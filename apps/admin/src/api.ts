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

type UploadResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

// fetch() can't report upload progress, so big-file uploads go through XHR,
// which exposes upload.onprogress. Mirrors api()'s 401 -> refresh -> retry.
export function uploadWithProgress<T>(path: string, body: FormData, onProgress: (percent: number) => void): Promise<T> {
  const attempt = (token: string | null) => new Promise<UploadResult<T>>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    if (token) xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, data: (xhr.responseText ? JSON.parse(xhr.responseText) : undefined) as T });
      } else {
        let error = 'Upload failed';
        try { error = JSON.parse(xhr.responseText).error ?? error; } catch { /* non-JSON body */ }
        resolve({ ok: false, status: xhr.status, error });
      }
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, error: 'Network error during upload' });
    xhr.send(body);
  });

  return (async () => {
    const { accessToken, setAuth, logoutSoft } = useAdminStore.getState();
    let res = await attempt(accessToken);
    if (!res.ok && res.status === 401) {
      const refresh = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (refresh.ok) {
        const d = await refresh.json();
        setAuth(d.user, d.accessToken);
        onProgress(0);
        res = await attempt(d.accessToken);
      } else {
        logoutSoft();
      }
    }
    if (!res.ok) throw new Error(res.error);
    return res.data;
  })();
}
