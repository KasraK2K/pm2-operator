import { useEffect, useState } from "react";

import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
import { api, ApiError } from "./lib/api";
import type { User } from "./lib/types";
import { useTheme } from "./lib/useTheme";

const ACCESS_TOKEN_KEY = "pm2-log-viewer.access-token";

function persistAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export default function App() {
  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [ownerExists, setOwnerExists] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const theme = useTheme(user?.settings.themeId ?? null);

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);

      try {
        if (storedToken) {
          const me = await api.me(storedToken);
          setUser(me.user);
          setAccessToken(storedToken);
          setOwnerExists(true);
          setMode("login");
          setBooting(false);
          return;
        }
      } catch {
        persistAccessToken(null);
      }

      try {
        const session = await api.refresh();
        setUser(session.user);
        setAccessToken(session.accessToken);
        persistAccessToken(session.accessToken);
        setOwnerExists(true);
        setMode("login");
      } catch {
        persistAccessToken(null);

        try {
          const status = await api.bootstrapStatus();
          setOwnerExists(status.ownerExists);
          setMode(status.ownerExists ? "login" : "bootstrap");
        } catch {
          setOwnerExists(true);
          setMode("login");
          setAuthError("Unable to load workspace bootstrap state.");
        }
      } finally {
        setBooting(false);
      }
    };

    void bootstrap();
  }, []);

  const handleAuthSubmit = async (
    nextMode: "login" | "bootstrap",
    email: string,
    password: string
  ) => {
    setAuthBusy(true);
    setAuthError(null);

    try {
      const session =
        nextMode === "login" ? await api.login(email, password) : await api.bootstrap(email, password);

      setUser(session.user);
      setAccessToken(session.accessToken);
      setOwnerExists(true);
      setMode("login");
      persistAccessToken(session.accessToken);
    } catch (error) {
      setAuthError(error instanceof ApiError ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSessionUpdate = (nextUser: User | null, nextAccessToken: string | null) => {
    setUser(nextUser);
    setAccessToken(nextAccessToken);
    persistAccessToken(nextAccessToken);

    if (!nextUser) {
      setOwnerExists(true);
      setMode("login");
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen px-4 py-4">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-xl items-center justify-center">
          <div className="panel flex items-center gap-3 px-5 py-4 text-sm text-[color:var(--text-muted)]">
            Restoring your PM2 workspace...
          </div>
        </div>
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <AuthScreen
        busy={authBusy}
        error={authError}
        mode={mode}
        ownerExists={ownerExists}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <Dashboard
      accessToken={accessToken}
      activeThemeId={theme.activeThemeId}
      onClearThemePreview={theme.clearPreviewTheme}
      onPreviewTheme={theme.previewTheme}
      onSessionUpdate={handleSessionUpdate}
      user={user}
    />
  );
}
