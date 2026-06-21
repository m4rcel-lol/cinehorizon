import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast { id: number; tone: ToastTone; message: string }

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }));
    setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}));

export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
    info: (message: string) => push('info', message)
  };
}
