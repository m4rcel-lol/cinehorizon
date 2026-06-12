import { useQuery } from '@tanstack/react-query';
import { contentApi } from '../lib/api';
import { Hero } from '../components/Hero';
import { ContentRow } from '../components/ContentRow';
import { useAuthStore } from '../stores/auth';

export default function Browse() {
  const user = useAuthStore((s) => s.user);
  const featured = useQuery({ queryKey: ['featured'], queryFn: contentApi.featured });
  const trending = useQuery({ queryKey: ['trending'], queryFn: contentApi.trending });
  const topTen = useQuery({ queryKey: ['top-ten'], queryFn: contentApi.topTen });
  const newArrivals = useQuery({ queryKey: ['new-arrivals'], queryFn: contentApi.newArrivals });
  const genres = useQuery({ queryKey: ['genres'], queryFn: contentApi.genres });
  const continueWatching = useQuery({ queryKey: ['continue'], queryFn: contentApi.continueWatching, enabled: Boolean(user) });

  return <main>
    <Hero item={featured.data?.items[0]} />
    <div className="rows">
      <ContentRow title="Continue Watching" items={continueWatching.data?.items} />
      <ContentRow title="Featured Originals" items={featured.data?.items.filter((i) => i.isOriginal)} />
      <ContentRow title="Trending Now" items={trending.data?.items} />
      <ContentRow title="Top 10 in Your Country" items={topTen.data?.items} />
      {genres.data?.genres.slice(0, 5).map((genre) => <GenreRow key={genre.id} slug={genre.slug} title={genre.name} />)}
      <ContentRow title="New Arrivals" items={newArrivals.data?.items} />
    </div>
    <footer className="footer"><span>CineHorizon</span><span>Help Centre</span><span>Terms</span><span>Privacy</span><small>© 2026 CineHorizon</small></footer>
  </main>;
}

function GenreRow({ slug, title }: { slug: string; title: string }) {
  const row = useQuery({ queryKey: ['genre', slug], queryFn: () => contentApi.byGenre(slug) });
  return <ContentRow title={title} items={row.data?.items} />;
}
