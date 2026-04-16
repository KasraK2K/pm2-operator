export interface User {
  id: string;
  email: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Host {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  hostFingerprint: string | null;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
}

export interface Pm2Process {
  name: string;
  pmId: number;
  status: string;
  pid: number | null;
  cpu: number;
  memory: number;
  uptime: number | null;
  restartCount: number;
}

export interface LogLine {
  sequence: number;
  line: string;
  source: "stdout" | "stderr";
  timestamp: string;
  processKey: string;
  processLabel: string;
}

export interface ConnectionResult {
  os: string;
  pm2Version: string;
  fingerprint: string;
}

export interface HostPayload {
  name: string;
  host: string;
  port: number;
  username: string;
  authType: "PASSWORD" | "PRIVATE_KEY";
  password?: string;
  privateKey?: string;
  passphrase?: string;
  tagIds: string[];
}
