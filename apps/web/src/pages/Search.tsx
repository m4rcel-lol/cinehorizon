import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { ContentCard } from '../types';
import { ContentRow } from '../components/ContentRow';

export default function Search() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const results = useQuery({ queryKey: ['search', q], queryFn: () => api<{ movies: ContentCard[]; series: ContentCard[]; people: string[] }>(`/search?q=${encodeURIComponent(q)}`, { auth: false }), enabled: q.length > 0 });
  return <main className="search-page"><h1>Search results for “{q}”</h1>{results.isLoading ? <p>Searching…</p> : null}<ContentRow title="Movies" items={results.data?.movies} /><ContentRow title="TV Shows" items={results.data?.series} />{results.data?.people.length ? <section className="people"><h2>Cast & Crew</h2>{results.data.people.map((p) => <span key={p}>{p}</span>)}</section> : null}</main>;
}
