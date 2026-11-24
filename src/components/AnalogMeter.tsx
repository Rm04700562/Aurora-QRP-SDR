import React from 'react';

interface AnalogMeterProps {
  label: string;
  valueText: string;
  normalized: number; // 0..1
  ticks: string[];
  accent?: 'cyan' | 'amber' | 'rose' | 'emerald';
  subtitle?: string;
}

export const AnalogMeter: React.FC<AnalogMeterProps> = ({
  label,
  valueText,
  normalized,
  ticks,
  accent = 'cyan',
  subtitle,
}) => {
  const clamped = Math.max(0, Math.min(1, normalized));
  // Arc spans from -130 deg to -50 deg? Let's use 210 deg to 330 deg (in standard SVG polar: -155 to -25 deg)
  const startDeg = -152;
  const endDeg = -28;
  const sweep = endDeg - startDeg; // 124 deg
  const cx = 100;
  const cy = 84;
  const r = 64;

  const polarToXY = (deg: number, radius: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };

  const arcPath = (fromDeg: number, toDeg: number, radius: number) => {
    const start = polarToXY(fromDeg, radius);
    const end = polarToXY(toDeg, radius);
    const largeArc = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };

  const currentDeg = startDeg + sweep * clamped;
  const needleTip = polarToXY(currentDeg, r - 6);
  const needleBase = polarToXY(currentDeg, 14);

  const strokeColor =
    accent === 'rose'
      ? '#f43f5e'
      : accent === 'amber'
      ? '#f59e0b'
      : accent === 'emerald'
      ? '#10b981'
      : '#22b8ff';

  return (
    <div
      className="sdr-panel rounded-md px-1.5 pt-1 pb-1 flex flex-col items-center justify-between min-w-0"
      title={subtitle}
    >
      <div className="text-[10px] font-display font-semibold tracking-wider uppercase text-slate-300 text-center truncate w-full">
        {label}
      </div>

      <svg
        viewBox="0 0 200 92"
        className="w-full max-w-[136px] h-[40px] overflow-visible"
        aria-label={`${label}: ${valueText}`}
      >
        {/* Background track */}
        <path
          d={arcPath(startDeg, endDeg, r)}
          fill="none"
          stroke="#1c2a3b"
          strokeWidth="7"
          strokeLinecap="round"
        />

        {/* Active glowing value arc */}
        {clamped > 0.01 && (
          <path
            d={arcPath(startDeg, currentDeg, r)}
            fill="none"
            stroke={strokeColor}
            strokeWidth="7"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor}80)` }}
          />
        )}

        {/* Scale ticks & labels */}
        {ticks.map((tick, idx) => {
          const frac = ticks.length === 1 ? 0 : idx / (ticks.length - 1);
          const deg = startDeg + sweep * frac;
          const inner = polarToXY(deg, r - 11);
          const outer = polarToXY(deg, r - 5);
          const textPos = polarToXY(deg, r + 13);
          return (
            <g key={`${tick}-${idx}`}>
              <line
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="#496484"
                strokeWidth="1.4"
              />
              <text
                x={textPos.x}
                y={textPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#8da7c4"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Pivot & crisp needle */}
        <line
          x1={needleBase.x}
          y1={needleBase.y}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#f8fafc"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy - 4} r="4" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
      </svg>

      <div
        className="font-mono-tabular text-xs font-semibold leading-none tracking-tight -mt-1"
        style={{ color: strokeColor }}
      >
        {valueText}
      </div>
    </div>
  );
};
