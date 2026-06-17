import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth';

const Browse = lazy(() => import('./pages/Browse'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Profiles = lazy(() => import('./pages/Profiles'));
const TitleDetail = lazy(() => import('./pages/TitleDetail'));
const Player = lazy(() => import('./pages/Player'));
const Search = lazy(() => import('./pages/Search'));
const Account = lazy(() => import('./pages/Account'));
const Games = lazy(() => import('./pages/Games'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const setAuth = useAuthStore((s) => s.setAuth);
  useEffect(() => { void api<{ user: any; profiles: any[]; accessToken: string }>('/auth/refresh', { method: 'POST', auth: false }).then((d) => setAuth(d.user, d.profiles, d.accessToken)).catch(() => undefined); }, [setAuth]);
  return <>
    <Navbar />
    <Routes>
      <Route path="/" element={<Browse />} />
      <Route path="/browse" element={<Browse />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/profiles" element={<RequireAuth><Profiles /></RequireAuth>} />
      <Route path="/title/:slug" element={<TitleDetail />} />
      <Route path="/watch/:slug" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/watch/:slug/episode/:episodeId" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/games" element={<Games />} />
      <Route path="/search" element={<Search />} />
      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
    </Routes>
  </>;
}
