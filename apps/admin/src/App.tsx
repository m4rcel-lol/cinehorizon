import { lazy, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAdminStore } from './store';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Content = lazy(() => import('./pages/Content'));
const Games = lazy(() => import('./pages/Games'));
const Users = lazy(() => import('./pages/Users'));
const Uploads = lazy(() => import('./pages/Uploads'));
const Settings = lazy(() => import('./pages/Settings'));

function RequireAdmin({ children }: { children: JSX.Element }) { const user = useAdminStore((s) => s.user); return user?.role === 'ADMIN' ? children : <Navigate to="/login" replace />; }
function Shell({ children }: { children: JSX.Element }) { const logoutSoft = useAdminStore((s) => s.logoutSoft); const navigate = useNavigate(); async function logout(){ await api('/auth/logout', { method: 'POST' }).catch(()=>undefined); logoutSoft(); navigate('/login'); } return <div className="admin-shell"><aside className="admin-sidebar"><div className="brand"><span>Cine</span><b>Horizon</b><small>ADMIN</small></div><NavLink to="/">Dashboard</NavLink><NavLink to="/content">Content</NavLink><NavLink to="/games">Games</NavLink><NavLink to="/users">Users</NavLink><NavLink to="/uploads">Uploads</NavLink><NavLink to="/settings">Settings</NavLink><button onClick={logout}>Sign out</button></aside><section className="admin-main">{children}</section></div>; }
export default function App(){ const setAuth = useAdminStore((s)=>s.setAuth); useEffect(()=>{ void api<any>('/auth/refresh',{method:'POST'}).then((d)=>{ if(d.user.role==='ADMIN') setAuth(d.user,d.accessToken); }).catch(()=>undefined);},[setAuth]); return <Routes><Route path="/login" element={<Login/>}/><Route path="/" element={<RequireAdmin><Shell><Dashboard/></Shell></RequireAdmin>}/><Route path="/content" element={<RequireAdmin><Shell><Content/></Shell></RequireAdmin>}/><Route path="/games" element={<RequireAdmin><Shell><Games/></Shell></RequireAdmin>}/><Route path="/users" element={<RequireAdmin><Shell><Users/></Shell></RequireAdmin>}/><Route path="/uploads" element={<RequireAdmin><Shell><Uploads/></Shell></RequireAdmin>}/><Route path="/settings" element={<RequireAdmin><Shell><Settings/></Shell></RequireAdmin>}/></Routes>; }
