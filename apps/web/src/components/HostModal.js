import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const emptyForm = {
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
export function HostModal({ open, host, tags, busy, onClose, onSubmit }) {
    const [form, setForm] = useState(emptyForm);
    useEffect(() => {
        if (!open) {
            return;
        }
        setForm(host
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
            : emptyForm);
    }, [host, open]);
    if (!open) {
        return null;
    }
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm", children: _jsxs("div", { className: "panel w-full max-w-3xl p-6", children: [_jsxs("div", { className: "mb-6 flex items-start justify-between gap-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-semibold text-white", children: host ? "Edit SSH host" : "Add SSH host" }), _jsx("p", { className: "mt-2 text-sm text-slate-400", children: host
                                        ? "Update connection details. Leave secrets blank to keep the current encrypted value."
                                        : "Create a new SSH host and store its credentials encrypted at rest." })] }), _jsx("button", { className: "button-ghost", onClick: onClose, type: "button", children: "Close" })] }), _jsxs("form", { className: "grid gap-4 md:grid-cols-2", onSubmit: async (event) => {
                        event.preventDefault();
                        await onSubmit(form, host?.id);
                    }, children: [_jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Name" }), _jsx("input", { className: "field", onChange: (event) => setForm((current) => ({ ...current, name: event.target.value })), value: form.name })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Host" }), _jsx("input", { className: "field", onChange: (event) => setForm((current) => ({ ...current, host: event.target.value })), value: form.host })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Port" }), _jsx("input", { className: "field", min: 1, onChange: (event) => setForm((current) => ({ ...current, port: Number(event.target.value) || 22 })), type: "number", value: form.port })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Username" }), _jsx("input", { className: "field", onChange: (event) => setForm((current) => ({ ...current, username: event.target.value })), value: form.username })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Authentication" }), _jsxs("select", { className: "field", onChange: (event) => setForm((current) => ({
                                        ...current,
                                        authType: event.target.value
                                    })), value: form.authType, children: [_jsx("option", { value: "PASSWORD", children: "Password" }), _jsx("option", { value: "PRIVATE_KEY", children: "Private key" })] })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300", children: [_jsx("span", { children: "Tags" }), _jsx("select", { className: "field min-h-28", multiple: true, onChange: (event) => setForm((current) => ({
                                        ...current,
                                        tagIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                                    })), value: form.tagIds, children: tags.map((tag) => (_jsx("option", { value: tag.id, children: tag.name }, tag.id))) })] }), form.authType === "PASSWORD" ? (_jsxs("label", { className: "space-y-2 text-sm text-slate-300 md:col-span-2", children: [_jsx("span", { children: "Password" }), _jsx("input", { className: "field", onChange: (event) => setForm((current) => ({ ...current, password: event.target.value })), placeholder: host ? "Leave blank to keep current password" : "Enter SSH password", type: "password", value: form.password ?? "" })] })) : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "space-y-2 text-sm text-slate-300 md:col-span-2", children: [_jsx("span", { children: "Private key" }), _jsx("textarea", { className: "field min-h-40", onChange: (event) => setForm((current) => ({ ...current, privateKey: event.target.value })), placeholder: host ? "Leave blank to keep current private key" : "Paste PEM or OpenSSH key", value: form.privateKey ?? "" })] }), _jsxs("label", { className: "space-y-2 text-sm text-slate-300 md:col-span-2", children: [_jsx("span", { children: "Passphrase" }), _jsx("input", { className: "field", onChange: (event) => setForm((current) => ({ ...current, passphrase: event.target.value })), placeholder: "Optional", type: "password", value: form.passphrase ?? "" })] })] })), _jsxs("div", { className: "md:col-span-2 flex justify-end gap-3 pt-2", children: [_jsx("button", { className: "button-secondary", onClick: onClose, type: "button", children: "Cancel" }), _jsx("button", { className: "button-primary", disabled: busy, type: "submit", children: busy ? "Saving..." : host ? "Save changes" : "Create host" })] })] })] }) }));
}
