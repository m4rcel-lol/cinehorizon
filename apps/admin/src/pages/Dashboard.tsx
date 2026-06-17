import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';

interface Stats {
  totalContent: number;
  totalUsers: number;
  movies: number;
  series: number;
  activeSessions: number;
  storageBytes: number;
  newUsers: Array<{ date: string; label: string; count: number }>;
  topContent: Array<{ title: string; minutes: number }>;
}

export default function Dashboard() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/admin/stats'), refetchInterval: 30000 });
  const newUsers = stats.data?.newUsers ?? [];
  const topContent = stats.data?.topContent ?? [];
  const hasSignups = newUsers.some((d) => d.count > 0);
  const hasWatch = topContent.some((d) => d.minutes > 0);

  return <>
    <h1>Dashboard</h1>
    <div className="stats">
      <Card title="Total Content" value={stats.data?.totalContent} />
      <Card title="Movies / Series" value={stats.data ? `${stats.data.movies} / ${stats.data.series}` : undefined} />
      <Card title="Total Users" value={stats.data?.totalUsers} />
      <Card title="Active Sessions" value={stats.data?.activeSessions} />
      <Card title="Storage Used" value={stats.data ? `${(stats.data.storageBytes / 1024 / 1024 / 1024).toFixed(2)} GB` : undefined} />
    </div>
    <div className="charts">
      <div className="panel">
        <h2>New users (last 14 days)</h2>
        {hasSignups ? <ResponsiveContainer height={260}>
          <LineChart data={newUsers}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Line dataKey="count" name="New users" stroke="currentColor" /></LineChart>
        </ResponsiveContainer> : <div className="empty-panel">No new sign-ups in the last 14 days.</div>}
      </div>
      <div className="panel">
        <h2>Top content by watch time</h2>
        {hasWatch ? <ResponsiveContainer height={260}>
          <BarChart data={topContent} layout="vertical"><XAxis type="number" /><YAxis dataKey="title" type="category" width={120} /><Tooltip /><Bar dataKey="minutes" name="Minutes watched" fill="currentColor" /></BarChart>
        </ResponsiveContainer> : <div className="empty-panel">No watch activity recorded yet.</div>}
      </div>
    </div>
  </>;
}

function Card({ title, value }: { title: string; value: number | string | undefined }) {
  return <div className="stat-card"><span>{title}</span><strong>{value ?? '—'}</strong></div>;
}
