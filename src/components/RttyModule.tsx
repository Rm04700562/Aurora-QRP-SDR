import React, { useEffect, useRef, useState } from 'react';
import { BookPlus, FlaskConical, Radio, Send, Square } from 'lucide-react';
import { SdrAudioEngine } from '../audio/sdrAudioEngine';
import {
  clampAndStepRttyFineOffset,
  demodulateRttyPcm,
  getRttyMarkSpaceFreqs,
  getStandardRttyFrequency,
  RTTY_FINE_MAX_HZ,
  RTTY_FINE_MIN_HZ,
  RTTY_FINE_STEP_HZ,
  rttyDurationMs,
  sanitizeRttyText,
  stepRttyFineOffset,
  synthesizeRttyAudioPcm,
} from '../radio/digitalModes';
import {
  BandId,
  DigitalFeedLine,
  QthLocation,
  RadioMode,
  RttyConfig,
} from '../types/radio';

interface RttyModuleProps {
  isPoweredOn: boolean;
  callsign: string;
  qth: QthLocation;
  band: BandId;
  frequencyHz: number;
  rttyFeed: DigitalFeedLine[];
  isSendingRtty: boolean;
  rttyConfig: RttyConfig;
  onChangeRttyConfig: (next: RttyConfig) => void;
  onSendRtty: (text: string) => void;
  onLoopbackDecodeRtty: (decodedText: string, snrRatio: number) => void;
  onStopDigitalTx: () => void;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
  onLogQso?: (dxCall: string, mode: RadioMode) => void;
  signalOffsetHz?: number | null;
  audioEngine: SdrAudioEngine | null;
}

function extractCallsignFromLine(line: DigitalFeedLine, ownCall: string): string {
  const deMatch = line.text.match(/\bDE\s+([A-Z0-9]{2,10}(?:\/[A-Z0-9]+)?)/i);
  if (deMatch?.[1] && deMatch[1].toUpperCase() !== ownCall.toUpperCase()) {
    return deMatch[1].toUpperCase();
  }
  if (line.callsign && line.callsign !== ownCall && line.callsign !== 'DSP-LOOP') {
    return line.callsign.toUpperCase();
  }
  return '';
}

