import { create } from 'zustand';
import type { Profile, User } from '../types';

interface AuthState {
  user: User | null;
  profiles: Profile[];
  profile: Profile | null;
  accessToken: string | null;
  setAuth: (user: User, profiles: Profile[], accessToken: string) => void;
  setProfile: (profile: Profile) => void;
  upsertProfile: (profile: Profile) => void;
  removeProfile: (id: string) => void;
  logoutSoft: () => void;
}

const storedProfileId = () => sessionStorage.getItem('ch_profile_id');

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profiles: [],
  profile: null,
  accessToken: null,
  setAuth: (user, profiles, accessToken) => {
    const remembered = profiles.find((p) => p.id === storedProfileId()) ?? profiles[0] ?? null;
    set({ user, profiles, accessToken, profile: get().profile ?? remembered });
  },
  setProfile: (profile) => {
    sessionStorage.setItem('ch_profile_id', profile.id);
    set({ profile });
  },
  upsertProfile: (profile) => set((state) => {
    const exists = state.profiles.some((p) => p.id === profile.id);
    return { profiles: exists ? state.profiles.map((p) => (p.id === profile.id ? profile : p)) : [...state.profiles, profile] };
  }),
  removeProfile: (id) => set((state) => {
    if (storedProfileId() === id) sessionStorage.removeItem('ch_profile_id');
    return {
      profiles: state.profiles.filter((p) => p.id !== id),
      profile: state.profile?.id === id ? null : state.profile
    };
  }),
  logoutSoft: () => set({ user: null, profiles: [], profile: null, accessToken: null })
}));
