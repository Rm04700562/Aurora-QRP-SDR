import React, { useMemo } from 'react';
import { Globe2, RefreshCw, Sparkles, SunMedium, X } from 'lucide-react';
import {
  BANDS,
  evaluateAllWorldRegions,
  evaluateBandCondition,
  PROPAGATION_PRESETS,
  PropagationRating,
} from '../radio/physics';
import { PropagationConditions, QthLocation } from '../types/radio';

interface PropagationModalProps {
  open: boolean;
  conditions: PropagationConditions;
  qth?: QthLocation;
  onChange: (next: PropagationConditions) => void;
  onRefreshHourly?: () => void;
  isRefreshingHourly?: boolean;
  onClose: () => void;
}

const CELL_STYLES: Record<PropagationRating, { badge: string; short: string }> = {
  Excellent: { badge: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/15', short: 'EXC' },
  Good: { badge: 'text-sky-300 border-sky-500/40 bg-sky-500/15', short: 'GOOD' },
  Fair: { badge: 'text-amber-300 border-amber-500/40 bg-amber-500/15', short: 'FAIR' },
  Poor: { badge: 'text-rose-300 border-rose-500/40 bg-rose-500/15', short: 'POOR' },
  Aurora: { badge: 'text-purple-300 border-purple-500/40 bg-purple-500/15', short: 'AUR' },
};

export const PropagationModal: React.FC<PropagationModalProps> = ({
  open,
  conditions,
  qth,
  onChange,
  onRefreshHourly,
  isRefreshingHourly = false,
  onClose,
}) => {
  const worldRegions = useMemo(
    () => (open ? evaluateAllWorldRegions(conditions) : []),
    [open, conditions]
  );

  if (!open) return null;

  const updateField = <K extends keyof PropagationConditions>(key: K, val: PropagationConditions[K]) => {
    onChange({
      ...conditions,
      [key]: val,
      presetName: 'Custom',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prop-modal-title"
    >
      <div className="sdr-panel rounded-lg max-w-4xl w-full max-h-[92dvh] overflow-y-auto p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 border-b border-[#1d2c3f] pb-2.5">
          <div className="flex items-center gap-2">
            <SunMedium className="w-5 h-5 text-sky-400 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="prop-modal-title" className="font-display text-lg font-bold text-white">
                Global Ionospheric Propagation Studio
              </h2>
              <p className="text-xs text-slate-400">
                Auto-updates all world regions hourly at :00 UTC ({conditions.sourceLabel ?? 'Hourly Feed'}
                {conditions.lastUpdatedUtc ? ` · Updated ${conditions.lastUpdatedUtc}` : ''}
                {conditions.nextUpdateUtc ? ` · Next ${conditions.nextUpdateUtc}` : ''})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRefreshHourly && (
              <button
                type="button"
                onClick={onRefreshHourly}
                disabled={isRefreshingHourly}
                data-testid="modal-refresh-hourly-btn"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-400/50 bg-sky-500/15 hover:bg-sky-500/25 text-xs font-medium text-sky-200 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHourly ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{isRefreshingHourly ? 'Syncing...' : 'Sync Hourly Global'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close Propagation Studio"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 mr-1">Quick Presets:</span>
          {PROPAGATION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() =>
                onChange({
                  ...preset.conditions,
                  utcHour: conditions.utcHour,
                  timestampMs: conditions.timestampMs,
                })
              }
              className={`px-3 py-1.5 rounded text-xs font-medium border cursor-pointer transition-colors ${
                conditions.presetName === preset.name
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-[#0a1019] border-[#23344a] text-slate-300 hover:border-sky-400/50'
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="sdr-bezel rounded-md p-3 flex flex-col gap-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="sfi-slider" className="text-slate-200 font-medium">
                  Solar Flux Index (SFI)
                </label>
                <span className="font-mono-tabular text-sky-400 font-semibold">{conditions.sfi}</span>
              </div>
              <input
                id="sfi-slider"
                type="range"
                min={65}
                max={250}
                value={conditions.sfi}
                onChange={(e) => updateField('sfi', Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                Higher SFI (150+) ionizes the F2 layer and opens high bands (15m, 12m, 10m) for worldwide DX.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="kindex-slider" className="text-slate-200 font-medium">
                  Geomagnetic K-Index
                </label>
                <span className="font-mono-tabular text-amber-300 font-semibold">K{conditions.kIndex}</span>
              </div>
              <input
                id="kindex-slider"
                type="range"
                min={0}
                max={9}
                value={conditions.kIndex}
                onChange={(e) => {
                  const k = Number(e.target.value);
                  onChange({
                    ...conditions,
                    kIndex: k,
                    aIndex: Math.round(Math.pow(2, k * 0.8) * 2),
                    auroraActive: k >= 6 ? true : conditions.auroraActive,
                    presetName: 'Custom',
                  });
                }}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                K0–K2 is quiet and great for DX. K5+ indicates geomagnetic storms that raise static and absorb polar paths.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="utc-slider" className="text-slate-200 font-medium">
                  Simulated UTC Solar Time
                </label>
                <span className="font-mono-tabular text-sky-300 font-semibold">
                  {String(Math.floor(conditions.utcHour)).padStart(2, '0')}:00 UTC
                </span>
              </div>
              <input
                id="utc-slider"
                type="range"
                min={0}
                max={23}
                value={Math.floor(conditions.utcHour)}
                onChange={(e) => updateField('utcHour', Number(e.target.value))}
                className="w-full accent-sky-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                Rotates the sunlit F2 belt and day/night greyline terminator across all continents around the Earth.
              </p>
            </div>
          </div>

          <div className="sdr-bezel rounded-md p-3 flex flex-col justify-between gap-3">
            <div className="flex flex-col gap-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conditions.auroraActive}
                  onChange={(e) => updateField('auroraActive', e.target.checked)}
                  className="mt-0.5 accent-purple-400"
                />
                <div>
                  <div className="text-xs font-medium text-slate-100">Aurora Flutter & Scatter</div>
                  <div className="text-[11px] text-slate-400">
                    Adds characteristic auroral rasp/flutter modulation to polar signals and elevates QRN static.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conditions.sporadicE}
                  onChange={(e) => updateField('sporadicE', e.target.checked)}
                  className="mt-0.5 accent-sky-400"
                />
                <div>
                  <div className="text-xs font-medium text-slate-100">Sporadic-E (Es) Cloud Openings</div>
                  <div className="text-[11px] text-slate-400">
                    Enables surprise medium-range skips on 15m, 12m, and 10m even when F2 MUF is low.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={conditions.greylineBoost}
                  onChange={(e) => updateField('greylineBoost', e.target.checked)}
                  className="mt-0.5 accent-emerald-400"
                />
                <div>
                  <div className="text-xs font-medium text-slate-100">Greyline Dawn/Dusk Ducting</div>
                  <div className="text-[11px] text-slate-400">
                    Reduces long-path attenuation along the day/night terminator for 100W SDR DX contacts.
                  </div>
                </div>
              </label>
            </div>

            <div className="rounded bg-[#0c1624] border border-[#22354c] p-2.5 text-xs text-slate-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Global hourly updates automatically broadcast across all connected stations and recalculate worldwide path loss and S-meters.
              </span>
            </div>
          </div>
        </div>

        {/* Whole-World Regional HF Matrix */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="flex items-center gap-1.5 text-xs font-display font-semibold uppercase tracking-wider text-slate-200">
              <Globe2 className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>Worldwide Hourly HF Propagation Matrix</span>
            </h3>
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {String(Math.floor(conditions.utcHour)).padStart(2, '0')}:00 UTC Solar Snapshot
            </span>
          </div>
          <div className="overflow-x-auto rounded border border-[#1d2c3f] bg-[#070d16]">
            <table className="w-full text-[10.5px] font-mono-tabular border-collapse" data-testid="world-propagation-matrix">
              <thead>
                <tr className="border-b border-[#1d2c3f] text-slate-400 bg-[#0b1320]">
                  <th className="text-left px-2 py-1.5 font-display">Region</th>
                  <th className="text-center px-1.5 py-1.5">Solar</th>
                  <th className="text-center px-1.5 py-1.5">MUF</th>
                  {BANDS.map((b) => (
                    <th key={b.id} className="text-center px-1 py-1.5">
                      {b.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {worldRegions.map((reg) => (
                  <tr key={reg.id} className="border-b border-[#142030] last:border-b-0">
                    <td className="px-2 py-1 text-slate-200 font-medium whitespace-nowrap">{reg.name}</td>
                    <td className="px-1.5 py-1 text-center text-slate-300 whitespace-nowrap">
                      {reg.solarPhase}
                    </td>
                    <td className="px-1.5 py-1 text-center text-sky-300 font-semibold whitespace-nowrap">
                      {reg.localMufMhz}
                    </td>
                    {BANDS.map((b) => {
                      const rating = reg.bands[b.id];
                      const st = CELL_STYLES[rating];
                      return (
                        <td key={b.id} className="p-0.5 text-center">
                          <span
                            className={`inline-block w-full rounded border px-1 py-0.5 text-[9.5px] font-semibold ${st.badge}`}
                          >
                            {st.short}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Local QTH Band-by-Band Matrix */}
        <div>
          <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Station QTH HF Band Forecast {qth ? `(${qth.grid})` : ''}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {BANDS.map((b) => {
              const ev = evaluateBandCondition(b.id, conditions, qth);
              const badgeColor = CELL_STYLES[ev.rating].badge;
              return (
                <div key={b.id} className={`rounded border px-2 py-1.5 ${badgeColor}`}>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="font-display">{b.label}</span>
                    <span>{ev.rating}</span>
                  </div>
                  <div className="text-[9.5px] font-mono-tabular opacity-85 mt-0.5 whitespace-nowrap">
                    MUF {ev.mufMhz} · {ev.noiseDbm} dBm
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
