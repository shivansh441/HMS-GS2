'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { customerApiClient } from '../../lib/api';

interface PublicProperty {
  id: string;
  name: string;
  type: string;
  city: string;
}

interface AdditionalOccupant {
  firstName: string;
  lastName: string;
  age: string;
  gender: string;
  email: string;
  phone: string;
  idType: string;
  idNumber: string;
}

interface CreatedReservation {
  requestCode: string;
}

const emptyOccupant: AdditionalOccupant = {
  firstName: '',
  lastName: '',
  age: '',
  gender: '',
  email: '',
  phone: '',
  idType: '',
  idNumber: '',
};

const governmentIdTypes = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PAN', label: 'PAN' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'OTHER_GOVERNMENT_ID', label: 'Other government ID' },
];

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/10';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to submit your booking request.';
}

export default function BookingPage() {
  const [properties, setProperties] = useState<PublicProperty[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [category, setCategory] = useState('CLASSIC');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [occupants, setOccupants] = useState<AdditionalOccupant[]>([]);
  const [step, setStep] = useState(1);
  const [reservation, setReservation] = useState<CreatedReservation | null>(null);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [requiresGovernmentId, setRequiresGovernmentId] = useState(false);

  useEffect(() => {
    let active = true;
    const searchParams = new URLSearchParams(window.location.search);
    const preferredPropertyId = searchParams.get('propertyId');
    const preferredCheckIn = searchParams.get('checkIn');
    const preferredCheckOut = searchParams.get('checkOut');
    const preferredCategory = searchParams.get('category');
    if (preferredCheckIn) setCheckIn(preferredCheckIn);
    if (preferredCheckOut) setCheckOut(preferredCheckOut);
    if (['CLASSIC', 'DELUXE', 'EXECUTIVE', 'DORMITORY'].includes(preferredCategory || '')) {
      setCategory(preferredCategory || 'CLASSIC');
    }
    customerApiClient.get<PublicProperty[]>('/public/properties')
      .then(({ data }) => {
        if (!active) return;
        setProperties(data);
        const preferred = data.find((property) => property.id === preferredPropertyId);
        setPropertyId(preferred?.id || data[0]?.id || '');
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingProperties(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedProperty = properties.find((property) => property.id === propertyId);
  const minimumDate = new Date().toISOString().slice(0, 10);
  const stayType = category === 'DORMITORY' ||
    ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'].includes(selectedProperty?.type || '')
    ? 'BED'
    : 'ROOM';
  const requiredAdditionalOccupants = Math.max(0, adults + children - 1);

  useEffect(() => {
    setOccupants((current) => {
      if (current.length === requiredAdditionalOccupants) return current;
      if (current.length > requiredAdditionalOccupants) {
        return current.slice(0, requiredAdditionalOccupants);
      }
      return [
        ...current,
        ...Array.from(
          { length: requiredAdditionalOccupants - current.length },
          () => ({ ...emptyOccupant }),
        ),
      ];
    });
  }, [requiredAdditionalOccupants]);

  const updateOccupant = (index: number, field: keyof AdditionalOccupant, value: string) => {
    setOccupants((current) => current.map((occupant, itemIndex) =>
      itemIndex === index ? { ...occupant, [field]: value } : occupant,
    ));
  };

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !selectedProperty ||
      !checkIn ||
      !checkOut ||
      !firstName.trim() ||
      !lastName.trim() ||
      !idType ||
      !idNumber.trim() ||
      occupants.length !== requiredAdditionalOccupants
    ) return;
    setSubmitting(true);
    setErrorMessage('');
    setRequiresGovernmentId(false);
    try {
      const { data } = await customerApiClient.post<CreatedReservation>('/reservations', {
        propertyId,
        guestName: `${firstName.trim()} ${lastName.trim()}`,
        mobile: phone.trim(),
        email: email.trim() || null,
        requestedCategory: category,
        requestedType: stayType,
        requestedQuantity: stayType === 'BED' ? adults + children : 1,
        numberOfAdults: adults,
        numberOfChildren: children,
        expectedCheckIn: checkIn,
        expectedCheckOut: checkOut,
        channelOrigin: 'PUBLIC_WEB',
        occupants: [
          {
            isPrimary: true,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim() || null,
            phone: phone.trim(),
            idType,
            idNumber: idNumber.trim(),
          },
          ...occupants.map((occupant) => ({
              isPrimary: false,
              firstName: occupant.firstName.trim(),
              lastName: occupant.lastName.trim() || null,
              age: occupant.age ? Number(occupant.age) : null,
              gender: occupant.gender || null,
              email: occupant.email.trim() || null,
              phone: occupant.phone.trim() || null,
              idType: occupant.idType,
              idNumber: occupant.idNumber.trim(),
          })),
        ],
      });
      setReservation(data);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ error?: { code?: string } }>;
      setRequiresGovernmentId(
        axiosError.response?.data?.error?.code === 'GOVERNMENT_ID_REQUIRED',
      );
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (reservation) {
    return (
      <main className="min-h-[75vh] px-6 py-20">
        <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Request received</p>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-slate-900">Your stay is one step closer</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Our team will review availability and contact you to confirm the reservation.
          </p>
          <div className="mt-7 rounded-xl bg-stone-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tracking reference</p>
            <p className="mt-2 font-mono text-xl font-bold tracking-wider text-slate-900">{reservation.requestCode}</p>
            <p className="mt-2 text-xs text-slate-500">Keep this code to check your request with our team.</p>
          </div>
          <Link href="/properties" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-amber-700">
            Browse properties <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[75vh] bg-stone-50 px-5 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/properties" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to properties
        </Link>
        <header className="mt-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Haven Stays</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-slate-900">Request a reservation</h1>
          <p className="mt-2 text-sm text-slate-600">Share your stay details and our team will confirm availability.</p>
        </header>

        <div className="mt-8 grid grid-cols-3 gap-2" aria-label="Booking steps">
          {['Stay details', 'Guest info', 'Occupants'].map((label, index) => {
            const number = index + 1;
            return (
              <div key={label} className={`border-t-2 pt-2 text-xs font-semibold ${step >= number ? 'border-amber-700 text-slate-900' : 'border-slate-200 text-slate-400'}`}>
                <span className="mr-2 font-mono">{String(number).padStart(2, '0')}</span>{label}
              </div>
            );
          })}
        </div>

        {errorMessage && (
          <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
            {requiresGovernmentId && (
              <Link href="/portal/profile" className="ml-1 font-semibold underline">
                Add your ID in your profile.
              </Link>
            )}
          </div>
        )}

        <form onSubmit={submitBooking} className="mt-5 space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {step === 1 && (
            <section className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">
                Property
                <select required value={propertyId} onChange={(event) => setPropertyId(event.target.value)} disabled={loadingProperties || properties.length === 0} className={inputClass}>
                  {loadingProperties && <option value="">Loading properties…</option>}
                  {!loadingProperties && properties.length === 0 && <option value="">No properties available</option>}
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>{property.name} · {property.city}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Check-in
                <input required type="date" min={minimumDate} value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Check-out
                <input required type="date" min={checkIn || minimumDate} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Unit category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
                  <option value="CLASSIC">Classic</option>
                  <option value="DELUXE">Deluxe</option>
                  <option value="DORMITORY">Dormitory</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Adults
                  <input required type="number" min={1} max={100} value={adults} onChange={(event) => setAdults(Number(event.target.value))} className={inputClass} />
                </label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                  Children
                  <input required type="number" min={0} max={100} value={children} onChange={(event) => setChildren(Number(event.target.value))} className={inputClass} />
                </label>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                First name
                <input required maxLength={50} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Last name
                <input required maxLength={50} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Email
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                Phone
                <input required type="tel" maxLength={20} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={inputClass} />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                ID proof type
                <select required value={idType} onChange={(event) => setIdType(event.target.value)} className={inputClass}>
                  <option value="">Select an ID type</option>
                  {governmentIdTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700">
                ID proof number
                <input required minLength={2} maxLength={128} value={idNumber} onChange={(event) => setIdNumber(event.target.value)} className={inputClass} />
              </label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Your information is used by the property team to process this reservation request.
              </p>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Additional occupants</h2>
                <p className="mt-1 text-xs text-slate-500">
                  The primary booker is included. Provide details and a government ID for each of the {requiredAdditionalOccupants} additional occupant(s).
                </p>
              </div>
              {occupants.map((occupant, index) => (
                <fieldset key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
                  <legend className="px-1 text-xs font-bold text-slate-600">Guest {index + 2}</legend>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    First name
                    <input required maxLength={50} value={occupant.firstName} onChange={(event) => updateOccupant(index, 'firstName', event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    Last name
                    <input maxLength={50} value={occupant.lastName} onChange={(event) => updateOccupant(index, 'lastName', event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    Age
                    <input type="number" min={0} max={130} value={occupant.age} onChange={(event) => updateOccupant(index, 'age', event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    Gender (optional)
                    <select value={occupant.gender} onChange={(event) => updateOccupant(index, 'gender', event.target.value)} className={inputClass}>
                      <option value="">Prefer not to say</option>
                      <option value="FEMALE">Female</option>
                      <option value="MALE">Male</option>
                      <option value="NON_BINARY">Non-binary</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    Phone
                    <input type="tel" maxLength={20} value={occupant.phone} onChange={(event) => updateOccupant(index, 'phone', event.target.value)} className={inputClass} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600">
                    Email
                    <input type="email" value={occupant.email} onChange={(event) => updateOccupant(index, 'email', event.target.value)} className={inputClass} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-xs font-semibold text-slate-600">
                      ID type
                      <select required value={occupant.idType} onChange={(event) => updateOccupant(index, 'idType', event.target.value)} className={inputClass}>
                        <option value="">Select</option>
                        {governmentIdTypes.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-slate-600">
                      ID number
                      <input required minLength={2} maxLength={128} value={occupant.idNumber} onChange={(event) => updateOccupant(index, 'idNumber', event.target.value)} className={inputClass} />
                    </label>
                  </div>
                </fieldset>
              ))}
            </section>
          )}

          <footer className="flex items-center justify-between border-t border-slate-100 pt-5">
            {step > 1 ? (
              <button type="button" onClick={() => setStep((current) => current - 1)} className="px-3 py-2 text-sm font-semibold text-slate-600">
                Back
              </button>
            ) : <span />}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  if (step === 1 && (!checkIn || !checkOut || checkOut <= checkIn)) {
                    setErrorMessage('Choose a check-out date after check-in.');
                    return;
                  }
                  if (step === 2 && (
                    !firstName.trim() ||
                    !lastName.trim() ||
                    !phone.trim() ||
                    !idType ||
                    !idNumber.trim()
                  )) {
                    setErrorMessage('Enter the primary booker name, phone number, and government ID.');
                    return;
                  }
                  setStep((current) => current + 1);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button disabled={submitting || loadingProperties || !propertyId} className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50">
                {submitting ? 'Submitting…' : 'Submit reservation request'}
              </button>
            )}
          </footer>
        </form>
      </div>
    </main>
  );
}
