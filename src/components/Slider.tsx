import { useState } from 'react';

interface SliderProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange?: (value: number) => void;
  value?: number;
}

export function Slider({
  label,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  unit,
  onChange,
  value,
}: SliderProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? min);
  const v = isControlled ? value! : internal;

  function update(next: number) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  return (
    <label className="block my-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </span>
        <span className="font-mono text-sm text-ink tabular-nums">
          {v}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => update(Number(e.target.value))}
        className="w-full accent-accent cursor-pointer"
      />
    </label>
  );
}
