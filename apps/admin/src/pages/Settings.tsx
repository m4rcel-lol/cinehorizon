import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

interface SystemInfo {
  appName: string;
  environment: string;
  baseUrl: string;
  mediaDir: string;
  uptimeSeconds: number;
  email: { transport: string; configured: boolean; from: string; smtpHost: string | null };
  db: string;
  downloads: number;
  pendingJobs: number;
  failedJobs: number;
}

function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

export default function Settings() {
  const system = useQuery({ queryKey: ['system'], queryFn: () => api<SystemInfo>('/admin/system'), refetchInterval: 30000 });
  const s = system.data;

  const emailReady = s?.email.configured && s.email.transport === 'smtp';

  return <>
    <div className="topline">
      <div>
        <h1>Settings</h1>
        <p className="muted">Live system status. Values come from the server environment and can't be edited here — change them in your server-side <code>.env</code>.</p>
      </div>
    </div>

    {system.isLoading ? <div className="empty-panel">Loading system status…</div> : null}

    {s ? <div className="settings-grid">
      <div className="panel">
        <h2>Health</h2>
        <dl className="kv">
          <div><dt>Environment</dt><dd><span className={`badge ${s.environment === 'production' ? 'published' : 'draft'}`}>{s.environment}</span></dd></div>
          <div><dt>Database</dt><dd><span className={`badge ${s.db === 'ok' ? 'ready' : 'failed'}`}>{s.db === 'ok' ? 'CONNECTED' : 'DOWN'}</span></dd></div>
          <div><dt>API uptime</dt><dd>{uptime(s.uptimeSeconds)}</dd></div>
          <div><dt>Base URL</dt><dd>{s.baseUrl}</dd></div>
        </dl>
      </div>

      <div className="panel">
        <h2>Email delivery</h2>
        <dl className="kv">
          <div><dt>Status</dt><dd><span className={`badge ${emailReady ? 'ready' : 'draft'}`}>{emailReady ? 'SENDING' : 'CONSOLE / LOG ONLY'}</span></dd></div>
          <div><dt>Transport</dt><dd>{s.email.transport}</dd></div>
          {s.email.smtpHost ? <div><dt>SMTP host</dt><dd>{s.email.smtpHost}</dd></div> : null}
          <div><dt>From</dt><dd>{s.email.from}</dd></div>
        </dl>
        {!emailReady ? <p className="hint">Set <code>SMTP_HOST</code> (and credentials) to send verification and password-reset emails. Works with Amazon SES, Postmark, Mailgun, or Gmail.</p> : null}
      </div>

      <div className="panel">
        <h2>Catalog &amp; queue</h2>
        <dl className="kv">
          <div><dt>Downloads published</dt><dd>{s.downloads}</dd></div>
          <div><dt>Jobs in progress</dt><dd>{s.pendingJobs}</dd></div>
          <div><dt>Failed jobs</dt><dd><span className={s.failedJobs ? 'cell-error' : undefined}>{s.failedJobs}</span></dd></div>
          <div><dt>Media directory</dt><dd>{s.mediaDir}</dd></div>
        </dl>
      </div>

      <div className="panel">
        <h2>Configuration</h2>
        <p className="hint">JWT keys, storage/CDN, CORS origins, and database credentials are managed through environment variables on the server. See <code>.env.example</code> for the full list and the project README for deployment steps.</p>
      </div>
    </div> : null}
  </>;
}
