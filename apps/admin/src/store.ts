import { create } from 'zustand';
export interface AdminUser { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN'; isVerified: boolean }
interface State {
  user: AdminUser | null;
  accessToken: string | null;
  bootstrapped: boolean;
  setAuth: (user: AdminUser, accessToken: string) => void;
  setBootstrapped: () => void;
  logoutSoft: () => void;
}
export const useAdminStore = create<State>((set) => ({
  user: null,
  accessToken: null,
  bootstrapped: false,
  setAuth: (user, accessToken) => set({ user, accessToken, bootstrapped: true }),
  setBootstrapped: () => set({ bootstrapped: true }),
  logoutSoft: () => set({ user: null, accessToken: null, bootstrapped: true })
}));
