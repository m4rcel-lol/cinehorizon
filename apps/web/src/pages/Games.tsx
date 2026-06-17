import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../lib/api';
import type { Game } from '../types';

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function Games() {
  const games = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });

  return <main className="games-page">
    <header className="games-head">
      <h1>Games</h1>
      <p>Download games published by CineHorizon.</p>
    </header>

    {games.isLoading ? <p className="games-status">Loading games…</p> : null}

    {!games.isLoading && !games.data?.items.length
      ? <section className="empty-catalog"><h2>No games yet</h2><p>Games appear here after an admin uploads them.</p></section>
      : null}

    <div className="games-grid">
      {games.data?.items.map((game) => <GameCard key={game.id} game={game} formatSize={formatSize} />)}
    </div>

    <footer className="footer"><span>CineHorizon</span><span>Help Centre</span><span>Terms</span><span>Privacy</span><small>© 2026 CineHorizon</small></footer>
  </main>;
}

function GameCard({ game, formatSize }: { game: Game; formatSize: (bytes: number) => string }) {
  return <article className="game-card">
    <div className="game-cover"><img src={game.coverImageUrl} alt={game.title} loading="lazy" /></div>
    <div className="game-body">
      <div className="game-meta">
        <span className="game-platform">{game.platform}</span>
        {game.version ? <span className="game-version">v{game.version}</span> : null}
      </div>
      <h2>{game.title}</h2>
      {game.developer ? <p className="game-dev">{game.developer}</p> : null}
      <p className="game-desc">{game.description}</p>
      <div className="game-footer">
        <span className="game-size">{formatSize(game.fileSize)} · {game.downloadCount} downloads</span>
        <a className="game-download" href={gamesApi.downloadUrl(game.slug)} download>Download</a>
      </div>
    </div>
  </article>;
}
