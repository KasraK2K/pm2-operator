import {
  Activity,
  CircleAlert,
  Cpu,
  LogOut,
  PencilLine,
  Plus,
  RefreshCw,
  Server,
  Shield,
  Tag as TagIcon,
  TerminalSquare,
  Trash2
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../lib/api";
import { formatBytes, formatLastTested, formatUptime } from "../lib/format";
import type { Host, HostPayload, LogLine, Pm2Process, Tag, User } from "../lib/types";
import { HostModal } from "./HostModal";
import { LogPanel } from "./LogPanel";

interface DashboardProps {
  user: User;
  accessToken: string;
  onSessionUpdate: (user: User | null, accessToken: string | null) => void;
}

const CLIENT_LOG_BUFFER_LIMIT = 2000;

function statusBadge(status: string) {
  if (status === "online") {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (status === "stopped") {
    return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

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

export function Dashboard({ user, accessToken, onSessionUpdate }: DashboardProps) {
  const [sessionToken, setSessionToken] = useState(accessToken);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [hostSearch, setHostSearch] = useState("");
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [hostModalOpen, setHostModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [hostMutationBusy, setHostMutationBusy] = useState(false);
  const [hostActionBusyId, setHostActionBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [tagDraft, setTagDraft] = useState<{ id: string | null; name: string; color: string }>({
    id: null,
    name: "",
    color: "#64748b"
  });
  const [tagBusy, setTagBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"processes" | "logs">("processes");
  const [processes, setProcesses] = useState<Pm2Process[]>([]);
  const [processSearch, setProcessSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [processesBusy, setProcessesBusy] = useState(false);
  const [processesError, setProcessesError] = useState<string | null>(null);
  const [selectedProcessIds, setSelectedProcessIds] = useState<number[]>([]);
  const [activeLogProcesses, setActiveLogProcesses] = useState<Pm2Process[]>([]);
  const [visibleLogLines, setVisibleLogLines] = useState<LogLine[]>([]);
  const [logStatus, setLogStatus] = useState("idle");
  const [logError, setLogError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [scrollLock, setScrollLock] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [initialLines, setInitialLines] = useState(200);

  const socketRef = useRef<Socket | null>(null);
  const pausedRef = useRef(false);
  const rawLogBufferRef = useRef<LogLine[]>([]);

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
    onSessionUpdate(session.user, session.accessToken);
    return session.accessToken;
  }

  async function withSessionRetry<T>(operation: (token: string) => Promise<T>) {
    try {
      return await operation(sessionToken);
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

      setHosts(nextHosts);
      setTags(nextTags);

      const nextSelectedHostId =
        preferredHostId && nextHosts.some((host) => host.id === preferredHostId)
          ? preferredHostId
          : nextHosts[0]?.id ?? null;

      setSelectedHostId(nextSelectedHostId);
    } catch (error) {
      setWorkspaceError(formatApiError(error, "Failed to load the workspace."));
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function loadProcessesForHost(hostId: string) {
    setProcessesBusy(true);
    setProcessesError(null);

    try {
      const response = await withSessionRetry((token) => api.getProcesses(token, hostId));
      setProcesses(response.processes);
    } catch (error) {
      setProcessesError(formatApiError(error, "Failed to load PM2 processes."));
      setProcesses([]);
    } finally {
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

  function clearLogs() {
    rawLogBufferRef.current = [];
    setVisibleLogLines([]);
    setLogError(null);
    setFilterError(null);
  }

  function stopLogs() {
    socketRef.current?.emit("logs:stop");
  }

  function startLogs(processSelection: Pm2Process | Pm2Process[]) {
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
    } catch {
      // no-op
    } finally {
      onSessionUpdate(null, null);
    }
  }

  async function handleHostSave(payload: HostPayload, hostId?: string) {
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
        open={hostModalOpen}
        tags={tags}
      />

      <div className="min-h-screen px-4 py-4 text-slate-100 md:px-6 md:py-6">
        <div className="mx-auto max-w-[1600px] space-y-4">
          <header className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-200">
                <Shield className="size-4" />
                PM2 Log Viewer
              </div>
              <h1 className="text-3xl font-semibold text-white">Remote PM2 operations cockpit</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                <div className="text-sm text-slate-400">Signed in as</div>
                <div className="text-sm font-medium text-white">{user.email}</div>
              </div>
              <button className="button-secondary" onClick={handleSignOut} type="button">
                <LogOut className="mr-2 size-4" />
                Sign out
              </button>
            </div>
          </header>

          {flash ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                flash.tone === "success"
                  ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/20 bg-rose-400/10 text-rose-100"
              }`}
            >
              {flash.text}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
            <aside className="panel flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden">
              <div className="border-b border-white/10 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Hosts</div>
                    <div className="mt-1 text-xl font-semibold text-white">{filteredHosts.length}</div>
                  </div>
                  <button
                    className="button-primary"
                    onClick={() => {
                      setEditingHost(null);
                      setHostModalOpen(true);
                    }}
                    type="button"
                  >
                    <Plus className="mr-2 size-4" />
                    Add host
                  </button>
                </div>
                <input
                  className="field mt-4"
                  onChange={(event) => setHostSearch(event.target.value)}
                  placeholder="Search name, host, or user"
                  value={hostSearch}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const active = selectedTagFilters.includes(tag.id);

                    return (
                      <button
                        className={`rounded-full border px-3 py-1.5 text-xs transition ${
                          active
                            ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                            : "border-white/10 bg-white/5 text-slate-300"
                        }`}
                        key={tag.id}
                        onClick={() =>
                          setSelectedTagFilters((current) =>
                            current.includes(tag.id)
                              ? current.filter((item) => item !== tag.id)
                              : [...current, tag.id]
                          )
                        }
                        type="button"
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-3">
                {workspaceBusy ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Loading workspace...
                  </div>
                ) : workspaceError ? (
                  <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
                    {workspaceError}
                  </div>
                ) : filteredHosts.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-slate-500">
                    Add an SSH host to begin.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredHosts.map((host) => {
                      const active = selectedHostId === host.id;
                      const busy = hostActionBusyId === host.id;

                      return (
                        <div
                          className={`w-full rounded-3xl border p-4 text-left transition ${
                            active
                              ? "border-sky-400/30 bg-sky-400/10"
                              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                          }`}
                          key={host.id}
                          onClick={() => setSelectedHostId(host.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedHostId(host.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-white">{host.name}</div>
                              <div className="mt-1 text-sm text-slate-400">
                                {host.username}@{host.host}:{host.port}
                              </div>
                            </div>
                            <Server className="size-4 text-slate-500" />
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {host.tags.map((tag) => (
                              <span
                                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300"
                                key={tag.id}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 text-xs text-slate-500">
                            {formatLastTested(host.lastTestedAt)}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              className="button-secondary"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleHostTest(host);
                              }}
                              type="button"
                            >
                              <RefreshCw className="mr-2 size-4" />
                              Test
                            </button>
                            <button
                              className="button-secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditingHost(host);
                                setHostModalOpen(true);
                              }}
                              type="button"
                            >
                              <PencilLine className="mr-2 size-4" />
                              Edit
                            </button>
                            <button
                              className="button-secondary"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleHostDelete(host);
                              }}
                              type="button"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                  <TagIcon className="size-4 text-slate-500" />
                  Tag manager
                </div>
                <div className="space-y-3">
                  <div className="grid gap-3">
                    <input
                      className="field"
                      onChange={(event) =>
                        setTagDraft((current) => ({ ...current, name: event.target.value }))
                      }
                      placeholder="Tag name"
                      value={tagDraft.name}
                    />
                    <div className="flex gap-3">
                      <input
                        className="h-12 w-16 rounded-2xl border border-white/10 bg-transparent p-2"
                        onChange={(event) =>
                          setTagDraft((current) => ({ ...current, color: event.target.value }))
                        }
                        type="color"
                        value={tagDraft.color}
                      />
                      <button
                        className="button-primary flex-1"
                        disabled={tagBusy}
                        onClick={() => void handleTagSubmit()}
                        type="button"
                      >
                        {tagDraft.id ? "Update tag" : "Create tag"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {tags.map((tag) => (
                      <div
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2"
                        key={tag.id}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="size-3 rounded-full"
                            style={{ backgroundColor: tag.color ?? "#64748b" }}
                          />
                          <span className="text-sm text-slate-200">{tag.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            className="button-ghost"
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
                            className="button-ghost"
                            onClick={() => void handleTagDelete(tag)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <main className="space-y-4">
              <section className="panel px-6 py-5">
                {selectedHost ? (
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                        <Activity className="size-4" />
                        Active host
                      </div>
                      <h2 className="mt-3 text-3xl font-semibold text-white">{selectedHost.name}</h2>
                      <div className="mt-2 text-sm text-slate-400">
                        {selectedHost.username}@{selectedHost.host}:{selectedHost.port}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-300">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                          {selectedHost.authType === "PASSWORD" ? "Password auth" : "Private key"}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                          Fingerprint {selectedHost.hostFingerprint ?? "not pinned"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button
                        className={`button-ghost ${activeTab === "processes" ? "bg-white/10 text-white" : ""}`}
                        onClick={() => setActiveTab("processes")}
                        type="button"
                      >
                        Processes
                      </button>
                      <button
                        className={`button-ghost ${activeTab === "logs" ? "bg-white/10 text-white" : ""}`}
                        onClick={() => setActiveTab("logs")}
                        type="button"
                      >
                        Logs
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">Select a host to inspect its PM2 processes.</div>
                )}
              </section>

              {activeTab === "processes" ? (
                <section className="panel overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
                    <div>
                      <h3 className="text-2xl font-semibold text-white">PM2 processes</h3>
                      <p className="mt-2 text-sm text-slate-400">
                        Searchable process inventory with status filtering and log shortcuts.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <input
                        className="field min-w-56"
                        onChange={(event) => setProcessSearch(event.target.value)}
                        placeholder="Search processes"
                        value={processSearch}
                      />
                      <select
                        className="field min-w-40"
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
                        onClick={() => startLogs(selectedProcesses)}
                        type="button"
                      >
                        <TerminalSquare className="mr-2 size-4" />
                        Open selected logs
                      </button>
                      <button
                        className="button-secondary"
                        disabled={!selectedHost || processesBusy}
                        onClick={() => {
                          if (!selectedHostId) {
                            return;
                          }

                          void (async () => {
                            await loadWorkspaceData(selectedHostId);
                            await loadProcessesForHost(selectedHostId);
                          })();
                        }}
                        type="button"
                      >
                        <RefreshCw className="mr-2 size-4" />
                        Refresh processes
                      </button>
                    </div>
                  </div>

                  {processesError ? (
                    <div className="px-6 py-5">
                      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                        {processesError}
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="min-w-full table-fixed">
                        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                          <tr>
                            <th className="w-12 px-6 py-4">
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
                            <th className="px-6 py-4">Name</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">PID</th>
                            <th className="px-6 py-4">CPU</th>
                            <th className="px-6 py-4">Memory</th>
                            <th className="px-6 py-4">Uptime</th>
                            <th className="px-6 py-4">Restarts</th>
                            <th className="px-6 py-4">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {processesBusy ? (
                            <tr>
                              <td className="px-6 py-12 text-center text-sm text-slate-400" colSpan={9}>
                                Fetching PM2 processes...
                              </td>
                            </tr>
                          ) : filteredProcesses.length === 0 ? (
                            <tr>
                              <td className="px-6 py-12 text-center text-sm text-slate-500" colSpan={9}>
                                No processes match the current filters.
                              </td>
                            </tr>
                          ) : (
                            filteredProcesses.map((process) => (
                              <tr className="text-sm text-slate-200" key={process.pmId}>
                                <td className="px-6 py-4">
                                  <input
                                    checked={selectedProcessIds.includes(process.pmId)}
                                    onChange={() => toggleProcessSelection(process.pmId)}
                                    type="checkbox"
                                  />
                                </td>
                                <td className="px-6 py-4">
                                  <div className="font-medium text-white">{process.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">PM2 ID {process.pmId}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={`rounded-full border px-3 py-1 text-xs ${statusBadge(process.status)}`}>
                                    {process.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4">{process.pid ?? "n/a"}</td>
                                <td className="px-6 py-4">{process.cpu.toFixed(1)}%</td>
                                <td className="px-6 py-4">{formatBytes(process.memory)}</td>
                                <td className="px-6 py-4">{formatUptime(process.uptime)}</td>
                                <td className="px-6 py-4">{process.restartCount}</td>
                                <td className="px-6 py-4">
                                  <button
                                    className="button-secondary"
                                    onClick={() => startLogs(process)}
                                    type="button"
                                  >
                                    <TerminalSquare className="mr-2 size-4" />
                                    Open logs
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="border-t border-white/10 px-6 py-4 text-sm text-slate-400">
                    {selectedProcessIds.length} process{selectedProcessIds.length === 1 ? "" : "es"} selected
                  </div>
                </section>
              ) : (
                <LogPanel
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
                          `[${line.timestamp}] [${line.source}] [${line.processLabel}] ${line.line}`
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
                  paused={paused}
                  processes={activeLogProcesses}
                  scrollLock={scrollLock}
                  status={logStatus}
                  streamError={logError}
                />
              )}

              <section className="grid gap-4 md:grid-cols-3">
                <div className="panel px-5 py-4">
                  <div className="flex items-center gap-3 text-slate-400">
                    <Cpu className="size-4" />
                    Process count
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">{processes.length}</div>
                </div>
                <div className="panel px-5 py-4">
                  <div className="flex items-center gap-3 text-slate-400">
                    <TerminalSquare className="size-4" />
                    Stream state
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">{logStatus}</div>
                </div>
                <div className="panel px-5 py-4">
                  <div className="flex items-center gap-3 text-slate-400">
                    <CircleAlert className="size-4" />
                    Buffer
                  </div>
                  <div className="mt-3 text-3xl font-semibold text-white">
                    {rawLogBufferRef.current.length}
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    </>
  );
}
