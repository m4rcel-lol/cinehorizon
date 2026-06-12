import { Link } from 'react-router-dom';
import type { ContentCard } from '../types';

export function Hero({ item }: { item: ContentCard | undefined }) {
  if (!item) return <div className="hero skeleton-hero" />;
  return <section className="hero" style={{ backgroundImage: `linear-gradient(to right, rgba(10,10,10,.92), rgba(10,10,10,.45), rgba(10,10,10,0)), linear-gradient(to top, #0a0a0a, transparent 45%), url(${item.backdropUrl})` }}>
    <div className="hero-content">
      {item.logoUrl ? <img className="title-logo" src={item.logoUrl} alt={item.title} /> : <h1>{item.title}</h1>}
      <div className="meta"><span>{item.ageRating}</span><span>{item.releaseYear}</span><span>{item.type === 'MOVIE' ? `${item.durationMinutes ?? 0} min` : 'Series'}</span></div>
      <p>{item.description}</p>
      <div className="cta-row"><Link className="play-btn" to={`/watch/${item.slug}`}>▶ Play</Link><Link className="info-btn" to={`/title/${item.slug}`}>ⓘ More Info</Link></div>
    </div>
  </section>;
}
