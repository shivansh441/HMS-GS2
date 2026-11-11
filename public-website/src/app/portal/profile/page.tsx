'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AxiosError } from 'axios';
import { ArrowLeft, FileCheck2, Upload } from 'lucide-react';
import { customerApiClient } from '../../../lib/api';
import { useCustomerAuth } from '../../../lib/auth-context';

interface CustomerProfile {
  id: string;
  fullName: string | null;
  email: string | null;
  pendingEmail: string | null;
  phone: string | null;
  gender: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  idDocumentType: string | null;
  idDocumentLast4: string | null;
  idDocumentFilePresent: boolean;
  idDocumentFileMediaType: string | null;
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to update your profile.';
}

export default function CustomerProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useCustomerAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [documentType, setDocumentType] = useState('PASSPORT');
  const [documentNumber, setDocumentNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isLoading && !user) router.push('/signin');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    customerApiClient.get<CustomerProfile>('/customer/profile')
      .then(({ data }) => {
        if (!active) return;
        setProfile(data);
        const [first = '', ...rest] = (data.fullName || '').split(' ');
        setFirstName(first);
        setLastName(rest.join(' '));
        setEmail(data.pendingEmail || data.email || '');
        setPhone(data.phone || '');
        setDocumentType(data.idDocumentType || 'PASSPORT');
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setMessage('');
    try {
      const { data } = await customerApiClient.patch<CustomerProfile>('/customer/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        phoneOtpCode: phoneOtpCode.trim() || null,
        email: email.trim() || null,
      });
      setProfile(data);
      setEmail(data.pendingEmail || data.email || '');
      setPhoneOtpCode('');
      setMessage('Profile details saved.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const requestPhoneCode = async () => {
    setErrorMessage('');
    setMessage('');
    try {
      const { data } = await customerApiClient.post<{ message: string }>('/auth/otp/request', {
        target: phone.trim(),
        channel: 'SMS',
        purpose: 'VERIFY_PHONE',
      });
      setMessage(data.message || 'Verification code sent.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const uploadDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setErrorMessage('Choose a PDF, JPEG, or PNG ID document.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    setMessage('');
    const formData = new FormData();
    formData.set('documentType', documentType);
    formData.set('documentNumber', documentNumber.trim());
    formData.set('file', file);
    try {
      const { data } = await customerApiClient.post<CustomerProfile>(
        '/customer/profile/id-document',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setProfile(data);
      setDocumentNumber('');
      setFile(null);
      setMessage('Your encrypted ID document was uploaded securely.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user || loading) {
    return <div className="flex min-h-[65vh] items-center justify-center text-sm text-slate-500">Loading your profile…</div>;
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-12 sm:px-6">
      <header>
        <Link href="/portal" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-amber-700">
          <ArrowLeft className="h-4 w-4" /> Customer portal
        </Link>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Account</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Profile & ID verification</h1>
      </header>

      {errorMessage && <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMessage}</div>}
      {message && <div role="status" className="border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</div>}

      <form onSubmit={saveProfile} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-xl font-semibold">Personal and contact details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">First name<input required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5" /></label>
          <label className="space-y-2 text-sm font-medium">Last name<input required value={lastName} onChange={(event) => setLastName(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5" /></label>
          <label className="space-y-2 text-sm font-medium">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5" /><span className="block text-xs text-slate-500">{profile?.pendingEmail ? `Verification pending for ${profile.pendingEmail}.` : profile?.emailVerified ? 'Verified' : 'Email changes require verification.'}</span></label>
          <label className="space-y-2 text-sm font-medium">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5" /><span className="block text-xs text-slate-500">{profile?.phoneVerified ? 'Verified' : 'A code is required to change your phone number.'}</span></label>
        </div>
        {!profile?.phoneVerified && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={requestPhoneCode} disabled={!phone.trim()} className="border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Send phone code</button>
            <input aria-label="Phone verification code" inputMode="numeric" value={phoneOtpCode} onChange={(event) => setPhoneOtpCode(event.target.value)} placeholder="SMS verification code" className="border border-slate-300 px-3 py-2 text-sm" />
          </div>
        )}
        <button disabled={saving} className="bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save profile'}</button>
      </form>

      <form onSubmit={uploadDocument} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          {profile?.idDocumentFilePresent ? <FileCheck2 className="mt-1 h-5 w-5 text-emerald-700" /> : <Upload className="mt-1 h-5 w-5 text-slate-600" />}
          <div>
            <h2 className="font-serif text-xl font-semibold">Government-issued ID</h2>
            <p className="mt-1 text-sm text-slate-600">
              {profile?.idDocumentFilePresent
                ? `${profile.idDocumentType?.replaceAll('_', ' ')} ending ${profile.idDocumentLast4 || '••••'} is on file. Uploading a new file replaces it.`
                : 'Upload a passport, voter ID, or driving licence for check-in verification.'}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">Document type
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5">
              <option value="AADHAAR">Aadhaar</option>
              <option value="PAN">PAN</option>
              <option value="PASSPORT">Passport</option>
              <option value="VOTER_ID">Voter ID</option>
              <option value="DRIVING_LICENSE">Driving licence</option>
              <option value="OTHER_GOVERNMENT_ID">Other government ID</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">Document number
            <input required minLength={2} maxLength={128} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5" />
          </label>
        </div>
        <label className="block space-y-2 text-sm font-medium">Document scan (PDF, JPEG, or PNG; max 8 MB)
          <input required type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-sm text-slate-600 file:mr-4 file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:font-semibold" />
        </label>
        <button disabled={saving} className="bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Upload encrypted ID'}</button>
        <p className="text-xs leading-5 text-slate-500">Your document scan and document number are encrypted at rest. The portal never displays the complete document number or scan.</p>
      </form>
    </main>
  );
}
