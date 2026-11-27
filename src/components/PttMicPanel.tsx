import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { getMicBadgeVisual } from '../radio/pttController';
import { RadioMode } from '../types/radio';
import { shouldReleasePttOnPointerLeave } from '../utils/browserCompat';

interface PttMicPanelProps {
  mode: RadioMode;
  isPoweredOn: boolean;
  micEnabled: boolean;
  micLevelDb: number;
  isTransmitting: boolean;
  pttHeld: boolean;
  pttLatched: boolean;
  onStartPtt: () => void;
  onStopPtt: () => void;
  onTogglePttLatch: () => void;
}

const DIGITAL_TONE_MODES: RadioMode[] = ['CW', 'RTTY', 'SSTV', 'FT8'];

export const PttMicPanel: React.FC<PttMicPanelProps> = ({
  mode,
  isPoweredOn,
  micEnabled,
  micLevelDb,
  isTransmitting,
  pttHeld,
  pttLatched,
  onStartPtt,
  onStopPtt,
  onTogglePttLatch,
}) => {
  // Map -55..0 dB to 0..12 segments
  const normLevel = Math.max(0, Math.min(1, (micLevelDb + 55) / 55));
  const activeSegments = Math.round(normLevel * 12);
  const isDigitalToneMode = DIGITAL_TONE_MODES.includes(mode);
  const badge = getMicBadgeVisual(isPoweredOn, isTransmitting, micEnabled, mode);

  const handlePttPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isPoweredOn) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (pttLatched) {
      onTogglePttLatch();
      return;
    }
    if (e.pointerType !== 'mouse' && typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture errors on unsupported browsers
      }
    }
    onStartPtt();
  };

  const handlePttRelease = () => {
    if (pttLatched) return;
    if (pttHeld || isTransmitting) {
      onStopPtt();
    }
  };

  const handlePttPointerLeave = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pttLatched) return;
    const hasCapture =
      typeof e.currentTarget.hasPointerCapture === 'function' &&
      e.currentTarget.hasPointerCapture(e.pointerId);
    if (shouldReleasePttOnPointerLeave(e.pointerType, hasCapture)) {
      handlePttRelease();
    }
  };

  return (
    <section
      data-testid="ptt-section"
      data-tx-state={isTransmitting ? 'TX' : 'RX'}
      data-mic-active={badge.isMicLive ? 'true' : 'false'}
      data-ptt-held={pttHeld ? 'true' : 'false'}
      data-ptt-latched={pttLatched ? 'true' : 'false'}
      className="sdr-panel rounded-md px-2.5 py-1 flex flex-wrap landscape:flex-nowrap sm:flex-nowrap items-center justify-between gap-2"
    >
      {/* Left: Mic status indicator (synchronized strictly with TX/PTT state) */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
          {badge.isMicLive ? (
            <Mic className="w-3.5 h-3.5 text-rose-400 animate-pulse" aria-hidden="true" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          )}
          <span>{isDigitalToneMode ? `Mic · ${mode}` : 'Mic'}</span>
        </div>

        <span
          data-testid="mic-status-badge"
          data-mic-active={badge.isMicLive ? 'true' : 'false'}
          title={
            pttLatched
              ? 'PTT latched TX — click Latch or PTT to return to RX'
              : badge.isMicLive
              ? 'Microphone live and transmitting (release PTT to stop immediately)'
              : badge.isTx
              ? `Transmitting ${mode} signal (microphone inactive)`
              : 'Microphone inactive in RX — press and hold PTT or toggle Latch to transmit'
          }
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono-tabular border whitespace-nowrap shrink-0 ${
            badge.isMicLive
              ? 'bg-rose-500/20 border-rose-400 text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
              : badge.isTx && isDigitalToneMode
              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
              : badge.isTx
              ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
              : 'bg-[#0b121c] border-[#24364d] text-slate-400'
          }`}
        >
          {badge.isMicLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" aria-hidden="true" />
          )}
          <span>{badge.label}</span>
        </span>
      </div>

      {/* Middle: Segmented LED VU Bar + dB readout */}
      <div className="flex items-center gap-2 flex-1 min-w-[140px]">
        <div
          className="flex items-center gap-0.5 flex-1"
          data-testid="mic-vu-bar"
          data-active-segments={activeSegments}
          aria-label={`Mic level ${micLevelDb.toFixed(1)} dB`}
        >
          {Array.from({ length: 12 }).map((_, idx) => {
            const lit = idx < activeSegments;
            const colorClass = !lit
              ? 'bg-[#142030]'
              : idx >= 10
              ? 'bg-rose-400'
              : idx >= 7
              ? 'bg-amber-400'
              : 'bg-sky-400';
            return <span key={idx} className={`h-2 flex-1 rounded-xs ${colorClass}`} />;
          })}
        </div>
        <span
          data-testid="mic-level-readout"
          className="text-[10px] text-slate-300 font-mono-tabular whitespace-nowrap shrink-0 w-[52px] text-right"
        >
          {micLevelDb.toFixed(1)} dB
        </span>
      </div>

      {/* Right: Hold / Latch controls + PTT button */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono-tabular whitespace-nowrap select-none ${
            !pttLatched
              ? 'border-sky-400/50 bg-[#0a1019] text-sky-300'
              : 'border-[#23344a] bg-[#0a1019] text-slate-500'
          }`}
          title="Hold-to-Talk: microphone captures only while PTT is pressed and held"
        >
          Hold
        </span>

        <button
          type="button"
          disabled={!isPoweredOn}
          onClick={onTogglePttLatch}
          data-testid="ptt-latch-button"
          aria-pressed={pttLatched}
          title={
            pttLatched
              ? 'PTT Latched ON — click to release transmitter back to RX'
              : 'Latch PTT hands-free TX ON (click again or tap PTT to return to RX)'
          }
          className={`px-2 py-0.5 rounded border text-[10px] font-display font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            pttLatched
              ? 'bg-amber-500 border-amber-300 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
              : 'bg-[#0a1019] border-[#25374d] text-slate-300 hover:border-amber-400/60 hover:text-amber-200'
          }`}
        >
          {pttLatched ? 'Latched' : 'Latch'}
        </button>

        <button
          type="button"
          disabled={!isPoweredOn}
          onPointerDown={handlePttPointerDown}
          onPointerUp={handlePttRelease}
          onPointerLeave={handlePttPointerLeave}
          onPointerCancel={handlePttRelease}
          onLostPointerCapture={handlePttRelease}
          onBlur={handlePttRelease}
          onContextMenu={(e) => {
            e.preventDefault();
            handlePttRelease();
          }}
          onKeyDown={(e) => {
            if (!isPoweredOn) return;
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
              e.preventDefault();
              if (pttLatched) onTogglePttLatch();
              else onStartPtt();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handlePttRelease();
            }
          }}
          data-testid="ptt-button"
          aria-pressed={isTransmitting}
          className={`touch-hold-control inline-flex items-center justify-center px-4 py-1 rounded-md font-display text-xs font-bold tracking-widest uppercase border transition-all select-none shrink-0 whitespace-nowrap ${
            !isPoweredOn
              ? 'bg-[#0b1018] border-[#1b2736] text-slate-600 cursor-not-allowed'
              : isTransmitting
              ? 'bg-rose-600 border-rose-300 text-white shadow-[0_0_20px_rgba(244,63,94,0.65)] scale-[0.98] cursor-pointer'
              : 'bg-[#0e1826] border-sky-400/70 text-sky-300 hover:bg-sky-500/15 hover:text-white shadow-[0_0_12px_rgba(34,184,255,0.2)] cursor-pointer'
          }`}
          title={
            pttLatched
              ? 'Click to unlatch PTT and return to RX'
              : 'Push To Talk (Press and hold mouse button or Spacebar)'
          }
        >
          {isTransmitting && badge.isMicLive && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1.5" aria-hidden="true" />
          )}
          {isTransmitting ? (pttLatched ? 'TX LATCH' : 'TX ON') : 'PTT'}
        </button>
      </div>
    </section>
  );
};

