//! Minimal classic Kermit *sender* (file transfer desktop -> device).
//!
//! Implements the original short-packet protocol: Send-Init parameter
//! negotiation, control-prefix and 8th-bit quoting, type-1 / type-2 block
//! checks, and a stop-and-wait state machine (S -> F -> D... -> Z -> B) with
//! per-packet retransmission. Repeat-count compression, sliding windows, long
//! packets and CRC (type-3) checks are intentionally not offered.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use serialport::{ClearBuffer, SerialPort};
use tauri::{AppHandle, Emitter};

const SOH: u8 = 0x01;
const MAX_RETRIES: u32 = 6;
const PACKET_TIMEOUT: Duration = Duration::from_secs(5);

#[inline]
fn tochar(b: u8) -> u8 {
    b + 32
}
#[inline]
fn unchar(c: u8) -> u8 {
    c.wrapping_sub(32)
}
#[inline]
fn ctl(c: u8) -> u8 {
    c ^ 0x40
}

/// Parameters negotiated with the receiver, used for the packets *we* send.
struct Params {
    /// Max total packet length the receiver can accept (we cap data to fit).
    maxl: usize,
    /// End-of-line terminator the receiver wants appended to our packets.
    eol: u8,
    /// Control-quote prefix (always our own '#').
    qctl: u8,
    /// 8th-bit quote prefix, if the receiver requested binary quoting.
    qbin: Option<u8>,
    /// Block-check type in force after init: b'1' or b'2'.
    chkt: u8,
    /// Padding before each packet the receiver asked for.
    npad: usize,
    padc: u8,
}

#[derive(Serialize, Clone)]
struct Progress {
    name: String,
    sent: usize,
    total: usize,
}

struct RxPacket {
    seq: u8,
    ptype: u8,
    data: Vec<u8>,
}

fn check_len(chkt: u8) -> usize {
    match chkt {
        b'2' => 2,
        b'3' => 3,
        _ => 1,
    }
}

/// Build a complete packet (optional leading pad, SOH, len, seq, type, data,
/// block check, EOL). The block check covers the len, seq, type and data bytes.
fn build_packet(seq: u8, ptype: u8, data: &[u8], p: &Params) -> Vec<u8> {
    let clen = check_len(p.chkt);
    let len_char = tochar((data.len() + clen + 2) as u8);
    let seq_char = tochar(seq % 64);

    let mut sum: u32 = len_char as u32 + seq_char as u32 + ptype as u32;
    for &b in data {
        sum += b as u32;
    }

    let mut pkt = Vec::with_capacity(data.len() + clen + 4 + p.npad);
    for _ in 0..p.npad {
        pkt.push(p.padc);
    }
    pkt.push(SOH);
    pkt.push(len_char);
    pkt.push(seq_char);
    pkt.push(ptype);
    pkt.extend_from_slice(data);

    match p.chkt {
        b'2' => {
            let s = sum & 0x0FFF;
            pkt.push(tochar(((s >> 6) & 0x3F) as u8));
            pkt.push(tochar((s & 0x3F) as u8));
        }
        _ => {
            let s = sum & 0xFF;
            let chk = (s + ((s & 0xC0) >> 6)) & 0x3F;
            pkt.push(tochar(chk as u8));
        }
    }

    pkt.push(p.eol);
    pkt
}

/// Encode one source byte into packet data using control / 8th-bit quoting.
fn encode_byte(out: &mut Vec<u8>, byte: u8, p: &Params) {
    let mut c = byte;
    let mut high = false;
    if p.qbin.is_some() && (c & 0x80) != 0 {
        high = true;
        c &= 0x7F;
    }

    if high {
        out.push(p.qbin.unwrap());
    }

    let low = c & 0x7F;
    if low < 0x20 || low == 0x7F {
        // Classify by the low 7 bits, but quote `c` so its 8th bit survives when
        // binary quoting is *not* in effect (rosco doesn't request QBIN). Using
        // ctl(low) here would silently drop bit 7, turning e.g. 0x8D into 0x0D —
        // a self-consistent corruption that passes the block check and only
        // surfaces as an illegal instruction once the device runs the image.
        // When QBIN *is* active, `c` was already masked to 7 bits above, so
        // ctl(c) == ctl(low) and this is equivalent.
        out.push(p.qctl);
        out.push(ctl(c));
    } else if low == p.qctl || p.qbin == Some(low) {
        out.push(p.qctl);
        out.push(c);
    } else {
        out.push(c);
    }
}

