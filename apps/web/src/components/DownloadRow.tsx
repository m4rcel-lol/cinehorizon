import type { DownloadItem } from '../types';
import { DownloadCard } from './DownloadCard';

export function DownloadRow({ title, items }: { title: string; items: DownloadItem[] | undefined }) {
  if (!items?.length) return null;
  return <section className="content-row">
    <div className="row-head"><h2>{title}</h2></div>
    <div className="rail">{items.map((item) => <DownloadCard key={item.id} item={item} />)}</div>
  </section>;
}
