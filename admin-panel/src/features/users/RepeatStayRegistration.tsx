import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import { Property } from '../../types';
import { ManagedUser } from './userTypes';
import { addCalendarDays, localDateToday } from './userForm';
import { userInputClass, userLabelClass } from './userStyles';

interface RepeatGuestForm {
  fullName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  idDocumentType: string;
  idDocumentNumber: string;
}

interface RepeatStayRegistrationProps {
  customer: ManagedUser;
  properties: Property[];
  onRegistered: () => Promise<void>;
}

const emptyGuest = (): RepeatGuestForm => ({
  fullName: '',
  dateOfBirth: '',
  gender: '',
  email: '',
  phone: '',
  idDocumentType: '',
  idDocumentNumber: '',
});

const governmentIdTypes = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'OTHER_GOVERNMENT_ID', label: 'Other government ID' },
];

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to register this stay.';
}

export const RepeatStayRegistration: React.FC<RepeatStayRegistrationProps> = ({
  customer,
  properties,
  onRegistered,
}) => {
  const hotelProperties = useMemo(
    () => properties.filter((property) => property.type === 'HOTEL'),
    [properties],
  );
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [startDate, setStartDate] = useState(localDateToday());
  const [endDate, setEndDate] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guests, setGuests] = useState<RepeatGuestForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferredProperty = hotelProperties.find(
      (property) => property.id === customer.initialStay?.propertyId,
    );
    setPropertyId(preferredProperty?.id || hotelProperties[0]?.id || '');
    setStartDate(localDateToday());
    setEndDate('');
    setGuestCount(1);
    setGuests([]);
    setErrorMessage('');
  }, [open, customer.initialStay?.propertyId, hotelProperties]);

  useEffect(() => {
    setGuests((current) => [
      ...current.slice(0, guestCount - 1),
      ...Array.from(
        { length: Math.max(0, guestCount - 1 - current.length) },
        emptyGuest,
      ),
    ]);
  }, [guestCount]);

  const updateGuest = (index: number, field: keyof RepeatGuestForm, value: string) => {
    setGuests((current) =>
      current.map((guest, itemIndex) =>
        itemIndex === index ? { ...guest, [field]: value } : guest,
      ),
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    try {
      await apiClient.post(`/admin/users/${encodeURIComponent(customer.id)}/stays`, {
        propertyId,
        startDate,
        endDate: endDate || null,
        guestCount,
        additionalGuests: guests.map((guest) => ({
          fullName: guest.fullName.trim(),
          dateOfBirth: guest.dateOfBirth,
          gender: guest.gender || null,
          email: guest.email.trim(),
          phone: guest.phone.trim(),
          idDocumentType: guest.idDocumentType,
          idDocumentNumber: guest.idDocumentNumber.trim(),
        })),
      });
      await onRegistered();
      setOpen(false);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!hotelProperties.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
      >
        Register new stay
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-lg bg-white p-5 dark:bg-slate-900"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Register a new stay</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Previous visit and occupant records will remain unchanged. {customer.full_name} is the billable main guest.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close new stay registration"
                onClick={() => setOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </header>
            {errorMessage && (
              <p role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {errorMessage}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={userLabelClass}>
                Property
                <select
                  required
                  value={propertyId}
                  onChange={(event) => setPropertyId(event.target.value)}
                  className={userInputClass}
                >
                  {hotelProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.code} · {property.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={userLabelClass}>
                Total occupants
                <input
                  required
                  type="number"
                  min={1}
                  max={100}
                  value={guestCount}
                  onChange={(event) =>
                    setGuestCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))
                  }
                  className={userInputClass}
                />
              </label>
              <label className={userLabelClass}>
                Start date
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className={userInputClass}
                />
              </label>
              <label className={userLabelClass}>
                End date
                <input
                  type="date"
                  min={startDate ? addCalendarDays(startDate, 1) : undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={userInputClass}
                />
              </label>
            </div>
            {guests.map((guest, index) => (
              <fieldset key={index} className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
                <legend className="text-sm font-semibold">Additional guest {index + 1}</legend>
                <label className={userLabelClass}>
                  Full name
                  <input required value={guest.fullName} onChange={(event) => updateGuest(index, 'fullName', event.target.value)} className={userInputClass} />
                </label>
                <label className={userLabelClass}>
                  Date of birth
                  <input required type="date" max={localDateToday()} value={guest.dateOfBirth} onChange={(event) => updateGuest(index, 'dateOfBirth', event.target.value)} className={userInputClass} />
                </label>
                <label className={userLabelClass}>
                  Email
                  <input required type="email" value={guest.email} onChange={(event) => updateGuest(index, 'email', event.target.value)} className={userInputClass} />
                </label>
                <label className={userLabelClass}>
                  Phone
                  <input required type="tel" minLength={5} maxLength={32} value={guest.phone} onChange={(event) => updateGuest(index, 'phone', event.target.value)} className={userInputClass} />
                </label>
                <label className={userLabelClass}>
                  Gender
                  <select value={guest.gender} onChange={(event) => updateGuest(index, 'gender', event.target.value)} className={userInputClass}>
                    <option value="">Not provided</option>
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="NON_BINARY">Non-binary</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className={userLabelClass}>
                  Government ID type
                  <select required value={guest.idDocumentType} onChange={(event) => updateGuest(index, 'idDocumentType', event.target.value)} className={userInputClass}>
                    <option value="">Select an ID type</option>
                    {governmentIdTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
                <label className={`${userLabelClass} sm:col-span-2`}>
                  Government ID number
                  <input required minLength={2} maxLength={128} value={guest.idDocumentNumber} onChange={(event) => updateGuest(index, 'idDocumentNumber', event.target.value)} className={userInputClass} />
                </label>
              </fieldset>
            ))}
            <footer className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button type="button" disabled={saving} onClick={() => setOpen(false)} className="rounded border border-slate-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="submit" disabled={saving || !propertyId} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Register stay'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
};
