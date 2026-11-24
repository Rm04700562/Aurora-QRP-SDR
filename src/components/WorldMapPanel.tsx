import React from 'react';
import { Globe2, LocateFixed, SlidersHorizontal } from 'lucide-react';
import { buildWorldMapBeamPaths } from '../radio/azimuthalMap';
import { BANDS, calculateBearingDeg, evaluateBandCondition } from '../radio/physics';
import { BandId, PropagationConditions, QthLocation, RemoteStation, SignalEvaluation } from '../types/radio';

interface WorldMapPanelProps {
  qth: QthLocation;
  rotorHeadingDeg: number;
  band: BandId;
  propagation: PropagationConditions;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  onOpenPropagation: () => void;
  onSelectBand?: (band: BandId) => void;
  onSetRotorTarget?: (deg: number) => void;
  onLocateMe?: () => void;
  onOpenSettings?: () => void;
}

// Simplified equirectangular continent polygons in 0..360 x 0..180 space
const CONTINENT_PATHS = [
  // North America
  'M 42 32 L 75 24 L 118 28 L 128 48 L 106 66 L 94 82 L 82 78 L 62 62 L 45 48 Z',
  // South America
  'M 96 86 L 122 92 L 132 114 L 118 148 L 104 162 L 96 132 L 90 104 Z',
  // Europe
  'M 164 30 L 208 26 L 218 46 L 198 58 L 172 56 L 164 42 Z',
  // Africa
  'M 166 64 L 204 62 L 222 86 L 210 128 L 194 142 L 180 120 L 166 92 Z',
  // Asia
  'M 212 26 L 298 28 L 328 48 L 306 78 L 268 88 L 236 82 L 214 62 Z',
  // Australia
  'M 284 114 L 324 112 L 332 138 L 302 146 L 282 132 Z',
];

function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 360;
  const y = ((90 - lat) / 180) * 180;
  return { x, y };
}

function ratingStyles(rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Aurora') {
  switch (rating) {
    case 'Excellent':
      return {
        short: 'EXC',
        text: 'text-emerald-300',
        cell: 'bg-emerald-500/18 border-emerald-400/50 text-emerald-300',
      };
    case 'Good':
      return {
        short: 'GOOD',
        text: 'text-sky-300',
        cell: 'bg-sky-500/18 border-sky-400/50 text-sky-300',
      };
    case 'Aurora':
      return {
        short: 'AUR',
        text: 'text-purple-300',
        cell: 'bg-purple-500/20 border-purple-400/55 text-purple-300',
      };
    case 'Fair':
      return {
        short: 'FAIR',
        text: 'text-amber-300',
        cell: 'bg-amber-500/18 border-amber-400/50 text-amber-300',
      };
    default:
      return {
        short: 'POOR',
        text: 'text-rose-300',
        cell: 'bg-rose-500/14 border-rose-500/40 text-rose-300',
      };
  }
}

