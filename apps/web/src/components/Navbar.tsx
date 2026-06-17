import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { useAuthStore } from '../stores/auth';
import { api } from '../lib/api';

export function Navbar() {
  const [solid, setSolid] = useState(false);
  const [search, setSearch] = useState('');
  const { user, profile, logoutSoft } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    logoutSoft();
    navigate('/login');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/search?q=${encodeURIComponent(search.trim())}`);
  }

  return <header className={`navbar ${solid ? 'navbar-solid' : ''}`}>
    <Logo />
    <nav className="navlinks">
      <NavLink to="/browse">Home</NavLink>
      <NavLink to="/browse?type=SERIES">TV Shows</NavLink>
      <NavLink to="/browse?type=MOVIE">Movies</NavLink>
      <NavLink to="/games">Games</NavLink>
      <NavLink to="/software">Software</NavLink>
      <NavLink to="/browse#popular">New & Popular</NavLink>
      <NavLink to="/account">My List</NavLink>
      {user?.role === 'ADMIN' ? <a className="admin-link" href="/admin">Admin</a> : null}
    </nav>
    <form onSubmit={submit} className="searchbox"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titles, people, genres" /></form>
    {user ? <div className="profile-menu"><Link to="/profiles" className="avatar">{profile?.name?.[0] ?? user.displayName[0]}</Link><button onClick={logout}>Sign out</button></div> : <Link className="signin" to="/login">Sign in</Link>}
  </header>;
}
