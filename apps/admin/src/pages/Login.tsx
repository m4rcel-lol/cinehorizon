import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAdminStore } from '../store';
import type { AdminUser } from '../store';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setAuth = useAdminStore((state) => state.setAuth);
  const navigate = useNavigate();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const data = await api<{ user: AdminUser; accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.user.role !== 'ADMIN') throw new Error('Admin role required');
      setAuth(data.user, data.accessToken);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return <main className="login-page">
    <form onSubmit={submit} className="login-card">
      <h1>CineHorizon Admin</h1>
      {error ? <p className="error">{error}</p> : null}
      <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
      <button>Sign in</button>
    </form>
  </main>;
}
