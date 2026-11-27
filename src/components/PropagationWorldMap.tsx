import React, { useMemo } from 'react';
import { Globe2, RefreshCw } from 'lucide-react';
import { WORLD_CONTINENT_POLYGONS } from '../radio/azimuthalMap';
import {
  computeGreyLineTerminator,
  evaluateAllWorldRegions,
  evaluateVoacapCoverageFromQth,
  evaluateVoacapPath,
  getSubsolarPoint,
  maidenheadFromLatLon,
  PropagationRating,
} from '../radio/physics';
import { BandId, PropagationConditions, QthLocation } from '../types/radio';

interface PropagationWorldMapProps {
  band: BandId;
  propagation: PropagationConditions;
  qth: QthLocation;
  variant?: 'compact' | 'expanded';
  onOpenPropagation?: () => void;
  onOpenExpandedMap?: () => void;
  onRefreshHourly?: () => void;
  isRefreshingHourly?: boolean;
}

const RATING_COLORS: Record<PropagationRating, { fill: string; label: string; dotClass: string; badgeClass: string }> = {
  Excellent: {
    fill: '#10b981',
    label: 'Exc',
    dotClass: 'bg-emerald-500',
    badgeClass: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  },
  Good: {
    fill: '#0ea5e9',
    label: 'Good',
    dotClass: 'bg-sky-500',
    badgeClass: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
  },
  Fair: {
    fill: '#f59e0b',
    label: 'Fair',
    dotClass: 'bg-amber-500',
    badgeClass: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  },
  Poor: {
    fill: '#f43f5e',
    label: 'Poor',
    dotClass: 'bg-rose-500',
    badgeClass: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
  },
  Aurora: {
    fill: '#a855f7',
    label: 'Aur',
    dotClass: 'bg-purple-500',
    badgeClass: 'text-purple-300 border-purple-500/40 bg-purple-500/10',
  },
};

const LON_COLS = 36; // 10° global grid
const LAT_ROWS = 18; // 10° global grid

