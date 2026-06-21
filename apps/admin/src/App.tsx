import { lazy, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAdminStore } from './store';
import { Toaster } from './components/Toaster';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Content = lazy(() => import('./pages/Content'));
const Downloads = lazy(() => import('./pages/Downloads'));
const Users = lazy(() => import('./pages/Users'));
const Uploads = lazy(() => import('./pages/Uploads'));
const Settings = lazy(() => import('./pages/Settings'));

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

function RequireAdmin({ children }: { children: JSX.Element }) {
  const user = useAdminStore((s) => s.user);
  const bootstrapped = useAdminStore((s) => s.bootstrapped);
  // Wait for the silent refresh to resolve before deciding: an admin with a valid
  // session cookie should never be bounced to the login screen on a page refresh.
  if (!bootstrapped) return <div className="admin-loading">Loading…</div>;
  return user?.role === 'ADMIN' ? children : <Navigate to="/login" replace />;
}

function Shell({ children }: { children: JSX.Element }) {
  const logoutSoft = useAdminStore((s) => s.logoutSoft);
  const navigate = useNavigate();
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    logoutSoft();
    navigate('/login');
  }
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand"><span>Cine</span><b>Horizon</b><small>ADMIN</small></div><NavLink to="/">Dashboard</NavLink><NavLink to="/content">Movies &amp; TV</NavLink><NavLink to="/games">Games</NavLink><NavLink to="/software">Software</NavLink><NavLink to="/users">Users</NavLink><NavLink to="/uploads">Uploads</NavLink><NavLink to="/settings">Settings</NavLink><button onClick={logout}>Sign out</button></aside><section className="admin-main">{children}</section><Toaster /></div>;
}

export default function App() {
  const setAuth = useAdminStore((s) => s.setAuth);
  const setBootstrapped = useAdminStore((s) => s.setBootstrapped);
  useEffect(() => {
    // Direct fetch (not the api() helper) so a missing/expired session resolves once
    // instead of looping the refresh-on-401 retry.
    fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user?.role === 'ADMIN') setAuth(data.user, data.accessToken);
        else setBootstrapped();
      })
      .catch(() => setBootstrapped());
  }, [setAuth, setBootstrapped]);
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<RequireAdmin><Shell><Dashboard /></Shell></RequireAdmin>} />
    <Route path="/content" element={<RequireAdmin><Shell><Content /></Shell></RequireAdmin>} />
    <Route path="/games" element={<RequireAdmin><Shell><Downloads category="GAME" /></Shell></RequireAdmin>} />
    <Route path="/software" element={<RequireAdmin><Shell><Downloads category="SOFTWARE" /></Shell></RequireAdmin>} />
    <Route path="/users" element={<RequireAdmin><Shell><Users /></Shell></RequireAdmin>} />
    <Route path="/uploads" element={<RequireAdmin><Shell><Uploads /></Shell></RequireAdmin>} />
    <Route path="/settings" element={<RequireAdmin><Shell><Settings /></Shell></RequireAdmin>} />
  </Routes>;
}
