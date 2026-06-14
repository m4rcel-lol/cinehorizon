import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await api<{ user: any; profiles: any[]; accessToken: string }>('/auth/register', { method: 'POST', auth: false, body: JSON.stringify({ displayName, email, password }) });
      setAuth(data.user, data.profiles, data.accessToken);
      navigate('/profiles');
    } catch (err) { setError(err instanceof Error ? err.message : 'Register failed'); }
  }
  return <main className="auth-page"><form onSubmit={submit} className="auth-card"><h1>Create Account</h1>{error && <p className="form-error">{error}</p>}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" placeholder="Display name" required /><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="Email" required /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" placeholder="Password" required /><button>Start Watching</button><p>Already joined? <Link to="/login">Sign in</Link></p></form></main>;
}
