import { LockKeyhole, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLockup } from "./Brand";

interface AuthScreenProps {
  mode: "login" | "bootstrap";
  ownerExists: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (mode: "login" | "bootstrap", email: string, password: string) => Promise<void>;
}

export function AuthScreen({ mode, ownerExists, busy, error, onSubmit }: AuthScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [mode]);

  const createOwner = mode === "bootstrap";

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1280px] gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="panel hidden min-h-[34rem] flex-col justify-between p-6 lg:flex">
          <div className="space-y-6">
            <BrandLockup descriptor="Secure remote PM2 observability" size="hero" />

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
              <div className="flex justify-center lg:hidden">
                <BrandLockup align="center" showDescriptor={false} />
              </div>
              <div>
                <div className="section-kicker">
                  {createOwner ? "Workspace bootstrap" : "Operator access"}
                </div>
                <h2 className="mt-2 text-3xl font-semibold text-[color:var(--text)]">
                  {createOwner ? "Create the owner account" : "Sign in to your workspace"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {createOwner
                    ? "This first account becomes the workspace owner and can invite admins or members later."
                    : "Resume your host inventory, process triage, live logs, and saved workspace context."}
                </p>
              </div>

              <div className="badge">
                {ownerExists
                  ? "The workspace owner already exists. Public registration is disabled."
                  : "No owner account exists yet. Bootstrap is available once."}
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
                {busy ? "Working..." : createOwner ? "Create owner account" : "Sign in"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
