import type { ThemeId } from "./themes";

export type UserRole = "OWNER" | "ADMIN" | "MEMBER";
export type PanelLayout = Record<string, boolean>;

export interface User {
  id: string;
  email: string;
  role: UserRole;
  settings: {
    themeId: ThemeId;
    panelLayout: PanelLayout;
  };
}

export interface ManagedUser extends User {
  createdAt: string;
  updatedAt: string;
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

export interface HostRuntimeSummary {
  hostname: string | null;
  os: string | null;
  pm2Version: string | null;
  cpuCores: number | null;
  totalMemory: number | null;
  loadAverage: number[];
}

export interface Pm2DashboardAggregate {
  totalCpu: number;
  totalMemory: number;
  processCount: number;
  onlineCount: number;
  stoppedCount: number;
  erroredCount: number;
  restartDelta: number;
}

export interface Pm2DashboardProcessState extends Pm2Process {
  selectedLabel: string;
  cwd: string | null;
  execPath: string | null;
  execMode: string | null;
  version: string | null;
  nodeVersion: string | null;
  gitBranch: string | null;
  gitRevision: string | null;
  repoPath: string | null;
  unstableRestarts: number;
  outputLogPath: string | null;
  errorLogPath: string | null;
}

export interface Pm2DashboardSnapshot {
  timestamp: string;
  fingerprint: string;
  host: HostRuntimeSummary | null;
  selection: {
    hostId: string;
    targetPmIds: number[];
    targetLabels: string[];
    missingTargetPmIds: number[];
  };
  aggregate: Pm2DashboardAggregate;
  processes: Pm2DashboardProcessState[];
}

export type Pm2DashboardAction = "restart" | "reload";

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
