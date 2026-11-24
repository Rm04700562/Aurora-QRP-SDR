import React from 'react';
import { Database, KeyRound, Mic, MicOff, Send, Square, X } from 'lucide-react';
import {
  hasSendableMorse,
  morseDurationMs,
  sanitizeCwText,
  textToMorse,
} from '../radio/physics';
import { GROUP_OPTIONS, SERVER_OPTIONS } from './HeaderBar';

interface BottomControlStripProps {
  callsign: string;
  serverId: string;
  groupId: string;
  onChangeServer: (id: string) => void;
  onChangeGroup: (id: string) => void;
  micEnabled: boolean;
  micLevelDb: number;
  isTransmitting: boolean;
  pttLatchMode: boolean;
  onTogglePttLatchMode: () => void;
  onStartPtt: () => void;
  onStopPtt: () => void;
  onToggleMic: () => void;
  cwWpm: number;
  onChangeCwWpm: (wpm: number) => void;
  cwDecodeEnabled: boolean;
  onToggleCwDecode: () => void;
  cwDecodedText: string;
  cwTextInput: string;
  onChangeCwTextInput: (text: string) => void;
  onSendCwText: (text: string) => void;
  onStopCwTx: () => void;
  isSendingCw: boolean;
  cwTxProgress: number;
  isTuningAtu: boolean;
  onRunAtuTune: () => void;
  onSendCwCq: () => void;
  isPoweredOn: boolean;
}

