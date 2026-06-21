import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';

interface Stats {
  totalContent: number;
  totalUsers: number;
  movies: number;
  series: number;
  games: number;
  software: number;
  totalDownloads: number;
  downloadCount: number;
  activeSessions: number;
  storageBytes: number;
  newUsers: Array<{ date: string; label: string; count: number }>;
  topContent: Array<{ title: string; minutes: number }>;
  topDownloads: Array<{ title: string; count: number }>;
}

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/admin/stats'), refetchInterval: 30000 });
  const d = stats.data;
  const newUsers = d?.newUsers ?? [];
  const topDownloads = d?.topDownloads ?? [];
  const hasSignups = newUsers.some((u) => u.count > 0);
  const hasDownloads = topDownloads.some((t) => t.count > 0);

  return <>
    <h1>Dashboard</h1>
    <div className="stats">
      <Card title="Games / Software" value={d ? `${d.games} / ${d.software}` : undefined} />
      <Card title="Total Downloads" value={d?.downloadCount} />
      <Card title="Total Users" value={d?.totalUsers} />
      <Card title="Active Sessions" value={d?.activeSessions} />
      <Card title="Movies / Series" value={d ? `${d.movies} / ${d.series}` : undefined} />
      <Card title="Storage Used" value={d ? `${(d.storageBytes / 1024 / 1024 / 1024).toFixed(2)} GB` : undefined} />
    </div>
    <div className="charts">
      <div className="panel">
        <h2>New users (last 14 days)</h2>
        {hasSignups ? <ResponsiveContainer height={260}>
          <LineChart data={newUsers}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="count" name="New users" stroke="currentColor" /></LineChart>
        </ResponsiveContainer> : <div className="empty-panel">No new sign-ups in the last 14 days.</div>}
      </div>
      <div className="panel">
        <h2>Most downloaded</h2>
        {hasDownloads ? <ResponsiveContainer height={260}>
          <BarChart data={topDownloads} layout="vertical"><XAxis type="number" allowDecimals={false} /><YAxis dataKey="title" type="category" width={120} /><Tooltip /><Bar dataKey="count" name="Downloads" fill="currentColor" /></BarChart>
        </ResponsiveContainer> : <div className="empty-panel">No downloads recorded yet. Counts appear once people start downloading.</div>}
      </div>
    </div>
  </>;
}

function Card({ title, value }: { title: string; value: number | string | undefined }) {
  return <div className="stat-card"><span>{title}</span><strong>{value ?? '—'}</strong></div>;
}
