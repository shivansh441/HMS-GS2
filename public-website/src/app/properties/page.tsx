'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AxiosError } from 'axios';
import { ArrowRight, BedDouble, MapPin } from 'lucide-react';
import { customerApiClient } from '../../lib/api';

interface PublicProperty {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  state: string;
  currency: string;
  facilities: string[];
}

interface PublicUnit {
  propertyCode: string;
  propertyName: string;
  unitNumber: string;
  floor: number;
  type: string;
  category: string;
  sharingType: string | null;
  capacity: number;
  currency: string;
  pricePerNight: number | string | null;
  recurringMonthlyRate: number | string | null;
  features: string[];
  status: 'AVAILABLE';
}

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load properties.';
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PublicProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [propertyType, setPropertyType] = useState<'ALL' | 'HOTEL' | 'HOSTEL'>('ALL');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [category, setCategory] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [units, setUnits] = useState<PublicUnit[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const params: Record<string, string> = {};
    if (locationFilter) params.location = locationFilter;
    if (propertyType === 'HOTEL') params.type = 'HOTEL';
    if (propertyType === 'HOSTEL') params.type = 'HOSTEL_BOYS,HOSTEL_GIRLS,HOSTEL_COED,CO_LIVING';
    customerApiClient.get<PublicProperty[]>('/public/properties', { params })
      .then(({ data }) => {
        if (!active) return;
        setProperties(data);
        setSelectedPropertyId((current) =>
          data.some((property) => property.id === current) ? current : data[0]?.id || '',
        );
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoadingProperties(false);
      });
    return () => {
      active = false;
    };
  }, [locationFilter, propertyType]);

  useEffect(() => {
    if (!selectedPropertyId) {
      setUnits([]);
      return;
    }
    let active = true;
    setIsLoadingUnits(true);
    setErrorMessage('');
    const params: Record<string, string> = { propertyId: selectedPropertyId };
    if (checkIn) params.checkIn = checkIn;
    if (checkOut) params.checkOut = checkOut;
    if (category) params.category = category;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    customerApiClient.get<PublicUnit[]>('/public/units/search', {
      params,
    })
      .then(({ data }) => {
        if (active) setUnits(data);
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoadingUnits(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPropertyId, checkIn, checkOut, category, minPrice, maxPrice]);

  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16">
      <div className="mx-auto max-w-7xl space-y-10">
        <header className="max-w-3xl space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700">Haven Stays</p>
          <h1 className="font-serif text-4xl font-semibold text-slate-900 sm:text-5xl">Find your stay</h1>
          <p className="text-base leading-relaxed text-slate-600">
            Browse available rooms and beds with their standard published rates. Final availability is confirmed when you book.
          </p>
        </header>

        {errorMessage && (
          <div role="alert" className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <form
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 lg:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault();
            setLocationFilter(locationInput.trim());
          }}
        >
          <label className="space-y-2 text-xs font-semibold text-slate-700 lg:col-span-2">
            Location
            <input
              value={locationInput}
              onChange={(event) => setLocationInput(event.target.value)}
              placeholder="City or state"
              className="w-full border border-slate-300 px-3 py-2.5 text-sm"
            />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700">
            Check-in
            <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700">
            Check-out
            <input type="date" min={checkIn || undefined} value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700">
            Room / bed category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Any category</option>
              {['CLASSIC', 'DELUXE', 'EXECUTIVE', 'DORMITORY'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800">Search stays</button>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-3">
            {([
              ['ALL', 'All stays'],
              ['HOTEL', 'Hotels'],
              ['HOSTEL', 'Hostels'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setPropertyType(value)} aria-pressed={propertyType === value} className={`border px-4 py-2 text-xs font-semibold ${propertyType === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="space-y-2 text-xs font-semibold text-slate-700">
            Minimum price
            <input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
          <label className="space-y-2 text-xs font-semibold text-slate-700">
            Maximum price
            <input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
          </label>
        </form>

        <section className="space-y-6">
          {isLoadingProperties ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading properties…</p>
          ) : properties.length === 0 ? (
            <p className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No active properties match your search.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {properties.map((property) => (
                <button
                  type="button"
                  key={property.id}
                  onClick={() => setSelectedPropertyId(property.id)}
                  aria-pressed={selectedPropertyId === property.id}
                  className={`text-left border bg-white p-5 shadow-sm transition hover:border-amber-700 ${selectedPropertyId === property.id ? 'border-amber-700 ring-1 ring-amber-700' : 'border-slate-200'}`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{property.type.replaceAll('_', ' ')}</span>
                  <span className="mt-1 block font-serif text-xl font-semibold text-slate-900">{property.name}</span>
                  <span className="mt-1 block text-sm text-slate-500">{property.city}, {property.state}</span>
                  {property.facilities.length > 0 && <span className="mt-3 block text-xs text-slate-500">{property.facilities.join(' · ')}</span>}
                </button>
              ))}
            </div>
          )}

          {selectedProperty && (
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="font-serif text-2xl font-semibold text-slate-900">{selectedProperty.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-4 w-4" />
                  {selectedProperty.city}, {selectedProperty.state} · {selectedProperty.type.replaceAll('_', ' ')}
                </p>
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Standard rates · {selectedProperty.currency}
              </span>
            </div>
          )}

          {isLoadingUnits ? (
            <p className="py-12 text-center text-sm text-slate-500">Loading available rooms and beds…</p>
          ) : units.length === 0 && selectedProperty ? (
            <p className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No available rooms or beds are listed for this property right now.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {units.map((unit) => {
                const monthly = unit.recurringMonthlyRate != null;
                const price = monthly ? unit.recurringMonthlyRate : unit.pricePerNight;
                return (
                  <article key={`${unit.propertyCode}-${unit.unitNumber}`} className="flex flex-col border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">{unit.category}</span>
                        <h3 className="mt-1 font-serif text-xl font-semibold text-slate-900">
                          {unit.type === 'BED' ? `Bed ${unit.unitNumber}` : `${unit.type} ${unit.unitNumber}`}
                        </h3>
                      </div>
                      <BedDouble className="h-5 w-5 shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Floor {unit.floor} · {unit.capacity} {unit.capacity === 1 ? 'person' : 'people'}
                      {unit.sharingType && ` · ${unit.sharingType.toLowerCase()} sharing`}
                    </p>
                    {unit.features.length > 0 && (
                      <p className="mt-2 text-xs text-slate-500">{unit.features.join(' · ')}</p>
                    )}
                    <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-5">
                      <p className="font-serif text-2xl font-semibold text-slate-900">
                        {price == null ? 'Contact us' : `${unit.currency} ${Number(price).toLocaleString()}`}
                        {price != null && <span className="ml-1 font-sans text-xs font-normal text-slate-500">/{monthly ? 'month' : 'night'}</span>}
                      </p>
                      <Link
                        href={`/book?propertyId=${encodeURIComponent(selectedPropertyId)}${checkIn ? `&checkIn=${encodeURIComponent(checkIn)}` : ''}${checkOut ? `&checkOut=${encodeURIComponent(checkOut)}` : ''}${category ? `&category=${encodeURIComponent(category)}` : ''}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 hover:text-amber-700"
                      >
                        Reserve Now <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
