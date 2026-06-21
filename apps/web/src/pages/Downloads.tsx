import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { downloadsApi } from '../lib/api';
import { DownloadRow } from '../components/DownloadRow';
import { Footer } from '../components/Footer';
import { formatCount } from '../lib/format';
import type { DownloadCategory, DownloadItem } from '../types';

const copy: Record<DownloadCategory, { heading: string; tagline: string; empty: string }> = {
  GAME: { heading: 'Games', tagline: 'Stream-free, download-and-play games — curated by CineHorizon.', empty: 'Games appear here after an admin publishes them.' },
  SOFTWARE: { heading: 'Software', tagline: 'Apps and tools for every platform — curated by CineHorizon.', empty: 'Software appears here after an admin publishes it.' }
};

export default function Downloads({ category }: { category: DownloadCategory }) {
  const text = copy[category];
  const featured = useQuery({ queryKey: ['dl-featured', category], queryFn: () => downloadsApi.featured(category) });
  const trending = useQuery({ queryKey: ['dl-trending', category], queryFn: () => downloadsApi.trending(category) });
  const top = useQuery({ queryKey: ['dl-top', category], queryFn: () => downloadsApi.top(category) });
  const all = useQuery({ queryKey: ['dl-all', category], queryFn: () => downloadsApi.list(category) });

  const hero = featured.data?.items[0] ?? all.data?.items[0];
  const isLoading = featured.isLoading || trending.isLoading || top.isLoading || all.isLoading;
  const hasItems = Boolean(all.data?.items.length);

  return <main>
    <DownloadHero item={hero} category={category} heading={text.heading} tagline={text.tagline} />
    <div className="rows">
      <DownloadRow title={`Trending ${text.heading}`} items={trending.data?.items} />
      <DownloadRow title={`Top ${text.heading}`} items={top.data?.items} />
      <DownloadRow title={`All ${text.heading}`} items={all.data?.items} />
      {!isLoading && !hasItems
        ? <section className="empty-catalog"><h2>Nothing here yet</h2><p>{text.empty}</p></section>
        : null}
    </div>
    <Footer />
  </main>;
}

function DownloadHero({ item, category, heading, tagline }: { item: DownloadItem | undefined; category: DownloadCategory; heading: string; tagline: string }) {
  if (!item) return <section className="hero hero-empty">
    <div className="hero-content"><h1>{heading}</h1><p>{tagline}</p></div>
  </section>;
  const to = `/${category.toLowerCase() === 'game' ? 'games' : 'software'}/${item.slug}`;
  return <section className="hero" style={{ backgroundImage: `linear-gradient(to right, rgba(10,10,10,.92), rgba(10,10,10,.45), rgba(10,10,10,0)), linear-gradient(to top, #0a0a0a, transparent 45%), url(${item.coverImageUrl})` }}>
    <div className="hero-content">
      <span className="hero-eyebrow">{heading}</span>
      <h1>{item.title}</h1>
      <div className="meta">
        <span>{item.platform}</span>
        {item.version ? <span>v{item.version}</span> : null}
        {item.developer ? <span>{item.developer}</span> : null}
        {item.downloadCount ? <span>{formatCount(item.downloadCount)} downloads</span> : null}
      </div>
      <p>{item.description}</p>
      <div className="cta-row">
        <a className="play-btn" href={downloadsApi.downloadUrl(category, item.slug)} download>↓ Download</a>
        <Link className="info-btn" to={to}>ⓘ More Info</Link>
      </div>
    </div>
  </section>;
}
