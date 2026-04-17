const STORAGE_PREFIX = "pm2-log-viewer.dashboard-view";
function getStorageKey(userId) {
    return `${STORAGE_PREFIX}.${userId}`;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isNumberArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}
function normalizeState(parsed) {
    return {
        version: 2,
        activeSection: parsed.activeSection === "settings" ? "settings" : "monitor",
        selectedHostId: typeof parsed.selectedHostId === "string" ? parsed.selectedHostId : null,
        activeTab: parsed.activeTab === "logs" ? "logs" : "processes",
        settingsTab: parsed.settingsTab === "users" ? "users" : "profile",
        hostSearch: typeof parsed.hostSearch === "string" ? parsed.hostSearch : "",
        selectedTagFilters: isStringArray(parsed.selectedTagFilters) ? parsed.selectedTagFilters : [],
        processSearch: typeof parsed.processSearch === "string" ? parsed.processSearch : "",
        statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : "all",
        selectedProcessIds: isNumberArray(parsed.selectedProcessIds) ? parsed.selectedProcessIds : [],
        activeLogProcessIds: isNumberArray(parsed.activeLogProcessIds) ? parsed.activeLogProcessIds : [],
        includePattern: typeof parsed.includePattern === "string" ? parsed.includePattern : "",
        excludePattern: typeof parsed.excludePattern === "string" ? parsed.excludePattern : "",
        initialLines: typeof parsed.initialLines === "number" && Number.isFinite(parsed.initialLines)
            ? parsed.initialLines
            : 200,
        scrollLock: parsed.scrollLock === true,
        sidebarCollapsed: parsed.sidebarCollapsed === true
    };
}
export function readDashboardViewState(userId) {
    try {
        const raw = localStorage.getItem(getStorageKey(userId));
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 && parsed.version !== 2) {
            return null;
        }
        return normalizeState(parsed);
    }
    catch {
        return null;
    }
}
export function writeDashboardViewState(userId, state) {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
}
export function clearDashboardViewState(userId) {
    localStorage.removeItem(getStorageKey(userId));
}
