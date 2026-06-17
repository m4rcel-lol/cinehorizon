import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../api';

type GamePlatform = 'WINDOWS' | 'MAC' | 'LINUX' | 'ANDROID' | 'MULTI';

interface GameItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  platform: GamePlatform;
  version: string | null;
  developer: string | null;
  genre: string | null;
  coverImageUrl: string;
  fileName: string;
  fileSize: number;
  downloadCount: number;
  isPublished: boolean;
  createdAt: string;
}

interface GamesResponse {
  games: GameItem[];
}

interface MediaUploadResponse {
  url: string;
  key: string;
}

const platforms: GamePlatform[] = ['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'MULTI'];

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function Games() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const games = useQuery({ queryKey: ['admin-games'], queryFn: () => api<GamesResponse>('/admin/games') });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/games/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-games'] })
  });
  const togglePublish = useMutation({
    mutationFn: (game: GameItem) => api(`/admin/games/${game.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !game.isPublished }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-games'] })
  });

  return <>
    <div className="topline">
      <div>
        <h1>Games</h1>
        <p className="muted">Uploaded games appear on the public Games page for download.</p>
      </div>
      <div className="toolbar">
        <button onClick={() => setOpen(true)}>+ Add Game</button>
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Cover</th><th>Title</th><th>Platform</th><th>Version</th><th>Size</th><th>Downloads</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {games.data?.games.map((game) => <tr key={game.id}>
            <td><img className="thumb" src={game.coverImageUrl} alt="" /></td>
            <td><strong>{game.title}</strong><span className="cell-sub">{game.fileName}</span></td>
            <td>{game.platform}</td>
            <td>{game.version ?? '—'}</td>
            <td>{formatSize(game.fileSize)}</td>
            <td>{game.downloadCount}</td>
            <td><span className={`badge ${game.isPublished ? 'published' : 'draft'}`}>{game.isPublished ? 'PUBLISHED' : 'HIDDEN'}</span></td>
            <td className="row-actions">
              <button className="ghost" onClick={() => togglePublish.mutate(game)}>{game.isPublished ? 'Hide' : 'Publish'}</button>
              <button className="ghost danger" onClick={() => { if (confirm(`Delete "${game.title}"? This removes the uploaded file.`)) del.mutate(game.id); }}>Delete</button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!games.isLoading && !games.data?.games.length ? <div className="empty-panel">No games uploaded yet.</div> : null}
    </div>

    {open ? <Drawer onClose={() => setOpen(false)} onDone={() => { setOpen(false); void qc.invalidateQueries({ queryKey: ['admin-games'] }); }} /> : null}
  </>;
}

function Drawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<GamePlatform>('WINDOWS');
  const [version, setVersion] = useState('');
  const [developer, setDeveloper] = useState('');
  const [genre, setGenre] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [gameFile, setGameFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const coverPreview = useObjectUrl(coverFile);

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append('file', file);
    return api<MediaUploadResponse>('/admin/uploads/media', { method: 'POST', body });
  }

  async function save() {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!coverFile) { setError('A cover image is required.'); return; }
    if (!gameFile) { setError('A game file is required.'); return; }

    setSaving(true);
    try {
      const cover = await uploadImage(coverFile);
      const body = new FormData();
      body.append('title', title.trim());
      body.append('description', description.trim());
      body.append('platform', platform);
      if (version.trim()) body.append('version', version.trim());
      if (developer.trim()) body.append('developer', developer.trim());
      if (genre.trim()) body.append('genre', genre.trim());
      body.append('coverImageUrl', cover.url);
      body.append('file', gameFile);
      await api('/admin/games', { method: 'POST', body });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Game upload failed');
    } finally {
      setSaving(false);
    }
  }

  return <div className="drawer-backdrop" role="presentation">
    <aside className="drawer" aria-label="Add game drawer">
      <div className="drawer-head">
        <div>
          <h2>Add Game</h2>
          <p>Upload a cover image and the downloadable game file.</p>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">x</button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="form-grid">
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" /></label>
        <label>Platform<select value={platform} onChange={(event) => setPlatform(event.target.value as GamePlatform)}>{platforms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Version<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" /></label>
        <label>Developer<input value={developer} onChange={(event) => setDeveloper(event.target.value)} placeholder="Studio name" /></label>
        <label>Genre<input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Action, Puzzle…" /></label>
      </div>

      <label>Description<textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /></label>

      <div className="upload-grid">
        <FilePicker label="Cover image" accept="image/png,image/jpeg,image/webp" file={coverFile} preview={coverPreview} onChange={setCoverFile} />
        <FilePicker label="Game file" accept=".zip,.7z,.rar,.exe,.msi,.dmg,.pkg,.apk,.deb,.appimage,.bin,.iso,.tar,.gz" file={gameFile} onChange={setGameFile} wide />
      </div>

      <div className="drawer-actions">
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button onClick={() => void save()} disabled={saving}>{saving ? 'Uploading...' : 'Save Game'}</button>
      </div>
    </aside>
  </div>;
}

function FilePicker({ label, accept, file, preview, wide, onChange }: { label: string; accept: string; file: File | null; preview?: string; wide?: boolean; onChange: (file: File | null) => void }) {
  return <label className={`file-picker ${wide ? 'wide' : ''}`}>
    <span>{label}</span>
    {preview ? <img src={preview} alt="" /> : <strong>{file ? file.name : 'Choose file'}</strong>}
    {file && !preview ? <small>{file.name}</small> : null}
    <input type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] ?? null)} />
  </label>;
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return undefined; }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url;
}
