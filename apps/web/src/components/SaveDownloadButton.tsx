import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { libraryApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useToast } from '../stores/toast';

export function SaveDownloadButton({ downloadId, title }: { downloadId: string; title: string }) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const library = useQuery({ queryKey: ['library'], queryFn: libraryApi.list, enabled: Boolean(user && profile) });
  const saved = Boolean(library.data?.items.some((item) => item.id === downloadId));

  const mutation = useMutation({
    mutationFn: async () => { if (saved) await libraryApi.remove(downloadId); else await libraryApi.save(downloadId); },
    onSuccess: () => {
      toast.success(saved ? `Removed ${title} from your library` : `Saved ${title} to your library`);
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update library')
  });

  function click() {
    if (!user) { navigate('/login'); return; }
    if (!profile) { navigate('/profiles'); return; }
    mutation.mutate();
  }

  return <button type="button" className={`info-btn save-btn ${saved ? 'saved' : ''}`} onClick={click} disabled={mutation.isPending} aria-pressed={saved}>
    {saved ? '✓ In library' : '+ Save'}
  </button>;
}
