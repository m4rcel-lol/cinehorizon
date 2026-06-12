import type { ContentCard as Card } from '../types';
import { ContentCard } from './ContentCard';

export function ContentRow({ title, items }: { title: string; items?: Card[] }) {
  if (!items?.length) return null;
  return <section className="content-row">
    <div className="row-head"><h2>{title}</h2><span>Explore All ›</span></div>
    <div className="rail">{items.map((item) => <ContentCard key={item.id} item={item} />)}</div>
  </section>;
}
