'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import { formatHandle } from '@/lib/socialHandles';

type AdminUserRow = {
  uid: string;
  fullName: string;
  email: string;
  instagramHandle: string;
  xHandle: string;
  bio: string;
  photoUrl: string;
  crownPrice: number;
  isActive: boolean;
};

type ChampionFields = {
  name?: string;
  bio?: string;
  photoUrl?: string;
};

type CrownStatus = {
  activeUid: string | null;
  crownPrice?: number | null;
  activePriceCents?: number | null;
  activePaymentIntentId?: string | null;
  activeDateKey?: string | null;
  lastSettledForDate?: string | null;
  lastAttemptForDate?: string | null;
  lastAttemptResult?: string | null;
  lastWinnerEmailSentForDate?: string | null;
  assignedBy?: string | null;
  user?: {
    uid: string;
    fullName?: string;
    email?: string;
    photoUrl?: string;
    bio?: string;
  } | null;
  snapshotChampion?: ChampionFields;
  userChampion?: ChampionFields;
  resolvedChampion?: ChampionFields;
};

type AdminEvent = {
  id: string;
  type: string;
  uid: string;
  fullName: string;
  email: string;
  amountCents: number;
  paymentIntentId: string;
  stripeStatus: string;
  dateKey: string;
  error: string;
  createdAt: string | null;
};

type EditDraft = {
  fullName: string;
  bio: string;
  instagramHandle: string;
  xHandle: string;
  crownPrice: string;
  isActive: boolean;
};

function formatMoney(amountCents?: number | null) {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents)) return '-';
  return `$${(amountCents / 100).toFixed(2)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function shortResult(value?: string | null) {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

export default function AdminPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [search, setSearch] = useState('');

  const [crown, setCrown] = useState<CrownStatus | null>(null);
  const [crownLoading, setCrownLoading] = useState(false);

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [winners, setWinners] = useState<AdminEvent[]>([]);
  const [failures, setFailures] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingUser, setSavingUser] = useState(false);

  async function getTokenOrRedirect() {
    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return null;
    }
    return user.getIdToken();
  }

  async function fetchUsers() {
    setError(null);
    setLoading(true);

    const token = await getTokenOrRedirect();
    if (!token) return;

    const res = await fetch('/api/admin/users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setLoading(false);
      setError(data?.error || 'Failed to load admin users.');
      return;
    }

    setRows(Array.isArray(data.users) ? data.users : []);
    setLoading(false);
  }

  async function fetchCrown() {
    setCrownLoading(true);
    setError(null);

    const token = await getTokenOrRedirect();
    if (!token) return;

    const res = await fetch('/api/admin/crown-status', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setCrownLoading(false);
      setError(data?.error || 'Failed to load crown status.');
      return;
    }

    setCrown((data?.crown as CrownStatus) || null);
    setCrownLoading(false);
  }

  async function fetchEvents() {
    setEventsLoading(true);
    setError(null);

    const token = await getTokenOrRedirect();
    if (!token) return;

    const res = await fetch('/api/admin/events', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setEventsLoading(false);
      setError(data?.error || 'Failed to load crown events.');
      return;
    }

    setEvents(Array.isArray(data.events) ? data.events : []);
    setWinners(Array.isArray(data.winners) ? data.winners : []);
    setFailures(Array.isArray(data.failures) ? data.failures : []);
    setEventsLoading(false);
  }

  async function refreshAll() {
    setNotice(null);
    await Promise.all([fetchUsers(), fetchCrown(), fetchEvents()]);
  }

  async function assignCrown(targetUid: string) {
    setError(null);
    setNotice(null);

    const confirmed = window.confirm(
      'Assign the crown to this person right now? This charges their default payment method and updates crownStatus/current.'
    );
    if (!confirmed) return;

    const token = await getTokenOrRedirect();
    if (!token) return;

    let res = await fetch('/api/admin/assign-crown-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUid }),
    });

    let data = (await res.json().catch(() => ({}))) as any;

    if (res.status === 409 && Array.isArray(data?.warnings) && data.warnings.length > 0) {
      const warningText = data.warnings.map((warning: string) => `- ${warning}`).join('\n');
      const forceConfirmed = window.confirm(
        `This crown assignment has warnings:

${warningText}

