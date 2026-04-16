export class ApiError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
async function request(input, init) {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
    }
    if (init?.token) {
        headers.set("Authorization", `Bearer ${init.token}`);
    }
    const response = await fetch(input, {
        ...init,
        headers,
        credentials: "include"
    });
    if (response.status === 204) {
        return undefined;
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new ApiError(response.status, data.error?.code ?? "REQUEST_FAILED", data.error?.message ?? "Request failed.", data.error?.details);
    }
    return data;
}
export const api = {
    register(email, password) {
        return request("/auth/register", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
    },
    login(email, password) {
        return request("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password })
        });
    },
    refresh() {
        return request("/auth/refresh", {
            method: "POST"
        });
    },
    me(token) {
        return request("/auth/me", { token });
    },
    logout(token) {
        return request("/auth/logout", {
            method: "POST",
            token
        });
    },
    updateSettings(token, payload) {
        return request("/auth/settings", {
            method: "PATCH",
            token,
            body: JSON.stringify(payload)
        });
    },
    getHosts(token) {
        return request("/hosts", { token });
    },
    createHost(token, payload) {
        return request("/hosts", {
            method: "POST",
            token,
            body: JSON.stringify(payload)
        });
    },
    updateHost(token, hostId, payload) {
        return request(`/hosts/${hostId}`, {
            method: "PATCH",
            token,
            body: JSON.stringify(payload)
        });
    },
    deleteHost(token, hostId) {
        return request(`/hosts/${hostId}`, {
            method: "DELETE",
            token
        });
    },
    testHost(token, hostId, repinFingerprint = false) {
        return request(`/hosts/${hostId}/test`, {
            method: "POST",
            token,
            body: JSON.stringify({ repinFingerprint })
        });
    },
    getProcesses(token, hostId) {
        return request(`/hosts/${hostId}/processes`, {
            token
        });
    },
    getTags(token) {
        return request("/tags", { token });
    },
    createTag(token, payload) {
        return request("/tags", {
            method: "POST",
            token,
            body: JSON.stringify(payload)
        });
    },
    updateTag(token, tagId, payload) {
        return request(`/tags/${tagId}`, {
            method: "PATCH",
            token,
            body: JSON.stringify(payload)
        });
    },
    deleteTag(token, tagId) {
        return request(`/tags/${tagId}`, {
            method: "DELETE",
            token
        });
    }
};
