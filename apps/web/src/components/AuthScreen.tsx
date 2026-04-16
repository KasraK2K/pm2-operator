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
    <div className="min-h-screen px-4 py-8 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-stretch overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-panel">
        <section className="hidden w-[44%] flex-col justify-between bg-slate-900/90 p-10 lg:flex">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-200">
              <ShieldCheck className="size-4" />
              PM2 Log Viewer
            </div>
            <div className="space-y-5">
              <h1 className="max-w-md text-4xl font-semibold leading-tight text-white">
                A calm control room for remote PM2 hosts, processes, and live logs.
              </h1>
              <p className="max-w-md text-base leading-7 text-slate-400">
                Connect over SSH, pin host fingerprints, inspect PM2 process health, and stream
                logs in real time without leaving the browser.
              </p>
            </div>
          </div>
          <div className="grid gap-4 text-sm text-slate-300">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              Encrypted SSH secrets at rest with AES-256-GCM and a per-deployment master key.
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              Socket-backed log streaming with pause, regex filters, download, and bounded memory.
            </div>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md space-y-8">
            <div className="space-y-3">
              <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                <button
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    mode === "login" ? "bg-white text-slate-950" : "text-slate-300"
                  }`}
                  onClick={() => onModeChange("login")}
                  type="button"
                >
                  Sign in
                </button>
                <button
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    mode === "register" ? "bg-white text-slate-950" : "text-slate-300"
                  }`}
                  onClick={() => onModeChange("register")}
                  type="button"
                >
                  Create account
                </button>
              </div>
              <div>
                <h2 className="text-3xl font-semibold text-white">
                  {mode === "login" ? "Welcome back" : "Create your operator account"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {mode === "login"
                    ? "Use your email and password to return to your PM2 workspace."
                    : "Start with a private workspace for your hosts, tags, and audit trail."}
                </p>
              </div>
            </div>

            <form
              className="panel space-y-5 p-6"
              onSubmit={async (event) => {
                event.preventDefault();
                await onSubmit(mode, email, password);
              }}
            >
              <label className="block space-y-2 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-slate-500" />
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
              <label className="block space-y-2 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <LockKeyhole className="size-4 text-slate-500" />
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
                <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </div>
              ) : null}

              <button className="button-primary w-full" disabled={busy} type="submit">
                {busy ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

