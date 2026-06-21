import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, uploadWithProgress } from '../api';

type ContentType = 'MOVIE' | 'SERIES';
type ContentStatus = 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED';

interface Genre {
  id: string;
  name: string;
  slug: string;
}

interface ContentItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: ContentType;
  status?: ContentStatus;
  releaseYear: number;
  ageRating: string;
  durationMinutes?: number | null;
  posterUrl: string;
  backdropUrl: string;
  isFeatured: boolean;
  isOriginal: boolean;
  isTrending: boolean;
  isTopTen: boolean;
  topTenRank?: number | null;
  genres: Genre[];
}

interface ContentListResponse {
  items: ContentItem[];
  total: number;
}

interface GenresResponse {
  genres: Genre[];
}

interface MediaUploadResponse {
  url: string;
  key: string;
}

interface CreateContentResponse {
  content: ContentItem;
}

interface ContentPayload {
  title: string;
  description: string;
  type: ContentType;
  releaseYear: number;
  ageRating: string;
  durationMinutes: number | null;
  posterUrl: string;
  backdropUrl: string;
  status: ContentStatus;
  genreIds: string[];
  maturityTags: string[];
  cast: Array<{ name: string; role: string; characterName: string | null }>;
  isFeatured: boolean;
  isOriginal: boolean;
  isTrending: boolean;
  isTopTen: boolean;
  topTenRank: number | null;
}

const ageRatings = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-Y', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
const maturityOptions = ['Violence', 'Language', 'Nudity', 'Drug Use', 'Horror', 'Flashing Images'];

