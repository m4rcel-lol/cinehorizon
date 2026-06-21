import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, uploadWithProgress } from '../api';

type DownloadCategory = 'GAME' | 'SOFTWARE';
type Platform = 'WINDOWS' | 'MAC' | 'LINUX' | 'ANDROID' | 'IOS' | 'WEB' | 'MULTI';

interface DownloadItem {
  id: string;
  category: DownloadCategory;
  title: string;
  slug: string;
  description: string;
  platform: Platform;
  version: string | null;
  developer: string | null;
  genre: string | null;
  coverImageUrl: string;
  fileName: string;
  fileSize: number;
  downloadCount: number;
  isPublished: boolean;
  isFeatured: boolean;
  isTrending: boolean;
  isTopRanked: boolean;
  rank: number | null;
  createdAt: string;
}

type MerchFlag = 'isFeatured' | 'isTrending' | 'isTopRanked';

interface DownloadsResponse {
  items: DownloadItem[];
}

interface MediaUploadResponse {
  url: string;
  key: string;
}

const platforms: Platform[] = ['WINDOWS', 'MAC', 'LINUX', 'ANDROID', 'IOS', 'WEB', 'MULTI'];
const accept = '.zip,.7z,.rar,.tar,.gz,.xz,.bz2,.exe,.msi,.dmg,.pkg,.apk,.deb,.rpm,.appimage,.snap,.flatpak,.jar,.bin,.iso,.img';

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function Downloads({ category }: { category: DownloadCategory }) {
  const noun = category === 'GAME' ? 'Game' : 'Software';
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ['admin-downloads', category];
  const items = useQuery({ queryKey, queryFn: () => api<DownloadsResponse>(`/admin/downloads?category=${category}`) });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/downloads/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey })
  });
  const togglePublish = useMutation({
    mutationFn: (item: DownloadItem) => api(`/admin/downloads/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isPublished: !item.isPublished }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey })
  });
  const toggleFlag = useMutation({
    mutationFn: ({ item, flag }: { item: DownloadItem; flag: MerchFlag }) =>
      api(`/admin/downloads/${item.id}`, { method: 'PATCH', body: JSON.stringify({ [flag]: !item[flag] }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey })
  });
  const merch: Array<{ flag: MerchFlag; label: string }> = [
    { flag: 'isFeatured', label: 'Featured' },
    { flag: 'isTrending', label: 'Trending' },
    { flag: 'isTopRanked', label: 'Top' }
  ];

  return <>
    <div className="topline">
      <div>
        <h1>{noun === 'Game' ? 'Games' : 'Software'}</h1>
        <p className="muted">Uploaded {noun === 'Game' ? 'games' : 'software'} appear on the public {noun === 'Game' ? 'Games' : 'Software'} page for download.</p>
      </div>
      <div className="toolbar">
        <button onClick={() => setOpen(true)}>+ Add {noun}</button>
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Cover</th><th>Title</th><th>Platform</th><th>Size</th><th>Downloads</th><th>Merchandising</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {items.data?.items.map((item) => <tr key={item.id}>
            <td><img className="thumb" src={item.coverImageUrl} alt="" /></td>
            <td><strong>{item.title}</strong><span className="cell-sub">{item.fileName}</span></td>
            <td>{item.platform}</td>
            <td>{formatSize(item.fileSize)}</td>
            <td>{item.downloadCount}</td>
            <td className="row-actions">
              {merch.map(({ flag, label }) => <button
                key={flag}
                className={`ghost ${item[flag] ? 'on' : ''}`}
                onClick={() => toggleFlag.mutate({ item, flag })}
                aria-pressed={item[flag]}
              >{label}{flag === 'isTopRanked' && item.isTopRanked && item.rank ? ` #${item.rank}` : ''}</button>)}
            </td>
            <td><span className={`badge ${item.isPublished ? 'published' : 'draft'}`}>{item.isPublished ? 'PUBLISHED' : 'HIDDEN'}</span></td>
            <td className="row-actions">
              <button className="ghost" onClick={() => togglePublish.mutate(item)}>{item.isPublished ? 'Hide' : 'Publish'}</button>
              <button className="ghost danger" onClick={() => { if (confirm(`Delete "${item.title}"? This removes the uploaded file.`)) del.mutate(item.id); }}>Delete</button>
            </td>
          </tr>)}
        </tbody>
      </table>
      {!items.isLoading && !items.data?.items.length ? <div className="empty-panel">No {noun === 'Game' ? 'games' : 'software'} uploaded yet.</div> : null}
    </div>

    {open ? <Drawer category={category} noun={noun} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void qc.invalidateQueries({ queryKey }); }} /> : null}
  </>;
}

