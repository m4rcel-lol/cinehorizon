import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { downloadsApi } from '../lib/api';
import { Footer } from '../components/Footer';
import { SaveDownloadButton } from '../components/SaveDownloadButton';
import { formatCount, formatSize } from '../lib/format';
import type { DownloadCategory } from '../types';

export default function DownloadDetail({ category }: { category: DownloadCategory }) {
  const { slug = '' } = useParams();
  const query = useQuery({ queryKey: ['dl-detail', category, slug], queryFn: () => downloadsApi.detail(category, slug) });

  if (query.isLoading) return <main className="store"><div className="store-inner"><div className="detail-skeleton" /></div></main>;
  if (query.isError || !query.data) return <main className="store"><div className="detail-error"><h1>Not found</h1><p>This download is no longer available.</p></div></main>;

  const item = query.data.item;
  const specs: Array<[string, string]> = [
    ['Platform', item.platform],
    ...(item.version ? [['Version', `v${item.version}`] as [string, string]] : []),
    ...(item.developer ? [['Developer', item.developer] as [string, string]] : []),
    ...(item.genre ? [['Category', item.genre] as [string, string]] : []),
    ['Size', formatSize(item.fileSize)],
    ['Downloads', formatCount(item.downloadCount)],
    ['File', item.fileName]
  ];

  return <main className="store">
    <div className="store-backdrop" style={{ backgroundImage: `url(${item.coverImageUrl})` }} aria-hidden />
    <div className="store-inner">
      <aside className="store-art">
        <div className="store-cover"><img src={item.coverImageUrl} alt={item.title} /></div>
        <div className="store-buy">
          <a className="play-btn store-download" href={downloadsApi.downloadUrl(item.category, item.slug)} download>↓ Download</a>
          <SaveDownloadButton downloadId={item.id} title={item.title} />
          <span className="store-buy-meta">{formatSize(item.fileSize)} · {item.platform}</span>
        </div>
      </aside>

      <div className="store-info">
        <span className="hero-eyebrow">{item.category === 'GAME' ? 'Game' : 'Software'}</span>
        <h1>{item.title}</h1>
        <div className="meta">
          <span>{item.platform}</span>
          {item.version ? <span>v{item.version}</span> : null}
          {item.developer ? <span>{item.developer}</span> : null}
          {item.genre ? <span>{item.genre}</span> : null}
          <span>{formatCount(item.downloadCount)} downloads</span>
        </div>
        <p className="store-desc">{item.description}</p>

        <section className="store-specs">
          <h2>Details</h2>
          <dl>
            {specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
      </div>
    </div>
    <Footer />
  </main>;
}
