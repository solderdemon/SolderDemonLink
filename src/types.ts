export type View = "session" | "transfer" | "settings";

export type PortInfo = {
  name: string;
  kind: string;
};

export type TransferProgress = {
  sent: number;
  total: number;
};