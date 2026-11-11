import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api';

type MealCategory = 'BREAKFAST' | 'LUNCH' | 'SNACKS' | 'DINNER';
type DietaryType = 'VEG' | 'NON_VEG' | 'EGGETARIAN';

interface MessFacility {
  id: number;
  propertyId: string;
  propertyName: string;
  propertyType: string;
  name: string;
  isDefault: boolean;
  capacity: number | null;
  createdAt: string;
}

interface MealItem {
  id: number;
  name: string;
  category: MealCategory;
  dietaryType: DietaryType;
  ingredients: string | null;
  createdAt: string;
}

interface MenuItem {
  id: number;
  mealCategory: MealCategory;
  mealItem: MealItem;
}

interface MenuResponse {
  messId: number;
  scheduledDate: string;
  items: MenuItem[];
}

interface MealForm {
  name: string;
  category: MealCategory;
  dietaryType: DietaryType;
  ingredients: string;
}

const categories: MealCategory[] = ['BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER'];
const dietaryTypes: DietaryType[] = ['VEG', 'NON_VEG', 'EGGETARIAN'];
const inputClass = 'w-full border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const emptyMealForm: MealForm = {
  name: '',
  category: 'BREAKFAST',
  dietaryType: 'VEG',
  ingredients: '',
};

function getErrorMessage(error: unknown) {
  const axiosError = error as AxiosError<{ error?: { message?: string } }>;
  return axiosError.response?.data?.error?.message || axiosError.message || 'Mess management request failed.';
}

function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function tomorrowString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateString(tomorrow);
}

