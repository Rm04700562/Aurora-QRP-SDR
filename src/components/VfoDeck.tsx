import React, { useRef, useState } from 'react';
import { formatFrequencyMhz } from '../radio/physics';
import { RadioMode, StepSizeHz, TuneSpeed } from '../types/radio';
import { computeWheelStepDirection } from '../utils/browserCompat';

const MODES: RadioMode[] = ['LSB', 'USB', 'CW', 'AM', 'FM', 'RTTY', 'SSTV', 'FT8', 'DIGITAL'];
const STEP_OPTIONS: StepSizeHz[] = [1, 10, 100, 1000, 5000];
const TUNE_SPEEDS: TuneSpeed[] = ['Fine', 'Fast', 'Memory'];

interface VfoDeckProps {
  activeVfo: 'A' | 'B';
  onSelectVfo: (vfo: 'A' | 'B') => void;
  onSwapVfo: () => void;
  frequencyHz: number;
  onTuneDelta: (deltaHz: number) => void;
  mode: RadioMode;
  onSelectMode: (mode: RadioMode) => void;
  isTransmitting: boolean;
  ritHz: number;
  xitHz: number;
  clarifierHz: number;
  onChangeRit: (hz: number) => void;
  onChangeXit: (hz: number) => void;
  onChangeClarifier: (hz: number) => void;
  stepHz: StepSizeHz;
  onChangeStepHz: (hz: StepSizeHz) => void;
  tuneSpeed: TuneSpeed;
  onChangeTuneSpeed: (speed: TuneSpeed) => void;
  isPoweredOn?: boolean;
}

