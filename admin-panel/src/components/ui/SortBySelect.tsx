import React, { useId } from 'react';

export interface SortByOption<Value extends string> {
  value: Value;
  label: string;
}

interface SortBySelectProps<Value extends string> {
  value: Value;
  options: readonly SortByOption<Value>[];
  onChange: (value: Value) => void;
  label?: string;
}

const sortSelectClass =
  'border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono text-slate-700 hover:bg-slate-100 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';

export function SortBySelect<Value extends string>({
  value,
  options,
  onChange,
  label = 'Sort by',
}: SortBySelectProps<Value>) {
  const id = useId();

  return (
    <label htmlFor={id} className="flex shrink-0 items-center gap-2 text-xs font-mono text-slate-500">
      {label}
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => {
          const option = options.find((item) => item.value === event.target.value);
          if (option) onChange(option.value);
        }}
        className={sortSelectClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
