import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api, ApiError } from "./lib/api";
import { AuthScreen } from "./components/AuthScreen";
import { Dashboard } from "./components/Dashboard";
const ACCESS_TOKEN_KEY = "pm2-log-viewer.access-token";
function persistAccessToken(token) {
    if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
        return;
    }
    localStorage.removeItem(ACCESS_TOKEN_KEY);
}
export default function App() {
    const [mode, setMode] = useState("login");
    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [booting, setBooting] = useState(true);
    const [authBusy, setAuthBusy] = useState(false);
    const [authError, setAuthError] = useState(null);
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
            }
            catch {
                persistAccessToken(null);
            }
            try {
                const session = await api.refresh();
                setUser(session.user);
                setAccessToken(session.accessToken);
                persistAccessToken(session.accessToken);
            }
            catch {
                persistAccessToken(null);
            }
            finally {
                setBooting(false);
            }
        };
        void bootstrap();
    }, []);
    const handleAuthSubmit = async (nextMode, email, password) => {
        setAuthBusy(true);
        setAuthError(null);
        try {
            const session = nextMode === "login" ? await api.login(email, password) : await api.register(email, password);
            setUser(session.user);
            setAccessToken(session.accessToken);
            persistAccessToken(session.accessToken);
        }
        catch (error) {
            setAuthError(error instanceof ApiError ? error.message : "Authentication failed.");
        }
        finally {
            setAuthBusy(false);
        }
    };
    const handleSessionUpdate = (nextUser, nextAccessToken) => {
        setUser(nextUser);
        setAccessToken(nextAccessToken);
        persistAccessToken(nextAccessToken);
    };
    if (booting) {
        return (_jsx("div", { className: "flex min-h-screen items-center justify-center px-4", children: _jsx("div", { className: "panel flex items-center gap-3 px-6 py-5 text-sm text-slate-300", children: "Restoring your PM2 workspace..." }) }));
    }
    if (!user || !accessToken) {
        return (_jsx(AuthScreen, { busy: authBusy, error: authError, mode: mode, onModeChange: setMode, onSubmit: handleAuthSubmit }));
    }
    return (_jsx(Dashboard, { accessToken: accessToken, onSessionUpdate: handleSessionUpdate, user: user }));
}
