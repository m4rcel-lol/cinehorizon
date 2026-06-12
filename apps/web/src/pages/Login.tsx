import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export default function Login() {
  const [email, setEmail] = useState('admin@cinehorizon.local');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await api<{ user: any; profiles: any[]; accessToken: string }>('/auth/login', { method: 'POST', auth: false, body: JSON.stringify({ email, password }) });
      setAuth(data.user, data.profiles, data.accessToken);
      navigate('/profiles');
    } catch (err) { setError(err instanceof Error ? err.message : 'Login failed'); }
  }

  return <main className="auth-page"><form onSubmit={submit} className="auth-card"><h1>Sign In</h1>{error && <p className="form-error">{error}</p>}<input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" /><button>Sign In</button><p>New to CineHorizon? <Link to="/register">Create account</Link></p></form></main>;
}