export const RttyModule: React.FC<RttyModuleProps> = ({
  isPoweredOn,
  callsign,
  qth,
  band,
  frequencyHz,
  rttyFeed,
  isSendingRtty,
  rttyConfig,
  onChangeRttyConfig,
  onSendRtty,
  onLoopbackDecodeRtty,
  onStopDigitalTx,
  onTuneToFrequency,
  onLogQso,
  signalOffsetHz = null,
  audioEngine,
}) => {
  const [rttyInput, setRttyInput] = useState(`CQ CQ DE ${callsign} ${callsign} K`);
  const [dxCall, setDxCall] = useState('');
  const [loopbackStatus, setLoopbackStatus] = useState<string | null>(null);
  const [activeToneMark, setActiveToneMark] = useState<boolean>(true);
  const [toneActive, setToneActive] = useState<boolean>(false);

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fineOffsetRef = useRef(rttyConfig.fineOffsetHz);
  fineOffsetRef.current = rttyConfig.fineOffsetHz;
  const signalOffsetRef = useRef<number | null>(signalOffsetHz);
  signalOffsetRef.current = signalOffsetHz;
  const toneSpec = getRttyMarkSpaceFreqs(rttyConfig);
  const stdRttyHz = getStandardRttyFrequency(band);

  useEffect(() => {
    setRttyInput((prev) => (prev.startsWith('CQ CQ DE ') ? `CQ CQ DE ${callsign} ${callsign} K` : prev));
  }, [callsign]);

  // 30 FPS Crossed-Banana XY Tuning Oscilloscope Canvas
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    let rafId = 0;
    let phase = 0;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        // Subtle CRT phosphor persistence fade
        ctx.fillStyle = 'rgba(4, 10, 18, 0.34)';
        ctx.fillRect(0, 0, w, h);

        // Reticle grid
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 2);
        ctx.lineTo(cx, h - 2);
        ctx.moveTo(2, cy);
        ctx.lineTo(w - 2, cy);
        ctx.stroke();

        const tel = audioEngine?.getToneTelemetry();
        const isRttyTelemetry = Boolean(tel && tel.mode === 'RTTY');
        const active = isPoweredOn && (isRttyTelemetry || isSendingRtty);
        const markOn = isRttyTelemetry ? Boolean(tel?.markActive) : true;

        setToneActive(active);
        setActiveToneMark(markOn);

        phase += active ? 0.38 : 0.12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = active ? 1.8 : 1.1;

        const activeOffset = signalOffsetRef.current;
        const skew =
          activeOffset !== null && Math.abs(activeOffset) > 10
            ? Math.max(-0.55, Math.min(0.55, activeOffset / 220))
            : 0;

        if (!isPoweredOn) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(-1, -1, 2, 2);
        } else if (active) {
          // Crossed-banana orthogonal Lissajous ellipse (rotates when incoming signal is off-center)
          ctx.rotate(skew);
          const rx = markOn ? 4.2 : 24;
          const ry = markOn ? 14.5 : 3.6;
          const offCenter = Math.abs(skew) > 0.05;
          ctx.strokeStyle = offCenter ? '#fbbf24' : markOn ? '#34d399' : '#fbbf24';
          ctx.shadowColor = offCenter ? '#f59e0b' : markOn ? '#10b981' : '#f59e0b';
          ctx.shadowBlur = 5;
          ctx.beginPath();
          for (let i = 0; i <= 36; i++) {
            const a = (i / 36) * Math.PI * 2;
            const px = Math.cos(a + phase) * rx;
            const py = Math.sin(a) * ry;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();

          // Faint ghost on inactive orthogonal axis
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.beginPath();
          ctx.ellipse(0, 0, markOn ? 18 : 3.2, markOn ? 2.6 : 11, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Idle quiet standby crossed reticle ring
          ctx.rotate(skew);
          ctx.strokeStyle =
            activeOffset !== null && Math.abs(activeOffset) <= 10
              ? 'rgba(52, 211, 153, 0.6)'
              : 'rgba(56, 189, 248, 0.35)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 11, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        // Fine-Tune center offset indicator tick along bottom edge
        if (isPoweredOn) {
          const norm = Math.max(-1, Math.min(1, (fineOffsetRef.current || 0) / RTTY_FINE_MAX_HZ));
          const tickX = cx + norm * (cx - 6);
          ctx.fillStyle = fineOffsetRef.current === 0 ? 'rgba(56, 189, 248, 0.7)' : '#38bdf8';
          ctx.fillRect(Math.round(tickX) - 1, h - 4, 3, 3);
        }
      }
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioEngine, isPoweredOn, isSendingRtty]);

  const handleLoopbackTest = () => {
    if (!isPoweredOn) return;
    const sampleText = sanitizeRttyText(rttyInput).trim() || `RYRY DE ${callsign} 599 K`;
    const sampleRate = 16000;
    const pcm = synthesizeRttyAudioPcm(sampleText, sampleRate, rttyConfig);
    const decoded = demodulateRttyPcm(pcm, sampleRate, rttyConfig);
    audioEngine?.playRttySequence(sampleText, 0.16, true, rttyConfig);
    setLoopbackStatus(`DSP SNR ${decoded.markSnrRatio}:1 (${decoded.words.length} Baudot wds)`);
    onLoopbackDecodeRtty(decoded.text || sampleText, decoded.markSnrRatio);
  };

  const estSec = Math.max(0.2, rttyDurationMs(rttyInput || 'RY', rttyConfig) / 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-rtty">
      {/* Top Telemetry + XY Tuning Scope + FSK Modem Controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
        <div className="flex items-center gap-1.5">
          <canvas
            ref={scopeCanvasRef}
            width={74}
            height={38}
            data-testid="rtty-xy-scope"
            aria-label="RTTY Crossed-Banana XY Tuning Scope"
            className="rounded border border-[#24364d] bg-[#040a12] shrink-0"
          />

          <div className="flex flex-col gap-0.5 font-mono-tabular">
            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded border font-semibold ${
                  isSendingRtty
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : toneActive
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-400/50 text-amber-200'
                }`}
              >
                {isSendingRtty ? 'FSK TX ON' : toneActive ? 'MARK LOCK' : `FSK ${toneSpec.baudRate}`}
              </span>
              <span className="text-slate-300" data-testid="rtty-mark-space-readout">
                M:{toneSpec.markHz} / S:{toneSpec.spaceHz} Hz
              </span>
            </div>

            {/* Live Mark vs Space Tone Indicators + Center Frequency */}
            <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400">
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    toneActive && activeToneMark ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-600'
                  }`}
                />
                MARK
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    toneActive && !activeToneMark ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-slate-600'
                  }`}
                />
                SPACE
              </span>
              <span className="text-sky-300/90" data-testid="rtty-center-freq-readout">
                · Ctr {toneSpec.centerHz} Hz
              </span>
              {loopbackStatus && (
                <span className="text-sky-300 hidden sm:inline">· {loopbackStatus}</span>
              )}
            </div>
          </div>
        </div>

        {/* Modem Parameters: Baud / Shift / Mark / REV / UOS / QSY / Loopback */}
        <div className="flex flex-wrap items-center gap-1 font-mono-tabular">
          <select
            aria-label="RTTY Baud Rate"
            data-testid="rtty-baud-select"
            value={rttyConfig.baudRate}
            onChange={(e) =>
              onChangeRttyConfig({ ...rttyConfig, baudRate: Number(e.target.value) as RttyConfig['baudRate'] })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer"
          >
            <option value={45.45}>45.45 Bd</option>
            <option value={50}>50 Bd</option>
            <option value={75}>75 Bd</option>
          </select>

          <select
            aria-label="RTTY FSK Shift"
            data-testid="rtty-shift-select"
            value={rttyConfig.shiftHz}
            onChange={(e) =>
              onChangeRttyConfig({ ...rttyConfig, shiftHz: Number(e.target.value) as RttyConfig['shiftHz'] })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer"
          >
            <option value={170}>170 Hz</option>
            <option value={425}>425 Hz</option>
            <option value={850}>850 Hz</option>
          </select>

          <select
            aria-label="RTTY Mark Pitch"
            value={rttyConfig.markHz}
            onChange={(e) =>
              onChangeRttyConfig({ ...rttyConfig, markHz: Number(e.target.value) as RttyConfig['markHz'] })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer"
          >
            <option value={2125}>2125 Hz</option>
            <option value={1275}>1275 Hz</option>
          </select>

          <button
            type="button"
            data-testid="rtty-rev-toggle"
            aria-pressed={rttyConfig.reversePolarity}
            onClick={() => onChangeRttyConfig({ ...rttyConfig, reversePolarity: !rttyConfig.reversePolarity })}
            className={`px-1.5 py-0.5 rounded border cursor-pointer ${
              rttyConfig.reversePolarity
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-[#0a1019] border-[#24364d] text-slate-300'
            }`}
            title="Reverse Mark/Space FSK polarity"
          >
            REV
          </button>

          <button
            type="button"
            aria-pressed={rttyConfig.uos}
            onClick={() => onChangeRttyConfig({ ...rttyConfig, uos: !rttyConfig.uos })}
            className={`px-1.5 py-0.5 rounded border cursor-pointer ${
              rttyConfig.uos
                ? 'bg-sky-500/20 border-sky-400/70 text-sky-200'
                : 'bg-[#0a1019] border-[#24364d] text-slate-400'
            }`}
            title="Unshift On Space (Baudot ITA2)"
          >
            UOS
          </button>

          <button
            type="button"
            data-testid="rtty-qsy-button"
            onClick={() => onTuneToFrequency(stdRttyHz, 'RTTY')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer"
            title={`QSY to standard ${band} RTTY sub-band`}
          >
            <Radio className="w-2.5 h-2.5" />
            <span>QSY {(stdRttyHz / 1_000_000).toFixed(3)}</span>
          </button>

          <button
            type="button"
            data-testid="rtty-loopback-button"
            disabled={!isPoweredOn}
            onClick={handleLoopbackTest}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 text-emerald-200 cursor-pointer disabled:opacity-40"
            title="Synthesize real FSK PCM audio and run Goertzel DSP loopback demodulator"
          >
            <FlaskConical className="w-2.5 h-2.5" />
            <span>Loopback</span>
          </button>
        </div>
      </div>

      {/* RTTY Center Frequency Fine-Tune Control (10 Hz Steps) */}
      <div
        data-testid="rtty-fine-tune-control"
        className="flex flex-wrap items-center justify-between gap-2 px-2 py-0.5 rounded border border-[#1c2c40] bg-[#050b13] text-[10px] font-mono-tabular"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-display font-semibold uppercase tracking-wider text-slate-300 whitespace-nowrap">
            Fine-Tune
          </span>
          <span
            data-testid="rtty-fine-value"
            className={`min-w-[54px] text-right font-semibold ${
              toneSpec.fineOffsetHz === 0 ? 'text-slate-300' : 'text-sky-300'
            }`}
          >
            {toneSpec.fineOffsetHz > 0
              ? `+${toneSpec.fineOffsetHz} Hz`
              : `${toneSpec.fineOffsetHz} Hz`}
          </span>
          <button
            type="button"
            data-testid="rtty-fine-down"
            disabled={!isPoweredOn || toneSpec.fineOffsetHz <= RTTY_FINE_MIN_HZ}
            onClick={() =>
              onChangeRttyConfig({
                ...rttyConfig,
                fineOffsetHz: stepRttyFineOffset(rttyConfig.fineOffsetHz, -1),
              })
            }
            aria-label="Fine-tune RTTY down 10 Hz"
            title="Shift RTTY center frequency -10 Hz"
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-slate-200 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            -10Hz
          </button>
          <input
            type="range"
            data-testid="rtty-fine-slider"
            aria-label="RTTY Center Frequency Fine-Tune Offset"
            disabled={!isPoweredOn}
            min={RTTY_FINE_MIN_HZ}
            max={RTTY_FINE_MAX_HZ}
            step={RTTY_FINE_STEP_HZ}
            value={toneSpec.fineOffsetHz}
            onChange={(e) =>
              onChangeRttyConfig({
                ...rttyConfig,
                fineOffsetHz: clampAndStepRttyFineOffset(Number(e.target.value)),
              })
            }
            className="w-28 sm:w-36 h-1.5 accent-sky-400 cursor-pointer disabled:opacity-40"
          />
          <button
            type="button"
            data-testid="rtty-fine-up"
            disabled={!isPoweredOn || toneSpec.fineOffsetHz >= RTTY_FINE_MAX_HZ}
            onClick={() =>
              onChangeRttyConfig({
                ...rttyConfig,
                fineOffsetHz: stepRttyFineOffset(rttyConfig.fineOffsetHz, 1),
              })
            }
            aria-label="Fine-tune RTTY up 10 Hz"
            title="Shift RTTY center frequency +10 Hz"
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-slate-200 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            +10Hz
          </button>
          <button
            type="button"
            data-testid="rtty-fine-reset"
            disabled={!isPoweredOn || toneSpec.fineOffsetHz === 0}
            onClick={() =>
              onChangeRttyConfig({
                ...rttyConfig,
                fineOffsetHz: 0,
              })
            }
            aria-label="Reset RTTY fine-tune offset to 0 Hz"
            title="Reset RTTY center offset to 0 Hz"
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            0Hz
          </button>
        </div>

        <div className="flex items-center gap-1.5" data-testid="rtty-signal-alignment">
          {signalOffsetHz !== null ? (
            <>
              <span
                className={
                  Math.abs(signalOffsetHz) <= 10 ? 'text-emerald-300 font-semibold' : 'text-amber-300'
                }
              >
                {Math.abs(signalOffsetHz) <= 10
                  ? `ALIGNED (${signalOffsetHz > 0 ? `+${signalOffsetHz}` : signalOffsetHz} Hz)`
                  : `SIG Δ ${signalOffsetHz > 0 ? `+${signalOffsetHz}` : signalOffsetHz} Hz`}
              </span>
              {Math.abs(signalOffsetHz) > 10 && (
                <button
                  type="button"
                  data-testid="rtty-fine-align-button"
                  disabled={!isPoweredOn}
                  onClick={() =>
                    onChangeRttyConfig({
                      ...rttyConfig,
                      fineOffsetHz: clampAndStepRttyFineOffset(
                        rttyConfig.fineOffsetHz + signalOffsetHz
                      ),
                    })
                  }
                  className="px-1.5 py-0.5 rounded border border-amber-400/60 bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 cursor-pointer whitespace-nowrap disabled:opacity-40"
                  title="Snap RTTY Fine-Tune to align with incoming signal in 10Hz steps"
                >
                  Align
                </button>
              )}
            </>
          ) : (
            <span className="text-slate-400">10 Hz Step · ±500 Hz</span>
          )}
        </div>
      </div>

      {/* Scrollable Baudot RTTY Terminal (Click line to capture DX callsign) */}
      <div
        className="flex-1 min-h-[54px] max-h-[78px] overflow-y-auto rounded border border-[#1c2c40] bg-[#04090f] p-1.5 font-mono-tabular text-[11px] space-y-0.5"
        data-testid="rtty-terminal-feed"
      >
        {rttyFeed.length === 0 ? (
          <div className="text-slate-500">
            ITA2 Baudot FSK terminal ready on {(frequencyHz / 1_000_000).toFixed(3)} MHz. Transmit CQ or run DSP Loopback to verify Goertzel decoding.
          </div>
        ) : (
          rttyFeed.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => {
                const found = extractCallsignFromLine(line, callsign);
                if (found) setDxCall(found);
              }}
              className="w-full text-left flex items-baseline gap-1.5 px-1 py-0.5 rounded hover:bg-sky-500/10 cursor-pointer"
            >
              <span className="text-slate-500 text-[10px] shrink-0">{line.timestampUtc.slice(11, 16)}</span>
              <span
                className={`text-[10px] font-bold shrink-0 ${
                  line.direction === 'TX'
                    ? 'text-rose-400'
                    : line.direction === 'SYS'
                    ? 'text-sky-400'
                    : 'text-amber-300'
                }`}
              >
                [{line.direction}]
              </span>
              <span className="text-sky-300 shrink-0">{line.callsign}:</span>
              <span className="text-emerald-200 break-all">{line.text}</span>
            </button>
          ))
        )}
      </div>

      {/* DX Call + Macro Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono-tabular">
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="text"
            data-testid="rtty-dxcall-input"
            aria-label="DX Callsign"
            value={dxCall}
            onChange={(e) => setDxCall(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 10))}
            placeholder="DX Call"
            className="w-24 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#060b12] text-amber-200 uppercase focus:outline-none focus:border-sky-400"
          />
          {[
            { label: 'RYRY', text: `RYRYRY DE ${callsign} ${callsign} K` },
            { label: 'CQ', text: `CQ CQ DE ${callsign} ${callsign} K` },
            {
              label: 'REPLY',
              text: `${dxCall || 'DX1AA'} DE ${callsign} ${callsign} UR 599 599 KN`,
            },
            { label: '599 QTH', text: `UR 599 599 QTH ${qth.grid} ${qth.grid} BK` },
            { label: '73 SK', text: `${dxCall ? `${dxCall} ` : ''}TU DE ${callsign} 73 SK` },
          ].map((m) => (
            <button
              key={m.label}
              type="button"
              onClick={() => setRttyInput(m.text)}
              className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-slate-300 cursor-pointer"
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">~{estSec}s FSK</span>
          {onLogQso && (
            <button
              type="button"
              data-testid="rtty-log-qso-button"
              onClick={() => onLogQso(dxCall || 'DX1AA', 'RTTY')}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/25 text-sky-200 cursor-pointer"
              title="Log RTTY contact to station logbook"
            >
              <BookPlus className="w-2.5 h-2.5" />
              <span>+Log QSO</span>
            </button>
          )}
        </div>
      </div>

      {/* TX Text Input + Send / Stop */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const clean = sanitizeRttyText(rttyInput).trim();
          if (clean && isPoweredOn && !isSendingRtty) {
            onSendRtty(clean);
          }
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          data-testid="rtty-text-input"
          value={rttyInput}
          onChange={(e) => setRttyInput(sanitizeRttyText(e.target.value))}
          placeholder={`RTTY Baudot message (e.g. CQ CQ DE ${callsign} K)`}
          className="flex-1 px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-xs text-amber-200 uppercase focus:outline-none focus:border-sky-400"
        />
        {isSendingRtty ? (
          <button
            type="button"
            onClick={onStopDigitalTx}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!isPoweredOn || !rttyInput.trim()}
            data-testid="rtty-send-button"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/70 hover:bg-amber-500 hover:text-slate-950 text-amber-200 font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
          >
            <Send className="w-3 h-3" />
            <span>Send RTTY</span>
          </button>
        )}
      </form>
    </div>
  );
};
