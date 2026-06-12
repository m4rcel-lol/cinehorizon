import { Link } from 'react-router-dom';
import type { ContentCard as Card } from '../types';

export function ContentCard({ item }: { item: Card }) {
  return <Link to={`/title/${item.slug}`} className="content-card" aria-label={item.title}>
    {item.isTopTen && item.topTenRank ? <span className="rank">{item.topTenRank}</span> : null}
    <img src={item.backdropUrl} alt="" loading="lazy" />
    <div className="card-preview">
      <strong>{item.title}</strong>
      <span>{item.releaseYear} · {item.ageRating} · {item.type === 'MOVIE' ? `${item.durationMinutes ?? 0}m` : 'Series'}</span>
      <p>{item.genres.slice(0, 3).map((g) => g.name).join(' · ')}</p>
      {item.progressSeconds ? <div className="progress"><span style={{ width: `${Math.min(100, item.progressSeconds / 60)}%` }} /></div> : null}
    </div>
    {item.isOriginal ? <em className="original-badge">Original</em> : null}
  </Link>;
}
