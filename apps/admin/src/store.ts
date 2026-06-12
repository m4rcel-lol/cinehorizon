import { create } from 'zustand';
export interface AdminUser { id: string; email: string; displayName: string; role: 'USER' | 'ADMIN'; isVerified: boolean }
interface State { user: AdminUser | null; accessToken: string | null; setAuth: (user: AdminUser, accessToken: string) => void; logoutSoft: () => void }
export const useAdminStore = create<State>((set) => ({ user: null, accessToken: null, setAuth: (user, accessToken) => set({ user, accessToken }), logoutSoft: () => set({ user: null, accessToken: null }) }));
