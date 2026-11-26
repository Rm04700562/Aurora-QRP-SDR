import React, { useRef } from 'react';
import { computeWheelStepDirection } from '../utils/browserCompat';

interface RotaryKnobProps {
  label: string;
  ariaLabel?: string;
  testId?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue: string;
  onChange: (next: number) => void;
  size?: 'xs' | 'sm' | 'md';
  showMinMax?: boolean;
  disabled?: boolean;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  ariaLabel,
  testId,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
  size = 'md',
  showMinMax = true,
  disabled = false,
}) => {
  const dragStartRef = useRef<{ y: number; startVal: number } | null>(null);
  const clamped = Math.max(min, Math.min(max, value));
  const norm = (clamped - min) / Math.max(1e-6, max - min);
  // Knob rotation from -135 deg to +135 deg
  const angleDeg = -135 + norm * 270;

  const r = size === 'xs' ? 18 : size === 'sm' ? 20 : 25;
  const cx = 32;
  const cy = 32;

  const polar = (deg: number, radPx: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radPx * Math.cos(rad), y: cy + radPx * Math.sin(rad) };
  };

  const arcPath = (fromDeg: number, toDeg: number, radPx: number) => {
    const start = polar(fromDeg, radPx);
    const end = polar(toDeg, radPx);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${radPx} ${radPx} 0 ${large} 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  };

  const snapValue = (raw: number) => {
    const stepped = Math.round((raw - min) / step) * step + min;
    return Math.max(min, Math.min(max, Number(stepped.toFixed(2))));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, startVal: clamped };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragStartRef.current) return;
    const dy = dragStartRef.current.y - e.clientY;
    const range = max - min;
    const raw = dragStartRef.current.startVal + (dy / 110) * range;
    onChange(snapValue(raw));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (disabled) return;
    e.preventDefault();
    const dir = computeWheelStepDirection(e.deltaY, e.deltaMode);
    if (dir === 0) return;
    const delta = dir * step * (e.shiftKey ? 5 : 1);
    onChange(snapValue(clamped + delta));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const mult = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(snapValue(clamped + step * mult));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(snapValue(clamped - step * mult));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      onChange(snapValue(clamped + step * 10));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      onChange(snapValue(clamped - step * 10));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    }
  };

  const indicatorOuter = polar(angleDeg, r - 3);
  const indicatorInner = polar(angleDeg, r - 9);
  const effectiveLabel = ariaLabel || label || 'Rotary Control';
  const svgSizeClass = size === 'xs' ? 'w-9 h-9' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  const safeId = `knob-grad-${(testId || label).replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

  return (
    <div className="flex flex-col items-center select-none">
      {label && (
        <span className="text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 leading-none mb-0.5 whitespace-nowrap">
          {label}
        </span>
      )}

      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        data-testid={testId}
        aria-label={effectiveLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={displayValue}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className={`touch-hold-control relative focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-full ${
          disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-ns-resize'
        }`}
        title={disabled ? 'Power on radio to adjust' : 'Drag up/down, scroll wheel, or use arrow keys'}
      >
        <svg viewBox="0 0 64 64" className={svgSizeClass}>
          <path d={arcPath(-135, 135, r + 4)} fill="none" stroke="#1b293b" strokeWidth="3" strokeLinecap="round" />
          {norm > 0.01 && !disabled && (
            <path
              d={arcPath(-135, angleDeg, r + 4)}
              fill="none"
              stroke="#22b8ff"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          <defs>
            <radialGradient id={safeId} cx="35%" cy="30%">
              <stop offset="0%" stopColor="#35465c" />
              <stop offset="65%" stopColor="#172230" />
              <stop offset="100%" stopColor="#0c121c" />
            </radialGradient>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={r - 1}
            fill={`url(#${safeId})`}
            stroke="#364a63"
            strokeWidth="1.2"
          />
          <line
            x1={indicatorInner.x}
            y1={indicatorInner.y}
            x2={indicatorOuter.x}
            y2={indicatorOuter.y}
            stroke={disabled ? '#64748b' : '#38bdf8'}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex items-center justify-center w-full px-0.5 -mt-0.5 gap-1.5">
        {showMinMax && size !== 'xs' && <span className="text-[9px] font-mono-tabular text-slate-500">{min}</span>}
        <span className={`text-[11px] font-mono-tabular font-semibold leading-none ${disabled ? 'text-slate-500' : 'text-sky-400'}`}>
          {displayValue}
        </span>
        {showMinMax && size !== 'xs' && <span className="text-[9px] font-mono-tabular text-slate-500">{max}</span>}
      </div>
    </div>
  );
};