function buildContinentEquirectPaths(): string[] {
  return WORLD_CONTINENT_POLYGONS.map((poly) => {
    return (
      poly
        .map(([lon, lat], idx) => {
          const x = ((lon + 180) / 360) * 360;
          const y = ((90 - lat) / 180) * 180;
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ') + ' Z'
    );
  });
}

const CONTINENT_EQUIRECT_PATHS = buildContinentEquirectPaths();

export const PropagationWorldMap: React.FC<PropagationWorldMapProps> = ({
  band,
  propagation,
  qth,
  variant = 'compact',
  onOpenPropagation,
  onOpenExpandedMap,
  onRefreshHourly,
  isRefreshingHourly = false,
}) => {
  const cells = useMemo(() => {
    const cellW = 360 / LON_COLS;
    const cellH = 180 / LAT_ROWS;
    const items: Array<{
      key: string;
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      rating: PropagationRating;
      mufMhz: number;
      lufMhz: number;
      reliabilityPct: number;
      modeLabel: string;
    }> = [];

    for (let r = 0; r < LAT_ROWS; r++) {
      const lat = 90 - (r + 0.5) * (180 / LAT_ROWS);
      for (let c = 0; c < LON_COLS; c++) {
        const lon = -180 + (c + 0.5) * (360 / LON_COLS);
        const ev = evaluateVoacapCoverageFromQth(qth, lat, lon, band, propagation);
        items.push({
          key: `${r}-${c}`,
          x: c * cellW,
          y: r * cellH,
          w: cellW + 0.35,
          h: cellH + 0.35,
          fill: RATING_COLORS[ev.rating].fill,
          rating: ev.rating,
          mufMhz: ev.mufMhz,
          lufMhz: ev.lufMhz,
          reliabilityPct: ev.reliabilityPct,
          modeLabel: ev.modeLabel,
        });
      }
    }
    return items;
  }, [band, propagation, qth]);

  const worldRegions = useMemo(() => {
    if (variant !== 'expanded') return [];
    return evaluateAllWorldRegions(propagation).map((reg) => {
      const path = evaluateVoacapPath({
        bandId: band,
        txQth: qth,
        rxQth: { lat: reg.lat, lon: reg.lon, grid: maidenheadFromLatLon(reg.lat, reg.lon) },
        powerW: 15,
        conditions: propagation,
      });
      return {
        ...reg,
        voacapRating: path.rating,
        reliabilityPct: path.reliabilityPct,
        circuitOpen: path.circuitOpen,
        pathMufMhz: path.mufMhz,
        pathLufMhz: path.lufMhz,
        modeLabel: path.modeLabel,
      };
    });
  }, [variant, propagation, band, qth]);

  const subsolarPt = useMemo(() => {
    const pt = getSubsolarPoint(propagation.utcHour, propagation.timestampMs);
    return {
      x: ((pt.lon + 180) / 360) * 360,
      y: ((90 - pt.lat) / 180) * 180,
    };
  }, [propagation.utcHour, propagation.timestampMs]);

  const greyLine = useMemo(
    () => computeGreyLineTerminator(propagation.utcHour, propagation.timestampMs),
    [propagation.utcHour, propagation.timestampMs]
  );

  const qthX = ((qth.lon + 180) / 360) * 360;
  const qthY = ((90 - qth.lat) / 180) * 180;
  const updatedTimeShort = propagation.lastUpdatedUtc
    ? propagation.lastUpdatedUtc.slice(11, 16) + 'Z'
    : `${String(Math.floor(propagation.utcHour)).padStart(2, '0')}:00Z`;
  const nextTimeShort = propagation.nextUpdateUtc
    ? propagation.nextUpdateUtc.slice(11, 16) + 'Z'
    : `${String((Math.floor(propagation.utcHour) + 1) % 24).padStart(2, '0')}:00Z`;

  const renderMapSvg = (className: string) => (
    <svg
      viewBox="0 0 360 180"
      className={className}
      role="img"
      aria-label={`Global hourly HF propagation map for ${band}`}
    >
      <rect x={0} y={0} width={360} height={180} fill="#040912" />
      {/* Hourly Color Propagation Grid (10° global cells) */}
      {cells.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x}
          y={cell.y}
          width={cell.w}
          height={cell.h}
          fill={cell.fill}
          fillOpacity={0.5}
        >
          <title>
            {`VOACAP ${cell.rating} (${cell.reliabilityPct}% REL) · MUF ${cell.mufMhz} / LUF ${cell.lufMhz} MHz · ${cell.modeLabel}`}
          </title>
        </rect>
      ))}

      {/* Subtle Equator & Prime Meridian */}
      <line x1={0} y1={90} x2={360} y2={90} stroke="#ffffff" strokeOpacity={0.14} strokeDasharray="3 3" />
      <line x1={180} y1={0} x2={180} y2={180} stroke="#ffffff" strokeOpacity={0.1} strokeDasharray="3 3" />

      {/* Continents Overlay */}
      {CONTINENT_EQUIRECT_PATHS.map((d, idx) => (
        <path
          key={idx}
          d={d}
          fill="#0b1524"
          fillOpacity={0.55}
          stroke="#e2e8f0"
          strokeOpacity={0.55}
          strokeWidth={0.85}
          strokeLinejoin="round"
        />
      ))}

      {/* Grey Line Shaded Night Hemisphere & Solar Terminator */}
      <path
        d={greyLine.nightPolygonD}
        fill="#02060e"
        fillOpacity={0.44}
        pointerEvents="none"
      />
      <path
        d={greyLine.terminatorPathD}
        fill="none"
        stroke="#fbbf24"
        strokeOpacity={0.32}
        strokeWidth={3.2}
        strokeLinecap="round"
        pointerEvents="none"
      />
      <path
        d={greyLine.terminatorPathD}
        data-testid="greyline-terminator-path"
        fill="none"
        stroke="#f59e0b"
        strokeOpacity={0.95}
        strokeWidth={1.25}
        strokeLinecap="round"
        pointerEvents="none"
      />

      {/* Solar Noon Subsolar Point */}
      <circle
        cx={subsolarPt.x}
        cy={subsolarPt.y}
        r={4.5}
        fill="#facc15"
        fillOpacity={0.9}
        stroke="#040912"
        strokeWidth={1}
      />

      {/* Operator QTH Marker */}
      <circle cx={qthX} cy={qthY} r={4} fill="#38bdf8" stroke="#ffffff" strokeWidth={1.2} />
    </svg>
  );

  if (variant === 'expanded') {
    return (
      <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-propmap">
        <div className="flex items-center justify-between gap-2 text-[10px] whitespace-nowrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <Globe2 className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
            <span className="font-display font-semibold uppercase tracking-wider text-slate-200 truncate">
              VOACAP Prop · {band} from {qth.grid}
            </span>
            <span className="px-1.5 py-0.5 rounded border border-sky-400/40 bg-sky-500/10 font-mono-tabular text-[9.5px] text-sky-300 shrink-0">
              SFI {propagation.sfi} · K{propagation.kIndex} · 1h
            </span>
          </div>

          <div className="flex items-center gap-1.5 font-mono-tabular text-[9.5px] text-slate-400 shrink-0">
            <span title={`Updated ${propagation.lastUpdatedUtc ?? updatedTimeShort} · Next update ${propagation.nextUpdateUtc ?? nextTimeShort}`}>
              {updatedTimeShort} → {nextTimeShort}
            </span>
            {onRefreshHourly && (
              <button
                type="button"
                onClick={onRefreshHourly}
                disabled={isRefreshingHourly}
                data-testid="propmap-refresh-btn"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer disabled:opacity-50"
                title="Refresh worldwide VOACAP hourly propagation conditions now"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingHourly ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>Sync</span>
              </button>
            )}
            {onOpenPropagation && (
              <button
                type="button"
                onClick={onOpenPropagation}
                className="px-2 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer"
              >
                Tune Solar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-[86px] rounded border border-[#1c2c40] bg-[#040912] overflow-hidden flex items-center justify-center p-0.5">
          {renderMapSvg('w-full h-full max-h-[112px] object-contain rounded')}
        </div>

        {/* Whole-World VOACAP Circuit Summary Strip from Operator's QTH */}
        <div
          className="grid grid-cols-7 gap-1"
          data-testid="world-regions-strip"
          aria-label={`VOACAP hourly circuit propagation from ${qth.grid} on ${band}`}
        >
          {worldRegions.map((reg) => {
            const rating = reg.voacapRating;
            const style = RATING_COLORS[rating];
            return (
              <div
                key={reg.id}
                className={`rounded border px-1 py-0.5 text-center leading-tight ${style.badgeClass}`}
                title={`${qth.grid} → ${reg.name} (${band}): VOACAP ${rating} · ${reg.reliabilityPct}% REL · MUF ${reg.pathMufMhz} / LUF ${reg.pathLufMhz} MHz (${reg.modeLabel})`}
              >
                <div className="text-[8.5px] font-display font-semibold text-slate-100 truncate">
                  {reg.shortName}
                </div>
                <div className="text-[8.5px] font-mono-tabular font-bold">
                  {style.label} {reg.reliabilityPct}%
                </div>
                <div className="text-[7.5px] font-mono-tabular opacity-80">
                  MUF {reg.pathMufMhz}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[9.5px] font-mono-tabular">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(RATING_COLORS) as PropagationRating[]).map((key) => (
              <span key={key} className="flex items-center gap-1 text-slate-300">
                <span className={`w-2 h-2 rounded-xs ${RATING_COLORS[key].dotClass}`} aria-hidden="true" />
                <span>{key}</span>
              </span>
            ))}
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-3 h-[2px] bg-amber-400 inline-block rounded-full" aria-hidden="true" />
              <span>Grey Line</span>
            </span>
          </div>
          <span className="text-slate-400">
            VOACAP QTH {qth.grid} ({qth.lat.toFixed(1)}, {qth.lon.toFixed(1)}) · {propagation.sourceLabel ?? 'Hourly'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="md:col-span-7 sdr-panel rounded-md p-1.5 flex items-center justify-between gap-2"
      data-testid="bottom-propagation-map-card"
    >
      <div className="flex flex-col justify-between gap-1 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={onOpenExpandedMap ?? onOpenPropagation}
            className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 hover:text-sky-300 cursor-pointer truncate"
            title="Open full global propagation map"
          >
            <Globe2 className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
            <span className="truncate">Global Prop · {band}</span>
          </button>
          <span
            className="font-mono-tabular text-[9.5px] text-sky-300 shrink-0"
            title={`Auto-updated hourly (${propagation.lastUpdatedUtc ?? updatedTimeShort} · Next ${nextTimeShort})`}
          >
            {updatedTimeShort} · 1h Global
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-mono-tabular text-slate-300">
          {(Object.keys(RATING_COLORS) as PropagationRating[]).map((key) => (
            <span key={key} className="flex items-center gap-0.5">
              <span className={`w-1.5 h-1.5 rounded-xs ${RATING_COLORS[key].dotClass}`} aria-hidden="true" />
              <span>{RATING_COLORS[key].label}</span>
            </span>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenExpandedMap ?? onOpenPropagation}
        className="shrink-0 rounded border border-[#1d2e43] bg-[#040912] hover:border-sky-400/70 transition-colors cursor-pointer overflow-hidden"
        title="Click to inspect full color-coded global propagation map"
        aria-label="Open expanded Global Propagation Map"
      >
        {renderMapSvg('w-[122px] h-[61px] block')}
      </button>
    </div>
  );
};
