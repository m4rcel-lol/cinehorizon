import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

export default function Register() {
  const [displayName, setDisplayName] = useState('Demo User');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('ChangeMe123!');
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
  return <main className="auth-page"><form onSubmit={submit} className="auth-card"><h1>Create Account</h1>{error && <p className="form-error">{error}</p>}<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" /><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" /><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" /><button>Start Watching</button><p>Already joined? <Link to="/login">Sign in</Link></p></form></main>;
}