export default function Content() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ContentStatus>('ALL');
  const rows = useQuery({
    queryKey: ['content', statusFilter],
    queryFn: () => api<ContentListResponse>(`/admin/content${statusFilter === 'ALL' ? '' : `?status=${statusFilter}`}`)
  });
  const genres = useQuery({ queryKey: ['admin-genres'], queryFn: () => api<GenresResponse>('/admin/genres') });
  const del = useMutation({
    mutationFn: (id: string) => api(`/admin/content/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['content'] })
  });

  return <>
    <div className="topline">
      <div>
        <h1>Movies &amp; TV</h1>
        <p className="muted">Movies and series in the streaming catalog. Games and software are managed under their own sections.</p>
      </div>
      <div className="toolbar">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'ALL' | ContentStatus)}>
          <option value="ALL">All status</option>
          <option value="DRAFT">Draft</option>
          <option value="PROCESSING">Processing</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button onClick={() => setOpen(true)}>+ Add Content</button>
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Thumbnail</th><th>Title</th><th>Type</th><th>Status</th><th>Year</th><th>Genres</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.data?.items.map((content) => <tr key={content.id}>
            <td><img className="thumb" src={content.backdropUrl} alt="" /></td>
            <td><strong>{content.title}</strong><span className="cell-sub">{content.slug}</span></td>
            <td>{content.type}</td>
            <td><span className={`badge ${(content.status ?? 'PUBLISHED').toLowerCase()}`}>{content.status ?? 'PUBLISHED'}</span></td>
            <td>{content.releaseYear}</td>
            <td>{content.genres.map((genre) => genre.name).join(', ') || 'None'}</td>
            <td><button className="ghost danger" onClick={() => del.mutate(content.id)}>Delete</button></td>
          </tr>)}
        </tbody>
      </table>
      {!rows.isLoading && !rows.data?.items.length ? <div className="empty-panel">No uploaded titles yet.</div> : null}
    </div>

    {open ? <Drawer genres={genres.data?.genres ?? []} onClose={() => setOpen(false)} onDone={() => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['content'] });
      void qc.invalidateQueries({ queryKey: ['uploads'] });
    }} /> : null}
  </>;
}

function Drawer({ genres, onClose, onDone }: { genres: Genre[]; onClose: () => void; onDone: () => void }) {
  const currentYear = new Date().getFullYear();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ContentType>('MOVIE');
  const [releaseYear, setReleaseYear] = useState(currentYear);
  const [ageRating, setAgeRating] = useState('PG-13');
  const [durationMinutes, setDurationMinutes] = useState(100);
  const [status, setStatus] = useState<ContentStatus>('DRAFT');
  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);
  const [maturityTags, setMaturityTags] = useState<string[]>([]);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [backdropFile, setBackdropFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isOriginal, setIsOriginal] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [isTrending, setIsTrending] = useState(false);
  const [isTopTen, setIsTopTen] = useState(false);
  const [topTenRank, setTopTenRank] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [progress, setProgress] = useState(0);

  const posterPreview = useObjectUrl(posterFile);
  const backdropPreview = useObjectUrl(backdropFile);

  function toggleValue(value: string, current: string[], setter: (next: string[]) => void) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append('file', file);
    return api<MediaUploadResponse>('/admin/uploads/media', { method: 'POST', body });
  }

  async function uploadVideo(contentId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    setUploadingVideo(true);
    setProgress(0);
    try {
      await uploadWithProgress(`/admin/content/${contentId}/video`, body, setProgress);
    } finally {
      setUploadingVideo(false);
    }
  }

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    if (!posterFile || !backdropFile) {
      setError('Poster and backdrop uploads are required.');
      return;
    }
    if (status === 'PUBLISHED' && type === 'MOVIE' && !videoFile) {
      setError('Upload a movie video before publishing.');
      return;
    }

    setSaving(true);
    try {
      const [poster, backdrop] = await Promise.all([uploadImage(posterFile), uploadImage(backdropFile)]);
      const payload: ContentPayload = {
        title: title.trim(),
        description: description.trim(),
        type,
        releaseYear,
        ageRating,
        durationMinutes: type === 'MOVIE' ? durationMinutes : null,
        posterUrl: poster.url,
        backdropUrl: backdrop.url,
        status: videoFile ? 'PROCESSING' : status,
        genreIds: selectedGenreIds,
        maturityTags,
        cast: [],
        isFeatured,
        isOriginal,
        isTrending,
        isTopTen,
        topTenRank: isTopTen ? topTenRank : null
      };
      const created = await api<CreateContentResponse>('/admin/content', { method: 'POST', body: JSON.stringify(payload) });
      if (videoFile) await uploadVideo(created.content.id, videoFile);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Content upload failed');
    } finally {
      setSaving(false);
    }
  }

  return <div className="drawer-backdrop" role="presentation">
    <aside className="drawer" aria-label="Add content drawer">
      <div className="drawer-head">
        <div>
          <h2>Add Content</h2>
          <p>Upload local artwork and optional movie video.</p>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">x</button>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="form-grid">
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" /></label>
        <label>Type<select value={type} onChange={(event) => setType(event.target.value as ContentType)}><option value="MOVIE">Movie</option><option value="SERIES">Series</option></select></label>
        <label>Release year<input type="number" value={releaseYear} min={1888} max={2100} onChange={(event) => setReleaseYear(Number(event.target.value))} /></label>
        <label>Age rating<select value={ageRating} onChange={(event) => setAgeRating(event.target.value)}>{ageRatings.map((rating) => <option key={rating}>{rating}</option>)}</select></label>
        {type === 'MOVIE' ? <label>Duration<input type="number" value={durationMinutes} min={1} onChange={(event) => setDurationMinutes(Number(event.target.value))} /></label> : null}
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as ContentStatus)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label>
      </div>

      <label>Description<textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /></label>

      <div className="upload-grid">
        <FilePicker label="Poster" accept="image/png,image/jpeg,image/webp" file={posterFile} preview={posterPreview} onChange={setPosterFile} />
        <FilePicker label="Backdrop" accept="image/png,image/jpeg,image/webp" file={backdropFile} preview={backdropPreview} onChange={setBackdropFile} wide />
        {type === 'MOVIE' ? <FilePicker label="Movie video" accept="video/mp4,video/webm,video/quicktime" file={videoFile} onChange={setVideoFile} /> : null}
      </div>

      <fieldset>
        <legend>Genres</legend>
        <div className="chips">{genres.map((genre) => <label key={genre.id} className="chip"><input type="checkbox" checked={selectedGenreIds.includes(genre.id)} onChange={() => toggleValue(genre.id, selectedGenreIds, setSelectedGenreIds)} />{genre.name}</label>)}</div>
      </fieldset>

      <fieldset>
        <legend>Maturity tags</legend>
        <div className="chips">{maturityOptions.map((tag) => <label key={tag} className="chip"><input type="checkbox" checked={maturityTags.includes(tag)} onChange={() => toggleValue(tag, maturityTags, setMaturityTags)} />{tag}</label>)}</div>
      </fieldset>

      <fieldset>
        <legend>Flags</legend>
        <div className="chips">
          <label className="chip"><input type="checkbox" checked={isOriginal} onChange={(event) => setIsOriginal(event.target.checked)} />Original</label>
          <label className="chip"><input type="checkbox" checked={isFeatured} onChange={(event) => setIsFeatured(event.target.checked)} />Featured</label>
          <label className="chip"><input type="checkbox" checked={isTrending} onChange={(event) => setIsTrending(event.target.checked)} />Trending</label>
          <label className="chip"><input type="checkbox" checked={isTopTen} onChange={(event) => setIsTopTen(event.target.checked)} />Top 10</label>
          {isTopTen ? <label className="rank-input">Rank<input type="number" min={1} max={10} value={topTenRank} onChange={(event) => setTopTenRank(Number(event.target.value))} /></label> : null}
        </div>
      </fieldset>

      {uploadingVideo ? <div className="upload-progress">
        <div className="upload-progress-head"><span>Uploading video…</span><span>{progress}%</span></div>
        <div className="bar"><span style={{ width: `${progress}%` }} /></div>
      </div> : null}

      <div className="drawer-actions">
        <button className="ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button onClick={() => void save()} disabled={saving}>{uploadingVideo ? `Uploading video ${progress}%` : saving ? 'Saving…' : 'Save Content'}</button>
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
    if (!file) {
      setUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}
