export type QueueItem = {
  file: string;
  targetKey: "session" | "flashStaging";
  stateKey: "queued" | "pending";
};

export const queue: QueueItem[] = [
  { file: "monitor.bin", targetKey: "session", stateKey: "queued" },
  { file: "boot.hex", targetKey: "flashStaging", stateKey: "pending" },
];
