import { useAdminStore } from './store';
const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { accessToken, setAuth, logoutSoft } = useAdminStore.getState();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  let res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
  if (res.status === 401) {
    const refresh = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refresh.ok) { const d = await refresh.json(); setAuth(d.user, d.accessToken); headers.set('authorization', `Bearer ${d.accessToken}`); res = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' }); }
    else logoutSoft();
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Request failed' }))).error);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
