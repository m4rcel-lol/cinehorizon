import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ContentRow } from '../components/ContentRow';
import { useAuthStore } from '../stores/auth';
import type { ContentCard } from '../types';

export default function Account() {
  const { user } = useAuthStore();
  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: () => api<{ items: ContentCard[] }>('/watchlist', { profile: true }) });
  return <main className="account-page"><h1>Account</h1><p>{user?.displayName} · {user?.email}</p><ContentRow title="My List" items={watchlist.data?.items} /></main>;
}
