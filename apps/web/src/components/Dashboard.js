import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Activity, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, PencilLine, Plus, RefreshCw, Search, Server, Shield, Tag as TagIcon, TerminalSquare, Trash2 } from "lucide-react";
import { io } from "socket.io-client";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { readDashboardViewState, writeDashboardViewState } from "../lib/dashboard-view-state";
import { formatBytes, formatLastTested, formatUptime } from "../lib/format";
import { THEME_LOOKUP } from "../lib/themes";
import { HostModal } from "./HostModal";
import { LogPanel } from "./LogPanel";
import { ThemeMenu } from "./ThemeMenu";
const CLIENT_LOG_BUFFER_LIMIT = 2000;
function statusBadge(status) {
    if (status === "online") {
        return "border-transparent bg-[color:var(--success-soft)] text-[color:var(--success)]";
    }
    if (status === "stopped") {
        return "border-transparent bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
    }
    if (status === "errored") {
        return "border-transparent bg-[color:var(--danger-soft)] text-[color:var(--danger)]";
    }
    return "border-[color:var(--border)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
}
function sortHosts(hosts) {
    return [...hosts].sort((left, right) => left.name.localeCompare(right.name));
}
function sortTags(tags) {
    return [...tags].sort((left, right) => left.name.localeCompare(right.name));
}
function formatApiError(error, fallback) {
    if (!(error instanceof ApiError)) {
        return fallback;
    }
    const output = error.details &&
        typeof error.details === "object" &&
        "output" in error.details &&
        typeof error.details.output === "string"
        ? error.details.output.trim()
        : "";
    if (!output) {
        return error.message;
    }
    return `${error.message} ${output.replace(/\s+/g, " ").slice(0, 220)}`;
}
function getInitials(value) {
    return value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
export function Dashboard({ user, accessToken, activeThemeId, onPreviewTheme, onClearThemePreview, onSessionUpdate }) {
    const restoredViewRef = useRef(readDashboardViewState(user.id));
    const restoredView = restoredViewRef.current;
    const [sessionToken, setSessionToken] = useState(accessToken);
    const [hosts, setHosts] = useState([]);
    const [tags, setTags] = useState([]);
    const [hostSearch, setHostSearch] = useState(restoredView?.hostSearch ?? "");
    const [selectedTagFilters, setSelectedTagFilters] = useState(restoredView?.selectedTagFilters ?? []);
    const [selectedHostId, setSelectedHostId] = useState(restoredView?.selectedHostId ?? null);
    const [workspaceBusy, setWorkspaceBusy] = useState(true);
    const [workspaceReady, setWorkspaceReady] = useState(false);
    const [workspaceError, setWorkspaceError] = useState(null);
    const [hostModalOpen, setHostModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState(null);
    const [hostMutationBusy, setHostMutationBusy] = useState(false);
    const [hostActionBusyId, setHostActionBusyId] = useState(null);
    const [flash, setFlash] = useState(null);
    const [tagDraft, setTagDraft] = useState({
        id: null,
        name: "",
        color: "#64748b"
    });
    const [tagBusy, setTagBusy] = useState(false);
    const [tagManagerOpen, setTagManagerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(restoredView?.activeTab ?? "processes");
    const [processes, setProcesses] = useState([]);
    const [processSearch, setProcessSearch] = useState(restoredView?.processSearch ?? "");
    const [statusFilter, setStatusFilter] = useState(restoredView?.statusFilter ?? "all");
    const [processesBusy, setProcessesBusy] = useState(false);
    const [processesError, setProcessesError] = useState(null);
    const [selectedProcessIds, setSelectedProcessIds] = useState(restoredView?.selectedProcessIds ?? []);
    const [activeLogProcesses, setActiveLogProcesses] = useState([]);
    const [visibleLogLines, setVisibleLogLines] = useState([]);
    const [logStatus, setLogStatus] = useState("idle");
    const [logError, setLogError] = useState(null);
    const [paused, setPaused] = useState(false);
    const [scrollLock, setScrollLock] = useState(restoredView?.scrollLock ?? false);
    const [includePattern, setIncludePattern] = useState(restoredView?.includePattern ?? "");
    const [excludePattern, setExcludePattern] = useState(restoredView?.excludePattern ?? "");
    const [filterError, setFilterError] = useState(null);
    const [initialLines, setInitialLines] = useState(restoredView?.initialLines ?? 200);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(restoredView?.sidebarCollapsed ?? false);
    const [themeBusy, setThemeBusy] = useState(false);
    const [themeError, setThemeError] = useState(null);
    const socketRef = useRef(null);
    const sessionTokenRef = useRef(accessToken);
    const pausedRef = useRef(false);
    const activeLogProcessesRef = useRef([]);
    const rawLogBufferRef = useRef([]);
    const previousHostIdRef = useRef(restoredView?.selectedHostId ?? null);
    const restoreLogIdsRef = useRef(restoredView?.activeTab === "logs" ? restoredView.activeLogProcessIds : []);
    const restoreAttemptedRef = useRef(false);
    const deferredHostSearch = useDeferredValue(hostSearch);
    const deferredProcessSearch = useDeferredValue(processSearch);
    useEffect(() => {
        setSessionToken(accessToken);
        sessionTokenRef.current = accessToken;
    }, [accessToken]);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);
    useEffect(() => {
        activeLogProcessesRef.current = activeLogProcesses;
    }, [activeLogProcesses]);
    useEffect(() => {
        if (!flash) {
            return;
        }
        const timer = window.setTimeout(() => setFlash(null), 5000);
        return () => window.clearTimeout(timer);
    }, [flash]);
    const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? null;
    const filteredHosts = hosts.filter((host) => {
        const matchesSearch = deferredHostSearch.trim().length === 0 ||
            [host.name, host.host, host.username].some((value) => value.toLowerCase().includes(deferredHostSearch.toLowerCase()));
        const matchesTags = selectedTagFilters.length === 0 ||
            host.tags.some((tag) => selectedTagFilters.includes(tag.id));
        return matchesSearch && matchesTags;
    });
    const filteredProcesses = processes.filter((process) => {
        const matchesSearch = deferredProcessSearch.trim().length === 0 ||
            `${process.name} ${process.pmId}`.toLowerCase().includes(deferredProcessSearch.toLowerCase());
        const matchesStatus = statusFilter === "all" || process.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    async function refreshSession() {
        const session = await api.refresh();
        setSessionToken(session.accessToken);
        sessionTokenRef.current = session.accessToken;
        onSessionUpdate(session.user, session.accessToken);
        return session.accessToken;
    }
    async function withSessionRetry(operation) {
        try {
            return await operation(sessionTokenRef.current);
        }
        catch (error) {
            if (error instanceof ApiError && error.status === 401) {
                try {
                    const nextToken = await refreshSession();
                    return await operation(nextToken);
                }
                catch {
                    onSessionUpdate(null, null);
                    throw error;
                }
            }
            throw error;
        }
    }
    function applyLogFilters(source) {
        let includeRegex = null;
        let excludeRegex = null;
        try {
            includeRegex = includePattern ? new RegExp(includePattern, "i") : null;
            excludeRegex = excludePattern ? new RegExp(excludePattern, "i") : null;
            setFilterError(null);
        }
        catch {
            setFilterError("Invalid regular expression.");
            startTransition(() => {
                setVisibleLogLines(source);
            });
            return;
        }
        const filtered = source.filter((entry) => {
            const haystack = `${entry.processLabel} ${entry.line}`;
            const matchesInclude = includeRegex ? includeRegex.test(haystack) : true;
            const matchesExclude = excludeRegex ? excludeRegex.test(haystack) : false;
            return matchesInclude && !matchesExclude;
        });
        startTransition(() => {
            setVisibleLogLines(filtered);
        });
    }
    function clearLogs() {
        rawLogBufferRef.current = [];
        setVisibleLogLines([]);
        setLogError(null);
        setFilterError(null);
    }
    function stopLogs() {
        socketRef.current?.emit("logs:stop");
    }
    function startLogs(processSelection, hostIdOverride) {
        const hostId = hostIdOverride ?? selectedHostId;
        if (!hostId) {
            return;
        }
        const nextProcesses = Array.isArray(processSelection) ? processSelection : [processSelection];
        const uniqueProcesses = [...new Map(nextProcesses.map((process) => [process.pmId, process])).values()];
        if (uniqueProcesses.length === 0) {
            return;
        }
        setActiveTab("logs");
        setActiveLogProcesses(uniqueProcesses);
        setPaused(false);
        setLogError(null);
        clearLogs();
        setLogStatus("connecting");
        socketRef.current?.emit("logs:start", {
            hostId,
            targets: uniqueProcesses.map((process) => ({
                processIdOrName: process.pmId,
                label: process.name
            })),
            initialLines
        });
    }
    async function loadWorkspaceData(preferredHostId) {
        setWorkspaceBusy(true);
        setWorkspaceError(null);
        try {
            const [hostsResponse, tagsResponse] = await Promise.all([
                withSessionRetry((token) => api.getHosts(token)),
                withSessionRetry((token) => api.getTags(token))
            ]);
            const nextHosts = sortHosts(hostsResponse.hosts);
            const nextTags = sortTags(tagsResponse.tags);
            const nextSelectedHostId = preferredHostId && nextHosts.some((host) => host.id === preferredHostId)
                ? preferredHostId
                : nextHosts[0]?.id ?? null;
            if (preferredHostId && nextSelectedHostId !== preferredHostId) {
                setFlash({
                    tone: "info",
                    text: "The previously selected host is no longer available. Switched to the next available host."
                });
            }
            const validTagIds = new Set(nextTags.map((tag) => tag.id));
            setHosts(nextHosts);
            setTags(nextTags);
            setSelectedTagFilters((current) => current.filter((tagId) => validTagIds.has(tagId)));
            setSelectedHostId(nextSelectedHostId);
        }
        catch (error) {
            setWorkspaceError(formatApiError(error, "Failed to load the workspace."));
        }
        finally {
            setWorkspaceBusy(false);
            setWorkspaceReady(true);
        }
    }
    async function loadProcessesForHost(hostId) {
        setProcessesBusy(true);
        setProcessesError(null);
        try {
            const previousSelection = selectedProcessIds;
            const response = await withSessionRetry((token) => api.getProcesses(token, hostId));
            const nextProcesses = response.processes;
            const availableProcessIds = new Set(nextProcesses.map((process) => process.pmId));
            setProcesses(nextProcesses);
            setSelectedProcessIds((current) => current.filter((pmId) => availableProcessIds.has(pmId)));
            setActiveLogProcesses((current) => current.filter((process) => availableProcessIds.has(process.pmId)));
            if (!restoreAttemptedRef.current) {
                restoreAttemptedRef.current = true;
                if (previousSelection.length > 0 &&
                    previousSelection.some((pmId) => !availableProcessIds.has(pmId))) {
                    setFlash({
                        tone: "info",
                        text: "Some previously selected PM2 processes are no longer available on this host."
                    });
                }
                if (activeTab === "logs" && restoreLogIdsRef.current.length > 0) {
                    const restoredProcesses = nextProcesses.filter((process) => restoreLogIdsRef.current.includes(process.pmId));
                    if (restoredProcesses.length > 0) {
                        if (restoredProcesses.length !== restoreLogIdsRef.current.length) {
                            setFlash({
                                tone: "info",
                                text: "Some saved log targets were missing, but the remaining PM2 streams were restored."
                            });
                        }
                        startLogs(restoredProcesses, hostId);
                    }
                    else {
                        setActiveTab("processes");
                        setFlash({
                            tone: "info",
                            text: "Saved log targets were not available anymore, so the dashboard returned to the Processes view."
                        });
                    }
                    restoreLogIdsRef.current = [];
                }
            }
        }
        catch (error) {
            if (!restoreAttemptedRef.current) {
                restoreAttemptedRef.current = true;
            }
            setProcessesError(formatApiError(error, "Failed to load PM2 processes."));
            setProcesses([]);
        }
        finally {
            setProcessesBusy(false);
        }
    }
    useEffect(() => {
        void loadWorkspaceData(restoredView?.selectedHostId ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!workspaceReady) {
            return;
        }
        if (!selectedHostId) {
            stopLogs();
            setProcesses([]);
            setSelectedProcessIds([]);
            setActiveLogProcesses([]);
            setProcessesError(null);
            setLogStatus("idle");
            clearLogs();
            previousHostIdRef.current = null;
            return;
        }
        const hostChanged = previousHostIdRef.current !== selectedHostId;
        previousHostIdRef.current = selectedHostId;
        if (hostChanged) {
            stopLogs();
            clearLogs();
            setActiveLogProcesses([]);
            setSelectedProcessIds([]);
            setLogStatus("idle");
            setLogError(null);
            if (restoreAttemptedRef.current) {
                setActiveTab("processes");
            }
        }
        void loadProcessesForHost(selectedHostId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedHostId, workspaceReady]);
    useEffect(() => {
        const socket = io("/", {
            transports: ["websocket"],
            auth: {
                token: sessionToken
            }
        });
        socketRef.current = socket;
        socket.on("connect", () => {
            if (activeLogProcessesRef.current.length === 0) {
                setLogStatus("idle");
            }
        });
        socket.on("disconnect", () => {
            setLogStatus(activeLogProcessesRef.current.length > 0 ? "disconnected" : "idle");
        });
        socket.on("logs:status", (payload) => {
            setLogStatus(payload.state);
            if (payload.state === "stopped") {
                setPaused(false);
            }
        });
        socket.on("logs:error", (payload) => {
            setLogStatus("error");
            setLogError(payload.message);
        });
        socket.on("logs:line", (entry) => {
            rawLogBufferRef.current = [...rawLogBufferRef.current, entry].slice(-CLIENT_LOG_BUFFER_LIMIT);
            if (!pausedRef.current) {
                applyLogFilters(rawLogBufferRef.current);
            }
        });
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionToken]);
    useEffect(() => {
        applyLogFilters(rawLogBufferRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [includePattern, excludePattern]);
    useEffect(() => {
        if (!workspaceReady) {
            return;
        }
        if (!restoreAttemptedRef.current && activeTab === "logs" && restoreLogIdsRef.current.length > 0) {
            return;
        }
        writeDashboardViewState(user.id, {
            version: 1,
            selectedHostId,
            activeTab,
            hostSearch,
            selectedTagFilters,
            processSearch,
            statusFilter,
            selectedProcessIds,
            activeLogProcessIds: activeLogProcesses.map((process) => process.pmId),
            includePattern,
            excludePattern,
            initialLines,
            scrollLock,
            sidebarCollapsed
        });
    }, [
        activeLogProcesses,
        activeTab,
        excludePattern,
        hostSearch,
        includePattern,
        initialLines,
        processSearch,
        scrollLock,
        selectedHostId,
        selectedProcessIds,
        selectedTagFilters,
        sidebarCollapsed,
        statusFilter,
        user.id
    ]);
    async function handleSignOut() {
        try {
            await api.logout(sessionTokenRef.current);
        }
        catch {
            // no-op
        }
        finally {
            onSessionUpdate(null, null);
        }
    }
    async function handleThemeSelect(themeId) {
        if (themeId === user.settings.themeId) {
            setThemeError(null);
            return;
        }
        setThemeBusy(true);
        setThemeError(null);
        try {
            const response = await withSessionRetry((token) => api.updateSettings(token, { themeId }));
            onSessionUpdate(response.user, sessionTokenRef.current);
            setFlash({
                tone: "success",
                text: `Theme updated to ${THEME_LOOKUP[themeId].label}.`
            });
        }
        catch (error) {
            const message = formatApiError(error, "Failed to update theme.");
            setThemeError(message);
            setFlash({
                tone: "error",
                text: message
            });
            throw error;
        }
        finally {
            setThemeBusy(false);
        }
    }
    async function handleHostSave(payload, hostId) {
        setHostMutationBusy(true);
        const normalizedPayload = {
            ...payload,
            name: payload.name.trim(),
            host: payload.host.trim(),
            username: payload.username.trim(),
            password: payload.password?.trim() || undefined,
            privateKey: payload.privateKey?.trim() || undefined,
            passphrase: payload.passphrase?.trim() || undefined
        };
        try {
            const response = hostId
                ? await withSessionRetry((token) => api.updateHost(token, hostId, normalizedPayload))
                : await withSessionRetry((token) => api.createHost(token, normalizedPayload));
            await loadWorkspaceData(response.host.id);
            setHostModalOpen(false);
            setEditingHost(null);
            setFlash({
                tone: "success",
                text: hostId ? "SSH host updated." : "SSH host created."
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: formatApiError(error, "Failed to save host.")
            });
        }
        finally {
            setHostMutationBusy(false);
        }
    }
    async function handleHostDelete(host) {
        const confirmed = window.confirm(`Delete ${host.name}? This cannot be undone.`);
        if (!confirmed) {
            return;
        }
        setHostActionBusyId(host.id);
        try {
            await withSessionRetry((token) => api.deleteHost(token, host.id));
            await loadWorkspaceData(selectedHostId === host.id ? null : selectedHostId);
            setFlash({
                tone: "success",
                text: "SSH host deleted."
            });
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: formatApiError(error, "Failed to delete host.")
            });
        }
        finally {
            setHostActionBusyId(null);
        }
    }
    async function handleHostTest(host, repinFingerprint = false) {
        setHostActionBusyId(host.id);
        try {
            const response = await withSessionRetry((token) => api.testHost(token, host.id, repinFingerprint));
            setHosts((current) => sortHosts(current.map((item) => (item.id === response.host.id ? response.host : item))));
            setFlash({
                tone: "success",
                text: `Connected to ${host.name}. PM2 ${response.connection.pm2Version} detected.`
            });
        }
        catch (error) {
            if (error instanceof ApiError && error.code === "HOST_KEY_MISMATCH") {
                const confirmed = window.confirm(`The fingerprint for ${host.name} changed. Repin the new fingerprint and test again?`);
                if (confirmed) {
                    await handleHostTest(host, true);
                    return;
                }
            }
            setFlash({
                tone: "error",
                text: formatApiError(error, "Connection test failed.")
            });
        }
        finally {
            setHostActionBusyId(null);
        }
    }
    async function handleTagSubmit() {
        if (!tagDraft.name.trim()) {
            return;
        }
        setTagBusy(true);
        try {
            if (tagDraft.id) {
                await withSessionRetry((token) => api.updateTag(token, tagDraft.id, {
                    name: tagDraft.name.trim(),
                    color: tagDraft.color
                }));
            }
            else {
                await withSessionRetry((token) => api.createTag(token, {
                    name: tagDraft.name.trim(),
                    color: tagDraft.color
                }));
            }
            setTagDraft({ id: null, name: "", color: "#64748b" });
            await loadWorkspaceData(selectedHostId);
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: formatApiError(error, "Failed to save tag.")
            });
        }
        finally {
            setTagBusy(false);
        }
    }
    async function handleTagDelete(tag) {
        const confirmed = window.confirm(`Delete tag ${tag.name}?`);
        if (!confirmed) {
            return;
        }
        setTagBusy(true);
        try {
            await withSessionRetry((token) => api.deleteTag(token, tag.id));
            setSelectedTagFilters((current) => current.filter((item) => item !== tag.id));
            await loadWorkspaceData(selectedHostId);
        }
        catch (error) {
            setFlash({
                tone: "error",
                text: formatApiError(error, "Failed to delete tag.")
            });
        }
        finally {
            setTagBusy(false);
        }
    }
    function toggleProcessSelection(pmId) {
        setSelectedProcessIds((current) => current.includes(pmId) ? current.filter((item) => item !== pmId) : [...current, pmId]);
    }
    function handleHostSelection(hostId) {
        setSelectedHostId(hostId);
        setActiveTab("processes");
    }
    const allFilteredSelected = filteredProcesses.length > 0 &&
        filteredProcesses.every((process) => selectedProcessIds.includes(process.pmId));
    const selectedProcesses = processes.filter((process) => selectedProcessIds.includes(process.pmId));
    return (_jsxs(_Fragment, { children: [_jsx(HostModal, { busy: hostMutationBusy, host: editingHost, onClose: () => {
                    setEditingHost(null);
                    setHostModalOpen(false);
                }, onSubmit: handleHostSave, open: hostModalOpen, tags: tags }), _jsx("div", { className: "min-h-screen px-3 py-3 sm:px-4 sm:py-4", children: _jsxs("div", { className: "mx-auto flex max-w-[1800px] flex-col gap-3", children: [_jsxs("header", { className: "panel flex flex-wrap items-center justify-between gap-3 px-4 py-3", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex size-10 items-center justify-center rounded-[0.95rem] bg-[color:var(--accent-soft)] text-[color:var(--accent)]", children: _jsx(Shield, { className: "size-[18px]" }) }), _jsxs("div", { children: [_jsx("div", { className: "section-kicker", children: "Operations workspace" }), _jsx("div", { className: "mt-1 text-sm font-semibold text-[color:var(--text)]", children: "PM2 Log Viewer" })] }), _jsxs("span", { className: "badge hidden sm:inline-flex", children: [hosts.length, " hosts"] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx(ThemeMenu, { activeThemeId: activeThemeId, busy: themeBusy, error: themeError, onClearPreview: onClearThemePreview, onPreviewTheme: onPreviewTheme, onSelectTheme: handleThemeSelect, savedThemeId: user.settings.themeId }), _jsxs("div", { className: "rounded-[0.95rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2 text-right", children: [_jsx("div", { className: "text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]", children: "Signed in" }), _jsx("div", { className: "max-w-[18rem] truncate text-sm font-medium text-[color:var(--text)]", children: user.email })] }), _jsxs("button", { className: "button-secondary", onClick: handleSignOut, type: "button", children: [_jsx(LogOut, { className: "mr-2 size-4" }), "Sign out"] })] })] }), flash ? (_jsx("div", { className: "flash", "data-tone": flash.tone, children: flash.text })) : null, workspaceError ? (_jsx("div", { className: "flash", "data-tone": "error", children: workspaceError })) : null, _jsxs("div", { className: "flex min-h-[calc(100vh-8rem)] flex-col gap-3 lg:flex-row", children: [_jsxs("aside", { className: `panel flex min-h-0 shrink-0 flex-col overflow-hidden ${sidebarCollapsed ? "lg:w-[5.25rem]" : "lg:w-[21rem]"}`, children: [_jsxs("div", { className: "border-b border-[color:var(--border)] px-3 py-3", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: `${sidebarCollapsed ? "hidden" : "block"}`, children: [_jsx("div", { className: "section-kicker", children: "Hosts" }), _jsxs("div", { className: "mt-1 text-sm font-semibold text-[color:var(--text)]", children: [filteredHosts.length, " visible"] })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { className: "button-ghost h-8 w-8 p-0", onClick: () => setSidebarCollapsed((current) => !current), title: sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar", type: "button", children: sidebarCollapsed ? (_jsx(PanelLeftOpen, { className: "size-4" })) : (_jsx(PanelLeftClose, { className: "size-4" })) }), _jsxs("button", { className: `${sidebarCollapsed ? "button-ghost h-8 w-8 p-0" : "button-primary"}`, onClick: () => {
                                                                        setEditingHost(null);
                                                                        setHostModalOpen(true);
                                                                    }, title: "Add host", type: "button", children: [_jsx(Plus, { className: `size-4 ${sidebarCollapsed ? "" : "mr-2"}` }), sidebarCollapsed ? _jsx("span", { className: "sr-only", children: "Add host" }) : "Add host"] })] })] }), !sidebarCollapsed ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "relative mt-3", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-soft)]" }), _jsx("input", { className: "field pl-9", onChange: (event) => setHostSearch(event.target.value), placeholder: "Search name, host, or user", value: hostSearch })] }), _jsx("div", { className: "mt-3 flex flex-wrap gap-1.5", children: tags.map((tag) => {
                                                                const active = selectedTagFilters.includes(tag.id);
                                                                return (_jsxs("button", { className: `${active ? "button-secondary border-[color:var(--border-strong)] bg-[color:var(--surface-strong)]" : "button-ghost"} px-2 py-1 text-xs`, onClick: () => setSelectedTagFilters((current) => current.includes(tag.id)
                                                                        ? current.filter((item) => item !== tag.id)
                                                                        : [...current, tag.id]), type: "button", children: [_jsx("span", { className: "size-2 rounded-full", style: { backgroundColor: tag.color ?? "#64748b" } }), tag.name] }, tag.id));
                                                            }) })] })) : null] }), _jsx("div", { className: "min-h-0 flex-1 overflow-auto px-2 py-2", children: workspaceBusy && hosts.length === 0 ? (_jsx("div", { className: "space-y-2 p-2", children: Array.from({ length: 5 }).map((_, index) => (_jsx("div", { className: "panel-soft h-16 animate-pulse" }, `host-skeleton-${index}`))) })) : filteredHosts.length === 0 ? (_jsx("div", { className: "flex h-full items-center justify-center p-4 text-center text-sm text-[color:var(--text-muted)]", children: hosts.length === 0
                                                    ? "Add your first SSH host to begin remote PM2 monitoring."
                                                    : "No hosts match the current search or tag filters." })) : sidebarCollapsed ? (_jsx("div", { className: "space-y-2", children: filteredHosts.map((host) => (_jsx("button", { className: `flex h-12 w-full items-center justify-center rounded-[0.95rem] border text-xs font-semibold ${host.id === selectedHostId
                                                        ? "border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] text-[color:var(--text)]"
                                                        : "border-transparent bg-transparent text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"}`, onClick: () => handleHostSelection(host.id), title: host.name, type: "button", children: getInitials(host.name) || "?" }, host.id))) })) : (_jsx("div", { className: "space-y-1", children: filteredHosts.map((host) => {
                                                    const busy = hostActionBusyId === host.id;
                                                    return (_jsx("div", { className: "host-row group cursor-pointer", "data-active": host.id === selectedHostId, onClick: () => handleHostSelection(host.id), onKeyDown: (event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                handleHostSelection(host.id);
                                                            }
                                                        }, role: "button", tabIndex: 0, children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: "flex size-10 shrink-0 items-center justify-center rounded-[0.95rem] bg-[color:var(--surface-strong)] text-xs font-semibold text-[color:var(--text)]", children: getInitials(host.name) || "?" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "truncate text-sm font-semibold text-[color:var(--text)]", children: host.name }), _jsx("span", { className: "badge", children: host.authType === "PASSWORD" ? "Password" : "Key" })] }), _jsxs("div", { className: "mt-1 truncate text-xs text-[color:var(--text-muted)]", children: [host.username, "@", host.host, ":", host.port] }), host.tags.length > 0 ? (_jsxs("div", { className: "mt-2 flex flex-wrap gap-1", children: [host.tags.slice(0, 4).map((tag) => (_jsxs("span", { className: "badge px-1.5 py-0.5 text-[10px]", children: [_jsx("span", { className: "size-1.5 rounded-full", style: { backgroundColor: tag.color ?? "#64748b" } }), tag.name] }, tag.id))), host.tags.length > 4 ? (_jsxs("span", { className: "badge px-1.5 py-0.5 text-[10px]", children: ["+", host.tags.length - 4] })) : null] })) : null, _jsx("div", { className: "mt-2 text-[11px] text-[color:var(--text-soft)]", children: formatLastTested(host.lastTestedAt) })] }), _jsxs("div", { className: "flex shrink-0 items-start gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100", children: [_jsx("button", { className: "button-ghost h-8 w-8 p-0", disabled: busy, onClick: (event) => {
                                                                                event.stopPropagation();
                                                                                void handleHostTest(host);
                                                                            }, title: "Test connection", type: "button", children: _jsx(RefreshCw, { className: "size-4" }) }), _jsx("button", { className: "button-ghost h-8 w-8 p-0", onClick: (event) => {
                                                                                event.stopPropagation();
                                                                                setEditingHost(host);
                                                                                setHostModalOpen(true);
                                                                            }, title: "Edit host", type: "button", children: _jsx(PencilLine, { className: "size-4" }) }), _jsx("button", { className: "button-ghost h-8 w-8 p-0", disabled: busy, onClick: (event) => {
                                                                                event.stopPropagation();
                                                                                void handleHostDelete(host);
                                                                            }, title: "Delete host", type: "button", children: _jsx(Trash2, { className: "size-4" }) })] })] }) }, host.id));
                                                }) })) }), !sidebarCollapsed ? (_jsxs("div", { className: "border-t border-[color:var(--border)] px-3 py-3", children: [_jsxs("button", { className: "button-ghost w-full justify-between px-0", onClick: () => setTagManagerOpen((current) => !current), type: "button", children: [_jsxs("span", { className: "flex items-center gap-2", children: [_jsx(TagIcon, { className: "size-4" }), "Tags"] }), _jsx(ChevronDown, { className: `size-4 transition ${tagManagerOpen ? "rotate-180" : ""}` })] }), tagManagerOpen ? (_jsxs("div", { className: "mt-3 space-y-3", children: [_jsxs("div", { className: "grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto]", children: [_jsx("input", { className: "field", onChange: (event) => setTagDraft((current) => ({ ...current, name: event.target.value })), placeholder: "Tag name", value: tagDraft.name }), _jsx("input", { className: "h-[2.65rem] w-full rounded-[0.9rem] border border-[color:var(--border)] bg-[color:var(--surface-strong)] p-1.5", onChange: (event) => setTagDraft((current) => ({ ...current, color: event.target.value })), type: "color", value: tagDraft.color }), _jsx("button", { className: "button-primary justify-center", disabled: tagBusy, onClick: () => void handleTagSubmit(), type: "button", children: tagDraft.id ? "Update" : "Create" })] }), _jsx("div", { className: "space-y-1.5", children: tags.length === 0 ? (_jsx("div", { className: "text-xs text-[color:var(--text-muted)]", children: "Create tags to filter hosts by role, environment, or team." })) : (tags.map((tag) => (_jsxs("div", { className: "panel-soft flex items-center justify-between gap-3 px-3 py-2", children: [_jsxs("div", { className: "flex min-w-0 items-center gap-2", children: [_jsx("span", { className: "size-2.5 rounded-full", style: { backgroundColor: tag.color ?? "#64748b" } }), _jsx("span", { className: "truncate text-sm text-[color:var(--text)]", children: tag.name })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { className: "button-ghost px-2 py-1 text-xs", onClick: () => setTagDraft({
                                                                                    id: tag.id,
                                                                                    name: tag.name,
                                                                                    color: tag.color ?? "#64748b"
                                                                                }), type: "button", children: "Edit" }), _jsx("button", { className: "button-ghost px-2 py-1 text-xs", onClick: () => void handleTagDelete(tag), type: "button", children: "Delete" })] })] }, tag.id)))) })] })) : null] })) : null] }), _jsxs("main", { className: "flex min-h-0 flex-1 flex-col gap-3", children: [_jsx("section", { className: "panel px-4 py-3", children: selectedHost ? (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "section-kicker", children: "Active host" }), _jsxs("div", { className: "mt-1 flex flex-wrap items-center gap-2", children: [_jsx("h2", { className: "truncate text-lg font-semibold text-[color:var(--text)]", children: selectedHost.name }), _jsx("span", { className: "badge", children: selectedHost.authType === "PASSWORD" ? "Password auth" : "Private key" })] }), _jsxs("div", { className: "mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]", children: [_jsxs("span", { children: [selectedHost.username, "@", selectedHost.host, ":", selectedHost.port] }), _jsxs("span", { className: "max-w-[28rem] truncate", title: selectedHost.hostFingerprint ?? "", children: ["Fingerprint ", selectedHost.hostFingerprint ?? "not pinned"] })] })] }), _jsxs("div", { className: "flex items-center gap-1 rounded-[0.95rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-1", children: [_jsx("button", { className: "button-tab", "data-active": activeTab === "processes", onClick: () => setActiveTab("processes"), type: "button", children: "Processes" }), _jsx("button", { className: "button-tab", "data-active": activeTab === "logs", onClick: () => setActiveTab("logs"), type: "button", children: "Logs" })] })] })) : (_jsxs("div", { className: "flex items-center gap-3 text-sm text-[color:var(--text-muted)]", children: [_jsx(Server, { className: "size-4" }), "Select a host to inspect PM2 processes and stream logs."] })) }), activeTab === "processes" ? (_jsxs("section", { className: "panel flex min-h-[26rem] flex-1 flex-col overflow-hidden", children: [_jsxs("div", { className: "border-b border-[color:var(--border)] px-4 py-3", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: "relative min-w-[15rem] flex-1", children: [_jsx(Search, { className: "pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-soft)]" }), _jsx("input", { className: "field pl-9", onChange: (event) => setProcessSearch(event.target.value), placeholder: "Search PM2 processes", value: processSearch })] }), _jsxs("select", { className: "field w-auto min-w-[8.5rem]", onChange: (event) => setStatusFilter(event.target.value), value: statusFilter, children: [_jsx("option", { value: "all", children: "All statuses" }), _jsx("option", { value: "online", children: "Online" }), _jsx("option", { value: "stopped", children: "Stopped" }), _jsx("option", { value: "errored", children: "Errored" })] }), _jsxs("button", { className: "button-primary", disabled: !selectedHost || processesBusy || selectedProcesses.length === 0, onClick: () => startLogs(selectedProcesses), type: "button", children: [_jsx(TerminalSquare, { className: "mr-2 size-4" }), "Open selected logs"] }), _jsxs("button", { className: "button-secondary", disabled: !selectedHost || processesBusy, onClick: () => {
                                                                        if (!selectedHostId) {
                                                                            return;
                                                                        }
                                                                        void loadProcessesForHost(selectedHostId);
                                                                    }, type: "button", children: [_jsx(RefreshCw, { className: "mr-2 size-4" }), "Refresh"] })] }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2", children: [_jsxs("span", { className: "badge", children: [_jsx(Activity, { className: "size-3.5" }), processes.length, " total"] }), _jsxs("span", { className: "badge", children: [filteredProcesses.length, " visible"] }), _jsxs("span", { className: "badge", children: [selectedProcessIds.length, " selected"] }), processesBusy ? _jsx("span", { className: "badge", children: "Refreshing..." }) : null] })] }), processesError ? (_jsx("div", { className: "px-4 py-3", children: _jsx("div", { className: "flash", "data-tone": "error", children: processesError }) })) : null, _jsx("div", { className: "min-h-0 flex-1 overflow-auto", children: _jsxs("table", { className: "min-w-full table-fixed", children: [_jsx("thead", { className: "border-b border-[color:var(--border)] text-left text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]", children: _jsxs("tr", { children: [_jsx("th", { className: "w-11 px-4 py-3", children: _jsx("input", { checked: allFilteredSelected, onChange: () => setSelectedProcessIds(allFilteredSelected ? [] : filteredProcesses.map((process) => process.pmId)), type: "checkbox" }) }), _jsx("th", { className: "px-4 py-3", children: "Name" }), _jsx("th", { className: "px-4 py-3", children: "Status" }), _jsx("th", { className: "px-4 py-3", children: "PID" }), _jsx("th", { className: "px-4 py-3", children: "CPU" }), _jsx("th", { className: "px-4 py-3", children: "Memory" }), _jsx("th", { className: "px-4 py-3", children: "Uptime" }), _jsx("th", { className: "px-4 py-3", children: "Restarts" }), _jsx("th", { className: "px-4 py-3", children: "Action" })] }) }), _jsx("tbody", { children: processesBusy && filteredProcesses.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "px-4 py-12 text-center text-sm text-[color:var(--text-muted)]", colSpan: 9, children: "Fetching PM2 processes..." }) })) : filteredProcesses.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "px-4 py-12 text-center text-sm text-[color:var(--text-muted)]", colSpan: 9, children: "No processes match the current filters." }) })) : (filteredProcesses.map((process) => (_jsxs("tr", { className: "border-b border-[color:var(--border)] text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]", children: [_jsx("td", { className: "px-4 py-2.5", children: _jsx("input", { checked: selectedProcessIds.includes(process.pmId), onChange: () => toggleProcessSelection(process.pmId), type: "checkbox" }) }), _jsxs("td", { className: "px-4 py-2.5", children: [_jsx("div", { className: "font-medium text-[color:var(--text)]", children: process.name }), _jsxs("div", { className: "mt-0.5 text-[11px] text-[color:var(--text-soft)]", children: ["PM2 ID ", process.pmId] })] }), _jsx("td", { className: "px-4 py-2.5", children: _jsx("span", { className: `inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadge(process.status)}`, children: process.status }) }), _jsx("td", { className: "px-4 py-2.5", children: process.pid ?? "n/a" }), _jsxs("td", { className: "px-4 py-2.5", children: [process.cpu.toFixed(1), "%"] }), _jsx("td", { className: "px-4 py-2.5", children: formatBytes(process.memory) }), _jsx("td", { className: "px-4 py-2.5", children: formatUptime(process.uptime) }), _jsx("td", { className: "px-4 py-2.5", children: process.restartCount }), _jsx("td", { className: "px-4 py-2.5", children: _jsx("button", { className: "button-secondary px-2.5 py-1.5 text-xs", onClick: () => startLogs(process), type: "button", children: "Logs" }) })] }, process.pmId)))) })] }) }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] px-4 py-2 text-xs text-[color:var(--text-muted)]", children: [_jsxs("span", { children: [selectedProcessIds.length, " process", selectedProcessIds.length === 1 ? "" : "es", " selected"] }), _jsx("span", { className: "badge", children: selectedHost ? selectedHost.host : "No host selected" }), _jsxs("span", { className: "badge", children: ["Status filter: ", statusFilter] })] })] })) : (_jsx(LogPanel, { bufferedLineCount: rawLogBufferRef.current.length, excludePattern: excludePattern, filterError: filterError, host: selectedHost, includePattern: includePattern, initialLines: initialLines, lines: visibleLogLines, onClear: clearLogs, onDownload: () => {
                                                const output = visibleLogLines
                                                    .map((line) => `[${line.timestamp}] [${line.source}] [${line.processLabel}] ${line.line}`)
                                                    .join("\n");
                                                const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
                                                const url = URL.createObjectURL(blob);
                                                const anchor = document.createElement("a");
                                                anchor.href = url;
                                                const label = activeLogProcesses.length === 1
                                                    ? activeLogProcesses[0].name
                                                    : `${activeLogProcesses.length}-processes`;
                                                anchor.download = `${selectedHost?.name ?? "host"}-${label}.txt`;
                                                anchor.click();
                                                URL.revokeObjectURL(url);
                                            }, onExcludePatternChange: setExcludePattern, onIncludePatternChange: setIncludePattern, onInitialLinesChange: setInitialLines, onPauseToggle: () => {
                                                setPaused((current) => {
                                                    const next = !current;
                                                    if (!next) {
                                                        applyLogFilters(rawLogBufferRef.current);
                                                    }
                                                    return next;
                                                });
                                            }, onRestart: () => activeLogProcesses.length > 0 && startLogs(activeLogProcesses), onScrollLockToggle: () => setScrollLock((current) => !current), paused: paused, processes: activeLogProcesses, scrollLock: scrollLock, status: logStatus, streamError: logError }))] })] })] }) })] }));
}