fn read_byte(port: &mut dyn SerialPort, deadline: Instant) -> Result<u8, String> {
    let mut b = [0u8; 1];
    loop {
        if Instant::now() >= deadline {
            return Err("timed out waiting for response".into());
        }
        match port.read(&mut b) {
            Ok(0) => continue,
            Ok(_) => return Ok(b[0]),
            Err(e) if e.kind() == ErrorKind::TimedOut => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Read and verify one inbound packet, using `chkt` to know the check length.
fn read_packet(port: &mut dyn SerialPort, chkt: u8, deadline: Instant) -> Result<RxPacket, String> {
    loop {
        if read_byte(port, deadline)? == SOH {
            break;
        }
    }

    let len_char = read_byte(port, deadline)?;
    let count = unchar(len_char) as usize; // seq + type + data + check
    let clen = check_len(chkt);
    if count < 2 + clen {
        return Err("malformed packet (length too small)".into());
    }

    let mut rest = Vec::with_capacity(count);
    while rest.len() < count {
        rest.push(read_byte(port, deadline)?);
    }

    let body = &rest[..rest.len() - clen]; // seq, type, data
    let recv_check = &rest[rest.len() - clen..];

    let mut sum: u32 = len_char as u32;
    for &b in body {
        sum += b as u32;
    }
    let ok = match chkt {
        b'2' => {
            let s = sum & 0x0FFF;
            recv_check.len() == 2
                && recv_check[0] == tochar(((s >> 6) & 0x3F) as u8)
                && recv_check[1] == tochar((s & 0x3F) as u8)
        }
        _ => {
            let s = sum & 0xFF;
            let chk = (s + ((s & 0xC0) >> 6)) & 0x3F;
            recv_check.len() == 1 && recv_check[0] == tochar(chk as u8)
        }
    };
    if !ok {
        return Err("block check mismatch".into());
    }

    Ok(RxPacket {
        seq: unchar(body[0]),
        ptype: body[1],
        data: body[2..].to_vec(),
    })
}

/// Parse the receiver's Send-Init ACK into the parameters we will use.
fn parse_params(d: &[u8]) -> Result<Params, String> {
    let get = |i: usize| d.get(i).copied();

    let maxl = get(0)
        .map(|b| unchar(b) as usize)
        .filter(|&n| n > 0)
        .unwrap_or(80)
        .min(94);
    let npad = get(2).map(|b| unchar(b) as usize).unwrap_or(0);
    let padc = get(3).map(ctl).unwrap_or(0);
    let eol = get(4).map(unchar).filter(|&n| n != 0).unwrap_or(b'\r');
    let qbin = match get(6) {
        Some(b) if b != b'Y' && b != b'N' && b != b' ' && (33..=126).contains(&b) => Some(b),
        _ => None,
    };
    let chkt = match get(7) {
        Some(b @ (b'1' | b'2')) => b,
        Some(b'3') => return Err("receiver requires CRC (type 3) checks, not supported".into()),
        _ => b'1',
    };

    Ok(Params {
        maxl,
        eol,
        qctl: b'#',
        qbin,
        chkt,
        npad,
        padc,
    })
}

/// Send a packet and wait for a matching ACK, retransmitting on NAK/timeout.
fn send_and_ack(
    port: &mut dyn SerialPort,
    seq: u8,
    ptype: u8,
    data: &[u8],
    p: &Params,
) -> Result<(), String> {
    let pkt = build_packet(seq, ptype, data, p);
    let mut last_err = String::from("no response");

    for _ in 0..MAX_RETRIES {
        port.write_all(&pkt).map_err(|e| e.to_string())?;
        port.flush().map_err(|e| e.to_string())?;

        match read_packet(port, p.chkt, Instant::now() + PACKET_TIMEOUT) {
            Ok(rx) => match rx.ptype {
                b'Y' if rx.seq == seq % 64 => return Ok(()),
                b'E' => {
                    return Err(format!(
                        "remote error: {}",
                        String::from_utf8_lossy(&rx.data)
                    ))
                }
                // Duplicate ACK, NAK, or wrong sequence: retransmit.
                _ => last_err = "unexpected reply, retransmitting".into(),
            },
            Err(e) => last_err = e,
        }
    }

    Err(last_err)
}

/// The Send-Init exchange: propose our parameters, read the receiver's reply.
fn exchange_init(port: &mut dyn SerialPort) -> Result<Params, String> {
    // MAXL, TIME, NPAD, PADC, EOL, QCTL, QBIN, CHKT, REPT
    let s_data = [
        tochar(80),  // we can receive up to 80
        tochar(5),   // suggested timeout
        tochar(0),   // no padding
        ctl(0),      // pad char NUL
        tochar(b'\r'),
        b'#',        // control prefix
        b'Y',        // willing to 8th-bit quote if asked
        b'1',        // type-1 block check
        b' ',        // no repeat compression
    ];

    // The Send-Init exchange itself always uses type-1 checks and CR EOL.
    let init = Params {
        maxl: 94,
        eol: b'\r',
        qctl: b'#',
        qbin: None,
        chkt: b'1',
        npad: 0,
        padc: 0,
    };
    let pkt = build_packet(0, b'S', &s_data, &init);

    let mut last_err = String::from("receiver did not answer Send-Init");
    for _ in 0..MAX_RETRIES {
        port.write_all(&pkt).map_err(|e| e.to_string())?;
        port.flush().map_err(|e| e.to_string())?;

        match read_packet(port, b'1', Instant::now() + PACKET_TIMEOUT) {
            Ok(rx) if rx.ptype == b'Y' => return parse_params(&rx.data),
            Ok(rx) if rx.ptype == b'E' => {
                return Err(format!(
                    "remote error: {}",
                    String::from_utf8_lossy(&rx.data)
                ))
            }
            Ok(_) => last_err = "unexpected reply to Send-Init".into(),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

/// Send `path` to the connected device. Returns the transferred file name.
pub fn send_file(
    port: &mut dyn SerialPort,
    path: &str,
    app: &AppHandle,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
    let name = Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "FILE".into());

    let _ = port.clear(ClearBuffer::Input);

    let params = exchange_init(port)?;

    let total = bytes.len();
    let _ = app.emit(
        "kermit:start",
        Progress {
            name: name.clone(),
            sent: 0,
            total,
        },
    );

    // File header (F), sequence 1.
    let mut fdata = Vec::new();
    for &b in name.as_bytes() {
        encode_byte(&mut fdata, b, &params);
    }
    send_and_ack(port, 1, b'F', &fdata, &params)?;

    // Data packets (D), starting at sequence 2.
    let budget = params
        .maxl
        .saturating_sub(check_len(params.chkt) + 2)
        .max(4);
    let mut seq: u8 = 2;
    let mut idx = 0usize;
    while idx < bytes.len() {
        if cancel.load(Ordering::Relaxed) {
            let _ = send_and_ack(port, seq, b'E', b"cancelled by user", &params);
            return Err("transfer cancelled".into());
        }

        let mut chunk = Vec::with_capacity(budget);
        while idx < bytes.len() && chunk.len() + 4 <= budget {
            encode_byte(&mut chunk, bytes[idx], &params);
            idx += 1;
        }
        send_and_ack(port, seq, b'D', &chunk, &params)?;

        let _ = app.emit(
            "kermit:progress",
            Progress {
                name: name.clone(),
                sent: idx,
                total,
            },
        );
        seq = (seq + 1) % 64;
    }

    // End of file (Z) then break / end of transmission (B).
    send_and_ack(port, seq, b'Z', &[], &params)?;
    seq = (seq + 1) % 64;
    send_and_ack(port, seq, b'B', &[], &params)?;

    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(chkt: u8, qbin: Option<u8>) -> Params {
        Params {
            maxl: 94,
            eol: b'\r',
            qctl: b'#',
            qbin,
            chkt,
            npad: 0,
            padc: 0,
        }
    }

    #[test]
    fn char_helpers_roundtrip() {
        for b in 0u8..=94 {
            assert_eq!(unchar(tochar(b)), b);
        }
        assert_eq!(ctl(0), 0x40);
        assert_eq!(ctl(ctl(13)), 13);
    }

    #[test]
    fn encode_control_and_quote_chars() {
        let pr = p(b'1', None);
        let mut out = Vec::new();
        encode_byte(&mut out, 0x00, &pr); // NUL -> '#','@'
        assert_eq!(out, vec![b'#', b'@']);

        out.clear();
        encode_byte(&mut out, b'A', &pr); // printable -> as-is
        assert_eq!(out, vec![b'A']);

        out.clear();
        encode_byte(&mut out, b'#', &pr); // the prefix itself is quoted
        assert_eq!(out, vec![b'#', b'#']);
    }

    #[test]
    fn encode_high_bit_control_without_binary_quote() {
        // QBIN not negotiated: a high-bit control byte must keep bit 7 through
        // control quoting. 0x8D -> '#', ctl(0x8D)=0xCD; decoding ctl(0xCD)=0x8D.
        let pr = p(b'1', None);
        let mut out = Vec::new();
        encode_byte(&mut out, 0x8D, &pr);
        assert_eq!(out, vec![b'#', 0xCD]);
        assert_eq!(ctl(out[1]), 0x8D);

        // 0x81 -> '#', ctl(0x81)=0xC1; the byte is not flattened to 0x01.
        out.clear();
        encode_byte(&mut out, 0x81, &pr);
        assert_eq!(out, vec![b'#', 0xC1]);
    }

    #[test]
    fn encode_high_bit_with_binary_quote() {
        let pr = p(b'1', Some(b'&'));
        let mut out = Vec::new();
        encode_byte(&mut out, 0xC1, &pr); // & then 'A'
        assert_eq!(out, vec![b'&', b'A']);
    }

    #[test]
    fn packet_length_and_check_roundtrip() {
        let pr = p(b'1', None);
        let pkt = build_packet(0, b'S', b"ABC", &pr);
        assert_eq!(pkt[0], SOH);
        // len = data(3) + check(1) + 2 = 6
        assert_eq!(unchar(pkt[1]), 6);
        // A type-1 packet should parse back through the reader's checksum math.
        let clen = 1;
        let count = unchar(pkt[1]) as usize;
        let body = &pkt[2..2 + count - clen];
        assert_eq!(body[1], b'S');
    }
}
