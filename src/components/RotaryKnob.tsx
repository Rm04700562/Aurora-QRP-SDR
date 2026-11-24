import React, { useRef } from 'react';

interface RotaryKnobProps {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  displayValue: string;
  onChange: (next: number) => void;
  size?: 'xs' | 'sm' | 'md';
  showMinMax?: boolean;
}

export const RotaryKnob: React.FC<RotaryKnobProps> = ({
  label,
  ariaLabel,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
  size = 'md',
  showMinMax = true,
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, startVal: clamped };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dy = dragStartRef.current.y - e.clientY;
    const range = max - min;
    const raw = dragStartRef.current.startVal + (dy / 110) * range;
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, Number(stepped.toFixed(2)))));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const next = Math.max(min, Math.min(max, Number((clamped + dir * step).toFixed(2))));
    onChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(Math.min(max, Number((clamped + step).toFixed(2))));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(Math.max(min, Number((clamped - step).toFixed(2))));
    }
  };

  const indicatorOuter = polar(angleDeg, r - 3);
  const indicatorInner = polar(angleDeg, r - 9);
  const effectiveLabel = ariaLabel || label || 'Rotary Control';
  const svgSizeClass = size === 'xs' ? 'w-9 h-9' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';

  return (
    <div className="flex flex-col items-center select-none">
      {label && (
        <span className="text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 leading-none mb-0.5 whitespace-nowrap">
          {label}
        </span>
      )}

      <div
        role="slider"
        tabIndex={0}
        aria-label={effectiveLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={displayValue}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        className="relative cursor-ns-resize focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-full"
        title="Drag up/down, scroll wheel, or use arrow keys"
      >
        <svg viewBox="0 0 64 64" className={svgSizeClass}>
          <path d={arcPath(-135, 135, r + 4)} fill="none" stroke="#1b293b" strokeWidth="3" strokeLinecap="round" />
          {norm > 0.01 && (
            <path
              d={arcPath(-135, angleDeg, r + 4)}
              fill="none"
              stroke="#22b8ff"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          <defs>
            <radialGradient id={`knob-grad-${label.replace(/\s+/g, '')}`} cx="35%" cy="30%">
              <stop offset="0%" stopColor="#35465c" />
              <stop offset="65%" stopColor="#172230" />
              <stop offset="100%" stopColor="#0c121c" />
            </radialGradient>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={r - 1}
            fill={`url(#knob-grad-${label.replace(/\s+/g, '')})`}
            stroke="#364a63"
            strokeWidth="1.2"
          />
          <line
            x1={indicatorInner.x}
            y1={indicatorInner.y}
            x2={indicatorOuter.x}
            y2={indicatorOuter.y}
            stroke="#38bdf8"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="flex items-center justify-center w-full px-0.5 -mt-0.5 gap-1.5">
        {showMinMax && size !== 'xs' && <span className="text-[9px] font-mono-tabular text-slate-500">{min}</span>}
        <span className="text-[11px] font-mono-tabular font-semibold text-sky-400 leading-none">{displayValue}</span>
        {showMinMax && size !== 'xs' && <span className="text-[9px] font-mono-tabular text-slate-500">{max}</span>}
      </div>
    </div>
  );
};
