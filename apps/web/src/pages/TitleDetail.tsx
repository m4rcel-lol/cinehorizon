import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { contentApi } from '../lib/api';

export default function TitleDetail() {
  const { slug = '' } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['title', slug], queryFn: () => contentApi.detail(slug), enabled: Boolean(slug) });
  if (isLoading) return <main className="detail-page"><div className="detail-card skeleton-hero" /></main>;
  if (error || !data) return <main className="detail-page"><p>Title not found.</p></main>;
  const c = data.content;
  return <main className="detail-page">
    <section className="detail-hero" style={{ backgroundImage: `linear-gradient(to top, #0a0a0a, rgba(10,10,10,.2)), url(${c.backdropUrl})` }}>
      <div><h1>{c.title}</h1><div className="meta"><span>{c.releaseYear}</span><span>{c.ageRating}</span><span>{c.type}</span><span>HD</span></div><p>{c.description}</p><div className="cta-row"><Link className="play-btn" to={`/watch/${c.slug}`}>▶ Play</Link><button className="info-btn">＋ Add to List</button></div></div>
    </section>
    <section className="detail-body"><p><strong>Cast:</strong> {c.cast.map((m) => m.name).join(', ') || 'Unknown'}</p><p><strong>Genres:</strong> {c.genres.map((g) => g.name).join(', ')}</p><p><strong>Maturity:</strong> {c.maturityTags.join(', ') || 'None'}</p>{c.type === 'SERIES' ? c.seasons.map((s) => <div key={s.id} className="season"><h2>{s.title ?? `Season ${s.number}`}</h2>{s.episodes.map((ep) => <Link key={ep.id} className="episode" to={`/watch/${c.slug}/episode/${ep.id}`}><img src={ep.thumbnailUrl} alt="" /><div><strong>{ep.number}. {ep.title}</strong><span>{ep.durationMinutes}m</span><p>{ep.description}</p></div></Link>)}</div>) : <h2>More Like This</h2>}</section>
  </main>;
}
