import React from 'react';
import { Sparkles, SunMedium, X } from 'lucide-react';
import { BANDS, evaluateBandCondition, PROPAGATION_PRESETS } from '../radio/physics';
import { PropagationConditions } from '../types/radio';

interface PropagationModalProps {
  open: boolean;
  conditions: PropagationConditions;
  onChange: (next: PropagationConditions) => void;
  onClose: () => void;
}

export const PropagationModal: React.FC<PropagationModalProps> = ({
  open,
  conditions,
  onChange,
  onClose,
}) => {
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
      <div className="sdr-panel rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <SunMedium className="w-5 h-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2 id="prop-modal-title" className="font-display text-lg font-bold text-white">
                Virtual Ionospheric Propagation Studio
              </h2>
              <p className="text-xs text-slate-400">
                Simulate solar flux, geomagnetic storms, and day/night MUF openings across all HF bands.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close Propagation Studio"
          >
            <X className="w-4 h-4" />
          </button>
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
                Daytime boosts higher bands (20m–10m) while nighttime eliminates D-layer absorption on 40m/80m/160m.
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
                    Reduces long-path attenuation along the day/night terminator for 5W QRP DX contacts.
                  </div>
                </div>
              </label>
            </div>

            <div className="rounded bg-[#0c1624] border border-[#22354c] p-2.5 text-xs text-slate-300 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Changes propagate live across connected operators in the VOIP mesh and immediately update S-meters and waterfall signals.
              </span>
            </div>
          </div>
        </div>

        {/* Band-by-Band Matrix */}
        <div>
          <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-slate-300 mb-2">
            Live HF Band Forecast
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {BANDS.map((b) => {
              const ev = evaluateBandCondition(b.id, conditions);
              const badgeColor =
                ev.rating === 'Excellent'
                  ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                  : ev.rating === 'Good'
                  ? 'text-sky-300 border-sky-500/40 bg-sky-500/10'
                  : ev.rating === 'Aurora'
                  ? 'text-purple-300 border-purple-500/40 bg-purple-500/10'
                  : ev.rating === 'Fair'
                  ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                  : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
              return (
                <div key={b.id} className={`rounded border px-2.5 py-2 ${badgeColor}`}>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="font-display">{b.label}</span>
                    <span>{ev.rating}</span>
                  </div>
                  <div className="text-[10px] font-mono-tabular opacity-80 mt-0.5">
                    QRN {ev.noiseDbm} dBm
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
