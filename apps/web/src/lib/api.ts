import type {
  ConnectionResult,
  Host,
  HostPayload,
  ManagedUser,
  Pm2Process,
  Tag,
  User,
  UserRole
} from "./types";
import type { ThemeId } from "./themes";

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  input: string,
  init?: RequestInit & { token?: string | null }
): Promise<T> {
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
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as any) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code ?? "REQUEST_FAILED",
      data.error?.message ?? "Request failed.",
      data.error?.details
    );
  }

  return data as T;
}

export const api = {
  bootstrapStatus() {
    return request<{ ownerExists: boolean }>("/auth/bootstrap-status");
  },
  bootstrap(email: string, password: string) {
    return request<{ user: User; accessToken: string }>("/auth/bootstrap", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  register(email: string, password: string) {
    return request<{ user: User; accessToken: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  login(email: string, password: string) {
    return request<{ user: User; accessToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  },
  refresh() {
    return request<{ user: User; accessToken: string }>("/auth/refresh", {
      method: "POST"
    });
  },
  me(token: string) {
    return request<{ user: User }>("/auth/me", { token });
  },
  logout(token?: string | null) {
    return request<void>("/auth/logout", {
      method: "POST",
      token
    });
  },
  updateSettings(token: string, payload: { themeId: ThemeId }) {
    return request<{ user: User }>("/auth/settings", {
      method: "PATCH",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateProfile(
    token: string,
    payload: { email?: string; currentPassword: string; newPassword?: string }
  ) {
    return request<{ user: User; accessToken: string }>("/auth/settings/profile", {
      method: "PATCH",
      token,
      body: JSON.stringify(payload)
    });
  },
  getHosts(token: string) {
    return request<{ hosts: Host[] }>("/hosts", { token });
  },
  createHost(token: string, payload: HostPayload) {
    return request<{ host: Host }>("/hosts", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateHost(token: string, hostId: string, payload: Partial<HostPayload>) {
    return request<{ host: Host }>(`/hosts/${hostId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload)
    });
  },
  deleteHost(token: string, hostId: string) {
    return request<void>(`/hosts/${hostId}`, {
      method: "DELETE",
      token
    });
  },
  testHost(token: string, hostId: string, repinFingerprint = false) {
    return request<{
      success: boolean;
      connection: ConnectionResult;
      host: Host;
    }>(`/hosts/${hostId}/test`, {
      method: "POST",
      token,
      body: JSON.stringify({ repinFingerprint })
    });
  },
  getProcesses(token: string, hostId: string) {
    return request<{ fingerprint: string; processes: Pm2Process[] }>(`/hosts/${hostId}/processes`, {
      token
    });
  },
  getTags(token: string) {
    return request<{ tags: Tag[] }>("/tags", { token });
  },
  createTag(token: string, payload: { name: string; color?: string | null }) {
    return request<{ tag: Tag }>("/tags", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateTag(token: string, tagId: string, payload: { name?: string; color?: string | null }) {
    return request<{ tag: Tag }>(`/tags/${tagId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload)
    });
  },
  deleteTag(token: string, tagId: string) {
    return request<void>(`/tags/${tagId}`, {
      method: "DELETE",
      token
    });
  },
  getUsers(token: string) {
    return request<{ users: ManagedUser[] }>("/users", { token });
  },
  createUser(
    token: string,
    payload: { email: string; password: string; role: UserRole }
  ) {
    return request<{ user: ManagedUser }>("/users", {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    });
  },
  updateUser(
    token: string,
    userId: string,
    payload: { email?: string; password?: string; role?: UserRole }
  ) {
    return request<{ user: ManagedUser }>(`/users/${userId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(payload)
    });
  },
  deleteUser(token: string, userId: string) {
    return request<void>(`/users/${userId}`, {
      method: "DELETE",
      token
    });
  }
};
