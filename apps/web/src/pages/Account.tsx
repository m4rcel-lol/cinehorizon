import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, authApi, libraryApi } from '../lib/api';
import { DownloadCard } from '../components/DownloadCard';
import { ContentCard } from '../components/ContentCard';
import { Footer } from '../components/Footer';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../stores/toast';
import type { ContentCard as ContentSummary } from '../types';

type Tab = 'mylist' | 'library';

export default function Account() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [tab, setTab] = useState<Tab>('mylist');

  const watchlist = useQuery({ queryKey: ['watchlist'], queryFn: () => api<{ items: ContentSummary[] }>('/watchlist', { profile: true }), enabled: Boolean(profile) });
  const library = useQuery({ queryKey: ['library'], queryFn: libraryApi.list, enabled: Boolean(profile) });

  return <main className="account">
    <div className="account-inner">
      <header className="account-hero reveal">
        <div className="account-avatar" aria-hidden>{(profile?.name ?? user?.displayName ?? '?')[0]}</div>
        <div>
          <span className="eyebrow">Account</span>
          <h1>{user?.displayName}</h1>
          <p className="account-email">{user?.email}{user && !user.isVerified ? <span className="pill pill-warn">Unverified</span> : <span className="pill pill-ok">Verified</span>}</p>
        </div>
        <Link to="/profiles" className="account-switch">Switch profile</Link>
      </header>

      {user && !user.isVerified ? <VerifyBanner /> : null}

      <div className="account-grid">
        <ChangePassword />
        <Sessions />
      </div>

      <section className="account-collection reveal">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mylist'} className={tab === 'mylist' ? 'on' : ''} onClick={() => setTab('mylist')}>My List <span>{watchlist.data?.items.length ?? 0}</span></button>
          <button role="tab" aria-selected={tab === 'library'} className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>My Library <span>{library.data?.items.length ?? 0}</span></button>
        </div>
        {tab === 'mylist'
          ? <CollectionGrid empty="Titles you add to your list show up here.">
              {watchlist.data?.items.map((item) => <ContentCard key={item.id} item={item} />)}
            </CollectionGrid>
          : <CollectionGrid empty="Save games and software and they'll land in your library.">
              {library.data?.items.map((item) => <DownloadCard key={item.id} item={item} />)}
            </CollectionGrid>}
      </section>
    </div>
    <Footer />
  </main>;
}

function CollectionGrid({ children, empty }: { children: React.ReactNode; empty: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(items) ? items.length === 0 : !items;
  if (isEmpty) return <div className="account-empty"><p>{empty}</p></div>;
  return <div className="account-collection-grid">{items}</div>;
}

function VerifyBanner() {
  const toast = useToast();
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (data) => toast.success(data.alreadyVerified ? 'Your email is already verified.' : 'Verification email sent — check your inbox.'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not send email')
  });
  return <div className="account-banner reveal">
    <div>
      <strong>Confirm your email</strong>
      <p>Verify your address to secure your account and recover it if you're ever locked out.</p>
    </div>
    <button onClick={() => resend.mutate()} disabled={resend.isPending}>{resend.isPending ? 'Sending…' : 'Resend email'}</button>
  </div>;
}

function ChangePassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: () => { toast.success('Password updated. Other devices were signed out.'); setCurrent(''); setNext(''); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update password')
  });
  return <section className="card reveal">
    <h2>Password</h2>
    <p className="card-sub">Use at least 8 characters. Changing it signs out your other devices.</p>
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="stack">
      <label>Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label>
      <label>New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required /></label>
      <button disabled={mutation.isPending || !current || next.length < 8}>{mutation.isPending ? 'Saving…' : 'Update password'}</button>
    </form>
  </section>;
}

function Sessions() {
  const toast = useToast();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions });
  const revoke = useMutation({
    mutationFn: authApi.revokeSession,
    onSuccess: () => { toast.success('Device signed out.'); void qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not sign out device')
  });
  return <section className="card reveal">
    <h2>Devices</h2>
    <p className="card-sub">Where you're signed in. Revoke any session you don't recognise.</p>
    {sessions.isLoading ? <div className="skeleton-rows"><span /><span /></div> : null}
    <ul className="session-list">
      {sessions.data?.sessions.map((s) => <li key={s.id}>
        <div>
          <strong>{describeAgent(s.userAgent)}{s.current ? <span className="pill pill-ok">This device</span> : null}</strong>
          <span>{s.ipAddress ?? 'Unknown IP'} · added {new Date(s.createdAt).toLocaleDateString()}</span>
        </div>
        {s.current ? null : <button className="ghost" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>Sign out</button>}
      </li>)}
    </ul>
  </section>;
}

function describeAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
