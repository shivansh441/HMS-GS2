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
  const [units, setUnits] = useState<PublicUnit[]>([]);
  const [isLoadingProperties, setIsLoadingProperties] = useState(true);
  const [isLoadingUnits, setIsLoadingUnits] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    customerApiClient.get<PublicProperty[]>('/public/properties')
      .then(({ data }) => {
        if (!active) return;
        setProperties(data);
        setSelectedPropertyId(data[0]?.id || '');
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
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) {
      setUnits([]);
      return;
    }
    let active = true;
    setIsLoadingUnits(true);
    setErrorMessage('');
    customerApiClient.get<PublicUnit[]>('/public/units/search', {
      params: { propertyId: selectedPropertyId },
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
  }, [selectedPropertyId]);

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

        <section className="space-y-6">
          <label className="block max-w-md space-y-2 text-sm font-semibold text-slate-700">
            Select a property
            <select
              value={selectedPropertyId}
              onChange={(event) => setSelectedPropertyId(event.target.value)}
              disabled={isLoadingProperties || properties.length === 0}
              className="w-full border border-slate-300 bg-white px-4 py-3"
            >
              {isLoadingProperties && <option value="">Loading properties…</option>}
              {!isLoadingProperties && properties.length === 0 && <option value="">No properties available</option>}
              {properties.map((property) => (
                <option key={property.id} value={property.id}>{property.name} · {property.city}</option>
              ))}
            </select>
          </label>

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
                      <Link href="/signup" className="inline-flex items-center gap-1 text-xs font-bold text-slate-800 hover:text-amber-700">
                        Enquire <ArrowRight className="h-3.5 w-3.5" />
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
