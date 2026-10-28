import React, { useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, Building2, Plus, Save } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';
import { Property } from '../../types';

interface InventoryBed {
  id: string;
  unitNumber: string;
  category: string;
  sharingType: string | null;
  status: string;
  baseRateMonthly: number | string | null;
}

interface InventoryRoom {
  id: string;
  unitNumber: string;
  type: 'ROOM' | 'SUITE' | 'BED';
  category: string;
  sharingType: string | null;
  capacity: number;
  status: string;
  baseRateMonthly: number | string | null;
  defaultPricePerNight: number | string | null;
  beds: InventoryBed[];
}

interface InventoryFloor {
  floorNumber: number;
  rooms: InventoryRoom[];
}

interface PropertyDetails extends Property {
  address: string;
  city: string;
  state: string;
  currency: string;
  unitMatrix: InventoryFloor[];
}

interface InventoryForm {
  unitNumber: string;
  floor: number;
  category: string;
  capacity: number;
  bedsPerRoom: number;
  baseRateMonthly: string;
  defaultPricePerNight: string;
}

const emptyForm: InventoryForm = {
  unitNumber: '',
  floor: 0,
  category: 'CLASSIC',
  capacity: 2,
  bedsPerRoom: 2,
  baseRateMonthly: '',
  defaultPricePerNight: '',
};

const hostelTypes = ['HOSTEL_BOYS', 'HOSTEL_GIRLS', 'HOSTEL_COED', 'CO_LIVING'];
const inputClass =
  'w-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white';

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Unable to load inventory.';
}