export const WorldMapPanel: React.FC<WorldMapPanelProps> = ({
  qth,
  rotorHeadingDeg,
  band,
  propagation,
  stations,
  onOpenPropagation,
  onSelectBand,
  onSetRotorTarget,
  onLocateMe,
  onOpenSettings,
}) => {
  const qthPt = projectLonLat(qth.lon, qth.lat);
  const beamPaths = buildWorldMapBeamPaths(qth, rotorHeadingDeg, 105);

  const bandCond = evaluateBandCondition(band, propagation);
  const activeBadge = ratingStyles(bandCond.rating);

  // Solar terminator subsolar longitude based on UTC hour
  const sunLon = ((12 - propagation.utcHour) * 15 + 360) % 360;
  const nightStartX = (sunLon + 90) % 360;

  // Show every connected operator (any band) plus active-band beacons (live users rendered on top)
  const visibleStations = stations
    .filter((s) => !s.station.isBeacon || s.station.band === band)
    .sort((a, b) => Number(!a.station.isBeacon) - Number(!b.station.isBeacon));

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSetRotorTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const lon = relX * 360 - 180;
    const lat = 90 - relY * 180;
    onSetRotorTarget(calculateBearingDeg(qth, { lat, lon }));
  };

  return (
    <section className="sdr-panel rounded-md p-1.5 flex flex-col gap-1">
      <div className="relative rounded overflow-hidden border border-[#1d2e42] bg-[#07101c]">
        <svg
          viewBox="0 0 360 180"
          onClick={handleMapClick}
          className="w-full h-[58px] block cursor-crosshair"
          aria-label="QTH World Map and Beam Heading. Click anywhere or on a station to aim rotator."
        >
          {/* Ocean grid */}
          <line x1="0" y1="90" x2="360" y2="90" stroke="#152538" strokeWidth="0.7" strokeDasharray="3 3" />
          <line x1="180" y1="0" x2="180" y2="180" stroke="#152538" strokeWidth="0.7" strokeDasharray="3 3" />

          {/* Night shadow band (greyline terminator visualization with wraparound) */}
          {nightStartX + 180 <= 360 ? (
            <rect x={nightStartX} y="0" width="180" height="180" fill="rgba(2, 6, 14, 0.45)" />
          ) : (
            <>
              <rect x={nightStartX} y="0" width={360 - nightStartX} height="180" fill="rgba(2, 6, 14, 0.45)" />
              <rect x="0" y="0" width={nightStartX + 180 - 360} height="180" fill="rgba(2, 6, 14, 0.45)" />
            </>
          )}

          {/* Landmasses */}
          {CONTINENT_PATHS.map((d, idx) => (
            <path key={idx} d={d} fill="#25364a" stroke="#3c5570" strokeWidth="0.8" />
          ))}

          {/* Curved great-circle rotor beam path */}
          {beamPaths.map((d, idx) => (
            <path
              key={`beam-${idx}`}
              d={d}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.9"
              pointerEvents="none"
            />
          ))}

          {/* Bearing / propagation path lines to stations */}
          {visibleStations.map(({ station, evalResult }) => {
            const pt = projectLonLat(station.qth.lon, station.qth.lat);
            const isPeer = !station.isBeacon;
            const sameBand = station.band === band;
            const pathStroke = !sameBand
              ? 'rgba(251,191,36,0.32)'
              : evalResult.auroraFlutter > 0.35
              ? 'rgba(192,132,252,0.55)'
              : evalResult.snrDb >= 15
              ? 'rgba(52,211,153,0.55)'
              : evalResult.snrDb >= 4
              ? 'rgba(56,189,248,0.45)'
              : 'rgba(251,191,36,0.35)';

            return (
              <line
                key={`line-${station.id}`}
                x1={qthPt.x}
                y1={qthPt.y}
                x2={pt.x}
                y2={pt.y}
                stroke={pathStroke}
                strokeWidth={isPeer ? '1.1' : '0.85'}
                strokeDasharray={!sameBand ? '2 2' : undefined}
                pointerEvents="none"
              />
            );
          })}

          {/* All connected users (any band) + current-band beacons */}
          {visibleStations.map(({ station, evalResult }) => {
            const pt = projectLonLat(station.qth.lon, station.qth.lat);
            const isPeer = !station.isBeacon;
            const sameBand = station.band === band;
            const dotFill = isPeer ? (sameBand ? '#34d399' : '#fbbf24') : '#38bdf8';

            return (
              <g
                key={station.id}
                onClick={(e) => {
                  if (!onSetRotorTarget) return;
                  e.stopPropagation();
                  onSetRotorTarget(evalResult.bearingToTxDeg);
                }}
                className="cursor-pointer"
                data-testid={isPeer ? `world-user-dot-${station.callsign}` : undefined}
              >
                <title>
                  {`${station.callsign} (${station.band} · ${evalResult.distanceKm} km · ${evalResult.bearingToTxDeg}°) — Click to aim rotator`}
                </title>
                <circle cx={pt.x} cy={pt.y} r="7" fill="transparent" />
                {isPeer && (
                  <circle cx={pt.x} cy={pt.y} r="5.5" fill={dotFill} opacity="0.22" pointerEvents="none" />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isPeer ? 3.5 : 2.4}
                  fill={dotFill}
                  stroke={isPeer ? '#ecfdf5' : 'none'}
                  strokeWidth="0.6"
                />
              </g>
            );
          })}

          {/* Operator QTH green dot */}
          <circle cx={qthPt.x} cy={qthPt.y} r="6" fill="rgba(34, 197, 94, 0.28)" pointerEvents="none" />
          <circle cx={qthPt.x} cy={qthPt.y} r="3.3" fill="#22c55e" stroke="#ecfdf5" strokeWidth="1" pointerEvents="none" />
        </svg>

        <div className="absolute top-1 right-1 flex items-center gap-1 px-1 py-0.5 rounded bg-[#070c14]/85 border border-[#223449] text-[9px] font-mono-tabular pointer-events-none">
          <Globe2 className="w-2.5 h-2.5 text-sky-400" aria-hidden="true" />
          <span className={activeBadge.text}>
            {band}: {bandCond.rating}
          </span>
        </div>
      </div>

      {/* Per-Band Propagation Strip */}
      <div
        className="grid grid-cols-5 gap-0.5"
        role="group"
        aria-label="Band Propagation Conditions"
      >
        {BANDS.map((b) => {
          const cond = evaluateBandCondition(b.id, propagation);
          const style = ratingStyles(cond.rating);
          const isCurrent = b.id === band;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectBand?.(b.id)}
              title={`${b.label} (${b.rangeLabel} MHz): ${cond.rating} · QRN ${cond.noiseDbm} dBm · Click to switch band`}
              className={`px-0.5 py-0.5 rounded border text-center leading-none transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                style.cell
              } ${isCurrent ? 'ring-1 ring-white/80 font-bold' : 'opacity-85 hover:opacity-100'}`}
            >
              <span className="text-[8.5px] font-mono-tabular text-slate-100">{b.label}</span>
              <span className="text-[7px] font-mono-tabular tracking-tight uppercase">{style.short}</span>
            </button>
          );
        })}
      </div>

      {/* Lat / Lon / Grid + GPS Locate */}
      <div className="flex items-center justify-between gap-1 text-[9px] font-mono-tabular text-slate-300 px-0.5 whitespace-nowrap">
        <span>Lat: {qth.lat.toFixed(1)}</span>
        <span>Lon: {qth.lon.toFixed(1)}</span>
        <button
          type="button"
          onClick={onOpenSettings}
          className="text-sky-300 hover:text-white cursor-pointer"
          title="Edit station QTH coordinates & grid"
        >
          {qth.grid}
        </button>
        {onLocateMe && (
          <button
            type="button"
            onClick={onLocateMe}
            className="flex items-center gap-0.5 px-1 rounded border border-[#213349] bg-[#0a111c] hover:border-sky-400 text-[8.5px] text-sky-300 cursor-pointer"
            aria-label="Use GPS Location"
            title="Update map & rotor to your current browser GPS location"
          >
            <LocateFixed className="w-2.5 h-2.5" aria-hidden="true" />
            <span>GPS</span>
          </button>
        )}
      </div>

      {/* Propagation Strip */}
      <button
        type="button"
        onClick={onOpenPropagation}
        className="w-full flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded border border-[#213349] bg-[#0a111c] hover:border-sky-400/60 text-[10px] transition-colors cursor-pointer whitespace-nowrap"
        title="Configure Virtual Ionospheric Propagation Conditions"
      >
        <span className="flex items-center gap-1 text-slate-300 shrink-0">
          <SlidersHorizontal className="w-2.5 h-2.5 text-sky-400" aria-hidden="true" />
          <span>Prop</span>
        </span>
        <span className="font-mono-tabular text-sky-300 truncate">
          MUF {bandCond.mufMhz} · {propagation.auroraActive ? 'Aurora' : propagation.presetName}
        </span>
      </button>
    </section>
  );
};
