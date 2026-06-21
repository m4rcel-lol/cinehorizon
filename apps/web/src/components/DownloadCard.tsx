import { Link } from 'react-router-dom';
import type { DownloadItem } from '../types';

export function DownloadCard({ item }: { item: DownloadItem }) {
  const to = `/${item.category.toLowerCase() === 'game' ? 'games' : 'software'}/${item.slug}`;
  return <Link to={to} className="download-card" aria-label={item.title}>
    <img src={item.coverImageUrl} alt="" loading="lazy" />
    {item.isTopRanked && item.rank ? <span className="dl-rank">#{item.rank}</span> : null}
    <div className="dl-overlay">
      <strong>{item.title}</strong>
      <span>{item.platform}{item.version ? ` · v${item.version}` : ''}</span>
    </div>
  </Link>;
}
