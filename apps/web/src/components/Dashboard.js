import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Activity, CircleAlert, Cpu, LogOut, PencilLine, Plus, RefreshCw, Server, Shield, Tag as TagIcon, TerminalSquare, Trash2 } from "lucide-react";
import { io } from "socket.io-client";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { formatBytes, formatLastTested, formatUptime } from "../lib/format";
import { HostModal } from "./HostModal";
import { LogPanel } from "./LogPanel";
const CLIENT_LOG_BUFFER_LIMIT = 2000;
function statusBadge(status) {
    if (status === "online") {
        return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    }
    if (status === "stopped") {
        return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    }
    return "border-white/10 bg-white/5 text-slate-300";
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
export function Dashboard({ user, accessToken, onSessionUpdate }) {
    const [sessionToken, setSessionToken] = useState(accessToken);
    const [hosts, setHosts] = useState([]);
    const [tags, setTags] = useState([]);
    const [hostSearch, setHostSearch] = useState("");
    const [selectedTagFilters, setSelectedTagFilters] = useState([]);
    const [selectedHostId, setSelectedHostId] = useState(null);
    const [workspaceBusy, setWorkspaceBusy] = useState(true);
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
    const [activeTab, setActiveTab] = useState("processes");
    const [processes, setProcesses] = useState([]);
    const [processSearch, setProcessSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [processesBusy, setProcessesBusy] = useState(false);
    const [processesError, setProcessesError] = useState(null);
    const [selectedProcessIds, setSelectedProcessIds] = useState([]);
    const [activeLogProcesses, setActiveLogProcesses] = useState([]);
    const [visibleLogLines, setVisibleLogLines] = useState([]);
    const [logStatus, setLogStatus] = useState("idle");
    const [logError, setLogError] = useState(null);
    const [paused, setPaused] = useState(false);
    const [scrollLock, setScrollLock] = useState(false);
    const [includePattern, setIncludePattern] = useState("");
    const [excludePattern, setExcludePattern] = useState("");
    const [filterError, setFilterError] = useState(null);
    const [initialLines, setInitialLines] = useState(200);
    const socketRef = useRef(null);
    const pausedRef = useRef(false);
    const rawLogBufferRef = useRef([]);
    const deferredHostSearch = useDeferredValue(hostSearch);
    const deferredProcessSearch = useDeferredValue(processSearch);
    useEffect(() => {
        setSessionToken(accessToken);
    }, [accessToken]);
    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);
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
        onSessionUpdate(session.user, session.accessToken);
        return session.accessToken;
    }
    async function withSessionRetry(operation) {
        try {
            return await operation(sessionToken);
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
            setHosts(nextHosts);
            setTags(nextTags);
            const nextSelectedHostId = preferredHostId && nextHosts.some((host) => host.id === preferredHostId)
                ? preferredHostId
                : nextHosts[0]?.id ?? null;
            setSelectedHostId(nextSelectedHostId);
        }
        catch (error) {
            setWorkspaceError(formatApiError(error, "Failed to load the workspace."));
        }
        finally {
            setWorkspaceBusy(false);
        }
    }
    async function loadProcessesForHost(hostId) {
        setProcessesBusy(true);
        setProcessesError(null);
        try {
            const response = await withSessionRetry((token) => api.getProcesses(token, hostId));
            setProcesses(response.processes);
        }
        catch (error) {
            setProcessesError(formatApiError(error, "Failed to load PM2 processes."));
            setProcesses([]);
        }
        finally {
            setProcessesBusy(false);
        }
    }
    useEffect(() => {
        void loadWorkspaceData(selectedHostId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!selectedHostId) {
            setProcesses([]);
            setSelectedProcessIds([]);
            setActiveLogProcesses([]);
            setProcessesError(null);
            return;
        }
        setSelectedProcessIds([]);
        setActiveLogProcesses([]);
        clearLogs();
        stopLogs();
        void loadProcessesForHost(selectedHostId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedHostId]);
    useEffect(() => {
        const socket = io("/", {
            transports: ["websocket"],
            auth: {
                token: sessionToken
            }
        });
        socketRef.current = socket;
        socket.on("connect", () => {
            if (logStatus === "disconnected") {
                setLogStatus("idle");
            }
        });
        socket.on("disconnect", () => {
            setLogStatus("disconnected");
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
    function clearLogs() {
        rawLogBufferRef.current = [];
        setVisibleLogLines([]);
        setLogError(null);
        setFilterError(null);
    }
    function stopLogs() {
        socketRef.current?.emit("logs:stop");
    }
    function startLogs(processSelection) {
        if (!selectedHostId) {
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
            hostId: selectedHostId,
            targets: uniqueProcesses.map((process) => ({
                processIdOrName: process.pmId,
                label: process.name
            })),
            initialLines
        });
    }
    async function handleSignOut() {
        try {
            await api.logout(sessionToken);
        }
        catch {
            // no-op
        }
        finally {
            onSessionUpdate(null, null);
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
    const allFilteredSelected = filteredProcesses.length > 0 &&
        filteredProcesses.every((process) => selectedProcessIds.includes(process.pmId));
    const selectedProcesses = processes.filter((process) => selectedProcessIds.includes(process.pmId));
    return (_jsxs(_Fragment, { children: [_jsx(HostModal, { busy: hostMutationBusy, host: editingHost, onClose: () => {
                    setEditingHost(null);
                    setHostModalOpen(false);
                }, onSubmit: handleHostSave, open: hostModalOpen, tags: tags }), _jsx("div", { className: "min-h-screen px-4 py-4 text-slate-100 md:px-6 md:py-6", children: _jsxs("div", { className: "mx-auto max-w-[1600px] space-y-4", children: [_jsxs("header", { className: "panel flex flex-wrap items-center justify-between gap-4 px-6 py-5", children: [_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-200", children: [_jsx(Shield, { className: "size-4" }), "PM2 Log Viewer"] }), _jsx("h1", { className: "text-3xl font-semibold text-white", children: "Remote PM2 operations cockpit" })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right", children: [_jsx("div", { className: "text-sm text-slate-400", children: "Signed in as" }), _jsx("div", { className: "text-sm font-medium text-white", children: user.email })] }), _jsxs("button", { className: "button-secondary", onClick: handleSignOut, type: "button", children: [_jsx(LogOut, { className: "mr-2 size-4" }), "Sign out"] })] })] }), flash ? (_jsx("div", { className: `rounded-2xl border px-4 py-3 text-sm ${flash.tone === "success"
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                                : "border-rose-400/20 bg-rose-400/10 text-rose-100"}`, children: flash.text })) : null, _jsxs("div", { className: "grid gap-4 xl:grid-cols-[20rem_1fr]", children: [_jsxs("aside", { className: "panel flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden", children: [_jsxs("div", { className: "border-b border-white/10 p-5", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-xs uppercase tracking-[0.18em] text-slate-500", children: "Hosts" }), _jsx("div", { className: "mt-1 text-xl font-semibold text-white", children: filteredHosts.length })] }), _jsxs("button", { className: "button-primary", onClick: () => {
                                                                setEditingHost(null);
                                                                setHostModalOpen(true);
                                                            }, type: "button", children: [_jsx(Plus, { className: "mr-2 size-4" }), "Add host"] })] }), _jsx("input", { className: "field mt-4", onChange: (event) => setHostSearch(event.target.value), placeholder: "Search name, host, or user", value: hostSearch }), _jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: tags.map((tag) => {
                                                        const active = selectedTagFilters.includes(tag.id);
                                                        return (_jsx("button", { className: `rounded-full border px-3 py-1.5 text-xs transition ${active
                                                                ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                                                                : "border-white/10 bg-white/5 text-slate-300"}`, onClick: () => setSelectedTagFilters((current) => current.includes(tag.id)
                                                                ? current.filter((item) => item !== tag.id)
                                                                : [...current, tag.id]), type: "button", children: tag.name }, tag.id));
                                                    }) })] }), _jsx("div", { className: "min-h-0 flex-1 overflow-auto p-3", children: workspaceBusy ? (_jsx("div", { className: "flex h-full items-center justify-center text-sm text-slate-400", children: "Loading workspace..." })) : workspaceError ? (_jsx("div", { className: "rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100", children: workspaceError })) : filteredHosts.length === 0 ? (_jsx("div", { className: "flex h-full items-center justify-center text-center text-sm text-slate-500", children: "Add an SSH host to begin." })) : (_jsx("div", { className: "space-y-3", children: filteredHosts.map((host) => {
                                                    const active = selectedHostId === host.id;
                                                    const busy = hostActionBusyId === host.id;
                                                    return (_jsxs("div", { className: `w-full rounded-3xl border p-4 text-left transition ${active
                                                            ? "border-sky-400/30 bg-sky-400/10"
                                                            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`, onClick: () => setSelectedHostId(host.id), onKeyDown: (event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                setSelectedHostId(host.id);
                                                            }
                                                        }, role: "button", tabIndex: 0, children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium text-white", children: host.name }), _jsxs("div", { className: "mt-1 text-sm text-slate-400", children: [host.username, "@", host.host, ":", host.port] })] }), _jsx(Server, { className: "size-4 text-slate-500" })] }), _jsx("div", { className: "mt-4 flex flex-wrap gap-2", children: host.tags.map((tag) => (_jsx("span", { className: "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300", children: tag.name }, tag.id))) }), _jsx("div", { className: "mt-4 text-xs text-slate-500", children: formatLastTested(host.lastTestedAt) }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-2", children: [_jsxs("button", { className: "button-secondary", disabled: busy, onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            void handleHostTest(host);
                                                                        }, type: "button", children: [_jsx(RefreshCw, { className: "mr-2 size-4" }), "Test"] }), _jsxs("button", { className: "button-secondary", onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            setEditingHost(host);
                                                                            setHostModalOpen(true);
                                                                        }, type: "button", children: [_jsx(PencilLine, { className: "mr-2 size-4" }), "Edit"] }), _jsxs("button", { className: "button-secondary", disabled: busy, onClick: (event) => {
                                                                            event.stopPropagation();
                                                                            void handleHostDelete(host);
                                                                        }, type: "button", children: [_jsx(Trash2, { className: "mr-2 size-4" }), "Delete"] })] })] }, host.id));
                                                }) })) }), _jsxs("div", { className: "border-t border-white/10 p-4", children: [_jsxs("div", { className: "mb-3 flex items-center gap-2 text-sm font-medium text-white", children: [_jsx(TagIcon, { className: "size-4 text-slate-500" }), "Tag manager"] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "grid gap-3", children: [_jsx("input", { className: "field", onChange: (event) => setTagDraft((current) => ({ ...current, name: event.target.value })), placeholder: "Tag name", value: tagDraft.name }), _jsxs("div", { className: "flex gap-3", children: [_jsx("input", { className: "h-12 w-16 rounded-2xl border border-white/10 bg-transparent p-2", onChange: (event) => setTagDraft((current) => ({ ...current, color: event.target.value })), type: "color", value: tagDraft.color }), _jsx("button", { className: "button-primary flex-1", disabled: tagBusy, onClick: () => void handleTagSubmit(), type: "button", children: tagDraft.id ? "Update tag" : "Create tag" })] })] }), _jsx("div", { className: "space-y-2", children: tags.map((tag) => (_jsxs("div", { className: "flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "size-3 rounded-full", style: { backgroundColor: tag.color ?? "#64748b" } }), _jsx("span", { className: "text-sm text-slate-200", children: tag.name })] }), _jsxs("div", { className: "flex gap-1", children: [_jsx("button", { className: "button-ghost", onClick: () => setTagDraft({
                                                                                    id: tag.id,
                                                                                    name: tag.name,
                                                                                    color: tag.color ?? "#64748b"
                                                                                }), type: "button", children: "Edit" }), _jsx("button", { className: "button-ghost", onClick: () => void handleTagDelete(tag), type: "button", children: "Delete" })] })] }, tag.id))) })] })] })] }), _jsxs("main", { className: "space-y-4", children: [_jsx("section", { className: "panel px-6 py-5", children: selectedHost ? (_jsxs("div", { className: "grid gap-4 lg:grid-cols-[1fr_auto]", children: [_jsxs("div", { children: [_jsxs("div", { className: "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-400", children: [_jsx(Activity, { className: "size-4" }), "Active host"] }), _jsx("h2", { className: "mt-3 text-3xl font-semibold text-white", children: selectedHost.name }), _jsxs("div", { className: "mt-2 text-sm text-slate-400", children: [selectedHost.username, "@", selectedHost.host, ":", selectedHost.port] }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-2 text-sm text-slate-300", children: [_jsx("span", { className: "rounded-full border border-white/10 bg-white/5 px-3 py-1.5", children: selectedHost.authType === "PASSWORD" ? "Password auth" : "Private key" }), _jsxs("span", { className: "rounded-full border border-white/10 bg-white/5 px-3 py-1.5", children: ["Fingerprint ", selectedHost.hostFingerprint ?? "not pinned"] })] })] }), _jsxs("div", { className: "flex flex-wrap gap-2 lg:justify-end", children: [_jsx("button", { className: `button-ghost ${activeTab === "processes" ? "bg-white/10 text-white" : ""}`, onClick: () => setActiveTab("processes"), type: "button", children: "Processes" }), _jsx("button", { className: `button-ghost ${activeTab === "logs" ? "bg-white/10 text-white" : ""}`, onClick: () => setActiveTab("logs"), type: "button", children: "Logs" })] })] })) : (_jsx("div", { className: "text-sm text-slate-400", children: "Select a host to inspect its PM2 processes." })) }), activeTab === "processes" ? (_jsxs("section", { className: "panel overflow-hidden", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-2xl font-semibold text-white", children: "PM2 processes" }), _jsx("p", { className: "mt-2 text-sm text-slate-400", children: "Searchable process inventory with status filtering and log shortcuts." })] }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("input", { className: "field min-w-56", onChange: (event) => setProcessSearch(event.target.value), placeholder: "Search processes", value: processSearch }), _jsxs("select", { className: "field min-w-40", onChange: (event) => setStatusFilter(event.target.value), value: statusFilter, children: [_jsx("option", { value: "all", children: "All statuses" }), _jsx("option", { value: "online", children: "Online" }), _jsx("option", { value: "stopped", children: "Stopped" }), _jsx("option", { value: "errored", children: "Errored" })] }), _jsxs("button", { className: "button-primary", disabled: !selectedHost || processesBusy || selectedProcesses.length === 0, onClick: () => startLogs(selectedProcesses), type: "button", children: [_jsx(TerminalSquare, { className: "mr-2 size-4" }), "Open selected logs"] }), _jsxs("button", { className: "button-secondary", disabled: !selectedHost || processesBusy, onClick: () => {
                                                                        if (!selectedHostId) {
                                                                            return;
                                                                        }
                                                                        void (async () => {
                                                                            await loadWorkspaceData(selectedHostId);
                                                                            await loadProcessesForHost(selectedHostId);
                                                                        })();
                                                                    }, type: "button", children: [_jsx(RefreshCw, { className: "mr-2 size-4" }), "Refresh processes"] })] })] }), processesError ? (_jsx("div", { className: "px-6 py-5", children: _jsx("div", { className: "rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100", children: processesError }) })) : (_jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full table-fixed", children: [_jsx("thead", { className: "bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-slate-500", children: _jsxs("tr", { children: [_jsx("th", { className: "w-12 px-6 py-4", children: _jsx("input", { checked: allFilteredSelected, onChange: () => setSelectedProcessIds(allFilteredSelected ? [] : filteredProcesses.map((process) => process.pmId)), type: "checkbox" }) }), _jsx("th", { className: "px-6 py-4", children: "Name" }), _jsx("th", { className: "px-6 py-4", children: "Status" }), _jsx("th", { className: "px-6 py-4", children: "PID" }), _jsx("th", { className: "px-6 py-4", children: "CPU" }), _jsx("th", { className: "px-6 py-4", children: "Memory" }), _jsx("th", { className: "px-6 py-4", children: "Uptime" }), _jsx("th", { className: "px-6 py-4", children: "Restarts" }), _jsx("th", { className: "px-6 py-4", children: "Action" })] }) }), _jsx("tbody", { className: "divide-y divide-white/5", children: processesBusy ? (_jsx("tr", { children: _jsx("td", { className: "px-6 py-12 text-center text-sm text-slate-400", colSpan: 9, children: "Fetching PM2 processes..." }) })) : filteredProcesses.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "px-6 py-12 text-center text-sm text-slate-500", colSpan: 9, children: "No processes match the current filters." }) })) : (filteredProcesses.map((process) => (_jsxs("tr", { className: "text-sm text-slate-200", children: [_jsx("td", { className: "px-6 py-4", children: _jsx("input", { checked: selectedProcessIds.includes(process.pmId), onChange: () => toggleProcessSelection(process.pmId), type: "checkbox" }) }), _jsxs("td", { className: "px-6 py-4", children: [_jsx("div", { className: "font-medium text-white", children: process.name }), _jsxs("div", { className: "mt-1 text-xs text-slate-500", children: ["PM2 ID ", process.pmId] })] }), _jsx("td", { className: "px-6 py-4", children: _jsx("span", { className: `rounded-full border px-3 py-1 text-xs ${statusBadge(process.status)}`, children: process.status }) }), _jsx("td", { className: "px-6 py-4", children: process.pid ?? "n/a" }), _jsxs("td", { className: "px-6 py-4", children: [process.cpu.toFixed(1), "%"] }), _jsx("td", { className: "px-6 py-4", children: formatBytes(process.memory) }), _jsx("td", { className: "px-6 py-4", children: formatUptime(process.uptime) }), _jsx("td", { className: "px-6 py-4", children: process.restartCount }), _jsx("td", { className: "px-6 py-4", children: _jsxs("button", { className: "button-secondary", onClick: () => startLogs(process), type: "button", children: [_jsx(TerminalSquare, { className: "mr-2 size-4" }), "Open logs"] }) })] }, process.pmId)))) })] }) })), _jsxs("div", { className: "border-t border-white/10 px-6 py-4 text-sm text-slate-400", children: [selectedProcessIds.length, " process", selectedProcessIds.length === 1 ? "" : "es", " selected"] })] })) : (_jsx(LogPanel, { excludePattern: excludePattern, filterError: filterError, host: selectedHost, includePattern: includePattern, initialLines: initialLines, lines: visibleLogLines, onClear: clearLogs, onDownload: () => {
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
                                            }, onRestart: () => activeLogProcesses.length > 0 && startLogs(activeLogProcesses), onScrollLockToggle: () => setScrollLock((current) => !current), paused: paused, processes: activeLogProcesses, scrollLock: scrollLock, status: logStatus, streamError: logError })), _jsxs("section", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("div", { className: "panel px-5 py-4", children: [_jsxs("div", { className: "flex items-center gap-3 text-slate-400", children: [_jsx(Cpu, { className: "size-4" }), "Process count"] }), _jsx("div", { className: "mt-3 text-3xl font-semibold text-white", children: processes.length })] }), _jsxs("div", { className: "panel px-5 py-4", children: [_jsxs("div", { className: "flex items-center gap-3 text-slate-400", children: [_jsx(TerminalSquare, { className: "size-4" }), "Stream state"] }), _jsx("div", { className: "mt-3 text-3xl font-semibold text-white", children: logStatus })] }), _jsxs("div", { className: "panel px-5 py-4", children: [_jsxs("div", { className: "flex items-center gap-3 text-slate-400", children: [_jsx(CircleAlert, { className: "size-4" }), "Buffer"] }), _jsx("div", { className: "mt-3 text-3xl font-semibold text-white", children: rawLogBufferRef.current.length })] })] })] })] })] }) })] }));
}
