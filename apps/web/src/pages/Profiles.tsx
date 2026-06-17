import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { profilesApi } from '../lib/api';
import type { Profile } from '../types';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#e50914,#ff6b35)',
  'linear-gradient(135deg,#7b2ff7,#f107a3)',
  'linear-gradient(135deg,#11998e,#38ef7d)',
  'linear-gradient(135deg,#2193b0,#6dd5ed)',
  'linear-gradient(135deg,#f5c518,#ff6b35)',
  'linear-gradient(135deg,#cc2b5e,#753a88)',
  'linear-gradient(135deg,#314755,#26a0da)',
  'linear-gradient(135deg,#ff512f,#dd2476)',
  'linear-gradient(135deg,#1f4037,#99f2c8)',
  'linear-gradient(135deg,#3a3a3a,#1a1a1a)'
];
const gradient = (i: number) => AVATAR_GRADIENTS[((i % AVATAR_GRADIENTS.length) + AVATAR_GRADIENTS.length) % AVATAR_GRADIENTS.length];

type Editor = { mode: 'create' | 'edit'; id?: string; name: string; avatarIndex: number; isKids: boolean };

export default function Profiles() {
  const { profiles, setProfile, upsertProfile, removeProfile } = useAuthStore();
  const navigate = useNavigate();
  const [manage, setManage] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function choose(profile: Profile) {
    if (manage) {
      setError('');
      setEditor({ mode: 'edit', id: profile.id, name: profile.name, avatarIndex: profile.avatarIndex, isKids: profile.isKids });
      return;
    }
    setProfile(profile);
    navigate('/browse');
  }

  async function save() {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) { setError('Enter a profile name'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { name, avatarIndex: editor.avatarIndex, isKids: editor.isKids };
      const { profile } = editor.mode === 'create'
        ? await profilesApi.create(payload)
        : await profilesApi.update(editor.id!, payload);
      upsertProfile(profile);
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editor?.id) return;
    setSaving(true);
    setError('');
    try {
      await profilesApi.remove(editor.id);
      removeProfile(editor.id);
      setEditor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="profiles-page">
      <h1>Who's watching?</h1>
      <div className="profile-grid">
        {profiles.map((profile) => (
          <button key={profile.id} className={`profile-tile${manage ? ' editing' : ''}`} onClick={() => choose(profile)}>
            <span className="profile-avatar" style={{ background: gradient(profile.avatarIndex) }}>
              {profile.name.charAt(0).toUpperCase()}
              {manage && <span className="profile-edit-badge">✎</span>}
            </span>
            <strong>{profile.name}{profile.isKids && <em className="kids-badge">KIDS</em>}</strong>
          </button>
        ))}
        {profiles.length < 5 && !manage && (
          <button className="profile-tile add" onClick={() => { setError(''); setEditor({ mode: 'create', name: '', avatarIndex: profiles.length % AVATAR_GRADIENTS.length, isKids: false }); }}>
            <span className="profile-avatar add">＋</span>
            <strong>Add Profile</strong>
          </button>
        )}
      </div>
      {profiles.length > 0 && (
        <button className="profile-manage" onClick={() => setManage((m) => !m)}>{manage ? 'Done' : 'Manage Profiles'}</button>
      )}

      {editor && (
        <div className="profile-modal-backdrop" onClick={() => !saving && setEditor(null)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editor.mode === 'create' ? 'Add Profile' : 'Edit Profile'}</h2>
            <div className="profile-modal-preview" style={{ background: gradient(editor.avatarIndex) }}>
              {(editor.name.trim().charAt(0) || '?').toUpperCase()}
            </div>
            <label className="profile-field">
              <span>Name</span>
              <input
                autoFocus
                value={editor.name}
                maxLength={24}
                placeholder="e.g. Wiktor"
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
              />
            </label>
            <div className="profile-field">
              <span>Avatar color</span>
              <div className="avatar-picker">
                {AVATAR_GRADIENTS.map((g, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`avatar-swatch${editor.avatarIndex === i ? ' selected' : ''}`}
                    style={{ background: g }}
                    onClick={() => setEditor({ ...editor, avatarIndex: i })}
                    aria-label={`Avatar ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            <label className="profile-toggle">
              <input type="checkbox" checked={editor.isKids} onChange={(e) => setEditor({ ...editor, isKids: e.target.checked })} />
              <span>Kids profile</span>
            </label>
            {error && <p className="profile-error">{error}</p>}
            <div className="profile-modal-actions">
              {editor.mode === 'edit' && profiles.length > 1 && (
                <button className="btn-danger" onClick={() => void remove()} disabled={saving}>Delete</button>
              )}
              <span className="spacer" />
              <button className="btn-ghost" onClick={() => setEditor(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