export const VfoDeck: React.FC<VfoDeckProps> = ({
  activeVfo,
  onSelectVfo,
  onSwapVfo,
  frequencyHz,
  onTuneDelta,
  mode,
  onSelectMode,
  isTransmitting,
  ritHz,
  xitHz,
  clarifierHz,
  onChangeRit,
  onChangeXit,
  onChangeClarifier,
  stepHz,
  onChangeStepHz,
  tuneSpeed,
  onChangeTuneSpeed,
  isPoweredOn = true,
}) => {
  const [dialAngle, setDialAngle] = useState(0);
  const lastAngleRef = useRef<number | null>(null);

  const formatted = formatFrequencyMhz(frequencyHz);
  const [mhzPart, khzPart, hzPart] = isPoweredOn ? formatted.split('.') : ['---', '---', '---'];

  const speedMultiplier = tuneSpeed === 'Fast' ? 10 : tuneSpeed === 'Memory' ? 25 : 1;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = computeWheelStepDirection(e.deltaY, e.deltaMode);
    if (dir === 0) return;
    setDialAngle((prev) => (prev + dir * 18) % 360);
    onTuneDelta(dir * stepHz * speedMultiplier);
  };

  const getPointerAngle = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
  };

  const handleDialDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastAngleRef.current = getPointerAngle(e);
  };

  const handleDialMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lastAngleRef.current === null) return;
    const cur = getPointerAngle(e);
    let delta = cur - lastAngleRef.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) >= 4) {
      lastAngleRef.current = cur;
      setDialAngle((prev) => (prev + delta) % 360);
      onTuneDelta(Math.sign(delta) * stepHz * speedMultiplier);
    }
  };

  const handleDialUp = (e: React.PointerEvent<HTMLDivElement>) => {
    lastAngleRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <section className="sdr-panel rounded-md px-2.5 py-1 flex flex-col gap-1">
      {/* VFO A / B & Main Frequency Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: RX / TX status + Quick Mode dropdown */}
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-display font-bold tracking-wider uppercase border ${
                isPoweredOn && !isTransmitting
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-[#0b111a] border-[#1f2e42] text-slate-600'
              }`}
            >
              RX
            </span>
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-display font-bold tracking-wider uppercase border ${
                isPoweredOn && isTransmitting
                  ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                  : 'bg-[#0b111a] border-[#1f2e42] text-slate-600'
              }`}
            >
              TX
            </span>
          </div>

          <label className="sr-only" htmlFor="vfo-quick-mode">
            Operating Mode
          </label>
          <select
            id="vfo-quick-mode"
            value={mode}
            onChange={(e) => onSelectMode(e.target.value as RadioMode)}
            className="px-2 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-[11px] font-mono-tabular text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Center: VFO A / B tabs + Compact Frequency Readout + VFO Tuning Knob */}
        <div className="flex items-center justify-center gap-3 flex-1 min-w-[220px]">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 mb-0.5">
              <button
                type="button"
                onClick={() => onSelectVfo('A')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-display font-semibold cursor-pointer transition-colors ${
                  activeVfo === 'A'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-[#0c1420] border border-[#23344a] text-slate-400 hover:text-white'
                }`}
              >
                VFO A
              </button>
              <button
                type="button"
                onClick={() => onSelectVfo('B')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-display font-semibold cursor-pointer transition-colors ${
                  activeVfo === 'B'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-[#0c1420] border border-[#23344a] text-slate-400 hover:text-white'
                }`}
              >
                VFO B
              </button>
              <button
                type="button"
                onClick={onSwapVfo}
                className="px-1.5 py-0.5 rounded text-[9.5px] font-mono-tabular bg-[#0c1420] border border-[#23344a] text-slate-300 hover:border-sky-400/50 cursor-pointer"
                title="Swap VFO A and VFO B frequencies"
              >
                A↔B
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="vfo-step-down-btn"
                onClick={() => {
                  setDialAngle((prev) => (prev - 18) % 360);
                  onTuneDelta(-stepHz * speedMultiplier);
                }}
                aria-label="Tune Frequency Down"
                title={`Tune down ${stepHz * speedMultiplier} Hz`}
                className="w-6 h-6 rounded border border-[#23344a] bg-[#0c1420] hover:border-sky-400/60 hover:text-white text-slate-300 font-mono-tabular text-sm leading-none flex items-center justify-center cursor-pointer shrink-0"
              >
                −
              </button>

              <div
                onWheel={handleWheel}
                className={`font-mono-tabular text-xl sm:text-[24px] font-bold tracking-tight leading-none select-none cursor-ns-resize flex items-baseline ${
                  isPoweredOn ? 'text-sky-400 cyan-readout-glow' : 'text-slate-600'
                }`}
                title="Scroll mouse wheel, tap −/+ buttons, or click digit groups to tune"
                data-testid="vfo-frequency-readout"
              >
                <button
                  type="button"
                  onClick={() => onTuneDelta(100_000)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onTuneDelta(-100_000);
                  }}
                  className="hover:text-sky-200 transition-colors cursor-pointer"
                  title="Click +100 kHz / Right-click -100 kHz"
                >
                  {mhzPart}
                </button>
                <span className="text-sky-500/80">.</span>
                <button
                  type="button"
                  onClick={() => onTuneDelta(1_000)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onTuneDelta(-1_000);
                  }}
                  className="hover:text-sky-200 transition-colors cursor-pointer"
                  title="Click +1 kHz / Right-click -1 kHz"
                >
                  {khzPart}
                </button>
                <span className="text-sky-500/80">.</span>
                <button
                  type="button"
                  onClick={() => onTuneDelta(stepHz)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onTuneDelta(-stepHz);
                  }}
                  className="text-sky-300 hover:text-white transition-colors cursor-pointer"
                  title={`Click +${stepHz} Hz / Right-click -${stepHz} Hz`}
                >
                  {hzPart}
                </button>
              </div>

              <button
                type="button"
                data-testid="vfo-step-up-btn"
                onClick={() => {
                  setDialAngle((prev) => (prev + 18) % 360);
                  onTuneDelta(stepHz * speedMultiplier);
                }}
                aria-label="Tune Frequency Up"
                title={`Tune up ${stepHz * speedMultiplier} Hz`}
                className="w-6 h-6 rounded border border-[#23344a] bg-[#0c1420] hover:border-sky-400/60 hover:text-white text-slate-300 font-mono-tabular text-sm leading-none flex items-center justify-center cursor-pointer shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {/* Brushed Metal Main VFO Dial next to Freq Display */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Main VFO Tuning Dial"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round((dialAngle + 360) % 360)}
            onPointerDown={handleDialDown}
            onPointerMove={handleDialMove}
            onPointerUp={handleDialUp}
            onPointerCancel={handleDialUp}
            onLostPointerCapture={handleDialUp}
            onWheel={handleWheel}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                setDialAngle((prev) => (prev + 18) % 360);
                onTuneDelta(stepHz * speedMultiplier);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                setDialAngle((prev) => (prev - 18) % 360);
                onTuneDelta(-stepHz * speedMultiplier);
              }
            }}
            className="touch-hold-control w-[40px] h-[40px] rounded-full border-2 border-[#394f69] bg-gradient-to-br from-[#2e3e52] via-[#131c28] to-[#0a0f17] shadow-[0_0_12px_rgba(34,184,255,0.22),inset_0_2px_4px_rgba(255,255,255,0.12)] flex items-center justify-center relative cursor-grab active:cursor-grabbing select-none shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            title="Spin or scroll wheel to tune VFO frequency"
          >
            <div
              className="w-[30px] h-[30px] rounded-full border border-[#1d2c3f] bg-gradient-to-b from-[#1e2a39] to-[#0d141e] relative"
              style={{ transform: `rotate(${dialAngle}deg)` }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#090e16] border border-sky-400/80 absolute top-1 left-1/2 -translate-x-1/2" />
            </div>
          </div>
        </div>

        {/* Right: RIT / XIT / Clarifier */}
        <div className="flex flex-col gap-0.5 min-w-[144px]">
          <div className="flex items-center justify-between gap-1.5 text-[11px]">
            <span className="text-slate-400 font-medium w-12">RIT</span>
            <select
              aria-label="RIT Offset"
              value={ritHz}
              onChange={(e) => onChangeRit(Number(e.target.value))}
              className="flex-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
            >
              {[-500, -200, -100, -50, 0, 50, 100, 200, 500].map((v) => (
                <option key={v} value={v}>
                  {v > 0 ? `+${v} Hz` : `${v} Hz`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-1.5 text-[11px]">
            <span className="text-slate-400 font-medium w-12">XIT</span>
            <select
              aria-label="XIT Offset"
              value={xitHz}
              onChange={(e) => onChangeXit(Number(e.target.value))}
              className="flex-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
            >
              {[-500, -200, -100, -50, 0, 50, 100, 200, 500].map((v) => (
                <option key={v} value={v}>
                  {v > 0 ? `+${v} Hz` : `${v} Hz`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between gap-1.5 text-[11px]">
            <span className="text-slate-400 font-medium w-12">Clarifier</span>
            <select
              aria-label="Clarifier Offset"
              value={clarifierHz}
              onChange={(e) => onChangeClarifier(Number(e.target.value))}
              className="flex-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
            >
              {[-300, -100, -25, 0, 25, 100, 300].map((v) => (
                <option key={v} value={v}>
                  {v > 0 ? `+${v} Hz` : `${v} Hz`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Mode Selector Bar */}
      <div className="grid grid-cols-5 sm:grid-cols-9 gap-1">
        {MODES.map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectMode(m)}
              className={`py-0.5 rounded text-[10.5px] font-display font-semibold tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-sky-500 text-slate-950 shadow-[0_0_10px_rgba(34,184,255,0.4)]'
                  : 'bg-[#0a111b] border border-[#1f3045] text-slate-300 hover:border-sky-400/50 hover:text-white'
              }`}
              aria-pressed={active}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* VFO Tuning Steps & Dial Speed */}
      <div
        data-testid="vfo-tuning-steps"
        className="flex flex-wrap items-center justify-between gap-2 pt-0.5 border-t border-[#182638]"
      >
        <div className="flex items-center gap-1" role="group" aria-label="Tuning Step">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-slate-400 mr-0.5">
            Step
          </span>
          {STEP_OPTIONS.map((hz) => {
            const active = stepHz === hz;
            const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}Hz`;
            const fullLabel = hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`;
            return (
              <button
                key={hz}
                type="button"
                onClick={() => onChangeStepHz(hz)}
                aria-pressed={active}
                aria-label={`Step ${fullLabel}`}
                title={`Set VFO tuning step to ${fullLabel}`}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer ${
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

        <div className="flex items-center gap-1" role="group" aria-label="Tune Speed">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-slate-400 mr-0.5">
            Tune
          </span>
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
                title={`${speed} VFO dial speed`}
                className={`px-1.5 py-0.5 rounded text-[10px] font-display uppercase tracking-wide border transition-colors cursor-pointer ${
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
    </section>
  );
};
