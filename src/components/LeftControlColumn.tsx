import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Compass, LocateFixed, RadioTower, SlidersHorizontal, SunMedium } from 'lucide-react';
import {
  buildAzimuthalContinentLabels,
  buildAzimuthalContinentPaths,
  buildAzimuthalGraticulePaths,
  describeBeamTarget,
  projectAzimuthalPoint,
} from '../radio/azimuthalMap';
import {
  angularDiffDeg,
  ANTENNAS,
  BANDS,
  evaluateBandCondition,
  getAntennaSpec,
  getEffectiveAntennaBandPerformance,
  PROPAGATION_PRESETS,
} from '../radio/physics';
import { AntennaId, BandId, PropagationConditions, QthLocation, RemoteStation, SignalEvaluation } from '../types/radio';

const PRESET_SHORT_LABELS: Record<string, string> = {
  'Balanced DX': 'Bal DX',
  'Solar Max Opening': 'Solar+',
  'Aurora Storm': 'Aurora',
  'Quiet Low-Band Night': 'Night',
};

interface LeftControlColumnProps {
  antennaId: AntennaId;
  onChangeAntenna: (id: AntennaId) => void;
  rotorHeadingDeg: number;
  rotorTargetDeg: number;
  onSetRotorTarget: (deg: number) => void;
  activeBand: BandId;
  onSelectBand: (band: BandId) => void;
  propagation: PropagationConditions;
  onUpdatePropagation: (next: PropagationConditions) => void;
  onOpenPropagation: () => void;
  qth: QthLocation;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  currentSwr?: number;
  onLocateMe?: () => void;
  onOpenSettings?: () => void;
}

