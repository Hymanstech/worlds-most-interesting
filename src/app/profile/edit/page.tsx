// src/app/profile/edit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { auth, db, storage } from '@/lib/firebaseClient';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type UserProfile = {
  fullName?: string;
  bio?: string;
  photoUrl?: string;
};

export default function EditProfilePage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        setError(null);
        setLoading(true);

        const user = auth.currentUser;
        if (!user) {
          router.push('/login');
          return;
        }

        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) {
          setError('Could not find your profile.');
          setLoading(false);
          return;
        }

        const data = snap.data() as UserProfile;
        setFullName(data.fullName ?? '');
        setBio(data.bio ?? '');
        setPhotoPreview(data.photoUrl ?? null);

        setLoading(false);
      } catch (err: any) {
        console.error('Error loading profile:', err);
        setError(err?.message || 'Failed to load your profile.');
        setLoading(false);
      }
    }

    loadProfile();
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);

    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      router.push('/login');
      return;
    }

    if (!fullName.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (!bio.trim()) {
      setError('Please enter a short bio.');
      return;
    }

    setSaving(true);

    try {
      let newPhotoUrl: string | null = null;

      if (photoFile) {
        const storageRef = ref(storage, `profilePhotos/${user.uid}`);
        await uploadBytes(storageRef, photoFile);
        newPhotoUrl = await getDownloadURL(storageRef);
      }

      const patch: any = {
        fullName: fullName.trim(),
        bio: bio.trim(),
        updatedAt: serverTimestamp(),
      };

      if (newPhotoUrl) patch.photoUrl = newPhotoUrl;

      await updateDoc(doc(db, 'users', user.uid), patch);

      router.push('/dashboard');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err?.message || 'Failed to save your profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Edit Profile
        </h1>
        <p className="mt-3 text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Edit your profile
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        Update how you appear when you&apos;re crowned.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm"
      >
        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Full Name
          </label>
          <input
            type="text"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Bio
          </label>
          <textarea
            rows={4}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300 resize-none"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Profile Photo
          </label>

          <label className="inline-flex w-fit cursor-pointer items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800">
            Choose Photo
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </label>

          {photoPreview ? (
            <div className="mt-3">
              <p className="mb-1 text-[10px] text-slate-500">Preview:</p>
              <img
                src={photoPreview}
                alt="Profile preview"
                className="h-40 w-32 rounded-lg border border-slate-300 object-cover"
              />
            </div>
          ) : (
            <p className="text-[10px] text-slate-500">No photo selected</p>
          )}
        </div>

        {error && <p className="text-[11px] text-red-500">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-emerald-500 px-5 py-2 text-[11px] font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
