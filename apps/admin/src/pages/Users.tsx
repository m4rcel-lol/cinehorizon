import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useToast } from '../toast';
import { useAdminStore } from '../store';

type Role = 'USER' | 'ADMIN';

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isVerified: boolean;
}

interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export default function Users() {
  const toast = useToast();
  const qc = useQueryClient();
  const currentUserId = useAdminStore((s) => s.user?.id);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const queryKey = ['users', search, page];

  const users = useQuery({
    queryKey,
    queryFn: () => api<UsersResponse>(`/admin/users?page=${page}&q=${encodeURIComponent(search)}`)
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<AdminUser, 'role' | 'isVerified'>> }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { toast.success('User updated.'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Update failed')
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('User deleted.'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Delete failed')
  });

  const rows = users.data?.users ?? [];
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.limit)) : 1;

  return <>
    <div className="topline">
      <div>
        <h1>Users</h1>
        <p className="muted">{users.data?.total ?? 0} registered {users.data?.total === 1 ? 'account' : 'accounts'}.</p>
      </div>
      <div className="toolbar">
        <input
          className="search-input"
          value={search}
          placeholder="Search name or email"
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Email</th><th>Name</th><th>Role</th><th>Verified</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((user) => {
            const isSelf = user.id === currentUserId;
            return <tr key={user.id}>
              <td><strong>{user.email}</strong>{isSelf ? <span className="cell-sub">You</span> : null}</td>
              <td>{user.displayName}</td>
              <td><span className={`badge ${user.role === 'ADMIN' ? 'published' : 'draft'}`}>{user.role}</span></td>
              <td><span className={`badge ${user.isVerified ? 'published' : 'draft'}`}>{user.isVerified ? 'VERIFIED' : 'UNVERIFIED'}</span></td>
              <td className="row-actions">
                <button className="ghost" onClick={() => {
                  const promoting = user.role !== 'ADMIN';
                  if (promoting && !confirm(`Grant admin access to ${user.email}? They will be able to manage the whole catalog and other users.`)) return;
                  patch.mutate({ id: user.id, body: { role: promoting ? 'ADMIN' : 'USER' } });
                }} disabled={isSelf}>{user.role === 'ADMIN' ? 'Revoke admin' : 'Make admin'}</button>
                <button className="ghost" onClick={() => patch.mutate({ id: user.id, body: { isVerified: !user.isVerified } })}>
                  {user.isVerified ? 'Unverify' : 'Verify'}
                </button>
                <button className="ghost danger" onClick={() => { if (confirm(`Delete ${user.email}? This removes their profiles, watchlist and history.`)) remove.mutate(user.id); }} disabled={isSelf}>Delete</button>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
      {users.isLoading ? <div className="empty-panel">Loading users…</div> : null}
      {!users.isLoading && !rows.length ? <div className="empty-panel">{search ? `No users match "${search}".` : 'No users yet.'}</div> : null}
    </div>

    {totalPages > 1 ? <div className="pager">
      <button className="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button className="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div> : null}
  </>;
}