export const LeftControlColumn: React.FC<LeftControlColumnProps> = ({
  antennaId,
  onChangeAntenna,
  rotorHeadingDeg,
  rotorTargetDeg,
  onSetRotorTarget,
  activeBand,
  onSelectBand,
  propagation,
  onUpdatePropagation,
  onOpenPropagation,
  qth,
  stations,
  currentSwr,
  onLocateMe,
  onOpenSettings,
}) => {
  const ant = getAntennaSpec(antennaId);
  const antPerf = getEffectiveAntennaBandPerformance(antennaId, activeBand);
  const isSlewing = Math.abs(rotorHeadingDeg - rotorTargetDeg) > 1;
  const isResonant = ant.resonantBands.includes(activeBand);
  const bandCond = evaluateBandCondition(activeBand, propagation, qth);

  const mapContinentPaths = useMemo(
    () => buildAzimuthalContinentPaths(qth, 50, 50, 42),
    [qth.lat, qth.lon]
  );

  const continentLabels = useMemo(
    () => buildAzimuthalContinentLabels(qth, 50, 50, 42),
    [qth.lat, qth.lon]
  );

  const graticulePaths = useMemo(
    () => buildAzimuthalGraticulePaths(qth, 50, 50, 42),
    [qth.lat, qth.lon]
  );

  const beamTargetLabel = useMemo(
    () => describeBeamTarget(qth, rotorHeadingDeg, stations, activeBand),
    [qth, rotorHeadingDeg, stations, activeBand]
  );

  const bandStationDots = useMemo(
    () =>
      stations
        .filter((s) => !s.station.isBeacon || s.station.band === activeBand)
        .map(({ station, evalResult }) => {
          const isBeacon = Boolean(station.isBeacon);
          const sameBand = station.band === activeBand;
          const beamHalf = ant.isDirectional ? Math.max(18, antPerf.beamwidthDeg / 2) : 180;
          const inBeam = angularDiffDeg(rotorHeadingDeg, evalResult.bearingToTxDeg) <= beamHalf;
          return {
            id: station.id,
            callsign: station.callsign,
            band: station.band,
            isBeacon,
            sameBand,
            inBeam,
            bearingDeg: evalResult.bearingToTxDeg,
            distanceKm: evalResult.distanceKm,
            ...projectAzimuthalPoint(station.qth.lon, station.qth.lat, qth, 50, 50, 42),
          };
        })
        .sort((a, b) => Number(!a.isBeacon) - Number(!b.isBeacon)),
    [stations, activeBand, qth.lat, qth.lon, rotorHeadingDeg, ant.isDirectional, antPerf.beamwidthDeg]
  );

  const handleCompassClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!ant.isRotatable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    onSetRotorTarget(Math.round(deg));
  };

  // Beamwidth wedge coordinates in SVG (center 50,50, radius 40)
  const halfBeam = Math.min(170, antPerf.beamwidthDeg / 2);
  const toXY = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) };
  };
  const wedgeStart = toXY(rotorHeadingDeg - halfBeam, 39);
  const wedgeEnd = toXY(rotorHeadingDeg + halfBeam, 39);
  const largeArc = halfBeam * 2 > 180 ? 1 : 0;
  const beamPath = ant.isDirectional
    ? `M 50 50 L ${wedgeStart.x.toFixed(1)} ${wedgeStart.y.toFixed(1)} A 39 39 0 ${largeArc} 1 ${wedgeEnd.x.toFixed(1)} ${wedgeEnd.y.toFixed(1)} Z`
    : '';

  const tip = toXY(rotorHeadingDeg, 36);
  const targetTip = toXY(rotorTargetDeg, 39);

  return (
    <aside className="flex flex-col gap-1.5 w-full lg:w-[198px] shrink-0">
      {/* ANTENNA SELECTOR */}
      <section className="sdr-panel rounded-md p-1.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            <RadioTower className="w-3 h-3 text-sky-400" aria-hidden="true" />
            <span>Antenna</span>
          </div>
          <span
            className={`text-[9px] font-mono-tabular ${
              isResonant ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {isResonant ? 'Resonant' : 'ATU Req'}
          </span>
        </div>

        <label className="sr-only" htmlFor="antenna-select">
          Virtual Antenna
        </label>
        <select
          id="antenna-select"
          value={antennaId}
          onChange={(e) => onChangeAntenna(e.target.value as AntennaId)}
          title={ant.description}
          className="w-full px-1.5 py-1 rounded border border-[#273a52] bg-[#0a111a] text-[11px] font-medium text-slate-100 focus:outline-none focus:border-sky-400 cursor-pointer"
        >
          <optgroup label="Multi-Band &amp; Portable">
            {ANTENNAS.filter((a) => !a.id.startsWith('dx')).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.isRotatable ? 'Rot' : 'Fixed'})
              </option>
            ))}
          </optgroup>
          <optgroup label="Band-Specific Long-Range DX">
            {ANTENNAS.filter((a) => a.id.startsWith('dx')).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.isRotatable ? 'Rot' : 'Fixed'})
              </option>
            ))}
          </optgroup>
        </select>

        <p className="mt-0.5 text-[10px] text-slate-400 leading-tight" data-testid="antenna-spec-summary">
          {antPerf.forwardGainDbi.toFixed(1)} dBi · {ant.isDirectional ? (ant.isBidirectional ? 'Figure-8' : `${antPerf.beamwidthDeg}° beam`) : '360° omni'}
          {!ant.isRotatable ? ' · Fixed' : ''}
          {typeof currentSwr === 'number' ? ` · SWR ${currentSwr.toFixed(1)}` : ''}
        </p>
      </section>

      {/* ROTOR COMPASS */}
      <section className="sdr-panel rounded-md p-1.5 flex flex-col gap-1" data-testid="rotor-panel">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            <Compass className={`w-3 h-3 ${ant.isRotatable ? 'text-sky-400' : 'text-slate-500'}`} aria-hidden="true" />
            <span>Rotor</span>
            {!ant.isRotatable ? (
              <span
                data-testid="rotor-fixed-badge"
                className="px-1 py-0 rounded bg-amber-500/15 border border-amber-400/40 text-[8px] font-mono-tabular text-amber-300 uppercase"
                title="Rotator disabled for non-rotatable fixed wire/vertical antennas"
              >
                FIXED
              </span>
            ) : (
              isSlewing && (
                <span className="text-[8.5px] font-mono-tabular text-amber-300 lowercase">turning</span>
              )
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-1 py-0.5 rounded border border-[#223449] bg-[#0a111c] hover:border-sky-400 text-[8.5px] font-mono-tabular text-emerald-300 cursor-pointer"
              title={`Rotor globe centered on your QTH (${qth.lat.toFixed(2)}, ${qth.lon.toFixed(2)} · ${qth.grid}). Click to change location.`}
              data-testid="rotor-qth-grid"
            >
              {qth.grid}
            </button>
            {onLocateMe && (
              <button
                type="button"
                onClick={onLocateMe}
                className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-[#223449] bg-[#0a111c] hover:border-sky-400 text-[8.5px] font-mono-tabular text-sky-300 cursor-pointer"
                aria-label="Center rotor map on my GPS location"
                title="Center rotor map on your current GPS location"
              >
                <LocateFixed className="w-2.5 h-2.5" aria-hidden="true" />
                <span>GPS</span>
              </button>
            )}
          </div>
        </div>

        {/* Compact Bearing & Target Strip */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!ant.isRotatable}
              data-testid="rotor-ccw-button"
              onClick={() => onSetRotorTarget((rotorTargetDeg - 15 + 360) % 360)}
              className="p-0.5 rounded border border-[#24364d] bg-[#0c1420] hover:border-sky-400 text-sky-400 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#24364d]"
              aria-label="Rotate antenna counter-clockwise 15 degrees"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span
              className={`font-mono-tabular text-xs font-bold w-[34px] text-center ${
                ant.isRotatable ? 'text-sky-400' : 'text-slate-500'
              }`}
              data-testid="rotor-heading-value"
            >
              {ant.isRotatable ? `${rotorHeadingDeg}°` : 'FIX'}
            </span>
            <button
              type="button"
              disabled={!ant.isRotatable}
              data-testid="rotor-cw-button"
              onClick={() => onSetRotorTarget((rotorTargetDeg + 15) % 360)}
              className="p-0.5 rounded border border-[#24364d] bg-[#0c1420] hover:border-sky-400 text-sky-400 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:border-[#24364d]"
              aria-label="Rotate antenna clockwise 15 degrees"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          <div className="flex flex-col items-end min-w-0 leading-tight">
            <span className="text-[9px] text-slate-400 font-mono-tabular">
              {ant.isRotatable ? (
                <>
                  Tgt <span className="text-sky-300">{rotorTargetDeg}°</span>
                </>
              ) : (
                <span className="text-amber-300">Rotor Off</span>
              )}
            </span>
            <span
              className="text-[9px] text-emerald-300 font-mono-tabular truncate max-w-[92px]"
              title={ant.isRotatable ? `Antenna beam pointing toward ${beamTargetLabel}` : 'Non-rotatable fixed antenna'}
              data-testid="rotor-beam-target"
            >
              {ant.isRotatable ? `→ ${beamTargetLabel}` : 'Fixed Pattern'}
            </span>
          </div>
        </div>

        <div className="flex justify-center">
          <svg
            viewBox="0 0 100 100"
            onClick={handleCompassClick}
            className={`w-[112px] h-[112px] shrink-0 select-none ${
              ant.isRotatable ? 'cursor-crosshair' : 'cursor-not-allowed opacity-80'
            }`}
            role="img"
            aria-label={
              ant.isRotatable
                ? `Antenna Rotor Globe Map centered at ${qth.grid} with beam at ${rotorHeadingDeg} degrees pointing toward ${beamTargetLabel}. Click to set target bearing.`
                : `Fixed non-rotatable antenna pattern centered at ${qth.grid}. Rotor disabled.`
            }
          >
            <defs>
              <clipPath id="rotor-map-clip">
                <circle cx="50" cy="50" r="42.5" />
              </clipPath>
              <radialGradient id="rotor-globe-ocean" cx="38%" cy="35%" r="68%">
                <stop offset="0%" stopColor="#143c63" />
                <stop offset="60%" stopColor="#091d35" />
                <stop offset="100%" stopColor="#030812" />
              </radialGradient>
              <radialGradient id="rotor-globe-sheen" cx="34%" cy="30%" r="55%">
                <stop offset="0%" stopColor="rgba(125, 211, 252, 0.2)" />
                <stop offset="100%" stopColor="rgba(125, 211, 252, 0)" />
              </radialGradient>
            </defs>

            {/* 3D Shaded Globe Base */}
            <circle cx="50" cy="50" r="44" fill="url(#rotor-globe-ocean)" stroke="#38bdf8" strokeOpacity="0.45" strokeWidth="1.2" />

            {/* Great-Circle Azimuthal Globe Map centered on operator QTH */}
            <g clipPath="url(#rotor-map-clip)">
              {/* Spherical Latitude / Longitude Graticule */}
              {graticulePaths.map((d, idx) => (
                <path
                  key={`g-${idx}`}
                  d={d}
                  fill="none"
                  stroke="#285175"
                  strokeWidth="0.4"
                  opacity="0.5"
                />
              ))}

              {/* Distance range rings from operator QTH (5k, 10k, 15k km) */}
              {[10.5, 21, 31.5].map((ringR) => (
                <circle
                  key={`ring-${ringR}`}
                  cx="50"
                  cy="50"
                  r={ringR}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="0.35"
                  strokeDasharray="1.5 1.5"
                  opacity="0.3"
                  pointerEvents="none"
                />
              ))}

              {/* Continents */}
              {mapContinentPaths.map((d, idx) => (
                <path
                  key={idx}
                  d={d}
                  fill="#26596e"
                  stroke="#63b6db"
                  strokeWidth="0.55"
                  strokeLinejoin="round"
                />
              ))}

              {/* Dynamic Continent Orientation Labels from User's QTH */}
              {continentLabels.map((lbl) => (
                <text
                  key={lbl.code}
                  x={lbl.x}
                  y={lbl.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#a5d8f3"
                  fontSize="3.8"
                  fontWeight="600"
                  fontFamily="JetBrains Mono"
                  opacity="0.72"
                  pointerEvents="none"
                >
                  {lbl.code}
                </text>
              ))}

              {/* Bearing lines to connected live operators */}
              {bandStationDots
                .filter((dot) => !dot.isBeacon)
                .map((dot) => (
                  <line
                    key={`line-${dot.id}`}
                    x1="50"
                    y1="50"
                    x2={dot.x}
                    y2={dot.y}
                    stroke={dot.sameBand ? '#34d399' : '#fbbf24'}
                    strokeWidth="0.6"
                    strokeDasharray="1.6 1.4"
                    opacity={dot.inBeam ? 0.78 : 0.38}
                    pointerEvents="none"
                  />
                ))}

              {/* Connected Operators (all bands) & Active-Band Beacon Markers */}
              {bandStationDots.map((dot) => {
                const fill = dot.isBeacon ? '#7dd3fc' : dot.sameBand ? '#34d399' : '#fbbf24';
                const glow = dot.isBeacon ? '#38bdf8' : dot.sameBand ? '#34d399' : '#fbbf24';
                return (
                  <g
                    key={dot.id}
                    onClick={(e) => {
                      if (!ant.isRotatable) return;
                      e.stopPropagation();
                      onSetRotorTarget(Math.round(dot.bearingDeg));
                    }}
                    className={ant.isRotatable ? 'cursor-pointer' : 'cursor-not-allowed'}
                    data-testid={dot.isBeacon ? undefined : `rotor-user-dot-${dot.callsign}`}
                  >
                    <title>
                      {`${dot.callsign} (${dot.band}) · ${Math.round(dot.distanceKm)} km · ${Math.round(dot.bearingDeg)}° — Click to turn rotor`}
                    </title>
                    <circle cx={dot.x} cy={dot.y} r="5" fill="transparent" />
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={dot.inBeam ? 4.2 : 3.2}
                      fill={glow}
                      opacity={dot.inBeam ? 0.34 : 0.2}
                      pointerEvents="none"
                    />
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={dot.isBeacon ? 1.6 : 2.1}
                      fill={fill}
                      stroke={dot.inBeam ? '#ffffff' : 'none'}
                      strokeWidth={dot.inBeam ? 0.65 : 0}
                    />
                    {!dot.isBeacon && (
                      <text
                        x={dot.x}
                        y={dot.y - 3.6}
                        textAnchor="middle"
                        fill={fill}
                        fontSize="4.1"
                        fontWeight="700"
                        fontFamily="JetBrains Mono"
                        pointerEvents="none"
                      >
                        {dot.callsign}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Spherical Lighting Sheen */}
              <circle cx="50" cy="50" r="42.5" fill="url(#rotor-globe-sheen)" pointerEvents="none" />
            </g>

            <line x1="50" y1="8" x2="50" y2="92" stroke="#335375" strokeWidth="0.5" opacity="0.5" pointerEvents="none" />
            <line x1="8" y1="50" x2="92" y2="50" stroke="#335375" strokeWidth="0.5" opacity="0.5" pointerEvents="none" />
            <text x="50" y="13.5" textAnchor="middle" fill="#cbd5e1" fontSize="6.2" fontWeight="700" fontFamily="JetBrains Mono" pointerEvents="none">N</text>
            <text x="88" y="52" textAnchor="middle" fill="#cbd5e1" fontSize="6.2" fontWeight="700" fontFamily="JetBrains Mono" pointerEvents="none">E</text>
            <text x="50" y="90.5" textAnchor="middle" fill="#cbd5e1" fontSize="6.2" fontWeight="700" fontFamily="JetBrains Mono" pointerEvents="none">S</text>
            <text x="12" y="52" textAnchor="middle" fill="#cbd5e1" fontSize="6.2" fontWeight="700" fontFamily="JetBrains Mono" pointerEvents="none">W</text>

            {ant.isDirectional ? (
              <path d={beamPath} fill="rgba(56, 189, 248, 0.25)" stroke="rgba(125, 211, 252, 0.65)" strokeWidth="0.9" pointerEvents="none" />
            ) : (
              <circle cx="50" cy="50" r="34" fill="rgba(56, 189, 248, 0.14)" stroke="rgba(125, 211, 252, 0.5)" strokeWidth="0.9" pointerEvents="none" />
            )}

            {/* Target tick */}
            <circle cx={targetTip.x} cy={targetTip.y} r="2.3" fill="#f59e0b" pointerEvents="none" />

            {/* Current heading needle & QTH center dot */}
            <line x1="50" y1="50" x2={tip.x} y2={tip.y} stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" pointerEvents="none" />
            <circle cx="50" cy="50" r="2.6" fill="#22c55e" stroke="#e2f8ec" strokeWidth="0.8" pointerEvents="none" />
          </svg>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'N', deg: 0 },
            { label: 'E', deg: 90 },
            { label: 'S', deg: 180 },
            { label: 'W', deg: 270 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={!ant.isRotatable}
              data-testid={`rotor-preset-${preset.label}`}
              onClick={() => onSetRotorTarget(preset.deg)}
              className={`py-0.5 rounded text-[9px] font-mono-tabular border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                !ant.isRotatable
                  ? 'bg-[#0a1019] border-[#1f3045] text-slate-500'
                  : rotorTargetDeg === preset.deg
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300 cursor-pointer'
                  : 'bg-[#0a1019] border-[#1f3045] text-slate-400 hover:border-sky-400/50 hover:text-white cursor-pointer'
              }`}
              title={ant.isRotatable ? `Point rotor ${preset.label} (${preset.deg}°)` : 'Rotator disabled for non-rotatable antenna'}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {/* BAND SMALL BUTTONS */}
      <section className="sdr-panel rounded-md p-1.5 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-1">
          <h2 className="text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            Band
          </h2>
          <span className="text-[9px] font-mono-tabular text-sky-300">
            {BANDS.find((b) => b.id === activeBand)?.rangeLabel ?? 'HF'} MHz
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1" role="listbox" aria-label="Amateur Radio Bands">
          {BANDS.map((band) => {
            const active = band.id === activeBand;
            return (
              <button
                key={band.id}
                type="button"
                onClick={() => onSelectBand(band.id)}
                title={`${band.label}: ${band.rangeLabel} MHz`}
                className={`py-0.5 px-0 rounded text-[10px] font-mono-tabular tracking-tight transition-colors cursor-pointer border text-center ${
                  active
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold shadow-[0_0_8px_rgba(34,184,255,0.3)]'
                    : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
                aria-pressed={active}
                aria-label={`${band.label} ${band.rangeLabel}`}
              >
                {band.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* PROPAGATION CONDITIONS */}
      <section className="sdr-panel rounded-md p-1.5 flex-1 flex flex-col justify-between gap-1">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            <SunMedium className="w-3 h-3 text-amber-400" aria-hidden="true" />
            <span>Conditions</span>
          </div>
          <button
            type="button"
            onClick={onOpenPropagation}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[9px] font-mono-tabular text-sky-300 cursor-pointer"
            title="Open Full Ionospheric Propagation Studio"
          >
            <SlidersHorizontal className="w-2.5 h-2.5" aria-hidden="true" />
            <span>Studio</span>
          </button>
        </div>

        {/* Live Telemetry Readout */}
        <div
          className="grid grid-cols-3 gap-0.5 text-center font-mono-tabular text-[9px]"
          aria-label="Live Solar & Ionospheric Metrics"
        >
          <div className="rounded border border-[#1d2c3f] bg-[#080e16] py-0.5">
            <span className="text-slate-400">SFI </span>
            <span className="text-sky-300 font-semibold">{propagation.sfi}</span>
          </div>
          <div className="rounded border border-[#1d2c3f] bg-[#080e16] py-0.5">
            <span className="text-slate-400">K </span>
            <span className={propagation.kIndex >= 5 ? 'text-rose-300 font-semibold' : 'text-amber-300 font-semibold'}>
              {propagation.kIndex}
            </span>
          </div>
          <div className="rounded border border-[#1d2c3f] bg-[#080e16] py-0.5">
            <span className="text-slate-400">MUF </span>
            <span className="text-emerald-300 font-semibold">{bandCond.mufMhz}</span>
          </div>
        </div>

        {/* Quick Propagation Condition Presets */}
        <div className="grid grid-cols-4 gap-0.5" role="group" aria-label="Propagation Condition Presets">
          {PROPAGATION_PRESETS.map((preset) => {
            const active = propagation.presetName === preset.name;
            const shortLabel = PRESET_SHORT_LABELS[preset.name] ?? preset.name;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() =>
                  onUpdatePropagation({
                    ...preset.conditions,
                    utcHour: preset.name === 'Quiet Low-Band Night' ? 2 : preset.name === 'Solar Max Opening' ? 14 : propagation.utcHour,
                  })
                }
                aria-pressed={active}
                aria-label={`Condition ${preset.name}`}
                title={`Apply ${preset.name} propagation preset`}
                className={`h-[18px] rounded text-[8.5px] font-display font-semibold tracking-tight border transition-colors cursor-pointer flex items-center justify-center ${
                  active
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                    : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
              >
                {shortLabel}
              </button>
            );
          })}
        </div>

        {/* Phenomenon Toggles + Simulated UTC */}
        <div className="flex items-center justify-between gap-0.5" role="group" aria-label="Ionospheric Phenomenon Toggles">
          <button
            type="button"
            onClick={() =>
              onUpdatePropagation({
                ...propagation,
                sporadicE: !propagation.sporadicE,
                presetName: 'Custom',
              })
            }
            aria-pressed={propagation.sporadicE}
            className={`px-1.5 h-[17px] rounded text-[8.5px] font-mono-tabular border cursor-pointer transition-colors ${
              propagation.sporadicE
                ? 'bg-sky-500/25 border-sky-400 text-sky-200 font-semibold'
                : 'bg-[#0a1019] border-[#1f3045] text-slate-400 hover:text-white'
            }`}
            title="Toggle Sporadic-E high-band skip openings"
          >
            Es
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePropagation({
                ...propagation,
                greylineBoost: !propagation.greylineBoost,
                presetName: 'Custom',
              })
            }
            aria-pressed={propagation.greylineBoost}
            className={`px-1.5 h-[17px] rounded text-[8.5px] font-mono-tabular border cursor-pointer transition-colors ${
              propagation.greylineBoost
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-semibold'
                : 'bg-[#0a1019] border-[#1f3045] text-slate-400 hover:text-white'
            }`}
            title="Toggle Greyline dawn/dusk DX ducting"
          >
            Grey
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePropagation({
                ...propagation,
                auroraActive: !propagation.auroraActive,
                presetName: 'Custom',
              })
            }
            aria-pressed={propagation.auroraActive}
            className={`px-1.5 h-[17px] rounded text-[8.5px] font-mono-tabular border cursor-pointer transition-colors ${
              propagation.auroraActive
                ? 'bg-purple-500/25 border-purple-400 text-purple-200 font-semibold'
                : 'bg-[#0a1019] border-[#1f3045] text-slate-400 hover:text-white'
            }`}
            title="Toggle Aurora flutter & polar static"
          >
            Aur
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePropagation({
                ...propagation,
                utcHour: (Math.floor(propagation.utcHour) + 4) % 24,
                presetName: 'Custom',
              })
            }
            className="flex-1 h-[17px] rounded text-[8.5px] font-mono-tabular border border-[#1f3045] bg-[#0a1019] hover:border-sky-400/50 text-slate-300 hover:text-white cursor-pointer"
            title="Advance simulated UTC solar time by +4 hours"
          >
            {String(Math.floor(propagation.utcHour)).padStart(2, '0')}Z
          </button>
        </div>
      </section>
    </aside>
  );
};
