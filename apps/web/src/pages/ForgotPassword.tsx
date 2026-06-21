import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await authApi.forgotPassword(email).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  return <main className="auth-page">
    <form onSubmit={submit} className="auth-card">
      <h1>Reset password</h1>
      {sent
        ? <p className="auth-note">If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox and spam folder.</p>
        : <>
            <p className="auth-note">Enter your email and we'll send a link to set a new password.</p>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="Email" required />
            <button disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>}
      <p>Remembered it? <Link to="/login">Sign in</Link></p>
    </form>
  </main>;
}
