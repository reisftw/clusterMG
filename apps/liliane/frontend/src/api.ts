const base = "/liliane/api";
const csrf = () => decodeURIComponent(document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("lili_csrf="))?.split("=").slice(1).join("=") || "");

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(csrf() ? { "X-CSRF-Token": csrf() } : {}), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `Erro HTTP ${response.status}`);
  return body as T;
}