function Drawer({ category, noun, onClose, onDone }: { category: DownloadCategory; noun: string; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<Platform>('WINDOWS');
  const [version, setVersion] = useState('');
  const [developer, setDeveloper] = useState('');
  const [genre, setGenre] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'cover' | 'file'>('idle');
  const [progress, setProgress] = useState(0);

  const coverPreview = useObjectUrl(coverFile);

  async function uploadImage(image: File) {
    const body = new FormData();
    body.append('file', image);
    return api<MediaUploadResponse>('/admin/uploads/media', { method: 'POST', body });
  }

  async function save() {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!coverFile) { setError('A cover image is required.'); return; }
    if (!file) { setError(`A ${noun.toLowerCase()} file is required.`); return; }

    setSaving(true);
    setProgress(0);
    try {
      setPhase('cover');
      const cover = await uploadImage(coverFile);
      const body = new FormData();
      body.append('category', category);
      body.append('title', title.trim());
      body.append('description', description.trim());
      body.append('platform', platform);
      if (version.trim()) body.append('version', version.trim());
      if (developer.trim()) body.append('developer', developer.trim());
      if (genre.trim()) body.append('genre', genre.trim());
      body.append('coverImageUrl', cover.url);
      body.append('file', file);
      setPhase('file');
      await uploadWithProgress('/admin/downloads', body, setProgress);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
      setPhase('idle');
    }
  }

  return <div className="drawer-backdrop" role="presentation">
    <aside className="drawer" aria-label={`Add ${noun.toLowerCase()} drawer`}>
      <div className="drawer-head">
        <div>
          <h2>Add {noun}</h2>
          <p>Upload a cover image and the downloadable file.</p>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">x</button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="form-grid">
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" /></label>
        <label>Platform<select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{platforms.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Version<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1.0.0" /></label>
        <label>{noun === 'Game' ? 'Developer' : 'Publisher'}<input value={developer} onChange={(event) => setDeveloper(event.target.value)} placeholder="Studio name" /></label>
        <label>Genre / Type<input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder={noun === 'Game' ? 'Action, Puzzle…' : 'Utility, Editor…'} /></label>
      </div>

      <label>Description<textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /></label>

      <div className="upload-grid">
        <FilePicker label="Cover image" accept="image/png,image/jpeg,image/webp" file={coverFile} preview={coverPreview} onChange={setCoverFile} />
        <FilePicker label={`${noun} file`} accept={accept} file={file} onChange={setFile} wide />
      </div>

      {saving ? <div className="upload-progress">
        <div className="upload-progress-head">
          <span>{phase === 'cover' ? 'Uploading cover image…' : `Uploading ${noun.toLowerCase()} file…`}</span>
          <span>{phase === 'file' ? `${progress}%` : ''}</span>
        </div>
        <div className="bar"><span style={{ width: `${phase === 'file' ? progress : 8}%` }} /></div>
      </div> : null}

      <div className="drawer-actions">
        <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button onClick={() => void save()} disabled={saving}>{saving ? (phase === 'file' ? `Uploading ${progress}%` : 'Uploading…') : `Save ${noun}`}</button>
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
