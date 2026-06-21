import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api';
import { useToast } from '../stores/toast';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      toast.success('Password reset. Sign in with your new password.');
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <main className="auth-page"><div className="auth-card"><h1>Invalid link</h1><p className="auth-note">This reset link is missing its token. Request a new one.</p><p><Link to="/forgot-password">Reset password</Link></p></div></main>;

  return <main className="auth-page">
    <form onSubmit={submit} className="auth-card">
      <h1>Set a new password</h1>
      {error && <p className="form-error">{error}</p>}
      <p className="auth-note">Choose a new password of at least 8 characters.</p>
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="New password" minLength={8} required />
      <button disabled={busy || password.length < 8}>{busy ? 'Saving…' : 'Save password'}</button>
      <p>Back to <Link to="/login">Sign in</Link></p>
    </form>
  </main>;
}
