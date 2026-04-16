import { useEffect, useState } from "react";

import { api, ApiError } from "./lib/api";
import type { User } from "./lib/types";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";

const ACCESS_TOKEN_KEY = "pm2-log-viewer.access-token";

function persistAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export default function App() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);

      try {
        if (storedToken) {
          const me = await api.me(storedToken);
          setUser(me.user);
          setAccessToken(storedToken);
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
      } catch {
        persistAccessToken(null);
      } finally {
        setBooting(false);
      }
    };

    void bootstrap();
  }, []);

  const handleAuthSubmit = async (
    nextMode: "login" | "register",
    email: string,
    password: string
  ) => {
    setAuthBusy(true);
    setAuthError(null);

    try {
      const session =
        nextMode === "login" ? await api.login(email, password) : await api.register(email, password);

      setUser(session.user);
      setAccessToken(session.accessToken);
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
  };

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel flex items-center gap-3 px-6 py-5 text-sm text-slate-300">
          Restoring your PM2 workspace...
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
        onModeChange={setMode}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <Dashboard
      accessToken={accessToken}
      onSessionUpdate={handleSessionUpdate}
      user={user}
    />
  );
}
