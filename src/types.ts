export type View = "session" | "transfer" | "settings";

export type PortInfo = {
  name: string;
  kind: string;
};

export type TransferProgress = {
  sent: number;
  total: number;
};

export type FirmwareInfo = {
  name: string;
  size: number;
  sha256: string;
  crc32: string;
};
