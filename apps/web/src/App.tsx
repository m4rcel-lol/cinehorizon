import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Toaster } from './components/Toaster';
import { api } from './lib/api';
import { useAuthStore } from './stores/auth';
import type { AuthResponse } from './types';

const Browse = lazy(() => import('./pages/Browse'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Profiles = lazy(() => import('./pages/Profiles'));
const TitleDetail = lazy(() => import('./pages/TitleDetail'));
const Player = lazy(() => import('./pages/Player'));
const Search = lazy(() => import('./pages/Search'));
const Account = lazy(() => import('./pages/Account'));
const Downloads = lazy(() => import('./pages/Downloads'));
const DownloadDetail = lazy(() => import('./pages/DownloadDetail'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user } = useAuthStore();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const setAuth = useAuthStore((s) => s.setAuth);
  useEffect(() => { void api<AuthResponse>('/auth/refresh', { method: 'POST', auth: false }).then((d) => setAuth(d.user, d.profiles, d.accessToken)).catch(() => undefined); }, [setAuth]);
  return <>
    <Navbar />
    <Toaster />
    <Routes>
      <Route path="/" element={<Browse />} />
      <Route path="/browse" element={<Browse />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/profiles" element={<RequireAuth><Profiles /></RequireAuth>} />
      <Route path="/title/:slug" element={<TitleDetail />} />
      <Route path="/watch/:slug" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/watch/:slug/episode/:episodeId" element={<RequireAuth><Player /></RequireAuth>} />
      <Route path="/games" element={<Downloads category="GAME" />} />
      <Route path="/games/:slug" element={<DownloadDetail category="GAME" />} />
      <Route path="/software" element={<Downloads category="SOFTWARE" />} />
      <Route path="/software/:slug" element={<DownloadDetail category="SOFTWARE" />} />
      <Route path="/search" element={<Search />} />
      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
    </Routes>
  </>;
}
