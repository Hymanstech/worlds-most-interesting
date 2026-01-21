// src/app/admin/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';

type AdminUserRow = {
  uid: string;
  fullName: string;
  email: string;
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

  // Live user doc loaded by the API (users/{uid})
  user?: {
    uid: string;
    fullName?: string;
    email?: string;
    photoUrl?: string;
    bio?: string;
  } | null;

  // Values stored directly on crownStatus/current (what homepage reads)
  snapshotChampion?: ChampionFields;

  // Values derived from user doc (users/{uid})
  userChampion?: ChampionFields;

  // Best available display (prefers snapshot, falls back to user doc)
  resolvedChampion?: ChampionFields;
};

export default function AdminPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [search, setSearch] = useState('');

  const [crown, setCrown] = useState<CrownStatus | null>(null);
  const [crownLoading, setCrownLoading] = useState(false);

  async function fetchUsers() {
    setError(null);
    setLoading(true);

    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }

    const token = await user.getIdToken();

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

    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }

    const token = await user.getIdToken();

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

  async function assignCrown(targetUid: string) {
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }

    const confirmed = window.confirm(
      'Assign the crown to this person right now? This updates crownStatus/current.'
    );
    if (!confirmed) return;

    const token = await user.getIdToken();

    const res = await fetch('/api/admin/assign-crown-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUid }),
    });

    const data = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      setError(data?.error || 'Failed to assign crown.');
      return;
    }

    alert('Crown assigned ✅');

    // Refresh crown indicator + list (so admin sees it immediately)
    await fetchCrown();
    await fetchUsers();
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setReady(true);
      if (!u) {
        router.push('/login');
        return;
      }
      await Promise.all([fetchUsers(), fetchCrown()]);
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
          r.uid?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.crownPrice || 0) - (a.crownPrice || 0));
  }, [rows, showOnlyActive, search]);

  const crownPriceDisplay = useMemo(() => {
    if (!crown) return null;
    const dollars =
      crown.crownPrice ??
      (typeof crown.activePriceCents === 'number' ? crown.activePriceCents / 100 : null);
    return typeof dollars === 'number' ? dollars : null;
  }, [crown]);

  // ✅ This is what we show in the "Current Crown" indicator:
  // prefer the snapshot values (what the public homepage sees), fallback to user doc
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

    // helpful debug: did snapshot differ from user doc?
    const snapshotName = (crown?.snapshotChampion?.name || '').trim();
    const userName = (crown?.userChampion?.name || '').trim();
    const isMismatch =
      Boolean(snapshotName && userName) && snapshotName.toLowerCase() !== userName.toLowerCase();

    return { name, photoUrl, emailOrUid, isMismatch };
  }, [crown]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-slate-600">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin</h1>
          <p className="mt-1 text-sm text-slate-600">
            View users, crown prices, and manually assign the crown.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={async () => {
              await Promise.all([fetchUsers(), fetchCrown()]);
            }}
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

      {/* CURRENT CROWN INDICATOR */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500">Current Crown</div>

            {crownLoading ? (
              <div className="mt-2 text-sm text-slate-600">Loading crown status…</div>
            ) : crown?.activeUid ? (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {crownDisplay.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={crownDisplay.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                      —
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">
                    {crownDisplay.name || '(no name)'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {crownDisplay.emailOrUid || crown.activeUid}
                  </div>
                </div>

                <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
                  Crowned
                </span>

                {crownDisplay.isMismatch ? (
                  <span className="inline-flex rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    Snapshot differs from user
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-600">No crown is currently set.</div>
            )}
          </div>

          <div className="flex flex-col gap-1 text-xs text-slate-600 sm:items-end">
            <div>
              <span className="text-slate-500">Crown Price: </span>
              <span className="font-semibold text-slate-900">
                {typeof crownPriceDisplay === 'number' ? `$${crownPriceDisplay.toFixed(0)}` : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Date Key: </span>
              <span className="font-semibold text-slate-900">
                {crown?.activeDateKey || crown?.lastSettledForDate || '—'}
              </span>
            </div>
            {crown?.activePaymentIntentId ? (
              <div className="text-[11px] text-slate-500 truncate max-w-[320px]">
                PI: {crown.activePaymentIntentId}
              </div>
            ) : null}
          </div>
        </div>
      </div>

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
              placeholder="Search name, email, uid…"
              className="w-full sm:w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            />
          </div>

          <div className="text-xs text-slate-500">
            Showing <span className="font-semibold">{filtered.length}</span> users
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading users…</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">Crown Price</th>
                  <th className="py-2 pr-3">Bio</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.uid} className="border-b border-slate-100">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {u.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                              —
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {u.fullName || '(no name)'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {u.email || u.uid}
                          </div>
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

                    <td className="py-3 pr-3">
                      <span className="font-semibold text-slate-900">
                        ${Number(u.crownPrice || 0).toFixed(0)}
                      </span>
                    </td>

                    <td className="py-3 pr-3 max-w-[420px]">
                      <div className="text-slate-700 line-clamp-2">{u.bio || '—'}</div>
                    </td>

                    <td className="py-3 pr-3 text-right">
                      <button
                        onClick={() => assignCrown(u.uid)}
                        className="rounded-full bg-emerald-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-emerald-400"
                      >
                        Assign Crown
                      </button>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td className="py-6 text-slate-500" colSpan={5}>
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
