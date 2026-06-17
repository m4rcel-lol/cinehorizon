import { useQuery } from '@tanstack/react-query';
import { downloadsApi } from '../lib/api';
import type { DownloadCategory, DownloadItem } from '../types';

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

const copy: Record<DownloadCategory, { heading: string; tagline: string; empty: string }> = {
  GAME: { heading: 'Games', tagline: 'Download games published by CineHorizon.', empty: 'Games appear here after an admin uploads them.' },
  SOFTWARE: { heading: 'Software', tagline: 'Download software and apps published by CineHorizon.', empty: 'Software appears here after an admin uploads it.' }
};

export default function Downloads({ category }: { category: DownloadCategory }) {
  const text = copy[category];
  const items = useQuery({ queryKey: ['downloads', category], queryFn: () => downloadsApi.list(category) });

  return <main className="games-page">
    <header className="games-head">
      <h1>{text.heading}</h1>
      <p>{text.tagline}</p>
    </header>

    {items.isLoading ? <p className="games-status">Loading…</p> : null}

    {!items.isLoading && !items.data?.items.length
      ? <section className="empty-catalog"><h2>Nothing here yet</h2><p>{text.empty}</p></section>
      : null}

    <div className="games-grid">
      {items.data?.items.map((item) => <DownloadCard key={item.id} item={item} category={category} />)}
    </div>

    <footer className="footer"><span>CineHorizon</span><span>Help Centre</span><span>Terms</span><span>Privacy</span><small>© 2026 CineHorizon</small></footer>
  </main>;
}

function DownloadCard({ item, category }: { item: DownloadItem; category: DownloadCategory }) {
  return <article className="game-card">
    <div className="game-cover"><img src={item.coverImageUrl} alt={item.title} loading="lazy" /></div>
    <div className="game-body">
      <div className="game-meta">
        <span className="game-platform">{item.platform}</span>
        {item.version ? <span className="game-version">v{item.version}</span> : null}
      </div>
      <h2>{item.title}</h2>
      {item.developer ? <p className="game-dev">{item.developer}</p> : null}
      <p className="game-desc">{item.description}</p>
      <div className="game-footer">
        <span className="game-size">{formatSize(item.fileSize)} · {item.downloadCount} downloads</span>
        <a className="game-download" href={downloadsApi.downloadUrl(category, item.slug)} download>Download</a>
      </div>
    </div>
  </article>;
}
