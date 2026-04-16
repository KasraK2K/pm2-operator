export type DashboardTab = "processes" | "logs";

export interface DashboardViewState {
  version: 1;
  selectedHostId: string | null;
  activeTab: DashboardTab;
  hostSearch: string;
  selectedTagFilters: string[];
  processSearch: string;
  statusFilter: string;
  selectedProcessIds: number[];
  activeLogProcessIds: number[];
  includePattern: string;
  excludePattern: string;
  initialLines: number;
  scrollLock: boolean;
  sidebarCollapsed: boolean;
}

const STORAGE_PREFIX = "pm2-log-viewer.dashboard-view";

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function readDashboardViewState(userId: string): DashboardViewState | null {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DashboardViewState>;

    if (parsed.version !== 1) {
      return null;
    }

    return {
      version: 1,
      selectedHostId: typeof parsed.selectedHostId === "string" ? parsed.selectedHostId : null,
      activeTab: parsed.activeTab === "logs" ? "logs" : "processes",
      hostSearch: typeof parsed.hostSearch === "string" ? parsed.hostSearch : "",
      selectedTagFilters: isStringArray(parsed.selectedTagFilters) ? parsed.selectedTagFilters : [],
      processSearch: typeof parsed.processSearch === "string" ? parsed.processSearch : "",
      statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : "all",
      selectedProcessIds: isNumberArray(parsed.selectedProcessIds) ? parsed.selectedProcessIds : [],
      activeLogProcessIds: isNumberArray(parsed.activeLogProcessIds) ? parsed.activeLogProcessIds : [],
      includePattern: typeof parsed.includePattern === "string" ? parsed.includePattern : "",
      excludePattern: typeof parsed.excludePattern === "string" ? parsed.excludePattern : "",
      initialLines:
        typeof parsed.initialLines === "number" && Number.isFinite(parsed.initialLines)
          ? parsed.initialLines
          : 200,
      scrollLock: parsed.scrollLock === true,
      sidebarCollapsed: parsed.sidebarCollapsed === true
    };
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
