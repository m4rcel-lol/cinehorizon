import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';

type Status = 'verifying' | 'done' | 'failed';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'failed');
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    authApi.verifyEmail(token).then(() => setStatus('done')).catch(() => setStatus('failed'));
  }, [token]);

  return <main className="auth-page">
    <div className="auth-card">
      {status === 'verifying' ? <><h1>Verifying…</h1><div className="spinner" aria-label="Verifying" /></> : null}
      {status === 'done' ? <><h1>Email verified</h1><p className="auth-note">Your account is all set. Welcome to CineHorizon.</p><p><Link to="/account">Go to account</Link></p></> : null}
      {status === 'failed' ? <><h1>Link expired</h1><p className="auth-note">This verification link is invalid or has expired. Sign in and resend a fresh one from your account.</p><p><Link to="/account">Go to account</Link></p></> : null}
    </div>
  </main>;
}
