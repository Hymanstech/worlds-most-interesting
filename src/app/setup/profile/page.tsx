// src/app/setup/profile/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { db, storage, auth } from '@/lib/firebaseClient';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function ProfileSetupPage() {
  const router = useRouter();

  const [crownPrice, setCrownPrice] = useState('');
  const [bio, setBio] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      setError('Your session expired. Please sign up or log in again.');
      router.push('/signup');
      return;
    }

    if (!crownPrice.trim()) {
      setError('Please enter your Crown Price (use 0 if you want to opt out).');
      return;
    }

    const crownPriceNumber = Number(crownPrice);
    if (
      Number.isNaN(crownPriceNumber) ||
      !Number.isInteger(crownPriceNumber) ||
      crownPriceNumber < 0
    ) {
      setError('Crown Price must be a whole dollar amount (0 or higher).');
      return;
    }

    if (!bio.trim()) {
      setError('Please enter a short bio.');
      return;
    }

    if (!photoFile) {
      setError('Please upload a photo.');
      return;
    }

    setLoading(true);

    try {
      const uid = user.uid;

      // 1) Upload photo
      const ext = photoFile.name.split('.').pop() || 'jpg';
      const photoRef = ref(storage, `profile_photos/${uid}/profile.${ext}`);
      await uploadBytes(photoRef, photoFile);
      const photoUrl = await getDownloadURL(photoRef);

      // 2) Update Firestore user doc
      await updateDoc(doc(db, 'users', uid), {
        crownPrice: crownPriceNumber,
        bio,
        photoUrl,
        updatedAt: serverTimestamp(),
      });

      router.push('/setup/payment');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err?.message || 'Something went wrong saving your profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Set up your Crown Profile
      </h1>

      <p className="mt-3 text-sm text-slate-600">
        Choose a daily Crown Price, upload your photo, and write a short bio.
        This is what the world will see when you are crowned.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 text-xs text-slate-800 shadow-sm"
      >
        <div className="grid gap-2">
          <label className="text-[11px] font-semibold text-slate-800">
            Crown Price (whole dollars per day)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300"
            value={crownPrice}
            onChange={(e) => setCrownPrice(e.target.value)}
            placeholder="Example: 20 (or 0 to opt out)"
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
            placeholder="Tell the world why you're the most interesting..."
          />
        </div>

        <div className="grid gap-2">
        <label className="text-[11px] font-semibold text-slate-800">
            Upload Photo
        </label>

        <label
            className="inline-flex cursor-pointer items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-[11px] font-semibold text-white hover:bg-slate-800 w-fit"
        >
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
                alt="Preview"
                className="h-40 w-32 rounded-lg border border-slate-300 object-cover"
            />
            </div>
        ) : (
            <p className="text-[10px] text-slate-500">No photo selected</p>
        )}
        </div>


        {error && (
          <p className="text-[11px] text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-emerald-500 px-5 py-2 text-[11px] font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? 'Saving profile…' : 'Continue to Authorization'}
        </button>
      </form>
    </div>
  );
}
