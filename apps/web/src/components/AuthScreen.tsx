import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

interface AuthScreenProps {
  mode: "login" | "register";
  busy: boolean;
  error: string | null;
  onModeChange: (mode: "login" | "register") => void;
  onSubmit: (mode: "login" | "register", email: string, password: string) => Promise<void>;
}

export function AuthScreen({
  mode,
  busy,
  error,
  onModeChange,
  onSubmit
}: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1280px] gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="panel hidden min-h-[34rem] flex-col justify-between p-6 lg:flex">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--accent-soft)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]">
              <ShieldCheck className="size-4" />
              PM2 Log Viewer
            </div>

            <div className="max-w-xl space-y-4">
              <h1 className="text-4xl font-semibold leading-tight text-[color:var(--text)]">
                Remote PM2 monitoring built for operators who live in the terminal.
              </h1>
              <p className="max-w-lg text-sm leading-7 text-[color:var(--text-muted)]">
                Keep SSH hosts organized, inspect PM2 health remotely, and stream merged logs in a
                focused workspace with persistent context and theme-aware comfort.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="panel-soft p-4">
              <div className="section-kicker">Security</div>
              <div className="mt-2 text-sm font-medium text-[color:var(--text)]">
                AES-256-GCM encrypted SSH secrets at rest.
              </div>
            </div>
            <div className="panel-soft p-4">
              <div className="section-kicker">Discovery</div>
              <div className="mt-2 text-sm font-medium text-[color:var(--text)]">
                Remote `pm2 jlist` inventory with status and resource data.
              </div>
            </div>
            <div className="panel-soft p-4">
              <div className="section-kicker">Logs</div>
              <div className="mt-2 text-sm font-medium text-[color:var(--text)]">
                Live SSH log streams with regex filters and bounded memory.
              </div>
            </div>
          </div>
        </section>

        <section className="panel flex min-h-[34rem] items-center justify-center px-5 py-6 sm:px-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-3">
              <div className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] p-1">
                <button
                  className="button-tab"
                  data-active={mode === "login"}
                  onClick={() => onModeChange("login")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className="button-tab"
                  data-active={mode === "register"}
                  onClick={() => onModeChange("register")}
                  type="button"
                >
                  Create account
                </button>
              </div>

              <div>
                <div className="section-kicker">Operator access</div>
                <h2 className="mt-2 text-3xl font-semibold text-[color:var(--text)]">
                  {mode === "login" ? "Welcome back" : "Create your workspace"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {mode === "login"
                    ? "Resume your host inventory, process triage, and live log sessions."
                    : "Start a private PM2 operations workspace tied to your account-wide settings."}
                </p>
              </div>
            </div>

            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                await onSubmit(mode, email, password);
              }}
            >
              <label className="block space-y-2 text-sm text-[color:var(--text-muted)]">
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-[color:var(--text-soft)]" />
                  Email
                </span>
                <input
                  className="field"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </label>

              <label className="block space-y-2 text-sm text-[color:var(--text-muted)]">
                <span className="flex items-center gap-2">
                  <LockKeyhole className="size-4 text-[color:var(--text-soft)]" />
                  Password
                </span>
                <input
                  className="field"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={password}
                />
              </label>

              {error ? (
                <div className="flash" data-tone="error">
                  {error}
                </div>
              ) : null}

              <button className="button-primary w-full justify-center" disabled={busy} type="submit">
                {busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
