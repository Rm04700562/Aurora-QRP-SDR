import React from 'react';
import { Activity, BookMarked, ChevronRight, Minus, Plus, SlidersHorizontal, Zap } from 'lucide-react';
import { isSwrHigh, MAX_TX_POWER_W, MIN_TX_POWER_W, PaGainDb } from '../radio/physics';
import { RotaryKnob } from './RotaryKnob';

const FILTER_PRESETS = [0.5, 1.0, 2.0, 2.4, 4.0, 6.0];
const POWER_PRESETS_W = [5, 15, 50, 100];

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
    <div className="sdr-panel rounded px-1.5 py-0.5 flex flex-col gap-0.5">
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
  noiseBlankerPct: number;
  onChangeNoiseBlanker: (pct: number) => void;
  txPowerW: number;
  deliveredPowerW: number;
  onChangeTxPower: (watts: number) => void;
  currentSwr: number;
  isTuningAtu: boolean;
  onRunAtuTune: () => void;
  paEnabled: boolean;
  paGainDb: PaGainDb;
  paTripped: boolean;
  paOutputW: number;
  isTransmitting: boolean;
  onTogglePa: () => void;
  onChangePaGain: (gainDb: PaGainDb) => void;
  isPoweredOn: boolean;
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
  noiseBlankerPct,
  onChangeNoiseBlanker,
  txPowerW,
  deliveredPowerW,
  onChangeTxPower,
  currentSwr,
  isTuningAtu,
  onRunAtuTune,
  paEnabled,
  paGainDb,
  paTripped,
  paOutputW,
  isTransmitting,
  onTogglePa,
  onChangePaGain,
  isPoweredOn,
  onOpenQsoLog,
  qsoCount,
}) => {
  const highSwr = isPoweredOn && isSwrHigh(currentSwr);
  const foldbackActive = isPoweredOn && !paEnabled && deliveredPowerW < txPowerW - 0.2;
  return (
    <div className="flex flex-col gap-1 flex-1">
      {/* FILTER WIDTH SMALL BUTTONS */}
      <section className="sdr-panel rounded-md p-1">
        <div className="flex items-center justify-between mb-0.5">
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
                className={`py-0.5 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer ${
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
        <div
          data-testid="noise-blanker-control"
          className="col-span-2 sdr-panel rounded px-1.5 py-0.5 flex items-center gap-1.5"
        >
          <span className="text-[10px] font-display font-semibold uppercase tracking-wide text-slate-300 whitespace-nowrap shrink-0">
            NB Thresh
          </span>
          <button
            type="button"
            onClick={() => onChangeNoiseBlanker(Math.max(0, noiseBlankerPct - 10))}
            aria-label="Decrease Noise Blanker"
            className="w-4 h-4 rounded border border-[#25374d] bg-[#0a1019] hover:border-sky-400 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <input
            type="range"
            aria-label="Noise Blanker"
            min={0}
            max={100}
            step={1}
            value={noiseBlankerPct}
            onChange={(e) => onChangeNoiseBlanker(Number(e.target.value))}
            className="flex-1 min-w-0 h-1.5 accent-sky-400 cursor-pointer"
          />
          <button
            type="button"
            onClick={() => onChangeNoiseBlanker(Math.min(100, noiseBlankerPct + 10))}
            aria-label="Increase Noise Blanker"
            className="w-4 h-4 rounded border border-[#25374d] bg-[#0a1019] hover:border-sky-400 text-slate-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
          <span
            data-testid="noise-blanker-readout"
            className={`text-[10px] font-mono-tabular font-semibold whitespace-nowrap shrink-0 w-8 text-right ${
              noiseBlankerPct > 0 ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {noiseBlankerPct === 0 ? 'Off' : `${noiseBlankerPct}%`}
          </span>
        </div>
      </div>

      {/* RF TX POWER SELECTOR KNOB (1W - 100W, 15W Startup Default) */}
      <section className="sdr-panel rounded-md p-1" data-testid="tx-power-panel">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            <Zap className="w-3 h-3 text-sky-400" aria-hidden="true" />
            <span>RF Output</span>
          </div>
          <span
            className={`font-mono-tabular text-[10px] font-semibold ${
              !isPoweredOn ? 'text-slate-500' : foldbackActive ? 'text-amber-300' : 'text-emerald-300'
            }`}
            title={
              foldbackActive
                ? 'SWR foldback is limiting forward RF output power'
                : 'Actual forward RF output into antenna feedline'
            }
          >
            {isPoweredOn
              ? foldbackActive
                ? `Fold ${deliveredPowerW.toFixed(1)}W`
                : `Out ${deliveredPowerW.toFixed(0)}W`
              : '0W'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <RotaryKnob
            testId="tx-power-knob"
            label="Power"
            ariaLabel="RF Output Power Selector"
            value={txPowerW}
            min={MIN_TX_POWER_W}
            max={MAX_TX_POWER_W}
            step={1}
            displayValue={`${Math.round(txPowerW)}W`}
            onChange={onChangeTxPower}
            size="sm"
            disabled={!isPoweredOn}
          />

          <div className="flex-1 grid grid-cols-2 gap-1" role="group" aria-label="RF Power Presets">
            {POWER_PRESETS_W.map((watts) => {
              const active = Math.abs(txPowerW - watts) < 0.5;
              return (
                <button
                  key={watts}
                  type="button"
                  disabled={!isPoweredOn}
                  onClick={() => onChangeTxPower(watts)}
                  aria-pressed={active}
                  className={`py-0.5 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                      : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                  }`}
                >
                  {watts}W
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ANTENNA TUNER + SMALL POWER AMPLIFIER + QSO LOG */}
      <section className="sdr-panel rounded-md p-1 flex-1 flex flex-col justify-between gap-1">
        <div className="flex flex-col gap-0.5" data-testid="atu-panel-above-log">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
              <SlidersHorizontal className="w-3 h-3 text-sky-400" aria-hidden="true" />
              <span>Antenna Tuner</span>
            </div>
            <span
              className={`font-mono-tabular text-[10px] font-semibold ${
                !isPoweredOn ? 'text-slate-500' : highSwr ? 'text-red-400' : 'text-emerald-300'
              }`}
            >
              {isPoweredOn ? `SWR ${currentSwr.toFixed(1)}` : 'STANDBY'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[#1c2c40] bg-[#060b12] font-mono-tabular text-[10px] truncate">
              {!isPoweredOn ? (
                <span className="text-slate-500">Power on radio</span>
              ) : isTuningAtu ? (
                <span className="text-amber-300">Matching L/C...</span>
              ) : highSwr ? (
                <span className="text-red-300">High SWR (&gt; 1.6)</span>
              ) : (
                <span className="text-sky-300">ATU Matched</span>
              )}
            </div>

            <button
              type="button"
              onClick={onRunAtuTune}
              disabled={!isPoweredOn || isTuningAtu}
              data-testid="atu-tune-button"
              className={`px-2 py-0.5 rounded border text-[10px] font-display font-bold tracking-wider uppercase cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                isTuningAtu
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : highSwr
                  ? 'bg-red-500/20 border-red-400 text-red-200 hover:bg-red-500 hover:text-white'
                  : 'bg-[#0e1725] border-[#2b425e] text-slate-200 hover:border-sky-400'
              }`}
              title="Run Automatic Antenna Tuner (ATU) to minimize SWR"
            >
              {isTuningAtu ? 'Tuning...' : 'Tune'}
            </button>
          </div>
        </div>

        {/* SMALL SOLID-STATE LINEAR POWER AMPLIFIER */}
        <div
          className="border-t border-[#182536] pt-1 flex flex-col gap-0.5"
          data-testid="power-amp-panel"
          data-pa-active={isPoweredOn && paEnabled && !paTripped ? 'true' : 'false'}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
              <Activity
                className={`w-3 h-3 ${
                  !isPoweredOn
                    ? 'text-slate-600'
                    : paTripped
                    ? 'text-red-400'
                    : paEnabled && isTransmitting
                    ? 'text-rose-400'
                    : paEnabled
                    ? 'text-emerald-400'
                    : 'text-slate-400'
                }`}
                aria-hidden="true"
              />
              <span>Power Amp</span>
            </div>
            <span
              data-testid="pa-output-readout"
              className={`font-mono-tabular text-[10px] font-semibold whitespace-nowrap ${
                !isPoweredOn
                  ? 'text-slate-500'
                  : paTripped
                  ? 'text-red-400'
                  : paEnabled && isTransmitting
                  ? 'text-rose-300'
                  : paEnabled
                  ? 'text-emerald-300'
                  : 'text-slate-400'
              }`}
              title="Linear PA output status (500W max; trips safely above 2.0 SWR)"
            >
              {!isPoweredOn
                ? 'OFF'
                : paTripped
                ? 'SWR PROT'
                : paEnabled
                ? `${isTransmitting ? 'TX ' : ''}${paOutputW.toFixed(0)}W`
                : 'STBY'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={onTogglePa}
              disabled={!isPoweredOn}
              aria-pressed={paEnabled && isPoweredOn}
              data-testid="pa-toggle-button"
              className={`px-2 py-0.5 rounded border text-[10px] font-display font-bold uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                !isPoweredOn
                  ? 'bg-[#0a1019] border-[#1c2a3c] text-slate-500'
                  : paTripped
                  ? 'bg-red-500/20 border-red-400 text-red-200'
                  : paEnabled
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-[#0a1019] border-[#25374d] text-slate-300 hover:border-sky-400/60 hover:text-white'
              }`}
              title="Toggle external 500W solid-state linear power amplifier"
            >
              {paEnabled ? 'PA On' : 'PA Off'}
            </button>

            <div className="flex items-center gap-0.5" role="group" aria-label="Power Amplifier Gain Stage">
              <button
                type="button"
                disabled={!isPoweredOn}
                onClick={() => onChangePaGain(7)}
                aria-pressed={paGainDb === 7}
                data-testid="pa-gain-5x"
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular cursor-pointer transition-colors whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
                  paGainDb === 7
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                    : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
                title="+7 dB gain stage (5x exciter drive)"
              >
                5x
              </button>
              <button
                type="button"
                disabled={!isPoweredOn}
                onClick={() => onChangePaGain(10)}
                aria-pressed={paGainDb === 10}
                data-testid="pa-gain-10x"
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular cursor-pointer transition-colors whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
                  paGainDb === 10
                    ? 'bg-sky-500 border-sky-400 text-slate-950 font-bold'
                    : 'bg-[#0a1019] border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
                title="+10 dB gain stage (10x exciter drive, 500W max)"
              >
                10x
              </button>
            </div>

            <span className="font-mono-tabular text-[10px] text-slate-400 whitespace-nowrap shrink-0">
              +{paGainDb}dB
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenQsoLog}
          className="w-full flex items-center justify-between px-2 py-0.5 rounded border border-[#25374d] bg-[#0b121d] hover:border-sky-400/60 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 transition-colors cursor-pointer"
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
