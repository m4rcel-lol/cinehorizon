import type { ContentCard, ContentDetail, DownloadCategory, DownloadItem, Playback, Profile, User } from '../types';
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

export const downloadsApi = {
  list: (category: DownloadCategory) => api<{ items: DownloadItem[] }>(`/downloads?category=${category}`, { auth: false }),
  downloadUrl: (category: DownloadCategory, slug: string) => `${API_URL}/downloads/${category.toLowerCase()}/${encodeURIComponent(slug)}/download`
};
