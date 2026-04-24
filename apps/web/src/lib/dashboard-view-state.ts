export type DashboardSection = "monitor" | "settings";
export type DashboardTab = "processes" | "dashboard" | "logs";
export type SettingsTab = "profile" | "shortcuts" | "users";

export interface DashboardViewState {
  version: 3;
  activeSection: DashboardSection;
  selectedHostId: string | null;
  activeTab: DashboardTab;
  settingsTab: SettingsTab;
  hostSearch: string;
  selectedTagFilters: string[];
  processSearch: string;
  statusFilter: string;
  selectedProcessIds: number[];
  activeDashboardProcessIds: number[];
  activeLogProcessIds: number[];
  includePattern: string;
  excludePattern: string;
  initialLines: number;
  scrollLock: boolean;
  sidebarCollapsed: boolean;
}

const STORAGE_PREFIX = "pm2-operator.dashboard-view";

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function normalizeState(parsed: RawDashboardViewState): DashboardViewState {
  const activeLogProcessIds = isNumberArray(parsed.activeLogProcessIds) ? parsed.activeLogProcessIds : [];
  const activeDashboardProcessIds = isNumberArray(parsed.activeDashboardProcessIds)
    ? parsed.activeDashboardProcessIds
    : activeLogProcessIds;

  return {
    version: 3,
    activeSection: parsed.activeSection === "settings" ? "settings" : "monitor",
    selectedHostId: typeof parsed.selectedHostId === "string" ? parsed.selectedHostId : null,
    activeTab: parsed.activeTab === "logs" || parsed.activeTab === "dashboard" ? parsed.activeTab : "processes",
    settingsTab:
      parsed.settingsTab === "users" || parsed.settingsTab === "shortcuts"
        ? parsed.settingsTab
        : "profile",
    hostSearch: typeof parsed.hostSearch === "string" ? parsed.hostSearch : "",
    selectedTagFilters: isStringArray(parsed.selectedTagFilters) ? parsed.selectedTagFilters : [],
    processSearch: typeof parsed.processSearch === "string" ? parsed.processSearch : "",
    statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : "all",
    selectedProcessIds: isNumberArray(parsed.selectedProcessIds) ? parsed.selectedProcessIds : [],
    activeDashboardProcessIds,
    activeLogProcessIds,
    includePattern: typeof parsed.includePattern === "string" ? parsed.includePattern : "",
    excludePattern: typeof parsed.excludePattern === "string" ? parsed.excludePattern : "",
    initialLines:
      typeof parsed.initialLines === "number" && Number.isFinite(parsed.initialLines)
        ? parsed.initialLines
        : 200,
    scrollLock: parsed.scrollLock === true,
    sidebarCollapsed: parsed.sidebarCollapsed === true
  };
}

export function readDashboardViewState(userId: string): DashboardViewState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as RawDashboardViewState;

    if (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3) {
      return null;
    }

    return normalizeState(parsed);
  } catch {
    return null;
  }
}

export function writeDashboardViewState(userId: string, state: DashboardViewState) {
  localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
}

export function clearDashboardViewState(userId: string) {
  localStorage.removeItem(getStorageKey(userId));
}
interface RawDashboardViewState {
  version?: number;
  activeSection?: unknown;
  selectedHostId?: unknown;
  activeTab?: unknown;
  settingsTab?: unknown;
  hostSearch?: unknown;
  selectedTagFilters?: unknown;
  processSearch?: unknown;
  statusFilter?: unknown;
  selectedProcessIds?: unknown;
  activeDashboardProcessIds?: unknown;
  activeLogProcessIds?: unknown;
  includePattern?: unknown;
  excludePattern?: unknown;
  initialLines?: unknown;
  scrollLock?: unknown;
  sidebarCollapsed?: unknown;
}
