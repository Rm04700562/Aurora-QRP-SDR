import React from 'react';

interface AnalogMeterProps {
  label: string;
  shortLabel?: string;
  dialLegend?: string;
  valueText: string;
  normalized: number; // 0..1
  ticks: string[];
  accent?: 'cyan' | 'amber' | 'rose' | 'emerald' | 'red';
  subtitle?: string;
  isPoweredOn?: boolean;
  dangerFrom?: number; // 0..1 where crimson over-scale begins
  alertRed?: boolean; // Turns the entire meter housing, dial, and readout red
  testId?: string;
}

export const AnalogMeter: React.FC<AnalogMeterProps> = ({
  label,
  shortLabel,
  dialLegend,
  valueText,
  normalized,
  ticks,
  accent = 'cyan',
  subtitle,
  isPoweredOn = true,
  dangerFrom = 0.65,
  alertRed = false,
  testId,
}) => {
  const clamped = Math.max(0, Math.min(1, normalized));
  const startDeg = -146;
  const endDeg = -34;
  const sweep = endDeg - startDeg; // 112 deg
  const cx = 100;
  const cy = 98;
  const r = 68;

  const isRedAlert = isPoweredOn && alertRed;

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

  const dangerDeg = startDeg + sweep * Math.max(0.05, Math.min(0.95, dangerFrom));
  const currentDeg = startDeg + sweep * clamped;
  const needleRotationDeg = currentDeg + 90; // Needle geometry is drawn upright (-90 deg) around (cx, cy)

  const readoutColor = !isPoweredOn
    ? '#64748b'
    : isRedAlert || accent === 'red'
    ? '#f87171'
    : accent === 'rose'
    ? '#fb7185'
    : accent === 'amber'
    ? '#fbbf24'
    : accent === 'emerald'
    ? '#34d399'
    : '#38bdf8';

  const gradId = `vintage-dial-${label.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const clipId = `vintage-clip-${label.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
  const subTickCount = Math.max(12, (ticks.length - 1) * 4);
  const legendText = (dialLegend ?? shortLabel ?? label).toUpperCase();
  const footerLabel = shortLabel ?? label;

  return (
    <div
      data-testid={testId}
      data-alert={isRedAlert ? 'red' : 'normal'}
      data-normalized={clamped.toFixed(3)}
      data-needle-deg={currentDeg.toFixed(1)}
      className={`rounded-md border p-1 flex flex-col items-center justify-between min-w-0 transition-colors duration-200 ${
        isRedAlert
          ? 'bg-[#26090e] border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.34),inset_0_1px_0_rgba(248,113,113,0.22)]'
          : 'bg-[#0a0f17] border-[#233245] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
      }`}
      title={subtitle}
    >
      {/* Classic Recessed Bakelite / Steel Meter Window */}
      <div
        className={`w-full relative rounded border p-0.5 shadow-[inset_0_2px_6px_rgba(0,0,0,0.85)] overflow-hidden transition-colors duration-200 ${
          isRedAlert ? 'border-red-500/80 bg-[#2d0c13]' : 'border-[#2c3b4f] bg-[#131922]'
        }`}
      >
        <span className="w-1 h-1 rounded-full bg-[#475569] border border-[#1e293b] absolute top-1 left-1 z-10 pointer-events-none" />
        <span className="w-1 h-1 rounded-full bg-[#475569] border border-[#1e293b] absolute top-1 right-1 z-10 pointer-events-none" />

        <svg
          viewBox="0 0 200 100"
          className="w-full h-[46px] block select-none"
          aria-label={`${label}: ${valueText}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
              {!isPoweredOn ? (
                <>
                  <stop offset="0%" stopColor="#262c36" />
                  <stop offset="100%" stopColor="#171c24" />
                </>
              ) : isRedAlert ? (
                <>
                  <stop offset="0%" stopColor="#fca5a5" />
                  <stop offset="48%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#dc2626" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#efe2be" />
                  <stop offset="48%" stopColor="#f7edd2" />
                  <stop offset="100%" stopColor="#dfc58e" />
                </>
              )}
            </linearGradient>
            <clipPath id={clipId}>
              <rect x="6" y="4" width="188" height="90" rx="5" />
            </clipPath>
          </defs>

          <rect
            x="6"
            y="4"
            width="188"
            height="90"
            rx="5"
            fill={`url(#${gradId})`}
            stroke={isRedAlert ? '#7f1d1d' : '#1e242d'}
            strokeWidth="2"
          />

          <g clipPath={`url(#${clipId})`}>
            <rect x="6" y="4" width="188" height="9" fill="rgba(0,0,0,0.14)" />

            <path
              d={arcPath(startDeg, dangerDeg, r - 8)}
              fill="none"
              stroke={!isPoweredOn ? '#475569' : isRedAlert ? '#450a0a' : '#1e293b'}
              strokeWidth="2.2"
            />

            <path
              d={arcPath(dangerDeg, endDeg, r - 8)}
              fill="none"
              stroke={!isPoweredOn ? '#5b3036' : isRedAlert ? '#7f1d1d' : '#b91c1c'}
              strokeWidth="3.0"
            />

            {Array.from({ length: subTickCount + 1 }).map((_, idx) => {
              const frac = idx / subTickCount;
              const deg = startDeg + sweep * frac;
              const isDanger = frac >= dangerFrom;
              const p1 = polarToXY(deg, r - 8);
              const p2 = polarToXY(deg, r - 12);
              return (
                <line
                  key={`sub-${idx}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={
                    !isPoweredOn
                      ? '#475569'
                      : isRedAlert
                      ? '#450a0a'
                      : isDanger
                      ? '#b91c1c'
                      : '#334155'
                  }
                  strokeWidth="0.9"
                />
              );
            })}

            {ticks.map((tick, idx) => {
              const frac = ticks.length === 1 ? 0 : idx / (ticks.length - 1);
              const deg = startDeg + sweep * frac;
              const isDanger = frac >= dangerFrom;
              const inner = polarToXY(deg, r - 14);
              const outer = polarToXY(deg, r - 6);
              const textPos = polarToXY(deg, r + 6.5);
              return (
                <g key={`${tick}-${idx}`}>
                  <line
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={
                      !isPoweredOn
                        ? '#475569'
                        : isRedAlert
                        ? '#450a0a'
                        : isDanger
                        ? '#b91c1c'
                        : '#0f172a'
                    }
                    strokeWidth="1.6"
                  />
                  <text
                    x={textPos.x}
                    y={textPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={
                      !isPoweredOn
                        ? '#64748b'
                        : isRedAlert
                        ? '#450a0a'
                        : isDanger
                        ? '#991b1b'
                        : '#0f172a'
                    }
                    fontSize="8.4"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Clean centered dial plate legend */}
            <text
              x={cx}
              y={53}
              textAnchor="middle"
              fill={!isPoweredOn ? '#64748b' : isRedAlert ? '#450a0a' : '#475569'}
              fontSize="7.8"
              fontWeight="700"
              letterSpacing="1.1"
              fontFamily="Chakra Petch, sans-serif"
            >
              {legendText}
            </text>

            {/* Mechanically damped rotating needle assembly around Bakelite pivot (100, 98) */}
            <g
              style={{
                transform: `rotate(${needleRotationDeg.toFixed(2)}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
                transition: 'transform 75ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {/* Needle shadow */}
              <line
                x1={cx + 2}
                y1={cy + 2}
                x2={cx + 2}
                y2={cy - (r + 1.5)}
                stroke="rgba(0,0,0,0.22)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />

              {/* Mechanical tapered needle */}
              <polygon
                points={`${(cx - 2.1).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(cy - (r + 2)).toFixed(1)} ${(cx + 2.1).toFixed(1)},${cy.toFixed(1)}`}
                fill={!isPoweredOn ? '#64748b' : isRedAlert ? '#fef2f2' : '#c2410c'}
                stroke={!isPoweredOn ? '#475569' : isRedAlert ? '#450a0a' : '#7c2d12'}
                strokeWidth={isRedAlert ? '0.8' : '0.5'}
              />
            </g>

            {/* Lower Bakelite Pivot Escutcheon & Screw */}
            <path
              d="M 68 94 A 34 34 0 0 1 132 94 Z"
              fill={isRedAlert ? '#2b090f' : '#141921'}
              stroke={isRedAlert ? '#991b1b' : '#334155'}
              strokeWidth="1"
            />
            <circle cx={cx} cy={90} r="4.5" fill="#94a3b8" stroke="#1e293b" strokeWidth="1.2" />
            <line x1={cx - 2.5} y1={90} x2={cx + 2.5} y2={90} stroke="#1e293b" strokeWidth="1" />
          </g>
        </svg>
      </div>

      {/* Bottom Digital Readout Strip */}
      <div className="w-full flex items-center justify-between gap-1 px-1 pt-0.5 leading-none">
        <span
          className={`text-[9px] font-display font-semibold uppercase tracking-wider truncate ${
            isRedAlert ? 'text-red-300' : 'text-slate-400'
          }`}
        >
          {footerLabel}
        </span>
        <span
          className="font-mono-tabular text-[11px] font-bold tracking-tight whitespace-nowrap shrink-0"
          style={{ color: readoutColor }}
        >
          {valueText}
        </span>
      </div>
    </div>
  );
};
