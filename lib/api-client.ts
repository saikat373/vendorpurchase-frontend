const TOKEN_KEY = "vendor-purchase-auth-token";
const SESSION_KEY = "vendor-purchase-admin-session";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:4000";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export interface ApiFetchOptions extends RequestInit {
  skipAuthRedirect?: boolean;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuthRedirect = false, headers: customHeaders, ...rest } = options;
  const token = getAuthToken();

  const headers = new Headers(customHeaders);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (rest.body && !headers.has("Content-Type") && !(rest.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const res = await fetch(url, { ...rest, headers });

  if (!skipAuthRedirect && typeof window !== "undefined") {
    if (res.status === 401) {
      clearAuthToken();
      localStorage.removeItem(SESSION_KEY);
      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    } else if (res.status === 403) {
      const cloned = res.clone();
      try {
        const body = (await cloned.json()) as { error?: string };
        if (body.error?.toLowerCase().includes("inactive")) {
          clearAuthToken();
          localStorage.removeItem(SESSION_KEY);
          if (window.location.pathname !== "/login") {
            window.location.assign("/login");
          }
        }
      } catch {
        // Ignore non-JSON 403 bodies
      }
    }
  }

  return res;
}
