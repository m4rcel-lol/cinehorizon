import { useToastStore } from '../toast';

const glyph: Record<string, string> = { success: '✓', error: '!', info: 'ⓘ' };

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return <div className="toaster" role="status" aria-live="polite">
    {toasts.map((toast) => (
      <button key={toast.id} className={`toast toast-${toast.tone}`} onClick={() => dismiss(toast.id)}>
        <span className="toast-glyph">{glyph[toast.tone]}</span>
        <span>{toast.message}</span>
      </button>
    ))}
  </div>;
}
