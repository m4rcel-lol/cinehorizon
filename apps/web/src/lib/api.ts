import type { ContentCard, ContentDetail, DownloadCategory, DownloadItem, Playback, Profile, Session, User } from '../types';
import { useAuthStore } from '../stores/auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

interface RequestOptions extends RequestInit {
  auth?: boolean;
  profile?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, profile, setAuth, logoutSoft } = useAuthStore.getState();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (options.auth !== false && accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (options.profile && profile) headers.set('x-profile-id', profile.id);

  let response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (response.status === 401 && options.auth !== false) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refreshed.ok) {
      const data = await refreshed.json() as { accessToken: string; user: User; profiles: Profile[] };
      setAuth(data.user, data.profiles, data.accessToken);
      headers.set('authorization', `Bearer ${data.accessToken}`);
      response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include' });
    } else {
      logoutSoft();
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error ?? 'Request failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const contentApi = {
  featured: () => api<{ items: ContentCard[] }>('/content/featured', { auth: false }),
  trending: () => api<{ items: ContentCard[] }>('/content/trending', { auth: false }),
  topTen: () => api<{ items: ContentCard[] }>('/content/top-ten', { auth: false }),
  newArrivals: () => api<{ items: ContentCard[] }>('/content/new-arrivals', { auth: false }),
  genres: () => api<{ genres: Array<{ id: string; name: string; slug: string }> }>('/content/genres', { auth: false }),
  byGenre: (slug: string) => api<{ items: ContentCard[] }>(`/content?genre=${encodeURIComponent(slug)}`, { auth: false }),
  detail: (slug: string) => api<{ content: ContentDetail }>(`/content/${slug}`, { auth: false }),
  continueWatching: () => api<{ items: ContentCard[] }>('/content/continue-watching', { profile: true }),
  playback: (slug: string, episodeId?: string) => api<Playback>(`/content/${slug}/playback${episodeId ? `?episodeId=${episodeId}` : ''}`, { profile: true })
};

export const authApi = {
  resendVerification: () => api<{ ok: boolean; alreadyVerified?: boolean }>('/auth/resend-verification', { method: 'POST' }),
  verifyEmail: (token: string) => api<{ ok: boolean }>('/auth/verify-email', { method: 'POST', auth: false, body: JSON.stringify({ token }) }),
  forgotPassword: (email: string) => api<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', auth: false, body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => api<{ ok: boolean }>('/auth/reset-password', { method: 'POST', auth: false, body: JSON.stringify({ token, password }) }),
  changePassword: (currentPassword: string, newPassword: string) => api<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sessions: () => api<{ sessions: Session[] }>('/auth/sessions'),
  revokeSession: (id: string) => api<void>(`/auth/sessions/${id}`, { method: 'DELETE' })
};

export const libraryApi = {
  list: () => api<{ items: DownloadItem[] }>('/library', { profile: true }),
  save: (downloadId: string) => api<{ ok: boolean }>('/library', { method: 'POST', profile: true, body: JSON.stringify({ downloadId }) }),
  remove: (downloadId: string) => api<void>(`/library/${downloadId}`, { method: 'DELETE', profile: true })
};

export const profilesApi = {
  list: () => api<{ profiles: Profile[] }>('/profiles'),
  create: (data: { name: string; avatarIndex: number; isKids: boolean }) =>
    api<{ profile: Profile }>('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; avatarIndex: number; isKids: boolean }>) =>
    api<{ profile: Profile }>(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => api<void>(`/profiles/${id}`, { method: 'DELETE' })
};

export const downloadsApi = {
  list: (category: DownloadCategory, page = 1) =>
    api<{ items: DownloadItem[]; total: number; page: number; limit: number }>(`/downloads?category=${category}&page=${page}`, { auth: false }),
  featured: (category: DownloadCategory) => api<{ items: DownloadItem[] }>(`/downloads/featured?category=${category}`, { auth: false }),
  trending: (category: DownloadCategory) => api<{ items: DownloadItem[] }>(`/downloads/trending?category=${category}`, { auth: false }),
  top: (category: DownloadCategory) => api<{ items: DownloadItem[] }>(`/downloads/top?category=${category}`, { auth: false }),
  detail: (category: DownloadCategory, slug: string) =>
    api<{ item: DownloadItem }>(`/downloads/${category.toLowerCase()}/${encodeURIComponent(slug)}`, { auth: false }),
  downloadUrl: (category: DownloadCategory, slug: string) => `${API_URL}/downloads/${category.toLowerCase()}/${encodeURIComponent(slug)}/download`
};
