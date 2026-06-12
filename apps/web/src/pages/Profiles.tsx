import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function Profiles() {
  const { profiles, setProfile } = useAuthStore();
  const navigate = useNavigate();
  return <main className="profiles-page"><h1>Who's watching?</h1><div className="profile-grid">{profiles.map((profile) => <button key={profile.id} className="profile-tile" onClick={() => { setProfile(profile); navigate('/browse'); }}><span>{profile.name[0]}</span><strong>{profile.name}</strong></button>)}<button className="profile-tile add"><span>＋</span><strong>Add Profile</strong></button></div></main>;
}
