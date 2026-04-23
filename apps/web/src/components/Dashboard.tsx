import {
  Activity,
  ChevronDown,
  Cog,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Tag as TagIcon,
  TerminalSquare,
  Trash2
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../lib/api";
import {
  readDashboardViewState,
  writeDashboardViewState,
  type DashboardSection,
  type DashboardTab,
  type SettingsTab
} from "../lib/dashboard-view-state";
import { formatBytes, formatLastTested, formatUptime } from "../lib/format";
import { THEME_LOOKUP, type ThemeId } from "../lib/themes";
import type {
  Host,
  HostPayload,
  LogLine,
  ManagedUser,
  Pm2DashboardAction,
  Pm2DashboardSnapshot,
  Pm2Process,
  Tag,
  User
} from "../lib/types";
import { BrandLockup } from "./Brand";
import { CollapseToggleButton } from "./CollapseToggleButton";
import { HostModal } from "./HostModal";
import { LogPanel } from "./LogPanel";
import { MonitorDashboard } from "./MonitorDashboard";
import { SettingsPanel } from "./SettingsPanel";
import { StatusPill } from "./StatusPill";
import { TagChip } from "./TagChip";
import { ThemeMenu } from "./ThemeMenu";

interface DashboardProps {
  user: User;
  accessToken: string;
  activeThemeId: ThemeId;
  onPreviewTheme: (themeId: ThemeId) => void;
  onClearThemePreview: () => void;
  onSessionUpdate: (user: User | null, accessToken: string | null) => void;
}

type FlashTone = "success" | "error" | "info";

const CLIENT_LOG_BUFFER_LIMIT = 2000;

function sortHosts(hosts: Host[]) {
  return [...hosts].sort((left, right) => left.name.localeCompare(right.name));
}

function sortTags(tags: Tag[]) {
  return [...tags].sort((left, right) => left.name.localeCompare(right.name));
}

function formatApiError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  const output =
    error.details &&
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

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Dashboard({
  user,
  accessToken,
  activeThemeId,
  onPreviewTheme,
  onClearThemePreview,
  onSessionUpdate
}: DashboardProps) {
  const restoredViewRef = useRef(readDashboardViewState(user.id));
  const restoredView = restoredViewRef.current;

  const [sessionToken, setSessionToken] = useState(accessToken);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [hostSearch, setHostSearch] = useState(restoredView?.hostSearch ?? "");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>(
    restoredView?.selectedTagFilters ?? []
  );
  const [selectedHostId, setSelectedHostId] = useState<string | null>(
    restoredView?.selectedHostId ?? null
  );
  const [workspaceBusy, setWorkspaceBusy] = useState(true);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [hostMutationBusy, setHostMutationBusy] = useState(false);
  const [hostActionBusyId, setHostActionBusyId] = useState<string | null>(null);
  const [hostMenuOpenId, setHostMenuOpenId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: FlashTone; text: string } | null>(null);
  const [tagDraft, setTagDraft] = useState<{ id: string | null; name: string; color: string }>({
    id: null,
    name: "",
    color: "#64748b"
  });
  const [tagBusy, setTagBusy] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<DashboardSection>(
    restoredView?.activeSection ?? "monitor"
  );
  const [activeTab, setActiveTab] = useState<DashboardTab>(restoredView?.activeTab ?? "processes");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(restoredView?.settingsTab ?? "profile");
  const [processes, setProcesses] = useState<Pm2Process[]>([]);
  const [processSearch, setProcessSearch] = useState(restoredView?.processSearch ?? "");
  const [statusFilter, setStatusFilter] = useState(restoredView?.statusFilter ?? "all");
  const [processesBusy, setProcessesBusy] = useState(false);
  const [processesError, setProcessesError] = useState<string | null>(null);
  const [selectedProcessIds, setSelectedProcessIds] = useState<number[]>(
    restoredView?.selectedProcessIds ?? []
  );
  const [activeLogProcesses, setActiveLogProcesses] = useState<Pm2Process[]>([]);
  const [visibleLogLines, setVisibleLogLines] = useState<LogLine[]>([]);
  const [logStatus, setLogStatus] = useState("idle");
  const [logError, setLogError] = useState<string | null>(null);
  const [dashboardSnapshot, setDashboardSnapshot] = useState<Pm2DashboardSnapshot | null>(null);
  const [dashboardStatus, setDashboardStatus] = useState("idle");
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardActionBusyLabel, setDashboardActionBusyLabel] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [scrollLock, setScrollLock] = useState(restoredView?.scrollLock ?? false);
  const [includePattern, setIncludePattern] = useState(restoredView?.includePattern ?? "");
  const [excludePattern, setExcludePattern] = useState(restoredView?.excludePattern ?? "");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [initialLines, setInitialLines] = useState(restoredView?.initialLines ?? 200);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(restoredView?.sidebarCollapsed ?? false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [panelLayout, setPanelLayout] = useState(user.settings.panelLayout ?? {});

  const socketRef = useRef<Socket | null>(null);
  const sessionTokenRef = useRef(accessToken);
  const pausedRef = useRef(false);
  const activeLogProcessesRef = useRef<Pm2Process[]>([]);
  const activeSectionRef = useRef(activeSection);
  const activeTabRef = useRef(activeTab);
  const selectedHostIdRef = useRef<string | null>(restoredView?.selectedHostId ?? null);
  const rawLogBufferRef = useRef<LogLine[]>([]);
  const previousHostIdRef = useRef<string | null>(restoredView?.selectedHostId ?? null);
  const restoreLogIdsRef = useRef<number[]>(
    restoredView?.activeSection === "monitor" && restoredView.activeTab === "logs"
      ? restoredView.activeLogProcessIds
      : []
  );
  const restoreDashboardIdsRef = useRef<number[]>(
    restoredView?.activeSection === "monitor" && restoredView.activeTab === "dashboard"
      ? restoredView.activeDashboardProcessIds
      : []
  );
  const restoreAttemptedRef = useRef(false);

  const deferredHostSearch = useDeferredValue(hostSearch);
  const deferredProcessSearch = useDeferredValue(processSearch);
  const canManageWorkspace = user.role === "OWNER" || user.role === "ADMIN";
  const canManageUsers = canManageWorkspace;

  useEffect(() => {
    setSessionToken(accessToken);
    sessionTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    setPanelLayout(user.settings.panelLayout ?? {});
  }, [user.settings.panelLayout]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    activeLogProcessesRef.current = activeLogProcesses;
  }, [activeLogProcesses]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedHostIdRef.current = selectedHostId;
  }, [selectedHostId]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    const timer = window.setTimeout(() => setFlash(null), 5000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const closeHostMenu = () => setHostMenuOpenId(null);

    window.addEventListener("click", closeHostMenu);
    return () => window.removeEventListener("click", closeHostMenu);
  }, []);

  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? null;

  const filteredHosts = hosts.filter((host) => {
    const matchesSearch =
      deferredHostSearch.trim().length === 0 ||
      [host.name, host.host, host.username].some((value) =>
        value.toLowerCase().includes(deferredHostSearch.toLowerCase())
      );
    const matchesTags =
      selectedTagFilters.length === 0 ||
      host.tags.some((tag) => selectedTagFilters.includes(tag.id));

    return matchesSearch && matchesTags;
  });

  const filteredProcesses = processes.filter((process) => {
    const matchesSearch =
      deferredProcessSearch.trim().length === 0 ||
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

  async function withSessionRetry<T>(operation: (token: string) => Promise<T>) {
    try {
      return await operation(sessionTokenRef.current);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const nextToken = await refreshSession();
          return await operation(nextToken);
        } catch {
          onSessionUpdate(null, null);
          throw error;
        }
      }

      throw error;
    }
  }

  function applyLogFilters(source: LogLine[]) {
    let includeRegex: RegExp | null = null;
    let excludeRegex: RegExp | null = null;

    try {
      includeRegex = includePattern ? new RegExp(includePattern, "i") : null;
      excludeRegex = excludePattern ? new RegExp(excludePattern, "i") : null;
      setFilterError(null);
    } catch {
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

  function stopDashboard() {
    socketRef.current?.emit("dashboard:stop");
  }

  function clearDashboard() {
    setDashboardSnapshot(null);
    setDashboardError(null);
    setDashboardActionBusyLabel(null);
  }

  function getUniqueProcesses(processSelection: Pm2Process | Pm2Process[]) {
    const nextProcesses = Array.isArray(processSelection) ? processSelection : [processSelection];
    return [...new Map(nextProcesses.map((process) => [process.pmId, process])).values()];
  }

  function emitLogStart(hostId: string, processesToStream: Pm2Process[]) {
    clearLogs();
    setPaused(false);
    setLogError(null);
    setLogStatus("connecting");
    socketRef.current?.emit("logs:start", {
      hostId,
      targets: processesToStream.map((process) => ({
        processIdOrName: process.pmId,
        label: process.name
      })),
      initialLines
    });
  }

  function emitDashboardStart(hostId: string, processesToMonitor: Pm2Process[]) {
    setDashboardError(null);
    setDashboardStatus("connecting");
    socketRef.current?.emit("dashboard:start", {
      hostId,
      targets: processesToMonitor.map((process) => ({
        pmId: process.pmId,
        label: process.name
      }))
    });
  }

  function startLogs(processSelection: Pm2Process | Pm2Process[], hostIdOverride?: string) {
    const hostId = hostIdOverride ?? selectedHostId;

    if (!hostId) {
      return;
    }

    const uniqueProcesses = getUniqueProcesses(processSelection);

    if (uniqueProcesses.length === 0) {
      return;
    }

    setActiveSection("monitor");
    setActiveTab("logs");
    setActiveLogProcesses(uniqueProcesses);
    setSelectedProcessIds(uniqueProcesses.map((process) => process.pmId));
    emitLogStart(hostId, uniqueProcesses);
  }

  function startDashboard(processSelection: Pm2Process | Pm2Process[], hostIdOverride?: string) {
    const hostId = hostIdOverride ?? selectedHostId;

    if (!hostId) {
      return;
    }

    const uniqueProcesses = getUniqueProcesses(processSelection);

    if (uniqueProcesses.length === 0) {
      return;
    }

    setActiveSection("monitor");
    setActiveTab("dashboard");
    setActiveLogProcesses(uniqueProcesses);
    setSelectedProcessIds(uniqueProcesses.map((process) => process.pmId));
    clearDashboard();
    emitLogStart(hostId, uniqueProcesses);
  }

  function restartDashboardSession() {
    const hostId = selectedHostIdRef.current;
    const processesToMonitor = activeLogProcessesRef.current;

    if (
      !hostId ||
      processesToMonitor.length === 0 ||
      activeSectionRef.current !== "monitor" ||
      activeTabRef.current !== "dashboard"
    ) {
      return;
    }

    clearDashboard();
    emitDashboardStart(hostId, processesToMonitor);
    emitLogStart(hostId, processesToMonitor);
  }

  function handleDashboardAction(action: Pm2DashboardAction, processIds: number[]) {
    if (!selectedHostId || processIds.length === 0) {
      return;
    }

    const names = activeLogProcesses
      .filter((process) => processIds.includes(process.pmId))
      .map((process) => `${process.name} (PM2 ${process.pmId})`);
    const confirmed = window.confirm(
      `${action === "restart" ? "Restart" : "Reload"} the following PM2 process${
        processIds.length === 1 ? "" : "es"
      }?\n\n${names.join("\n")}`
    );

    if (!confirmed) {
      return;
    }

    setDashboardActionBusyLabel(
      `${action === "restart" ? "Restarting" : "Reloading"} ${processIds.length} PM2 process${
        processIds.length === 1 ? "" : "es"
      }...`
    );
    setDashboardError(null);
    socketRef.current?.emit("dashboard:action", {
      hostId: selectedHostId,
      action,
      targetPmIds: processIds
    });
  }

  async function loadWorkspaceData(preferredHostId?: string | null) {
    setWorkspaceBusy(true);
    setWorkspaceError(null);

    try {
      const [hostsResponse, tagsResponse] = await Promise.all([
        withSessionRetry((token) => api.getHosts(token)),
        withSessionRetry((token) => api.getTags(token))
      ]);

      const nextHosts = sortHosts(hostsResponse.hosts);
      const nextTags = sortTags(tagsResponse.tags);
      const nextSelectedHostId =
        preferredHostId && nextHosts.some((host) => host.id === preferredHostId)
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
    } catch (error) {
      setWorkspaceError(formatApiError(error, "Failed to load the workspace."));
    } finally {
      setWorkspaceBusy(false);
      setWorkspaceReady(true);
    }
  }

  async function loadProcessesForHost(hostId: string) {
    setProcessesBusy(true);
    setProcessesError(null);

    try {
      const previousSelection = selectedProcessIds;
      const response = await withSessionRetry((token) => api.getProcesses(token, hostId));
      const nextProcesses = response.processes;
      const availableProcessIds = new Set(nextProcesses.map((process) => process.pmId));

      setProcesses(nextProcesses);
      setSelectedProcessIds((current) => current.filter((pmId) => availableProcessIds.has(pmId)));
      setActiveLogProcesses((current) =>
        current.filter((process) => availableProcessIds.has(process.pmId))
      );

      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;

        if (
          previousSelection.length > 0 &&
          previousSelection.some((pmId) => !availableProcessIds.has(pmId))
        ) {
          setFlash({
            tone: "info",
            text: "Some previously selected PM2 processes are no longer available on this host."
          });
        }

        if (activeSection === "monitor" && activeTab === "dashboard" && restoreDashboardIdsRef.current.length > 0) {
          const restoredProcesses = nextProcesses.filter((process) =>
            restoreDashboardIdsRef.current.includes(process.pmId)
          );

          if (restoredProcesses.length > 0) {
            if (restoredProcesses.length !== restoreDashboardIdsRef.current.length) {
              setFlash({
                tone: "info",
                text: "Some saved dashboard targets were missing, but the remaining PM2 services were restored."
              });
            }

            startDashboard(restoredProcesses, hostId);
          } else {
            setActiveTab("processes");
            setFlash({
              tone: "info",
              text: "Saved dashboard targets were not available anymore, so the workspace returned to the Processes view."
            });
          }

          restoreDashboardIdsRef.current = [];
        } else if (activeSection === "monitor" && activeTab === "logs" && restoreLogIdsRef.current.length > 0) {
          const restoredProcesses = nextProcesses.filter((process) =>
            restoreLogIdsRef.current.includes(process.pmId)
          );

          if (restoredProcesses.length > 0) {
            if (restoredProcesses.length !== restoreLogIdsRef.current.length) {
              setFlash({
                tone: "info",
                text: "Some saved log targets were missing, but the remaining PM2 streams were restored."
              });
            }

            startLogs(restoredProcesses, hostId);
          } else {
            setActiveTab("processes");
            setFlash({
              tone: "info",
              text: "Saved log targets were not available anymore, so the dashboard returned to the Processes view."
            });
          }

          restoreLogIdsRef.current = [];
        }
      }
    } catch (error) {
      if (!restoreAttemptedRef.current) {
        restoreAttemptedRef.current = true;
      }

      setProcessesError(formatApiError(error, "Failed to load PM2 processes."));
      setProcesses([]);
    } finally {
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
      stopDashboard();
      setProcesses([]);
      setSelectedProcessIds([]);
      setActiveLogProcesses([]);
      setProcessesError(null);
      setLogStatus("idle");
      setDashboardStatus("idle");
      clearLogs();
      clearDashboard();
      previousHostIdRef.current = null;
      return;
    }

    const hostChanged = previousHostIdRef.current !== selectedHostId;
    previousHostIdRef.current = selectedHostId;

    if (hostChanged) {
      stopLogs();
      stopDashboard();
      clearLogs();
      clearDashboard();
      setActiveLogProcesses([]);
      setSelectedProcessIds([]);
      setLogStatus("idle");
      setLogError(null);
      setDashboardStatus("idle");

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
      const hostId = selectedHostIdRef.current;
      const targets = activeLogProcessesRef.current;

      if (activeSectionRef.current === "monitor" && hostId && targets.length > 0) {
        if (activeTabRef.current === "logs" || activeTabRef.current === "dashboard") {
          emitLogStart(hostId, targets);
        }

        if (activeTabRef.current === "dashboard") {
          emitDashboardStart(hostId, targets);
        }
      } else {
        setLogStatus("idle");
        setDashboardStatus("idle");
      }
    });

    socket.on("disconnect", () => {
      setLogStatus(
        activeSectionRef.current === "monitor" && activeLogProcessesRef.current.length > 0
          ? "disconnected"
          : "idle"
      );
      setDashboardStatus(
        activeSectionRef.current === "monitor" &&
          activeTabRef.current === "dashboard" &&
          activeLogProcessesRef.current.length > 0
          ? "disconnected"
          : "idle"
      );
    });

    socket.on("logs:status", (payload: { state: string }) => {
      setLogStatus(payload.state);

      if (payload.state === "stopped") {
        setPaused(false);
      }
    });

    socket.on("logs:error", (payload: { message: string }) => {
      setLogStatus("error");
      setLogError(payload.message);
    });

    socket.on("dashboard:status", (payload: { state: string }) => {
      setDashboardStatus(payload.state);

      if (payload.state === "stopped") {
        setDashboardActionBusyLabel(null);
      }
    });

    socket.on("dashboard:snapshot", (snapshot: Pm2DashboardSnapshot) => {
      setDashboardSnapshot(snapshot);
      setDashboardError(null);
      setDashboardStatus("streaming");
    });

    socket.on("dashboard:error", (payload: { message: string }) => {
      setDashboardStatus("error");
      setDashboardActionBusyLabel(null);
      setDashboardError(payload.message);
    });

    socket.on(
      "dashboard:action-result",
      (payload: {
        success: boolean;
        action: Pm2DashboardAction;
        message: string;
        targetPmIds: number[];
      }) => {
        setDashboardActionBusyLabel(null);
        setFlash({
          tone: payload.success ? "success" : "error",
          text: payload.message
        });
      }
    );

    socket.on("logs:line", (entry: LogLine) => {
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
    if (activeSection !== "monitor" || activeTab !== "dashboard" || !selectedHostId || activeLogProcesses.length === 0) {
      stopDashboard();

      if (activeTab !== "dashboard") {
        setDashboardStatus("idle");
      }

      return;
    }

    emitDashboardStart(selectedHostId, activeLogProcesses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLogProcesses, activeSection, activeTab, selectedHostId]);

  useEffect(() => {
    if (canManageUsers) {
      return;
    }

    setUsers([]);
    setUsersError(null);
  }, [canManageUsers]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    if (
      !restoreAttemptedRef.current &&
      activeSection === "monitor" &&
      ((activeTab === "logs" && restoreLogIdsRef.current.length > 0) ||
        (activeTab === "dashboard" && restoreDashboardIdsRef.current.length > 0))
    ) {
      return;
    }

    writeDashboardViewState(user.id, {
      version: 3,
      activeSection,
      selectedHostId,
      activeTab,
      settingsTab,
      hostSearch,
      selectedTagFilters,
      processSearch,
      statusFilter,
      selectedProcessIds,
      activeLogProcessIds: activeLogProcesses.map((process) => process.pmId),
      activeDashboardProcessIds: activeLogProcesses.map((process) => process.pmId),
      includePattern,
      excludePattern,
      initialLines,
      scrollLock,
      sidebarCollapsed
    });
  }, [
    activeLogProcesses,
    activeSection,
    activeTab,
    excludePattern,
    hostSearch,
    includePattern,
    initialLines,
    processSearch,
    scrollLock,
    settingsTab,
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
    } catch {
      // no-op
    } finally {
      onSessionUpdate(null, null);
    }
  }

  async function handleThemeSelect(themeId: ThemeId) {
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
    } catch (error) {
      const message = formatApiError(error, "Failed to update theme.");
      setThemeError(message);
      setFlash({
        tone: "error",
        text: message
      });
      throw error;
    } finally {
      setThemeBusy(false);
    }
  }

  async function loadUsers() {
    if (!canManageUsers) {
      setUsers([]);
      setUsersError(null);
      return;
    }

    setUsersBusy(true);
    setUsersError(null);

    try {
      const response = await withSessionRetry((token) => api.getUsers(token));
      setUsers(response.users);
    } catch (error) {
      setUsersError(formatApiError(error, "Failed to load workspace users."));
    } finally {
      setUsersBusy(false);
    }
  }

  async function handleProfileSave(payload: {
    email?: string;
    currentPassword: string;
    newPassword?: string;
  }) {
    const response = await withSessionRetry((token) => api.updateProfile(token, payload));
    setSessionToken(response.accessToken);
    sessionTokenRef.current = response.accessToken;
    onSessionUpdate(response.user, response.accessToken);
    setFlash({
      tone: "success",
      text: "Profile updated."
    });
  }

  async function handleUserCreate(payload: { email: string; password: string; role: User["role"] }) {
    await withSessionRetry((token) => api.createUser(token, payload));
    setFlash({
      tone: "success",
      text: "User account created."
    });
  }

  async function handleUserUpdate(
    userId: string,
    payload: { email?: string; password?: string; role?: User["role"] }
  ) {
    await withSessionRetry((token) => api.updateUser(token, userId, payload));
    setFlash({
      tone: "success",
      text: "User account updated."
    });
  }

  async function handleUserDelete(targetUser: ManagedUser) {
    const confirmed = window.confirm(`Delete ${targetUser.email}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    await withSessionRetry((token) => api.deleteUser(token, targetUser.id));
    setFlash({
      tone: "success",
      text: "User account deleted."
    });
    await loadUsers();
  }

  async function handleHostSave(payload: HostPayload, hostId?: string) {
    if (!canManageWorkspace) {
      return;
    }

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
    } catch (error) {
      setFlash({
        tone: "error",
        text: formatApiError(error, "Failed to save host.")
      });
    } finally {
      setHostMutationBusy(false);
    }
  }

  async function handleHostDelete(host: Host) {
    if (!canManageWorkspace) {
      return;
    }

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
    } catch (error) {
      setFlash({
        tone: "error",
        text: formatApiError(error, "Failed to delete host.")
      });
    } finally {
      setHostActionBusyId(null);
    }
  }

  async function handleHostTest(host: Host, repinFingerprint = false) {
    if (!canManageWorkspace) {
      return;
    }

    setHostActionBusyId(host.id);

    try {
      const response = await withSessionRetry((token) => api.testHost(token, host.id, repinFingerprint));
      setHosts((current) =>
        sortHosts(current.map((item) => (item.id === response.host.id ? response.host : item)))
      );
      setFlash({
        tone: "success",
        text: `Connected to ${host.name}. PM2 ${response.connection.pm2Version} detected.`
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "HOST_KEY_MISMATCH") {
        const confirmed = window.confirm(
          `The fingerprint for ${host.name} changed. Repin the new fingerprint and test again?`
        );

        if (confirmed) {
          await handleHostTest(host, true);
          return;
        }
      }

      setFlash({
        tone: "error",
        text: formatApiError(error, "Connection test failed.")
      });
    } finally {
      setHostActionBusyId(null);
    }
  }

  async function handleTagSubmit() {
    if (!canManageWorkspace) {
      return;
    }

    if (!tagDraft.name.trim()) {
      return;
    }

    setTagBusy(true);

    try {
      if (tagDraft.id) {
        await withSessionRetry((token) =>
          api.updateTag(token, tagDraft.id!, {
            name: tagDraft.name.trim(),
            color: tagDraft.color
          })
        );
      } else {
        await withSessionRetry((token) =>
          api.createTag(token, {
            name: tagDraft.name.trim(),
            color: tagDraft.color
          })
        );
      }

      setTagDraft({ id: null, name: "", color: "#64748b" });
      await loadWorkspaceData(selectedHostId);
    } catch (error) {
      setFlash({
        tone: "error",
        text: formatApiError(error, "Failed to save tag.")
      });
    } finally {
      setTagBusy(false);
    }
  }

  async function handleTagDelete(tag: Tag) {
    if (!canManageWorkspace) {
      return;
    }

    const confirmed = window.confirm(`Delete tag ${tag.name}?`);

    if (!confirmed) {
      return;
    }

    setTagBusy(true);

    try {
      await withSessionRetry((token) => api.deleteTag(token, tag.id));
      setSelectedTagFilters((current) => current.filter((item) => item !== tag.id));
      await loadWorkspaceData(selectedHostId);
    } catch (error) {
      setFlash({
        tone: "error",
        text: formatApiError(error, "Failed to delete tag.")
      });
    } finally {
      setTagBusy(false);
    }
  }

  function toggleProcessSelection(pmId: number) {
    setSelectedProcessIds((current) =>
      current.includes(pmId) ? current.filter((item) => item !== pmId) : [...current, pmId]
    );
  }

  function handleHostSelection(hostId: string) {
    setSelectedHostId(hostId);
    setActiveSection("monitor");
    setActiveTab("processes");
    setHostMenuOpenId(null);
  }

  function isPanelCollapsed(panelId: string) {
    return Boolean(panelLayout[panelId]);
  }

  function togglePanel(panelId: string) {
    const previousLayout = panelLayout;
    const nextLayout = {
      ...previousLayout,
      [panelId]: !previousLayout[panelId]
    };

    setPanelLayout(nextLayout);

    void withSessionRetry((token) => api.updateSettings(token, { panelLayout: nextLayout }))
      .then((response) => {
        onSessionUpdate(response.user, sessionTokenRef.current);
      })
      .catch((error) => {
        setPanelLayout(previousLayout);
        setFlash({
          tone: "error",
          text: formatApiError(error, "Failed to save the panel layout.")
        });
      });
  }

  const allFilteredSelected =
    filteredProcesses.length > 0 &&
    filteredProcesses.every((process) => selectedProcessIds.includes(process.pmId));
  const selectedProcesses = processes.filter((process) => selectedProcessIds.includes(process.pmId));

  return (
    <>
      <HostModal
        busy={hostMutationBusy}
        host={editingHost}
        onClose={() => {
          setEditingHost(null);
          setHostModalOpen(false);
        }}
        onSubmit={handleHostSave}
        open={canManageWorkspace && hostModalOpen}
        tags={tags}
      />

      <div className="h-screen overflow-hidden px-3 py-3 sm:px-4 sm:py-4" data-ui="workspace-dashboard">
        <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-3">
          <header className="panel flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" data-ui="app-header">
            <div className="flex items-center gap-3">
              <BrandLockup descriptor="Ops" size="compact" />
              <span className="badge hidden sm:inline-flex">{hosts.length} hosts</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-[0.9rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-1">
                <button
                  className="button-tab"
                  data-active={activeSection === "monitor"}
                  onClick={() => setActiveSection("monitor")}
                  type="button"
                >
                  Monitor
                </button>
                <button
                  className="button-tab"
                  data-active={activeSection === "settings"}
                  onClick={() => setActiveSection("settings")}
                  type="button"
                >
                  <Cog className="mr-2 size-4" />
                  Settings
                </button>
              </div>
              <ThemeMenu
                activeThemeId={activeThemeId}
                busy={themeBusy}
                error={themeError}
                onClearPreview={onClearThemePreview}
                onPreviewTheme={onPreviewTheme}
                onSelectTheme={handleThemeSelect}
                savedThemeId={user.settings.themeId}
              />
              <div className="rounded-[0.9rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`badge border-transparent ${
                      user.role === "OWNER"
                        ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                        : user.role === "ADMIN"
                          ? "bg-[color:var(--warning-soft)] text-[color:var(--warning)]"
                          : ""
                    }`}
                  >
                    {user.role}
                  </span>
                  <div className="max-w-[18rem] truncate text-sm font-medium text-[color:var(--text)]">
                    {user.email}
                  </div>
                </div>
              </div>
              <button className="button-secondary" onClick={handleSignOut} type="button">
                <LogOut className="mr-2 size-4" />
                Sign out
              </button>
            </div>
          </header>

          {flash ? (
            <div className="flash" data-tone={flash.tone} data-ui="workspace-flash">
              {flash.text}
            </div>
          ) : null}

          {workspaceError ? (
            <div className="flash" data-tone="error" data-ui="workspace-error">
              {workspaceError}
            </div>
          ) : null}

          {activeSection === "settings" ? (
            <SettingsPanel
              canManageUsers={canManageUsers}
              currentUser={user}
              onCreateUser={handleUserCreate}
              onDeleteUser={handleUserDelete}
              onProfileSave={handleProfileSave}
              onRefreshUsers={loadUsers}
              onSettingsTabChange={setSettingsTab}
              onThemeSelect={handleThemeSelect}
              onUpdateUser={handleUserUpdate}
              settingsTab={settingsTab}
              themeBusy={themeBusy}
              users={users}
              usersBusy={usersBusy}
              usersError={usersError}
            />
          ) : (
          <div className="min-h-0 flex flex-1 flex-col gap-3 lg:flex-row">
            <aside
              className={`panel flex min-h-0 shrink-0 flex-col overflow-hidden ${
                sidebarCollapsed ? "lg:w-[5.25rem]" : "lg:w-[21rem]"
              }`}
              data-ui="hosts-sidebar"
            >
              <div className="border-b border-[color:var(--border)] px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className={`${sidebarCollapsed ? "hidden" : "block"}`}>
                    <div className="section-kicker">Hosts</div>
                      <div className="mt-1 text-sm font-semibold text-[color:var(--text)]">
                        {filteredHosts.length} visible
                      </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="button-ghost h-8 w-8 p-0"
                      onClick={() => setSidebarCollapsed((current) => !current)}
                      title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                      type="button"
                    >
                      {sidebarCollapsed ? (
                        <PanelLeftOpen className="size-4" />
                      ) : (
                        <PanelLeftClose className="size-4" />
                      )}
                    </button>
                    {canManageWorkspace ? (
                      <button
                        className={`${sidebarCollapsed ? "button-ghost h-8 w-8 p-0" : "button-primary"}`}
                        onClick={() => {
                          setEditingHost(null);
                          setHostModalOpen(true);
                        }}
                        title="Add host"
                        type="button"
                      >
                        <Plus className={`size-4 ${sidebarCollapsed ? "" : "mr-2"}`} />
                        {sidebarCollapsed ? <span className="sr-only">Add host</span> : "Add host"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {!sidebarCollapsed ? (
                  <>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-soft)]" />
                      <input
                        className="field pl-9"
                        data-ui="host-search"
                        onChange={(event) => setHostSearch(event.target.value)}
                        placeholder="Search hosts"
                        value={hostSearch}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tags.map((tag) => {
                        const active = selectedTagFilters.includes(tag.id);

                        return (
                          <TagChip
                            active={active}
                            clickable
                            key={tag.id}
                            onClick={() =>
                              setSelectedTagFilters((current) =>
                                current.includes(tag.id)
                                  ? current.filter((item) => item !== tag.id)
                                  : [...current, tag.id]
                              )
                            }
                            tag={tag}
                          />
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-2 py-2" data-ui="hosts-list">
                {workspaceBusy && hosts.length === 0 ? (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        className="panel-soft h-16 animate-pulse"
                        key={`host-skeleton-${index}`}
                      />
                    ))}
                  </div>
                ) : filteredHosts.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-[color:var(--text-muted)]">
                    {hosts.length === 0
                      ? canManageWorkspace
                        ? "Add SSH host."
                        : "No hosts."
                      : "No matches."}
                  </div>
                ) : sidebarCollapsed ? (
                  <div className="space-y-2">
                    {filteredHosts.map((host) => (
                      <button
                        className={`flex h-12 w-full items-center justify-center rounded-[0.95rem] border text-xs font-semibold ${
                          host.id === selectedHostId
                            ? "border-[color:var(--border-strong)] bg-[color:var(--accent-soft)] text-[color:var(--text)]"
                            : "border-transparent bg-transparent text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"
                        }`}
                        data-host-id={host.id}
                        data-ui="host-card"
                        key={host.id}
                        onClick={() => handleHostSelection(host.id)}
                        title={host.name}
                        type="button"
                      >
                        {getInitials(host.name) || "?"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredHosts.map((host) => {
                      const busy = hostActionBusyId === host.id;

                      return (
                        <div
                          className="host-row group cursor-pointer"
                          data-active={host.id === selectedHostId}
                          data-host-id={host.id}
                          data-ui="host-card"
                          key={host.id}
                          onClick={() => handleHostSelection(host.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleHostSelection(host.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-[0.95rem] bg-[color:var(--surface-strong)] text-xs font-semibold text-[color:var(--text)]">
                              {getInitials(host.name) || "?"}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-sm font-semibold text-[color:var(--text)]">
                                  {host.name}
                                </div>
                                <span className="badge">
                                  {host.authType === "PASSWORD" ? "Password" : "Key"}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                                {host.username}@{host.host}:{host.port}
                              </div>
                              {host.tags.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {host.tags.slice(0, 4).map((tag) => (
                                    <TagChip compact key={tag.id} tag={tag} />
                                  ))}
                                  {host.tags.length > 4 ? (
                                    <TagChip compact label={`+${host.tags.length - 4}`} showDot={false} />
                                  ) : null}
                                </div>
                              ) : null}
                          <div className="mt-2 text-[11px] text-[color:var(--text-soft)]">
                            {formatLastTested(host.lastTestedAt)}
                          </div>
                            </div>

                            {canManageWorkspace ? (
                              <div
                                className="relative shrink-0 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  className="button-ghost h-8 w-8 p-0"
                                  data-ui="host-card-menu-trigger"
                                  disabled={busy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setHostMenuOpenId((current) => (current === host.id ? null : host.id));
                                  }}
                                  title="Host actions"
                                  type="button"
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>

                                {hostMenuOpenId === host.id ? (
                                  <div
                                    className="absolute right-0 top-9 z-20 min-w-[11rem] rounded-[0.95rem] border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated)] p-1.5 shadow-[0_18px_38px_rgba(0,0,0,0.22)]"
                                    data-ui="host-card-menu"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      className="button-ghost w-full justify-start px-2.5 py-2 text-sm"
                                      disabled={busy}
                                      onClick={() => {
                                        setHostMenuOpenId(null);
                                        void handleHostTest(host);
                                      }}
                                      type="button"
                                    >
                                      <RefreshCw className="mr-2 size-4" />
                                      Test connection
                                    </button>
                                    <button
                                      className="button-ghost w-full justify-start px-2.5 py-2 text-sm"
                                      onClick={() => {
                                        setHostMenuOpenId(null);
                                        setEditingHost(host);
                                        setHostModalOpen(true);
                                      }}
                                      type="button"
                                    >
                                      <PencilLine className="mr-2 size-4" />
                                      Edit host
                                    </button>
                                    <button
                                      className="button-ghost w-full justify-start px-2.5 py-2 text-sm text-[color:var(--danger)]"
                                      disabled={busy}
                                      onClick={() => {
                                        setHostMenuOpenId(null);
                                        void handleHostDelete(host);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 className="mr-2 size-4" />
                                      Delete host
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!sidebarCollapsed && canManageWorkspace ? (
                <div className="shrink-0 border-t border-[color:var(--border)] px-3 py-3">
                  <button
                    className="button-ghost w-full justify-between px-2.5 py-2"
                    onClick={() => setTagManagerOpen((current) => !current)}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <TagIcon className="size-4" />
                      Tags
                    </span>
                    <ChevronDown
                      className={`size-4 transition ${tagManagerOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {tagManagerOpen ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_auto]">
                        <input
                          className="field"
                          onChange={(event) =>
                            setTagDraft((current) => ({ ...current, name: event.target.value }))
                          }
                          placeholder="Tag name"
                          value={tagDraft.name}
                        />
                        <input
                          className="color-field"
                          onChange={(event) =>
                            setTagDraft((current) => ({ ...current, color: event.target.value }))
                          }
                          type="color"
                          value={tagDraft.color}
                        />
                        <button
                          className="button-primary justify-center"
                          disabled={tagBusy}
                          onClick={() => void handleTagSubmit()}
                          type="button"
                        >
                          {tagDraft.id ? "Update" : "Create"}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {tags.length === 0 ? (
                          <div className="text-xs text-[color:var(--text-muted)]">
                            No tags
                          </div>
                        ) : (
                          tags.map((tag) => (
                            <div
                              className="panel-soft flex items-center justify-between gap-3 px-3 py-2"
                              key={tag.id}
                            >
                              <div className="min-w-0">
                                <TagChip tag={tag} />
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  className="button-ghost px-2 py-1 text-xs"
                                  onClick={() =>
                                    setTagDraft({
                                      id: tag.id,
                                      name: tag.name,
                                      color: tag.color ?? "#64748b"
                                    })
                                  }
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  className="button-ghost px-2 py-1 text-xs"
                                  onClick={() => void handleTagDelete(tag)}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
            <main className="flex min-h-0 flex-1 flex-col gap-3" data-ui="workspace-main">
              {activeTab === "processes" ? (
                <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" data-ui="processes-section">
                  <div className="border-b border-[color:var(--border)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="section-kicker">Processes</div>
                      </div>
                      <CollapseToggleButton
                        collapsed={isPanelCollapsed("processes-section")}
                        onClick={() => togglePanel("processes-section")}
                      />
                    </div>

                    {!isPanelCollapsed("processes-section") ? (
                    <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="relative min-w-[15rem] flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[color:var(--text-soft)]" />
                        <input
                          className="field pl-9"
                          data-ui="process-search"
                          onChange={(event) => setProcessSearch(event.target.value)}
                          placeholder="Search processes"
                          value={processSearch}
                        />
                      </div>

                      <select
                        className="field w-auto min-w-[8.5rem]"
                        data-ui="process-status-filter"
                        onChange={(event) => setStatusFilter(event.target.value)}
                        value={statusFilter}
                      >
                        <option value="all">All statuses</option>
                        <option value="online">Online</option>
                        <option value="stopped">Stopped</option>
                        <option value="errored">Errored</option>
                      </select>

                      <button
                        className="button-primary"
                        disabled={!selectedHost || processesBusy || selectedProcesses.length === 0}
                        onClick={() => startDashboard(selectedProcesses)}
                        type="button"
                      >
                        <Activity className="mr-2 size-4" />
                        Open dashboard
                      </button>

                      <button
                        className="button-secondary"
                        disabled={!selectedHost || processesBusy || selectedProcesses.length === 0}
                        onClick={() => startLogs(selectedProcesses)}
                        type="button"
                      >
                        <TerminalSquare className="mr-2 size-4" />
                        Open logs
                      </button>

                      <button
                        className="button-secondary"
                        disabled={!selectedHost || processesBusy}
                        onClick={() => {
                          if (!selectedHostId) {
                            return;
                          }

                          void loadProcessesForHost(selectedHostId);
                        }}
                        type="button"
                      >
                        <RefreshCw className="mr-2 size-4" />
                        Refresh
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="badge">
                        <Activity className="size-3.5" />
                        {processes.length} total
                      </span>
                      <span className="badge">{filteredProcesses.length} visible</span>
                      <span className="badge">{selectedProcessIds.length} selected</span>
                      {processesBusy ? <span className="badge">Refreshing...</span> : null}
                    </div>
                    </>
                    ) : null}
                  </div>

                  {!isPanelCollapsed("processes-section") && processesError ? (
                    <div className="px-4 py-3">
                      <div className="flash" data-tone="error">
                        {processesError}
                      </div>
                    </div>
                  ) : null}

                  {!isPanelCollapsed("processes-section") ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <table className="min-w-full table-fixed" data-ui="process-table">
                      <thead className="border-b border-[color:var(--border)] text-left text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
                        <tr>
                          <th className="w-11 px-4 py-3">
                            <input
                              checked={allFilteredSelected}
                              onChange={() =>
                                setSelectedProcessIds(
                                  allFilteredSelected ? [] : filteredProcesses.map((process) => process.pmId)
                                )
                              }
                              type="checkbox"
                            />
                          </th>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">PID</th>
                          <th className="px-4 py-3">CPU</th>
                          <th className="px-4 py-3">Memory</th>
                          <th className="px-4 py-3">Uptime</th>
                          <th className="px-4 py-3">Restarts</th>
                          <th className="px-4 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processesBusy && filteredProcesses.length === 0 ? (
                          <tr>
                            <td className="px-4 py-12 text-center text-sm text-[color:var(--text-muted)]" colSpan={9}>
                              Fetching PM2 processes...
                            </td>
                          </tr>
                        ) : filteredProcesses.length === 0 ? (
                          <tr>
                            <td className="px-4 py-12 text-center text-sm text-[color:var(--text-muted)]" colSpan={9}>
                              No matches.
                            </td>
                          </tr>
                        ) : (
                          filteredProcesses.map((process) => (
                            <tr
                              className="border-b border-[color:var(--border)] text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)]"
                              data-process-id={process.pmId}
                              data-ui="process-row"
                              key={process.pmId}
                            >
                              <td className="px-4 py-2.5">
                                <input
                                  checked={selectedProcessIds.includes(process.pmId)}
                                  onChange={() => toggleProcessSelection(process.pmId)}
                                  type="checkbox"
                                />
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="font-medium text-[color:var(--text)]">{process.name}</div>
                                <div className="mt-0.5 text-[11px] text-[color:var(--text-soft)]">
                                  PM2 ID {process.pmId}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <StatusPill status={process.status} />
                              </td>
                              <td className="px-4 py-2.5">{process.pid ?? "n/a"}</td>
                              <td className="px-4 py-2.5">{process.cpu.toFixed(1)}%</td>
                              <td className="px-4 py-2.5">{formatBytes(process.memory)}</td>
                              <td className="px-4 py-2.5">{formatUptime(process.uptime)}</td>
                              <td className="px-4 py-2.5">{process.restartCount}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    className="button-secondary px-2.5 py-1.5 text-xs"
                                    onClick={() => startDashboard(process)}
                                    type="button"
                                  >
                                    Dashboard
                                  </button>
                                  <button
                                    className="button-secondary px-2.5 py-1.5 text-xs"
                                    onClick={() => startLogs(process)}
                                    type="button"
                                  >
                                    Logs
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  ) : null}

                  {!isPanelCollapsed("processes-section") ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border)] px-4 py-2 text-xs text-[color:var(--text-muted)]">
                    <span>{selectedProcessIds.length} selected</span>
                    <span className="badge">{selectedHost ? selectedHost.host : "No host selected"}</span>
                  </div>
                  ) : null}
                </section>
              ) : activeTab === "dashboard" ? (
                <MonitorDashboard
                  actionBusyLabel={dashboardActionBusyLabel}
                  activeTargets={activeLogProcesses}
                  canManageActions={canManageWorkspace}
                  dashboardError={dashboardError}
                  dashboardStatus={dashboardStatus}
                  host={selectedHost}
                  isPanelCollapsed={isPanelCollapsed}
                  logError={logError}
                  logLines={visibleLogLines}
                  logStatus={logStatus}
                  onAction={handleDashboardAction}
                  onBackToProcesses={() => setActiveTab("processes")}
                  onOpenLogs={() => setActiveTab("logs")}
                  onRefresh={restartDashboardSession}
                  onTogglePanel={togglePanel}
                  snapshot={dashboardSnapshot}
                />
              ) : (
                <LogPanel
                  bufferedLineCount={rawLogBufferRef.current.length}
                  collapsed={isPanelCollapsed("logs-panel")}
                  excludePattern={excludePattern}
                  filterError={filterError}
                  host={selectedHost}
                  includePattern={includePattern}
                  initialLines={initialLines}
                  lines={visibleLogLines}
                  onClear={clearLogs}
                  onDownload={() => {
                    const output = visibleLogLines
                      .map(
                        (line) =>
                          `[${line.timestamp}] [${line.processLabel}] ${
                            line.source === "stderr" ? "[stderr] " : ""
                          }${line.line}`
                      )
                      .join("\n");
                    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    const label =
                      activeLogProcesses.length === 1
                        ? activeLogProcesses[0].name
                        : `${activeLogProcesses.length}-processes`;
                    anchor.download = `${selectedHost?.name ?? "host"}-${label}.txt`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                  onExcludePatternChange={setExcludePattern}
                  onIncludePatternChange={setIncludePattern}
                  onInitialLinesChange={setInitialLines}
                  onBackToProcesses={() => setActiveTab("processes")}
                  onPauseToggle={() => {
                    setPaused((current) => {
                      const next = !current;

                      if (!next) {
                        applyLogFilters(rawLogBufferRef.current);
                      }

                      return next;
                    });
                  }}
                  onRestart={() => activeLogProcesses.length > 0 && startLogs(activeLogProcesses)}
                  onScrollLockToggle={() => setScrollLock((current) => !current)}
                  onToggleCollapsed={() => togglePanel("logs-panel")}
                  paused={paused}
                  processes={activeLogProcesses}
                  scrollLock={scrollLock}
                  status={logStatus}
                  streamError={logError}
                />
              )}
            </main>
          </div>
          )}
        </div>
      </div>
    </>
  );
}
