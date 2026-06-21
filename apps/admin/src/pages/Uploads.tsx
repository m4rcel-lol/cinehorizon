import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

type JobStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

interface UploadJob {
  id: string;
  fileName: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  error: string | null;
  createdAt: string;
  content: { title: string } | null;
  episode: { title: string } | null;
}

export default function Uploads() {
  const uploads = useQuery({
    queryKey: ['uploads'],
    queryFn: () => api<{ jobs: UploadJob[] }>('/admin/uploads'),
    refetchInterval: 5000
  });

  const jobs = uploads.data?.jobs ?? [];
  const active = jobs.filter((job) => job.status === 'PENDING' || job.status === 'PROCESSING').length;

  return <>
    <div className="topline">
      <div>
        <h1>Upload queue</h1>
        <p className="muted">{active > 0 ? `${active} job${active === 1 ? '' : 's'} in progress · refreshing live` : 'No active transcodes. Newest jobs appear first.'}</p>
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Title</th><th>File</th><th>Status</th><th>Progress</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {jobs.map((job) => <tr key={job.id}>
            <td><strong>{job.content?.title ?? job.episode?.title ?? '—'}</strong><span className="cell-sub">{new Date(job.createdAt).toLocaleString()}</span></td>
            <td>{job.fileName}</td>
            <td><span className={`badge ${job.status.toLowerCase()}`}>{job.status}</span></td>
            <td>
              <div className="bar"><span style={{ width: `${job.status === 'READY' ? 100 : job.progress}%` }} /></div>
              <span className="cell-sub">{job.status === 'READY' ? '100%' : `${job.progress}%`}</span>
            </td>
            <td className={job.error ? 'cell-error' : undefined}>{job.error ?? job.message ?? '—'}</td>
          </tr>)}
        </tbody>
      </table>
      {uploads.isLoading ? <div className="empty-panel">Loading queue…</div> : null}
      {!uploads.isLoading && !jobs.length ? <div className="empty-panel">No uploads yet. Add a movie, episode, or download with a video/file to populate the queue.</div> : null}
    </div>
  </>;
}
