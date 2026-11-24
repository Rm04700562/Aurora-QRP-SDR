import React from 'react';
import { BookMarked, ChevronRight, Minus, Plus } from 'lucide-react';
import { StepSizeHz, TuneSpeed } from '../types/radio';

const STEP_OPTIONS: StepSizeHz[] = [1, 10, 100, 1000, 5000];
const TUNE_SPEEDS: TuneSpeed[] = ['Fine', 'Fast', 'Memory'];
const FILTER_PRESETS = [0.5, 1.0, 2.0, 2.4, 4.0, 6.0];

interface CompactGainControlProps {
  label: string;
  value: number;
  displayValue: string;
  step?: number;
  onChange: (next: number) => void;
}

const CompactGainControl: React.FC<CompactGainControlProps> = ({
  label,
  value,
  displayValue,
  step = 5,
  onChange,
}) => {
  const dec = () => onChange(Math.max(0, value - step));
  const inc = () => onChange(Math.min(100, value + step));

  return (
    <div className="sdr-panel rounded px-1.5 py-1 flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] leading-none">
        <span className="font-display font-semibold uppercase tracking-wide text-slate-300 truncate">
          {label}
        </span>
        <span className="font-mono-tabular font-semibold text-sky-400">{displayValue}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={dec}
          aria-label={`Decrease ${label}`}
          className="w-4 h-4 rounded border border-[#25374d] bg-[#0a1019] hover:border-sky-400 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Minus className="w-2.5 h-2.5" />
        </button>

        <input
          type="range"
          aria-label={label}
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 accent-sky-400 cursor-pointer"
        />

        <button
          type="button"
          onClick={inc}
          aria-label={`Increase ${label}`}
          className="w-4 h-4 rounded border border-[#25374d] bg-[#0a1019] hover:border-sky-400 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

interface DspControlPanelProps {
  filterWidthKhz: number;
  onChangeFilterWidth: (khz: number) => void;
  rfGainPct: number;
  onChangeRfGain: (pct: number) => void;
  afGainPct: number;
  onChangeAfGain: (pct: number) => void;
  noiseReductionPct: number;
  onChangeNoiseReduction: (pct: number) => void;
  notchPct: number;
  onChangeNotch: (pct: number) => void;
  stepHz: StepSizeHz;
  onChangeStepHz: (hz: StepSizeHz) => void;
  tuneSpeed: TuneSpeed;
  onChangeTuneSpeed: (speed: TuneSpeed) => void;
  onOpenQsoLog: () => void;
  qsoCount: number;
}

export const DspControlPanel: React.FC<DspControlPanelProps> = ({
  filterWidthKhz,
  onChangeFilterWidth,
  rfGainPct,
  onChangeRfGain,
  afGainPct,
  onChangeAfGain,
  noiseReductionPct,
  onChangeNoiseReduction,
  notchPct,
  onChangeNotch,
  stepHz,
  onChangeStepHz,
  tuneSpeed,
  onChangeTuneSpeed,
  onOpenQsoLog,
  qsoCount,
}) => {
  return (
    <div className="flex flex-col gap-1.5 flex-1">
      {/* FILTER WIDTH SMALL BUTTONS */}
      <section className="sdr-panel rounded-md p-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            Filter
          </span>
          <span className="font-mono-tabular text-[11px] font-semibold text-sky-400">
            {filterWidthKhz.toFixed(1)} kHz
          </span>
        </div>

        <div className="grid grid-cols-6 gap-1" role="group" aria-label="Filter Width Presets">
          {FILTER_PRESETS.map((preset) => {
            const active = Math.abs(filterWidthKhz - preset) < 0.08;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChangeFilterWidth(preset)}
                aria-pressed={active}
                className={`py-1 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer ${
                  active
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                    : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </section>

      {/* COMPACT 2x2 GAIN & DSP BUTTONS */}
      <div className="grid grid-cols-2 gap-1">
        <CompactGainControl
          label="RF Gain"
          value={rfGainPct}
          displayValue={`${rfGainPct}%`}
          onChange={onChangeRfGain}
        />
        <CompactGainControl
          label="AF Gain"
          value={afGainPct}
          displayValue={`${afGainPct}%`}
          onChange={onChangeAfGain}
        />
        <CompactGainControl
          label="Noise Red."
          value={noiseReductionPct}
          displayValue={`${noiseReductionPct}%`}
          onChange={onChangeNoiseReduction}
        />
        <CompactGainControl
          label="Notch"
          value={notchPct}
          displayValue={notchPct === 0 ? 'Off' : `${notchPct}%`}
          step={10}
          onChange={onChangeNotch}
        />
      </div>

      {/* STEP / TUNE SMALL BUTTONS + QSO LOG */}
      <section className="sdr-panel rounded-md p-1.5 flex-1 flex flex-col justify-between gap-1.5">
        <div className="flex flex-col gap-1">
          <div>
            <div className="flex items-center justify-between mb-0.5 leading-none">
              <span className="text-[9px] font-display font-semibold uppercase tracking-wider text-slate-400">
                Step
              </span>
              <span className="text-[9px] font-mono-tabular text-sky-400">
                {stepHz >= 1000 ? `${stepHz / 1000} kHz` : `${stepHz} Hz`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-0.5" role="group" aria-label="Tuning Step">
              {STEP_OPTIONS.map((hz) => {
                const active = stepHz === hz;
                const label = hz >= 1000 ? `${hz / 1000}k` : String(hz);
                const fullLabel = hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
                return (
                  <button
                    key={hz}
                    type="button"
                    onClick={() => onChangeStepHz(hz)}
                    aria-pressed={active}
                    aria-label={`Step ${fullLabel}`}
                    title={`Set tuning step to ${fullLabel}`}
                    className={`h-[18px] rounded text-[9px] font-mono-tabular border transition-colors cursor-pointer flex items-center justify-center ${
                      active
                        ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                        : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5 leading-none">
              <span className="text-[9px] font-display font-semibold uppercase tracking-wider text-slate-400">
                Tune
              </span>
            </div>
            <div className="grid grid-cols-3 gap-0.5" role="group" aria-label="Tune Speed">
              {TUNE_SPEEDS.map((speed) => {
                const active = tuneSpeed === speed;
                const shortLabel = speed === 'Memory' ? 'Mem' : speed;
                return (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => onChangeTuneSpeed(speed)}
                    aria-pressed={active}
                    aria-label={`Tune ${speed}`}
                    title={`${speed} dial speed`}
                    className={`h-[18px] rounded text-[9px] font-display uppercase tracking-wide border transition-colors cursor-pointer flex items-center justify-center ${
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
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenQsoLog}
          className="w-full flex items-center justify-between px-2 py-1 rounded border border-[#25374d] bg-[#0b121d] hover:border-sky-400/60 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <BookMarked className="w-3 h-3 text-sky-400" aria-hidden="true" />
            <span>QSO Log ({qsoCount})</span>
          </span>
          <ChevronRight className="w-3 h-3 text-slate-400" />
        </button>
      </section>
    </div>
  );
};
