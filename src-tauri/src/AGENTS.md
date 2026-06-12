# AGENTS.md

## Scope

This file covers Rust runtime logic in `src-tauri/src/`.
Read this when the task is about commands, serial state, background threads, Kermit transfer, or OS-level device notifications.

## File Map

- `main.rs` - minimal entrypoint, calls library `run()`
- `lib.rs` - main Tauri runtime and serial command bridge
- `kermit.rs` - Kermit sender protocol implementation and tests

## Start Here By Task

- serial port list/open/close/write issue -> `lib.rs`
- Tauri event emission issue -> `lib.rs`
- Windows device hot-plug issue -> `lib.rs`
- firmware transfer logic issue -> `lib.rs`, then `kermit.rs`
- Kermit packet/ack/retry/cancel issue -> `kermit.rs`

## Ownership

### `lib.rs`

Owns:

- `SerialState`
- Tauri commands exposed to frontend
- background serial reader thread
- transfer exclusivity coordination
- device change watcher on Windows
- app event emission back to frontend

This is the file to inspect first for behavior at the frontend/backend boundary.

### `kermit.rs`

Owns:

- Kermit send-init negotiation
- packet construction
- checksum handling
- control and 8th-bit quoting
- retransmission behavior
- transfer progress reporting
- cancel behavior
- low-level protocol tests

If the issue is protocol-specific, stay here and avoid touching `lib.rs` unless the interface must change.

## Boundaries

- Keep serial session runtime concerns in `lib.rs`.
- Keep transfer protocol concerns in `kermit.rs`.
- Do not move protocol formatting or retry logic into frontend code.
- Do not add UI-specific wording to protocol code except concise error strings returned to the app.

## Token Saving Rules

- For most Rust tasks, `lib.rs` and `kermit.rs` are enough.
- `main.rs` rarely needs changes.
- Read tests in `kermit.rs` when changing packet behavior to preserve protocol assumptions.
