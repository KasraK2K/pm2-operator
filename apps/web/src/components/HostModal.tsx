import { useEffect, useState } from "react";

import type { Host, HostPayload, Tag } from "../lib/types";

interface HostModalProps {
  open: boolean;
  host: Host | null;
  tags: Tag[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: HostPayload, hostId?: string) => Promise<void>;
}

const emptyForm: HostPayload = {
  name: "",
  host: "",
  port: 22,
  username: "",
  authType: "PASSWORD",
  password: "",
  privateKey: "",
  passphrase: "",
  tagIds: []
};

export function HostModal({ open, host, tags, busy, onClose, onSubmit }: HostModalProps) {
  const [form, setForm] = useState<HostPayload>(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      host
        ? {
            name: host.name,
            host: host.host,
            port: host.port,
            username: host.username,
            authType: host.authType,
            password: "",
            privateKey: "",
            passphrase: "",
            tagIds: host.tags.map((tag) => tag.id)
          }
        : emptyForm
    );
  }, [host, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm">
      <div className="panel w-full max-w-3xl p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              {host ? "Edit SSH host" : "Add SSH host"}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {host
                ? "Update connection details. Leave secrets blank to keep the current encrypted value."
                : "Create a new SSH host and store its credentials encrypted at rest."}
            </p>
          </div>
          <button className="button-ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(form, host?.id);
          }}
        >
          <label className="space-y-2 text-sm text-slate-300">
            <span>Name</span>
            <input
              className="field"
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              value={form.name}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Host</span>
            <input
              className="field"
              onChange={(event) => setForm((current) => ({ ...current, host: event.target.value }))}
              value={form.host}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Port</span>
            <input
              className="field"
              min={1}
              onChange={(event) =>
                setForm((current) => ({ ...current, port: Number(event.target.value) || 22 }))
              }
              type="number"
              value={form.port}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Username</span>
            <input
              className="field"
              onChange={(event) =>
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              value={form.username}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Authentication</span>
            <select
              className="field"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  authType: event.target.value as HostPayload["authType"]
                }))
              }
              value={form.authType}
            >
              <option value="PASSWORD">Password</option>
              <option value="PRIVATE_KEY">Private key</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            <span>Tags</span>
            <select
              className="field min-h-28"
              multiple
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tagIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                }))
              }
              value={form.tagIds}
            >
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          {form.authType === "PASSWORD" ? (
            <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
              <span>Password</span>
              <input
                className="field"
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={host ? "Leave blank to keep current password" : "Enter SSH password"}
                type="password"
                value={form.password ?? ""}
              />
            </label>
          ) : (
            <>
              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Private key</span>
                <textarea
                  className="field min-h-40"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, privateKey: event.target.value }))
                  }
                  placeholder={
                    host ? "Leave blank to keep current private key" : "Paste PEM or OpenSSH key"
                  }
                  value={form.privateKey ?? ""}
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Passphrase</span>
                <input
                  className="field"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, passphrase: event.target.value }))
                  }
                  placeholder="Optional"
                  type="password"
                  value={form.passphrase ?? ""}
                />
              </label>
            </>
          )}

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button className="button-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="button-primary" disabled={busy} type="submit">
              {busy ? "Saving..." : host ? "Save changes" : "Create host"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

