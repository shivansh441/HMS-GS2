import React, { useEffect, useRef, useState } from 'react';
import { userInputClass, userLabelClass } from './userStyles';

export interface AddressParts {
  addressCountry: string;
  addressCity: string;
  addressState: string;
  addressPincode: string;
  addressLine: string;
}

interface AddressFieldsProps {
  value: AddressParts;
  onChange: (value: AddressParts) => void;
  disabled: boolean;
}

interface StateListResponse {
  error?: boolean;
  msg?: string;
  data?: {
    states?: Array<string | { name: string }>;
  };
}

interface CityListResponse {
  error?: boolean;
  msg?: string;
  data?: string[];
}

interface PostalLookupResponse {
  Status?: string;
  Message?: string;
  PostOffice?: Array<{
    Country: string;
    State: string;
    District: string;
    Pincode: string;
  }> | null;
}

const countryStatesUrl = 'https://countriesnow.space/api/v0.1/countries/states';
const stateCitiesUrl = 'https://countriesnow.space/api/v0.1/countries/state/cities';

async function postJson<T>(url: string, body: Record<string, string>, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`);
  return response.json() as Promise<T>;
}

export const AddressFields: React.FC<AddressFieldsProps> = ({ value, onChange, disabled }) => {
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const lastPostalLookup = useRef('');
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [statesError, setStatesError] = useState('');
  const [citiesError, setCitiesError] = useState('');
  const [postalError, setPostalError] = useState('');
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [postalLoading, setPostalLoading] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  valueRef.current = value;

  useEffect(() => {
    const country = value.addressCountry.trim();
    if (!country) {
      setStates([]);
      setStatesError('');
      setStatesLoading(false);
      return;
    }

    setStates([]);
    setStatesError('');
    setStatesLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      postJson<StateListResponse>(countryStatesUrl, { country }, controller.signal)
        .then((response) => {
          if (response.error) throw new Error(response.msg || `No states found for ${country}.`);
          const nextStates = (response.data?.states || [])
            .map((state) => typeof state === 'string' ? state : state.name)
            .filter(Boolean);
          setStates(nextStates);
          if (nextStates.length === 0) setStatesError(`No state list is available for ${country}.`);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setStates([]);
            setStatesError(error instanceof Error ? error.message : 'Unable to load states.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setStatesLoading(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value.addressCountry]);

  useEffect(() => {
    const country = value.addressCountry.trim();
    const state = value.addressState.trim();
    if (!country || !state) {
      setCities([]);
      setCitiesError('');
      setCitiesLoading(false);
      return;
    }

    setCitiesLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      postJson<CityListResponse>(stateCitiesUrl, { country, state }, controller.signal)
        .then((response) => {
          if (response.error) throw new Error(response.msg || `No cities found for ${state}.`);
          const nextCities = response.data || [];
          setCities(nextCities);
          if (nextCities.length === 0) setCitiesError(`No city list is available for ${state}.`);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setCities([]);
            setCitiesError(error instanceof Error ? error.message : 'Unable to load cities.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setCitiesLoading(false);
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value.addressCountry, value.addressState]);

  useEffect(() => {
    const pincode = value.addressPincode.trim();
    const country = value.addressCountry.trim();
    if (pincode !== lastPostalLookup.current) lastPostalLookup.current = '';
    if (country && country.toLowerCase() !== 'india') lastPostalLookup.current = '';
    if (disabled || !/^\d{6}$/.test(pincode) || (country && country.toLowerCase() !== 'india')) {
      setPostalError('');
      setPostalLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (lastPostalLookup.current === pincode) {
        setPostalLoading(false);
        return;
      }
      lastPostalLookup.current = pincode;
      setPostalLoading(true);
      setPostalError('');
      fetch(`https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Pincode lookup failed (${response.status}).`);
          return response.json() as Promise<PostalLookupResponse[]>;
        })
        .then((response) => {
          const office = response[0]?.PostOffice?.[0];
          if (response[0]?.Status !== 'Success' || !office) {
            throw new Error(response[0]?.Message || 'No location was found for this pincode.');
          }
          onChangeRef.current({
            ...valueRef.current,
            addressCountry: office.Country,
            addressState: office.State,
            addressCity: office.District,
            addressPincode: office.Pincode,
          });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            lastPostalLookup.current = '';
            setPostalError(error instanceof Error ? error.message : 'Unable to look up this pincode.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPostalLoading(false);
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [disabled, value.addressCountry, value.addressPincode]);

  const updateField = (field: keyof AddressParts, nextValue: string) => {
    const next = { ...value, [field]: nextValue };
    if (field === 'addressCountry') {
      next.addressState = '';
      next.addressCity = '';
    } else if (field === 'addressState') {
      next.addressCity = '';
    } else if (field === 'addressPincode') {
      next.addressState = '';
      next.addressCity = '';
    }
    onChange(next);
  };

  const fields: Array<{
    key: keyof AddressParts;
    label: string;
    maxLength: number;
    span: string;
  }> = [
    { key: 'addressLine', label: 'Address', maxLength: 230, span: 'lg:col-span-2' },
    { key: 'addressCity', label: 'City', maxLength: 80, span: 'lg:col-span-2' },
    { key: 'addressState', label: 'State', maxLength: 60, span: 'lg:col-span-2' },
    { key: 'addressCountry', label: 'Country', maxLength: 60, span: 'lg:col-span-3' },
    { key: 'addressPincode', label: 'Pincode', maxLength: 20, span: 'lg:col-span-3' },
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
      {fields.map(({ key, label, maxLength, span }) => (
        <label key={key} className={`${userLabelClass} ${span}`}>
          {label}
          {key === 'addressState' && (statesLoading || (states.length > 0 && !statesError)) ? (
            <select
              disabled={disabled || statesLoading}
              className={userInputClass}
              value={value.addressState}
              onChange={(event) => updateField(key, event.target.value)}
            >
              <option value="">{statesLoading ? 'Loading states...' : 'Select state'}</option>
              {value.addressState && !states.includes(value.addressState) && (
                <option value={value.addressState}>{value.addressState}</option>
              )}
              {states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          ) : key === 'addressCity' && (citiesLoading || (cities.length > 0 && !citiesError)) ? (
            <select
              disabled={disabled || citiesLoading || !value.addressState}
              className={userInputClass}
              value={value.addressCity}
              onChange={(event) => updateField(key, event.target.value)}
            >
              <option value="">{citiesLoading ? 'Loading cities...' : 'Select city'}</option>
              {value.addressCity && !cities.includes(value.addressCity) && (
                <option value={value.addressCity}>{value.addressCity}</option>
              )}
              {cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          ) : (
            <input
              type="text"
              inputMode={key === 'addressPincode' ? 'numeric' : undefined}
              autoComplete={key === 'addressPincode' ? 'postal-code' : undefined}
              maxLength={maxLength}
              disabled={disabled}
              className={userInputClass}
              value={value[key]}
              onChange={(event) => updateField(key, event.target.value)}
            />
          )}
        </label>
      ))}
      {(statesError || citiesError || postalError || statesLoading || citiesLoading || postalLoading) && (
        <div
          className={`text-xs sm:col-span-2 lg:col-span-6 ${statesError || citiesError || postalError ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}
          role={statesError || citiesError || postalError ? 'alert' : 'status'}
        >
          {postalLoading ? 'Looking up pincode…' : null}
          {statesLoading ? ' Loading states…' : null}
          {citiesLoading ? ' Loading cities…' : null}
          {postalError ? ` ${postalError}` : null}
          {statesError ? ` ${statesError}` : null}
          {citiesError ? ` ${citiesError}` : null}
        </div>
      )}
    </div>
  );
};