Assign the crown anyway without collecting a successful payment?`
      );

      if (!forceConfirmed) return;

      res = await fetch('/api/admin/assign-crown-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUid, force: true }),
      });

      data = (await res.json().catch(() => ({}))) as any;
    }

    if (!res.ok) {
      setError(data?.error || 'Failed to assign crown.');
      return;
    }

    setNotice(
      data?.forced
        ? 'Crown assigned with admin override. No successful charge was collected.'
        : 'Crown assigned successfully.'
    );
    await refreshAll();
  }

  function beginEdit(user: AdminUserRow) {
    setSelectedUid(user.uid);
    setDraft({
      fullName: user.fullName || '',
      bio: user.bio || '',
      instagramHandle: user.instagramHandle || '',
      xHandle: user.xHandle || '',
      crownPrice: String(Number.isFinite(user.crownPrice) ? user.crownPrice : 0),
      isActive: user.isActive,
    });
    setNotice(null);
    setError(null);
  }

  function cancelEdit() {
    setSelectedUid(null);
    setDraft(null);
  }

  async function saveUser() {
    if (!selectedUid || !draft) return;

    setSavingUser(true);
    setError(null);
    setNotice(null);

    const token = await getTokenOrRedirect();
    if (!token) return;

    const crownPrice = Number(draft.crownPrice);
    if (!Number.isFinite(crownPrice) || crownPrice < 0) {
      setSavingUser(false);
      setError('Crown price must be 0 or higher.');
      return;
    }

    const res = await fetch(`/api/admin/users/${selectedUid}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fullName: draft.fullName,
        bio: draft.bio,
        instagramHandle: draft.instagramHandle,
        xHandle: draft.xHandle,
        crownPrice,
        isActive: draft.isActive,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setSavingUser(false);
      setError(data?.error || 'Failed to save user.');
      return;
    }

    setSavingUser(false);
    setNotice('User updated.');
    await refreshAll();
    cancelEdit();
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setReady(true);
      if (!u) {
        router.push('/login');
        return;
      }
      await refreshAll();
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows
      .filter((r) => (showOnlyActive ? r.isActive : true))
      .filter((r) => {
        if (!q) return true;
        return (
          r.fullName?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.instagramHandle?.toLowerCase().includes(q) ||
          r.xHandle?.toLowerCase().includes(q) ||
          r.uid?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.crownPrice || 0) - (a.crownPrice || 0));
  }, [rows, showOnlyActive, search]);

  const selectedUser = useMemo(
    () => rows.find((row) => row.uid === selectedUid) || null,
    [rows, selectedUid]
  );

  const crownPriceDisplay = useMemo(() => {
    if (!crown) return null;
    const dollars =
      crown.crownPrice ??
      (typeof crown.activePriceCents === 'number' ? crown.activePriceCents / 100 : null);
    return typeof dollars === 'number' ? dollars : null;
  }, [crown]);

  const crownDisplay = useMemo(() => {
    const name =
      crown?.resolvedChampion?.name ||
      crown?.snapshotChampion?.name ||
      crown?.user?.fullName ||
      '';

    const photoUrl =
      crown?.resolvedChampion?.photoUrl ||
      crown?.snapshotChampion?.photoUrl ||
      crown?.user?.photoUrl ||
      '';

    const emailOrUid = crown?.user?.email || crown?.activeUid || '';
    const snapshotName = (crown?.snapshotChampion?.name || '').trim();
    const userName = (crown?.userChampion?.name || '').trim();
    const isMismatch =
      Boolean(snapshotName && userName) && snapshotName.toLowerCase() !== userName.toLowerCase();

    return { name, photoUrl, emailOrUid, isMismatch };
  }, [crown]);

  const activeCount = useMemo(() => rows.filter((row) => row.isActive).length, [rows]);
  const topBid = useMemo(() => filtered[0]?.crownPrice ?? 0, [filtered]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <p className="text-sm text-slate-600">Checking session...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Operations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage users, review nightly crown activity, and intervene when the flow needs help.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={refreshAll}
            className="rounded-full bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800"
          >
            Refresh
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-800 hover:bg-slate-50"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Crown</div>
          <div className="mt-3 text-lg font-semibold text-slate-900">
            {crownLoading ? 'Loading...' : crownDisplay.name || 'No crown set'}
          </div>
          <div className="mt-1 text-sm text-slate-500">{crownDisplay.emailOrUid || '-'}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Price</div>
          <div className="mt-3 text-lg font-semibold text-slate-900">
            {typeof crownPriceDisplay === 'number' ? `$${crownPriceDisplay.toFixed(0)}` : '-'}
          </div>
          <div className="mt-1 text-sm text-slate-500">Top active bid: ${topBid.toFixed(0)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Nightly Status</div>
          <div className="mt-3 text-lg font-semibold text-slate-900">{shortResult(crown?.lastAttemptResult)}</div>
          <div className="mt-1 text-sm text-slate-500">
            Attempted for: {crown?.lastAttemptForDate || crown?.lastSettledForDate || '-'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Users</div>
          <div className="mt-3 text-lg font-semibold text-slate-900">{activeCount} active</div>
          <div className="mt-1 text-sm text-slate-500">{rows.length} total profiles</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current Crown</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {crownDisplay.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={crownDisplay.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">-</div>
                  )}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{crownDisplay.name || '(no name)'}</div>
                  <div className="text-sm text-slate-500">{crownDisplay.emailOrUid || '-'}</div>
                </div>
              </div>
            </div>

            {crownDisplay.isMismatch ? (
              <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                Snapshot differs from user
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Assigned By</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{crown?.assignedBy || '-'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Winner Email</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {crown?.lastWinnerEmailSentForDate || 'Not recorded'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Intent</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                {crown?.activePaymentIntentId || '-'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Active Date</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{crown?.activeDateKey || '-'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Attention Needed</h2>
              <p className="text-sm text-slate-500">Latest failures and warnings from crown operations.</p>
            </div>
            {eventsLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>

          <div className="mt-4 space-y-3">
            {failures.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
                No recent failures recorded.
              </div>
            ) : (
              failures.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-red-800">{event.type}</div>
                    <div className="text-[11px] text-red-700">{event.dateKey || formatDateTime(event.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-sm text-red-900">
                    {event.fullName || event.email || event.uid || 'Unknown user'}
                  </div>
                  <div className="mt-1 text-[12px] text-red-700">{event.error || event.stripeStatus || 'Failure recorded.'}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={showOnlyActive}
                  onChange={(e) => setShowOnlyActive(e.target.checked)}
                />
                Only active
              </label>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, handle, uid..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300 sm:w-80"
              />
            </div>

            <div className="text-xs text-slate-500">
              Showing <span className="font-semibold">{filtered.length}</span> users
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">Crown Price</th>
                  <th className="py-2 pr-3">Social</th>
                  <th className="py-2 pr-3">Bio</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.uid} className="border-b border-slate-100 align-top">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {u.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">-</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{u.fullName || '(no name)'}</div>
                          <div className="truncate text-[11px] text-slate-500">{u.email || u.uid}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 pr-3">
                      {u.isActive ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="py-3 pr-3 font-semibold text-slate-900">${Number(u.crownPrice || 0).toFixed(0)}</td>

                    <td className="min-w-[180px] py-3 pr-3">
                      <div className="space-y-1 text-[11px] text-slate-600">
                        <div>IG: {formatHandle(u.instagramHandle) || '-'}</div>
                        <div>X: {formatHandle(u.xHandle) || '-'}</div>
                      </div>
                    </td>

                    <td className="max-w-[320px] py-3 pr-3">
                      <div className="line-clamp-3 text-slate-700">{u.bio || '-'}</div>
                    </td>

                    <td className="py-3 pr-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => beginEdit(u)}
                          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => assignCrown(u.uid)}
                          className="rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-400"
                        >
                          Assign Crown
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="py-6 text-slate-500" colSpan={6}>
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
              <p className="text-sm text-slate-500">
                Update a profile or deactivate it without deleting history.
              </p>
            </div>
          </div>

          {!selectedUser || !draft ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Choose a user from the table to edit their public profile fields and activation status.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">{selectedUser.fullName || '(no name)'}</div>
                <div className="text-xs text-slate-500">{selectedUser.email || selectedUser.uid}</div>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold text-slate-800">Full Name</label>
                <input
                  value={draft.fullName}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold text-slate-800">Bio</label>
                <textarea
                  rows={4}
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  className="resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold text-slate-800">Instagram</label>
                  <input
                    value={draft.instagramHandle}
                    onChange={(e) => setDraft({ ...draft, instagramHandle: e.target.value })}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold text-slate-800">X</label>
                  <input
                    value={draft.xHandle}
                    onChange={(e) => setDraft({ ...draft, xHandle: e.target.value })}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold text-slate-800">Crown Price</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.crownPrice}
                  onChange={(e) => setDraft({ ...draft, crownPrice: e.target.value })}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
                User is active
              </label>

              <div className="flex gap-2">
                <button
                  onClick={saveUser}
                  disabled={savingUser}
                  className="rounded-full bg-slate-900 px-4 py-2 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingUser ? 'Saving...' : 'Save User'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Past Winners</h2>
              <p className="text-sm text-slate-500">Recent nightly and manual crown wins.</p>
            </div>
            {eventsLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>

          <div className="mt-4 space-y-3">
            {winners.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No winner events yet.</div>
            ) : (
              winners.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">
                      {event.fullName || event.email || event.uid || 'Unknown user'}
                    </div>
                    <div className="text-[11px] text-slate-500">{event.dateKey || formatDateTime(event.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {event.type} | {formatMoney(event.amountCents)}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">
                    {event.paymentIntentId || 'No payment intent recorded'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
              <p className="text-sm text-slate-500">Latest crown events and settlement results.</p>
            </div>
            {eventsLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
          </div>

          <div className="mt-4 space-y-3">
            {events.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No events recorded yet.</div>
            ) : (
              events.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{event.type}</div>
                    <div className="text-[11px] text-slate-500">{formatDateTime(event.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {event.fullName || event.email || event.uid || 'System'} {event.amountCents ? `| ${formatMoney(event.amountCents)}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {event.error || event.stripeStatus || event.paymentIntentId || event.dateKey || 'No extra details'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