export const BottomControlStrip: React.FC<BottomControlStripProps> = ({
  callsign,
  serverId,
  groupId,
  onChangeServer,
  onChangeGroup,
  micEnabled,
  micLevelDb,
  isTransmitting,
  pttLatchMode,
  onTogglePttLatchMode,
  onStartPtt,
  onStopPtt,
  onToggleMic,
  cwWpm,
  onChangeCwWpm,
  cwDecodeEnabled,
  onToggleCwDecode,
  cwDecodedText,
  cwTextInput,
  onChangeCwTextInput,
  onSendCwText,
  onStopCwTx,
  isSendingCw,
  cwTxProgress,
  isTuningAtu,
  onRunAtuTune,
  onSendCwCq,
  isPoweredOn,
}) => {
  // Map -55..0 dB to 0..12 segments
  const normLevel = Math.max(0, Math.min(1, (micLevelDb + 55) / 55));
  const activeSegments = Math.round(normLevel * 12);

  const trimmedCw = cwTextInput.trim();
  const canSendCw = isPoweredOn && hasSendableMorse(trimmedCw);
  const morsePreview = trimmedCw ? textToMorse(trimmedCw) : '';
  const estimatedMs = canSendCw ? morseDurationMs(trimmedCw, cwWpm) : 0;
  const ditMs = Math.round(1200 / Math.max(5, Math.min(40, cwWpm)));

  const handlePttPointerDown = () => {
    if (pttLatchMode) {
      if (isTransmitting) onStopPtt();
      else onStartPtt();
    } else {
      onStartPtt();
    }
  };

  const handlePttPointerUp = () => {
    if (!pttLatchMode && isTransmitting) {
      onStopPtt();
    }
  };

  const handleCwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSendCw || isSendingCw) return;
    onSendCwText(trimmedCw);
  };

  const appendMacro = (snippet: string) => {
    const base = cwTextInput.trim();
    const next = base ? `${base} ${snippet}` : snippet;
    onChangeCwTextInput(sanitizeCwText(next));
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-12 gap-1.5">
      {/* SERVER / GROUP */}
      <div className="md:col-span-4 sdr-panel rounded-md p-1.5 flex flex-col justify-between gap-1">
        <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
          <Database className="w-3 h-3 text-sky-400" aria-hidden="true" />
          <span>Server / Group</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <select
            aria-label="Bottom Server Selector"
            value={serverId}
            onChange={(e) => onChangeServer(e.target.value)}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-[11px] text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {SERVER_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Bottom Group Selector"
            value={groupId}
            onChange={(e) => onChangeGroup(e.target.value)}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-[11px] text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {GROUP_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* MIC & PTT */}
      <div className="md:col-span-4 sdr-panel rounded-md p-1.5 flex items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
              {micEnabled ? (
                <Mic className="w-3 h-3 text-sky-400" aria-hidden="true" />
              ) : (
                <MicOff className="w-3 h-3 text-slate-400" aria-hidden="true" />
              )}
              <span>Mic</span>
            </div>

            <button
              type="button"
              onClick={onToggleMic}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border cursor-pointer whitespace-nowrap shrink-0 ${
                micEnabled
                  ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-300'
                  : 'bg-[#0b121c] border-[#24364d] text-slate-300 hover:border-sky-400'
              }`}
            >
              {micEnabled ? 'VOIP Live' : 'Enable Mic'}
            </button>
          </div>

          {/* Segmented LED VU Bar */}
          <div className="flex items-center gap-0.5" aria-label={`Mic level ${micLevelDb.toFixed(1)} dB`}>
            {Array.from({ length: 12 }).map((_, idx) => {
              const lit = idx < activeSegments;
              const colorClass = !lit
                ? 'bg-[#142030]'
                : idx >= 10
                ? 'bg-rose-400'
                : idx >= 7
                ? 'bg-amber-400'
                : 'bg-sky-400';
              return <span key={idx} className={`h-1.5 flex-1 rounded-xs ${colorClass}`} />;
            })}
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono-tabular">
            <span>Lvl: {micLevelDb.toFixed(1)} dB</span>
            <button
              type="button"
              onClick={onTogglePttLatchMode}
              className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline cursor-pointer"
              title="Switch between Hold-to-Talk and Click-to-Latch PTT"
            >
              {pttLatchMode ? 'Latch' : 'Hold'}
            </button>
          </div>
        </div>

        <button
          type="button"
          onPointerDown={handlePttPointerDown}
          onPointerUp={handlePttPointerUp}
          onPointerLeave={handlePttPointerUp}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
              e.preventDefault();
              handlePttPointerDown();
            }
          }}
          onKeyUp={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !pttLatchMode) {
              e.preventDefault();
              handlePttPointerUp();
            }
          }}
          data-testid="ptt-button"
          aria-pressed={isTransmitting}
          className={`px-3.5 py-2 rounded-md font-display text-xs font-bold tracking-widest uppercase border transition-all cursor-pointer select-none shrink-0 whitespace-nowrap ${
            isTransmitting
              ? 'bg-rose-600 border-rose-300 text-white shadow-[0_0_20px_rgba(244,63,94,0.65)] scale-[0.98]'
              : 'bg-[#0e1826] border-sky-400/70 text-sky-300 hover:bg-sky-500/15 hover:text-white shadow-[0_0_12px_rgba(34,184,255,0.2)]'
          }`}
          title="Push To Talk (Hold mouse, or press Spacebar)"
        >
          {isTransmitting ? 'TX ON' : 'PTT'}
        </button>
      </div>

      {/* KEYER & CW DECODER */}
      <div className="md:col-span-4 sdr-panel rounded-md p-1.5 flex flex-col justify-between gap-1">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-1 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200">
            <KeyRound className="w-3 h-3 text-sky-400" aria-hidden="true" />
            <span>Keyer</span>
          </div>

          <select
            aria-label="CW Keyer Speed"
            value={cwWpm}
            onChange={(e) => onChangeCwWpm(Number(e.target.value))}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
          >
            {[10, 12, 15, 18, 20, 25, 30].map((wpm) => (
              <option key={wpm} value={wpm}>
                {wpm} WPM
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onSendCwCq}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#273c56] bg-[#0e1725] hover:border-sky-400 text-[10px] font-display font-semibold text-sky-300 cursor-pointer whitespace-nowrap shrink-0"
            title="Transmit an automated Morse CQ call on current frequency"
          >
            <Send className="w-2.5 h-2.5" aria-hidden="true" />
            <span>CQ</span>
          </button>

          <button
            type="button"
            onClick={onRunAtuTune}
            disabled={isTuningAtu}
            className={`px-1.5 py-0.5 rounded border text-[10px] font-display font-semibold tracking-wider uppercase cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              isTuningAtu
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-[#0e1725] border-[#2b425e] text-slate-200 hover:border-sky-400'
            }`}
            title="Run Automatic Antenna Tuner (ATU) to minimize SWR"
          >
            {isTuningAtu ? 'Tuning...' : 'Tune'}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleCwDecode}
            aria-pressed={cwDecodeEnabled}
            className={`px-1.5 py-0.5 rounded text-[10px] font-display font-semibold uppercase border cursor-pointer shrink-0 whitespace-nowrap ${
              cwDecodeEnabled
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-[#0a1019] border-[#223348] text-slate-400'
            }`}
          >
            Decode
          </button>

          <div
            data-testid="cw-decoded-readout"
            className="flex-1 px-2 py-0.5 rounded border border-[#1c2c40] bg-[#060b12] font-mono-tabular text-[11px] text-sky-300 truncate"
            title={cwDecodedText}
          >
            {cwDecodeEnabled ? cwDecodedText : 'CW Decoder Paused'}
          </div>
        </div>
      </div>

      {/* CW TEXT SEND LINE */}
      <div
        className="md:col-span-12 sdr-panel rounded-md p-1.5 flex flex-col gap-1"
        data-testid="cw-text-line-panel"
        data-state={isSendingCw ? 'transmitting' : 'idle'}
      >
        <form onSubmit={handleCwSubmit} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
          <label
            htmlFor="cw-text-line-input"
            className="flex items-center gap-1.5 text-[10px] font-display font-semibold tracking-wider uppercase text-slate-200 whitespace-nowrap shrink-0"
          >
            <span className={isSendingCw ? 'text-rose-400 font-mono-tabular' : 'text-sky-400 font-mono-tabular'}>
              {isSendingCw ? '● TX' : '● CW'}
            </span>
            <span>CW Text Line</span>
          </label>

          <div className="flex-1 min-w-[200px] flex items-center gap-1">
            <input
              id="cw-text-line-input"
              data-testid="cw-text-input"
              type="text"
              maxLength={80}
              disabled={!isPoweredOn}
              value={cwTextInput}
              onChange={(e) => onChangeCwTextInput(sanitizeCwText(e.target.value))}
              placeholder={`Type CW text to send (e.g. CQ DX DE ${callsign} K)`}
              className="w-full px-2.5 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-xs text-sky-200 placeholder:text-slate-500 uppercase focus:outline-none focus:border-sky-400 disabled:opacity-50"
            />
            {cwTextInput.length > 0 && !isSendingCw && (
              <button
                type="button"
                onClick={() => onChangeCwTextInput('')}
                aria-label="Clear CW text"
                className="p-1 rounded border border-[#24364d] bg-[#0a1019] text-slate-400 hover:text-white hover:border-sky-400 cursor-pointer shrink-0"
                title="Clear CW message"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => onChangeCwTextInput(sanitizeCwText(`CQ CQ DE ${callsign} K`))}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 hover:text-white cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              title="Fill standard CQ call"
            >
              CQ
            </button>
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => appendMacro('UR RST 599')}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 hover:text-white cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              title="Insert RST 599 report"
            >
              599
            </button>
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => appendMacro('73 TU SK')}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 hover:text-white cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              title="Insert 73 sign-off"
            >
              73
            </button>

            {isSendingCw ? (
              <button
                type="button"
                onClick={onStopCwTx}
                data-testid="cw-stop-button"
                className="flex items-center gap-1 px-2.5 py-1 rounded border border-rose-400 bg-rose-600 hover:bg-rose-500 text-[11px] font-display font-bold tracking-wider uppercase text-white cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                <span>Stop CW</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSendCw}
                data-testid="cw-send-button"
                className="flex items-center gap-1 px-2.5 py-1 rounded border border-sky-400/70 bg-sky-500/20 hover:bg-sky-500 hover:text-slate-950 text-[11px] font-display font-bold tracking-wider uppercase text-sky-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-500/20 disabled:hover:text-sky-200"
              >
                <Send className="w-3 h-3" aria-hidden="true" />
                <span>Send CW</span>
              </button>
            )}
          </div>
        </form>

        <div className="flex items-center justify-between gap-3 text-[10px] font-mono-tabular">
          <div className="flex-1 min-w-0 truncate" data-testid="cw-morse-preview">
            {morsePreview ? (
              <span className="text-amber-300/95 tracking-wider">{morsePreview}</span>
            ) : trimmedCw ? (
              <span className="text-rose-300">No valid Morse characters (use A-Z, 0-9, / ? . , - + = @)</span>
            ) : (
              <span className="text-slate-400">
                Enter message above and press Enter or Send CW to transmit Morse on air
              </span>
            )}
          </div>

          <span className="text-slate-400 whitespace-nowrap shrink-0">
            {cwWpm} WPM · {estimatedMs > 0 ? `${(estimatedMs / 1000).toFixed(1)}s` : `${ditMs}ms dit`}
          </span>
        </div>

        <div className="h-[2px] w-full bg-[#121c2a] rounded-full overflow-hidden">
          <div
            className={`h-full transition-[width] duration-75 ${
              isSendingCw ? 'bg-rose-400' : 'bg-sky-400/50'
            }`}
            style={{ width: `${isSendingCw ? Math.max(4, Math.round(cwTxProgress * 100)) : 0}%` }}
          />
        </div>
      </div>
    </section>
  );
};

