const TOKEN_KEY = "aa_access";
const REFRESH_KEY = "aa_refresh";
const USER_KEY = "aa_user";

export type User = { id: string; email: string; name: string | null; role: string };

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setSession(data: { accessToken: string; refreshToken: string; user: User }) {
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

async function refreshAccess(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  const res = await fetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const data = await res.json();
  setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  return data.accessToken as string;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  let token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(path, { ...init, headers });
  if (res.status === 401 && localStorage.getItem(REFRESH_KEY)) {
    token = await refreshAccess();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
      res = await fetch(path, { ...init, headers });
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function streamRun(runId: string, onEvent: (type: string, data: unknown) => void): () => void {
  const token = getAccessToken();
  const url = `/agent/runs/${runId}/stream`;
  // EventSource cannot set Authorization; use fetch SSE
  const controller = new AbortController();
  (async () => {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      onEvent("error", { message: "Stream failed" });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventType = "message";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const line of parts) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const raw = line.slice(5).trim();
          try {
            onEvent(eventType, JSON.parse(raw));
          } catch {
            onEvent(eventType, raw);
          }
        }
      }
    }
  })().catch((err) => {
    if (!controller.signal.aborted) onEvent("error", { message: String(err) });
  });
  return () => controller.abort();
}