export const PropertyInventory: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { user, properties, selectedPropertyId } = useAuth();
  const activePropertyId =
    propertyId || (selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '');
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [floors, setFloors] = useState<InventoryFloor[]>([]);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isHostel = hostelTypes.includes(property?.type || '');
  const rooms = useMemo(
    () => floors.flatMap((floor) => floor.rooms).filter((unit) => unit.type !== 'BED'),
    [floors],
  );
  const totalBeds = useMemo(
    () => floors.flatMap((floor) => floor.rooms).reduce((total, room) => total + room.beds.length, 0),
    [floors],
  );

  const loadInventory = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [propertyResponse, matrixResponse] = await Promise.all([
        apiClient.get<PropertyDetails>(`/admin/properties/${encodeURIComponent(activePropertyId)}`),
        apiClient.get<{ floors: InventoryFloor[] }>(`/properties/${encodeURIComponent(activePropertyId)}/units/matrix`),
      ]);
      setProperty(propertyResponse.data);
      setFloors(matrixResponse.data.floors || propertyResponse.data.unitMatrix || []);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activePropertyId) return;
    void loadInventory();
  }, [activePropertyId]);

  const createUnit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!property) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      unitNumber: form.unitNumber.trim(),
      floor: form.floor,
      type: 'ROOM',
      category: form.category,
      capacity: isHostel ? form.bedsPerRoom : form.capacity,
      ...(isHostel ? {
        bedsPerRoom: form.bedsPerRoom,
        ...(form.bedsPerRoom <= 3 ? { sharingType: form.bedsPerRoom === 1 ? 'SINGLE'
          : form.bedsPerRoom === 2 ? 'DOUBLE'
            : 'TRIPLE' } : {}),
        category: 'CLASSIC',
        baseRateMonthly: form.baseRateMonthly,
      } : {}),
      ...(!isHostel && form.defaultPricePerNight ? { defaultPricePerNight: form.defaultPricePerNight } : {}),
    };
    try {
      await apiClient.post(`/properties/${encodeURIComponent(property.id)}/units`, payload);
      setForm(emptyForm);
      setIsCreating(false);
      setSuccessMessage(isHostel
        ? `Room added with ${form.bedsPerRoom} configured bed${form.bedsPerRoom === 1 ? '' : 's'}.`
        : 'Room added.');
      await loadInventory();
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (!activePropertyId) {
    return (
      <div className="space-y-5">
        <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <h1 className="text-xl font-bold uppercase tracking-wide">Unit inventory</h1>
          <p className="mt-1 text-xs text-slate-500">
            Select a property from the property scope selector, or choose one below.
          </p>
        </header>
        {properties.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
            No properties are available for your account.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {properties.map((item) => (
              <Link
                key={item.id}
                to={`/properties/${encodeURIComponent(item.id)}/inventory`}
                className="border border-slate-200 bg-white p-4 hover:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-xs font-mono text-slate-500">{item.code} · {item.type}</p>
                <p className="mt-1 text-sm font-bold">{item.name}</p>
                <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">Open inventory</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Loading property inventory…</p>;
  }

  if (!property) {
    return (
      <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        {errorMessage || 'Property not found.'}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/properties" className="inline-flex items-center gap-2 text-xs font-bold uppercase text-blue-700 hover:text-blue-900 dark:text-blue-300">
        <ArrowLeft className="h-4 w-4" />
        Back to properties
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-mono text-slate-500">{property.code} · {property.type}</p>
          <h1 className="mt-1 text-xl font-bold uppercase tracking-wide">
            {isCreating ? `Create ${isHostel ? 'hostel' : 'hotel'} room` : `${property.name} inventory`}
          </h1>
          <p className="mt-1 text-xs text-slate-500">{property.city}, {property.state}</p>
        </div>
        {user?.role === 'ADMIN' && !isCreating && (
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setErrorMessage('');
              setSuccessMessage('');
              setIsCreating(true);
            }}
            className="inline-flex items-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Create room
          </button>
        )}
        {isCreating && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setIsCreating(false);
              setForm(emptyForm);
              setErrorMessage('');
            }}
            className="text-xs font-bold uppercase text-blue-700 hover:text-blue-900 disabled:opacity-60 dark:text-blue-300"
          >
            Back to inventory
          </button>
        )}
      </header>

      {errorMessage && (
        <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {successMessage}
        </div>
      )}

      {!isCreating && <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <Building2 className="h-5 w-5 text-blue-700" />
          <div>
            <p className="text-xl font-bold">{rooms.length}</p>
            <p className="text-xs uppercase text-slate-500">{isHostel ? 'Rooms' : 'Rooms / suites'}</p>
          </div>
        </div>
        {isHostel && (
          <div className="flex items-center gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <BedDouble className="h-5 w-5 text-blue-700" />
            <div>
              <p className="text-xl font-bold">{totalBeds}</p>
              <p className="text-xs uppercase text-slate-500">Total configured beds</p>
            </div>
          </div>
        )}
      </section>}

      {user?.role === 'ADMIN' && isCreating ? (
        <section className="space-y-4 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div>
              <h2 className="text-sm font-bold uppercase">Add {isHostel ? 'hostel room' : 'hotel room'}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {isHostel
                    ? 'Hostel rooms use the Classic category. Enter the number of beds; individual bed records are created automatically.'
                  : 'Set the room category and standard nightly rate.'}
              </p>
          </div>
          <form onSubmit={createUnit} className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
          <label className="space-y-1 text-xs font-semibold">
            Unit number *
            <input required maxLength={64} className={inputClass} value={form.unitNumber} onChange={(event) => setForm((current) => ({ ...current, unitNumber: event.target.value }))} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            Floor
            <input type="number" min="0" max="100" className={inputClass} value={form.floor} onChange={(event) => setForm((current) => ({ ...current, floor: Number(event.target.value) }))} />
          </label>
          {isHostel ? (
            <div className="space-y-1 text-xs font-semibold">
              <span>Category</span>
              <p className={`${inputClass} text-slate-500`}>Classic</p>
            </div>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Category
              <select className={inputClass} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                <option value="CLASSIC">Classic</option>
                <option value="DELUXE">Deluxe</option>
                <option value="EXECUTIVE">Executive</option>
                <option value="DORMITORY">Dormitory</option>
              </select>
            </label>
          )}
          {isHostel ? (
            <label className="space-y-1 text-xs font-semibold">
              Number of beds *
              <input
                required
                type="number"
                min="1"
                max="100"
                className={inputClass}
                value={form.bedsPerRoom}
                onChange={(event) => setForm((current) => ({ ...current, bedsPerRoom: Number(event.target.value) }))}
              />
            </label>
          ) : (
            <label className="space-y-1 text-xs font-semibold">
              Occupancy capacity *
              <input required type="number" min="1" max="100" className={inputClass} value={form.capacity} onChange={(event) => setForm((current) => ({ ...current, capacity: Number(event.target.value) }))} />
            </label>
          )}
          <label className="space-y-1 text-xs font-semibold">
            {isHostel ? `Standard monthly rate per bed (${property.currency})` : `Standard nightly rate (${property.currency})`}
            <input required type="number" min="0.01" step="0.01" className={inputClass} value={isHostel ? form.baseRateMonthly : form.defaultPricePerNight} onChange={(event) => setForm((current) => isHostel ? { ...current, baseRateMonthly: event.target.value } : { ...current, defaultPricePerNight: event.target.value })} />
          </label>
          <button type="submit" disabled={saving} className="inline-flex items-center justify-center gap-2 bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white hover:bg-blue-800 disabled:opacity-60">
            {saving ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Create room'}
          </button>
          </form>
        </section>
      ) : null}

      {!isCreating && <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase">Configured rooms and beds</h2>
        {rooms.length === 0 ? (
          <p className="border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">No rooms have been added to this property.</p>
        ) : floors.map((floor) => (
          <div key={floor.floorNumber} className="space-y-2">
            <h3 className="text-xs font-bold uppercase text-slate-500">Floor {floor.floorNumber}</h3>
            {floor.rooms.filter((room) => room.type !== 'BED').map((room) => (
              <article key={room.id} className="border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold">{room.type} {room.unitNumber} · {room.category}</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Capacity {room.capacity}{room.sharingType ? ` · ${room.sharingType} sharing` : ''} · {room.status}
                    </p>
                  </div>
                  <p className="text-xs font-semibold">
                    {isHostel
                      ? `${room.baseRateMonthly ?? '—'} ${property.currency}/bed/month`
                      : `${room.defaultPricePerNight ?? '—'} ${property.currency}/night`}
                  </p>
                </div>
                {room.beds.length > 0 && (
                  <ul className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-700 sm:grid-cols-2">
                    {room.beds.map((bed) => (
                      <li key={bed.id} className="flex justify-between gap-2">
                        <span>Bed {bed.unitNumber.split('-').at(-1)} · {bed.sharingType || room.sharingType} · {bed.status}</span>
                        <span>{bed.baseRateMonthly ?? '—'} {property.currency}/month</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        ))}
      </section>}
    </div>
  );
};