export const AdminMessPage: React.FC = () => {
  const { properties, selectedPropertyId, user } = useAuth();
  const activePropertyId = selectedPropertyId && selectedPropertyId !== 'ALL' ? selectedPropertyId : '';
  const activeProperty = properties.find((property) => property.id === activePropertyId);
  const allPropertiesSelected = selectedPropertyId === 'ALL';
  const [facilities, setFacilities] = useState<MessFacility[]>([]);
  const [meals, setMeals] = useState<MealItem[]>([]);
  const [selectedMessId, setSelectedMessId] = useState<number | null>(null);
  const [scheduledDate, setScheduledDate] = useState(tomorrowString);
  const [scheduledMealIds, setScheduledMealIds] = useState<number[]>([]);
  const [facilityName, setFacilityName] = useState('Main Mess');
  const [facilityCapacity, setFacilityCapacity] = useState('');
  const [mealForm, setMealForm] = useState<MealForm>(emptyMealForm);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isPastDate = scheduledDate < localDateString(new Date());
  const isLockedDate = scheduledDate <= localDateString(new Date());
  const selectedFacility = facilities.find((facility) => facility.id === selectedMessId) || null;
  const totalCapacity = facilities.reduce((total, facility) => total + (facility.capacity || 0), 0);
  const groupedMeals = useMemo(
    () => categories.map((category) => ({
      category,
      meals: meals.filter((meal) => meal.category === category),
    })),
    [meals],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const params = activePropertyId ? { propertyId: activePropertyId } : undefined;
      const facilityResponse = await apiClient.get<MessFacility[]>('/mess/facilities', { params });
      setFacilities(facilityResponse.data);
      if (activePropertyId) {
        const mealResponse = await apiClient.get<MealItem[]>('/mess/meals');
        setMeals(mealResponse.data);
        setSelectedMessId((current) => {
          if (current && facilityResponse.data.some((facility) => facility.id === current)) return current;
          return facilityResponse.data.find((facility) => facility.isDefault)?.id
            ?? facilityResponse.data[0]?.id
            ?? null;
        });
      } else {
        setSelectedMessId(null);
        setMeals([]);
      }
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [activePropertyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedMessId || !scheduledDate) {
      setScheduledMealIds([]);
      return;
    }
    let active = true;
    setErrorMessage('');
    apiClient.get<MenuResponse>(`/mess/${selectedMessId}/menu`, { params: { date: scheduledDate } })
      .then(({ data }) => {
        if (active) setScheduledMealIds(data.items.map((item) => item.mealItem.id));
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [selectedMessId, scheduledDate]);

  const createFacility = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activePropertyId) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data } = await apiClient.post<MessFacility>('/mess/facilities', {
        propertyId: activePropertyId,
        name: facilityName,
        capacity: facilityCapacity ? Number(facilityCapacity) : null,
      });
      setFacilities((current) => [...current, data]);
      setSelectedMessId(data.id);
      setFacilityName('');
      setFacilityCapacity('');
      setSuccessMessage('Mess facility created.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const setDefaultFacility = async (facility: MessFacility) => {
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data } = await apiClient.put<MessFacility>(`/mess/facilities/${facility.id}`, { isDefault: true });
      setFacilities((current) => current.map((item) => (
        item.propertyId === data.propertyId
          ? { ...item, isDefault: item.id === data.id }
          : item
      )));
      setSuccessMessage(`${data.name} is now the default mess.`);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveMeal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    const payload = {
      ...mealForm,
      name: mealForm.name.trim(),
      ingredients: mealForm.ingredients.trim() || null,
    };
    try {
      const { data } = editingMealId
        ? await apiClient.put<MealItem>(`/mess/meals/${editingMealId}`, payload)
        : await apiClient.post<MealItem>('/mess/meals', payload);
      setMeals((current) => [
        ...current.filter((meal) => meal.id !== data.id),
        data,
      ].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)));
      setMealForm(emptyMealForm);
      setEditingMealId(null);
      setSuccessMessage(editingMealId ? 'Meal item updated.' : 'Meal item created.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const deleteMeal = async (meal: MealItem) => {
    if (!window.confirm(`Delete "${meal.name}" from the meal library?`)) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await apiClient.delete(`/mess/meals/${meal.id}`);
      setMeals((current) => current.filter((item) => item.id !== meal.id));
      setScheduledMealIds((current) => current.filter((id) => id !== meal.id));
      setSuccessMessage('Meal item deleted.');
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveMenu = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMessId) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data } = await apiClient.post<MenuResponse>(`/mess/${selectedMessId}/menu`, {
        scheduledDate,
        mealItemIds: scheduledMealIds,
      });
      setScheduledMealIds(data.items.map((item) => item.mealItem.id));
      setSuccessMessage(`Menu saved for ${scheduledDate}.`);
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'ADMIN') {
    return <p role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-800">Only admins can manage mess facilities and menus.</p>;
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <p className="text-xs font-mono text-slate-500">HOSTEL OPERATIONS</p>
        <h1 className="mt-1 text-xl font-bold uppercase tracking-wide">Mess Management</h1>
        <p className="mt-1 text-xs text-slate-500">Manage hostel mess facilities, the meal library, and future menus.</p>
      </header>

      {errorMessage && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>}
      {successMessage && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{successMessage}</div>}

      {allPropertiesSelected ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase">All hostel mess facilities</h2>
            <span className="text-xs text-slate-500">{facilities.length} facilities · {totalCapacity} total capacity</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr><th className="p-3">Mess facility</th><th className="p-3">Hostel</th><th className="p-3">Type</th><th className="p-3">Default</th><th className="p-3">Capacity</th></tr>
              </thead>
              <tbody>
                {facilities.map((facility) => (
                  <tr key={facility.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="p-3 font-semibold">{facility.name}</td>
                    <td className="p-3">{facility.propertyName}</td>
                    <td className="p-3">{facility.propertyType.replaceAll('_', ' ')}</td>
                    <td className="p-3">{facility.isDefault ? <span className="bg-emerald-100 px-2 py-1 font-bold text-emerald-800">DEFAULT</span> : '—'}</td>
                    <td className="p-3">{facility.capacity ?? 'Not set'}</td>
                  </tr>
                ))}
                {!loading && facilities.length === 0 && <tr><td className="p-4 text-slate-500" colSpan={5}>No mess facilities are configured across your properties.</td></tr>}
              </tbody>
            </table>
          </div>
          {!facilities.length && properties.some((property) => property.hasMessFacility) && (
            <p className="text-xs text-slate-500">Choose a mess-enabled hostel from the property selector to configure its facility.</p>
          )}
        </section>
      ) : !activePropertyId ? (
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Select a property or All Properties from the property selector.</p>
      ) : !activeProperty?.hasMessFacility ? (
        <p className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Mess management is not enabled for this property. Enable it from the property settings.</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold uppercase">{activeProperty.name} · Mess facilities</h2>
                <p className="text-xs text-slate-500">Set one default facility for this hostel.</p>
              </div>
              <form onSubmit={createFacility} className="flex flex-wrap gap-2">
                <input required maxLength={100} aria-label="Mess facility name" placeholder="Facility name" value={facilityName} onChange={(event) => setFacilityName(event.target.value)} className={inputClass} />
                <input type="number" min="1" aria-label="Mess capacity" placeholder="Capacity" value={facilityCapacity} onChange={(event) => setFacilityCapacity(event.target.value)} className={`${inputClass} max-w-32`} />
                <button disabled={saving} className="bg-blue-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">Add facility</button>
              </form>
            </div>
            <div className="flex flex-wrap gap-2">
              {facilities.map((facility) => (
                <button
                  type="button"
                  key={facility.id}
                  onClick={() => setSelectedMessId(facility.id)}
                  className={`border px-3 py-2 text-xs ${selectedMessId === facility.id ? 'border-blue-700 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  {facility.name}{facility.isDefault ? ' · Default' : ''}
                </button>
              ))}
            </div>
            {selectedFacility && !selectedFacility.isDefault && (
              <button type="button" disabled={saving} onClick={() => void setDefaultFacility(selectedFacility)} className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-700">
                Set {selectedFacility.name} as default
              </button>
            )}
            {!facilities.length && <p className="text-xs text-slate-500">No mess facilities are configured yet.</p>}
          </section>

          {selectedFacility && (
            <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold uppercase">Menu scheduler · {selectedFacility.name}</h2>
                  <p className="text-xs text-slate-500">Select the meals to serve on the chosen date.</p>
                </div>
                <label className="space-y-1 text-xs font-semibold">
                  Menu date
                  <input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} className={inputClass} />
                </label>
              </div>
              {isPastDate && <span className="inline-block bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">Historical menu · read only</span>}
              {scheduledDate === localDateString(new Date()) && <span className="inline-block bg-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-700">Today · read only</span>}
              <form onSubmit={saveMenu} className="space-y-4">
                {groupedMeals.map(({ category, meals: categoryMeals }) => (
                  <fieldset key={category} className="space-y-2 border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                    <legend className="px-1 text-xs font-bold uppercase">{category.replaceAll('_', ' ')}</legend>
                    {categoryMeals.length ? categoryMeals.map((meal) => (
                      <label key={meal.id} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={isLockedDate || saving}
                          checked={scheduledMealIds.includes(meal.id)}
                          onChange={(event) => setScheduledMealIds((current) => (
                            event.target.checked
                              ? [...current, meal.id]
                              : current.filter((id) => id !== meal.id)
                          ))}
                        />
                        <span><strong>{meal.name}</strong> · {meal.dietaryType.replaceAll('_', ' ')}{meal.ingredients ? ` · ${meal.ingredients}` : ''}</span>
                      </label>
                    )) : <p className="text-xs text-slate-500">No meals in this category.</p>}
                  </fieldset>
                ))}
                <button type="submit" disabled={isLockedDate || saving || !scheduledDate} className="bg-blue-700 px-4 py-2 text-xs font-bold uppercase text-white disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save future menu'}
                </button>
              </form>
            </section>
          )}

          <section className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase">Master meal library</h2>
            <form onSubmit={saveMeal} className="grid gap-3 border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 md:grid-cols-4">
              <input required maxLength={100} aria-label="Meal name" placeholder="Meal name" value={mealForm.name} onChange={(event) => setMealForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} />
              <select aria-label="Meal category" value={mealForm.category} onChange={(event) => setMealForm((current) => ({ ...current, category: event.target.value as MealCategory }))} className={inputClass}>
                {categories.map((category) => <option key={category} value={category}>{category.replaceAll('_', ' ')}</option>)}
              </select>
              <select aria-label="Dietary type" value={mealForm.dietaryType} onChange={(event) => setMealForm((current) => ({ ...current, dietaryType: event.target.value as DietaryType }))} className={inputClass}>
                {dietaryTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
              </select>
              <input maxLength={5000} aria-label="Ingredients" placeholder="Ingredients (optional)" value={mealForm.ingredients} onChange={(event) => setMealForm((current) => ({ ...current, ingredients: event.target.value }))} className={inputClass} />
              <div className="flex gap-2 md:col-span-4">
                <button disabled={saving} className="bg-emerald-700 px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60">{editingMealId ? 'Update meal' : 'Add meal'}</button>
                {editingMealId && <button type="button" onClick={() => { setEditingMealId(null); setMealForm(emptyMealForm); }} className="border border-slate-300 px-3 py-2 text-xs font-bold uppercase dark:border-slate-700">Cancel</button>}
              </div>
            </form>
            <div className="divide-y divide-slate-200 border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
              {meals.map((meal) => (
                <article key={meal.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                  <div><strong>{meal.name}</strong><span className="ml-2 text-slate-500">{meal.category} · {meal.dietaryType}{meal.ingredients ? ` · ${meal.ingredients}` : ''}</span></div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => { setEditingMealId(meal.id); setMealForm({ name: meal.name, category: meal.category, dietaryType: meal.dietaryType, ingredients: meal.ingredients || '' }); }} className="font-bold text-blue-700 dark:text-blue-300">Edit</button>
                    <button type="button" disabled={saving} onClick={() => void deleteMeal(meal)} className="font-bold text-red-700 dark:text-red-300">Delete</button>
                  </div>
                </article>
              ))}
              {!loading && meals.length === 0 && <p className="p-4 text-xs text-slate-500">No meal items have been created.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
