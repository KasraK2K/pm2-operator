import { Shield, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { THEMES } from "../lib/themes";
import type { ManagedUser, User, UserRole } from "../lib/types";
import type { SettingsTab } from "../lib/dashboard-view-state";

interface SettingsPanelProps {
  currentUser: User;
  users: ManagedUser[];
  usersBusy: boolean;
  usersError: string | null;
  settingsTab: SettingsTab;
  canManageUsers: boolean;
  themeBusy: boolean;
  onSettingsTabChange: (tab: SettingsTab) => void;
  onProfileSave: (payload: {
    email?: string;
    currentPassword: string;
    newPassword?: string;
  }) => Promise<void>;
  onThemeSelect: (themeId: User["settings"]["themeId"]) => Promise<void>;
  onRefreshUsers: () => Promise<void>;
  onCreateUser: (payload: { email: string; password: string; role: UserRole }) => Promise<void>;
  onUpdateUser: (
    userId: string,
    payload: { email?: string; password?: string; role?: UserRole }
  ) => Promise<void>;
  onDeleteUser: (user: ManagedUser) => Promise<void>;
}

function formatDate(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function roleTone(role: UserRole) {
  if (role === "OWNER") {
    return "bg-[color:var(--accent-soft)] text-[color:var(--accent)]";
  }

  if (role === "ADMIN") {
    return "bg-[color:var(--warning-soft)] text-[color:var(--warning)]";
  }

  return "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
}

export function SettingsPanel({
  currentUser,
  users,
  usersBusy,
  usersError,
  settingsTab,
  canManageUsers,
  themeBusy,
  onSettingsTabChange,
  onProfileSave,
  onThemeSelect,
  onRefreshUsers,
  onCreateUser,
  onUpdateUser,
  onDeleteUser
}: SettingsPanelProps) {
  const [profileEmail, setProfileEmail] = useState(currentUser.email);
  const [profileCurrentPassword, setProfileCurrentPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("MEMBER");
  const [userBusy, setUserBusy] = useState(false);
  const [userMessage, setUserMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setProfileEmail(currentUser.email);
  }, [currentUser.email]);

  useEffect(() => {
    if (!canManageUsers || settingsTab !== "users") {
      return;
    }

    void onRefreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageUsers, settingsTab]);

  function resetUserEditor() {
    setEditorMode("create");
    setEditingUserId(null);
    setUserEmail("");
    setUserPassword("");
    setUserRole("MEMBER");
  }

  function beginEditUser(user: ManagedUser) {
    setEditorMode("edit");
    setEditingUserId(user.id);
    setUserEmail(user.email);
    setUserPassword("");
    setUserRole(user.role === "OWNER" ? "ADMIN" : user.role);
  }

  async function handleProfileSubmit() {
    setProfileBusy(true);
    setProfileMessage(null);

    try {
      await onProfileSave({
        email: profileEmail.trim(),
        currentPassword: profileCurrentPassword,
        newPassword: profileNewPassword.trim() || undefined
      });
      setProfileCurrentPassword("");
      setProfileNewPassword("");
      setProfileMessage({
        tone: "success",
        text: "Profile updated."
      });
    } catch (error) {
      setProfileMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to update your profile."
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleUserSubmit() {
    setUserBusy(true);
    setUserMessage(null);

    try {
      if (editorMode === "create") {
        await onCreateUser({
          email: userEmail.trim(),
          password: userPassword,
          role: userRole
        });
        setUserMessage({
          tone: "success",
          text: "User account created."
        });
      } else if (editingUserId) {
        await onUpdateUser(editingUserId, {
          email: userEmail.trim(),
          password: userPassword.trim() || undefined,
          role: userRole
        });
        setUserMessage({
          tone: "success",
          text: "User account updated."
        });
      }

      resetUserEditor();
      await onRefreshUsers();
    } catch (error) {
      setUserMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to save the user."
      });
    } finally {
      setUserBusy(false);
    }
  }

  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden" data-ui="settings-panel">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="section-kicker">Settings</div>
            <div className="mt-1 text-base font-semibold text-[color:var(--text)]">
              Account and workspace administration
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-[0.9rem] border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-1" data-ui="settings-tabs">
            <button
              className="button-tab"
              data-active={settingsTab === "profile"}
              onClick={() => onSettingsTabChange("profile")}
              type="button"
            >
              Profile
            </button>
            {canManageUsers ? (
              <button
                className="button-tab"
                data-active={settingsTab === "users"}
                onClick={() => onSettingsTabChange("users")}
                type="button"
              >
                Users
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {settingsTab === "profile" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]" data-ui="profile-settings-section">
            <div className="panel-soft p-4" data-ui="profile-card">
              <div className="flex items-center gap-2">
                <UserCog className="size-4 text-[color:var(--accent)]" />
                <div className="text-sm font-semibold text-[color:var(--text)]">Profile</div>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>Email</span>
                  <input
                    className="field"
                    onChange={(event) => setProfileEmail(event.target.value)}
                    type="email"
                    value={profileEmail}
                  />
                </label>

                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>Current password</span>
                  <input
                    className="field"
                    onChange={(event) => setProfileCurrentPassword(event.target.value)}
                    placeholder="Required to save profile changes"
                    type="password"
                    value={profileCurrentPassword}
                  />
                </label>

                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>New password</span>
                  <input
                    className="field"
                    minLength={8}
                    onChange={(event) => setProfileNewPassword(event.target.value)}
                    placeholder="Leave blank to keep the current password"
                    type="password"
                    value={profileNewPassword}
                  />
                </label>

                {profileMessage ? (
                  <div className="flash" data-tone={profileMessage.tone}>
                    {profileMessage.text}
                  </div>
                ) : null}

                <div className="flex justify-end">
                  <button
                    className="button-primary"
                    disabled={profileBusy}
                    onClick={() => void handleProfileSubmit()}
                    type="button"
                  >
                    {profileBusy ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="panel-soft p-4" data-ui="access-card">
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-[color:var(--accent)]" />
                  <div className="text-sm font-semibold text-[color:var(--text)]">Access</div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`badge border-transparent ${roleTone(currentUser.role)}`}>
                    {currentUser.role}
                  </span>
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {currentUser.role === "OWNER"
                      ? "Full workspace authority"
                      : currentUser.role === "ADMIN"
                        ? "Workspace manager"
                        : "Read-only operator"}
                  </span>
                </div>
              </div>

              <div className="panel-soft p-4" data-ui="theme-settings-card">
                <div className="text-sm font-semibold text-[color:var(--text)]">Theme</div>
                <p className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                  Save a default dashboard theme for this account. Hover previews stay available in the header.
                </p>
                <label className="mt-3 block space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>Saved theme</span>
                  <select
                    className="field"
                    disabled={themeBusy}
                    onChange={(event) => void onThemeSelect(event.target.value as User["settings"]["themeId"])}
                    value={currentUser.settings.themeId}
                  >
                    {THEMES.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" data-ui="user-management-section">
            <div className="panel-soft p-4" data-ui="user-editor-card">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-[color:var(--accent)]" />
                <div className="text-sm font-semibold text-[color:var(--text)]">
                  {editorMode === "create" ? "Create user" : "Edit user"}
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>Email</span>
                  <input
                    className="field"
                    onChange={(event) => setUserEmail(event.target.value)}
                    type="email"
                    value={userEmail}
                  />
                </label>

                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>{editorMode === "create" ? "Password" : "New password"}</span>
                  <input
                    className="field"
                    minLength={editorMode === "create" ? 8 : undefined}
                    onChange={(event) => setUserPassword(event.target.value)}
                    placeholder={
                      editorMode === "create"
                        ? "At least 8 characters"
                        : "Leave blank to keep the current password"
                    }
                    type="password"
                    value={userPassword}
                  />
                </label>

                <label className="space-y-1.5 text-sm text-[color:var(--text-muted)]">
                  <span>Role</span>
                  <select
                    className="field"
                    onChange={(event) => setUserRole(event.target.value as UserRole)}
                    value={userRole}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </label>

                {userMessage ? (
                  <div className="flash" data-tone={userMessage.tone}>
                    {userMessage.text}
                  </div>
                ) : null}

                <div className="flex justify-end gap-2">
                  {editorMode === "edit" ? (
                    <button className="button-secondary" onClick={resetUserEditor} type="button">
                      Cancel
                    </button>
                  ) : null}
                  <button
                    className="button-primary"
                    disabled={userBusy || !userEmail.trim() || (editorMode === "create" && userPassword.length < 8)}
                    onClick={() => void handleUserSubmit()}
                    type="button"
                  >
                    {userBusy ? "Saving..." : editorMode === "create" ? "Create user" : "Save user"}
                  </button>
                </div>
              </div>
            </div>

            <div className="panel-soft min-h-0 p-4" data-ui="workspace-users-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--text)]">Workspace users</div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    Owners stay locked. Admins and members can be updated here.
                  </div>
                </div>
                <button className="button-secondary" onClick={() => void onRefreshUsers()} type="button">
                  Refresh
                </button>
              </div>

              {usersError ? (
                <div className="flash mt-3" data-tone="error">
                  {usersError}
                </div>
              ) : null}

              <div className="mt-3 space-y-2">
                {usersBusy && users.length === 0 ? (
                  <div className="text-sm text-[color:var(--text-muted)]">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="text-sm text-[color:var(--text-muted)]">No users found.</div>
                ) : (
                  users.map((workspaceUser) => {
                    const ownerLocked = workspaceUser.role === "OWNER";
                    const disableActions = ownerLocked || workspaceUser.id === currentUser.id;

                    return (
                      <div
                        className="panel flex items-center justify-between gap-3 px-3 py-3"
                        data-ui="workspace-user-row"
                        data-user-id={workspaceUser.id}
                        key={workspaceUser.id}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-sm font-semibold text-[color:var(--text)]">
                              {workspaceUser.email}
                            </div>
                            <span className={`badge border-transparent ${roleTone(workspaceUser.role)}`}>
                              {workspaceUser.role}
                            </span>
                            {workspaceUser.id === currentUser.id ? <span className="badge">You</span> : null}
                          </div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            Created {formatDate(workspaceUser.createdAt)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            className="button-secondary px-2.5 py-1.5 text-xs"
                            disabled={ownerLocked}
                            onClick={() => beginEditUser(workspaceUser)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button-ghost px-2.5 py-1.5 text-xs"
                            disabled={disableActions}
                            onClick={() => void onDeleteUser(workspaceUser)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
