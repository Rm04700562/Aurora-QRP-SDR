import React, { useEffect, useRef, useState } from 'react';
import { BookPlus, FlaskConical, Languages, Radio, Send, Square } from 'lucide-react';
import { SdrAudioEngine } from '../audio/sdrAudioEngine';
import {
  demodulateJttyPcm,
  getJttyMarkSpaceFreqs,
  getStandardJttyFrequency,
  jttyDurationMs,
  romajiToKatakana,
  sanitizeJttyText,
  synthesizeJttyAudioPcm,
} from '../radio/digitalModes';
import {
  BandId,
  DigitalFeedLine,
  JttyConfig,
  QthLocation,
  RadioMode,
} from '../types/radio';

interface JttyModuleProps {
  isPoweredOn: boolean;
  callsign: string;
  qth: QthLocation;
  band: BandId;
  frequencyHz: number;
  jttyFeed: DigitalFeedLine[];
  isSendingJtty: boolean;
  jttyConfig: JttyConfig;
  onChangeJttyConfig: (next: JttyConfig) => void;
  onSendJtty: (text: string) => void;
  onLoopbackDecodeJtty: (decodedText: string, snrRatio: number) => void;
  onStopDigitalTx: () => void;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
  onLogQso?: (dxCall: string, mode: RadioMode) => void;
  audioEngine: SdrAudioEngine | null;
}

function extractJttyCallsign(line: DigitalFeedLine, ownCall: string): string {
  const deMatch = line.text.match(/\bDE\s+([A-Z0-9]{2,10}(?:\/[A-Z0-9]+)?)/i);
  if (deMatch?.[1] && deMatch[1].toUpperCase() !== ownCall.toUpperCase()) {
    return deMatch[1].toUpperCase();
  }
  if (line.callsign && line.callsign !== ownCall && line.callsign !== 'DSP-LOOP') {
    return line.callsign.toUpperCase();
  }
  return '';
}

export const JttyModule: React.FC<JttyModuleProps> = ({
  isPoweredOn,
  callsign,
  qth,
  band,
  frequencyHz,
  jttyFeed,
  isSendingJtty,
  jttyConfig,
  onChangeJttyConfig,
  onSendJtty,
  onLoopbackDecodeJtty,
  onStopDigitalTx,
  onTuneToFrequency,
  onLogQso,
  audioEngine,
}) => {
  const [jttyInput, setJttyInput] = useState(`CQ CQ DE ${callsign} カナ/EN K`);
  const [dxCall, setDxCall] = useState('');
  const [loopbackStatus, setLoopbackStatus] = useState<string | null>(null);
  const [activeToneMark, setActiveToneMark] = useState<boolean>(true);
  const [toneActive, setToneActive] = useState<boolean>(false);

  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const toneSpec = getJttyMarkSpaceFreqs(jttyConfig);
  const stdJttyHz = getStandardJttyFrequency(band);

  useEffect(() => {
    setJttyInput((prev) =>
      prev.startsWith('CQ CQ DE ') ? `CQ CQ DE ${callsign} カナ/EN K` : prev
    );
  }, [callsign]);

  // Crossed-banana XY tuning scope synchronized to JTTY 6-unit FSK tones
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

        ctx.fillStyle = 'rgba(4, 10, 18, 0.34)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 2);
        ctx.lineTo(cx, h - 2);
        ctx.moveTo(2, cy);
        ctx.lineTo(w - 2, cy);
        ctx.stroke();

        const tel = audioEngine?.getToneTelemetry();
        const isJttyTel = Boolean(tel && tel.mode === 'JTTY');
        const active = isPoweredOn && (isJttyTel || isSendingJtty);
        const markOn = isJttyTel ? Boolean(tel?.markActive) : true;

        setToneActive(active);
        setActiveToneMark(markOn);

        phase += active ? 0.38 : 0.12;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = active ? 1.8 : 1.1;

        if (!isPoweredOn) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(-1, -1, 2, 2);
        } else if (active) {
          const rx = markOn ? 4.2 : 24;
          const ry = markOn ? 14.5 : 3.6;
          ctx.strokeStyle = markOn ? '#34d399' : '#fbbf24';
          ctx.shadowColor = markOn ? '#10b981' : '#f59e0b';
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

          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.beginPath();
          ctx.ellipse(0, 0, markOn ? 18 : 3.2, markOn ? 2.6 : 11, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 3, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 11, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [audioEngine, isPoweredOn, isSendingJtty]);

  const handleLoopbackTest = () => {
    if (!isPoweredOn) return;
    const raw = sanitizeJttyText(jttyInput).trim() || `CQ DE ${callsign} ハロー K`;
    const sampleRate = 16000;
    const pcm = synthesizeJttyAudioPcm(raw, sampleRate, jttyConfig);
    const decoded = demodulateJttyPcm(pcm, sampleRate, jttyConfig);
    audioEngine?.playJttySequence(raw, 0.16, true, jttyConfig);
    setLoopbackStatus(`DSP SNR ${decoded.markSnrRatio}:1 (${decoded.words.length} JIS-6 wds)`);
    onLoopbackDecodeJtty(decoded.text || raw, decoded.markSnrRatio);
  };

  const handleConvertRomaji = () => {
    const converted = sanitizeJttyText(romajiToKatakana(jttyInput));
    setJttyInput(converted);
    onChangeJttyConfig({ ...jttyConfig, kanaShift: !jttyConfig.kanaShift });
  };

  const estSec = Math.max(0.2, jttyDurationMs(jttyInput || 'CQ', jttyConfig) / 1000).toFixed(1);

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-jtty">
      {/* Top Telemetry + XY Scope + 6-Unit JIS Modem Controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
        <div className="flex items-center gap-1.5">
          <canvas
            ref={scopeCanvasRef}
            width={74}
            height={38}
            data-testid="jtty-xy-scope"
            aria-label="JTTY 6-Unit FSK Tuning Scope"
            className="rounded border border-[#24364d] bg-[#040a12] shrink-0"
          />

          <div className="flex flex-col gap-0.5 font-mono-tabular">
            <div className="flex items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded border font-semibold ${
                  isSendingJtty
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : toneActive
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                }`}
              >
                {isSendingJtty ? 'JTTY TX' : toneActive ? 'MARK LOCK' : `JIS-6 ${toneSpec.baudRate}`}
              </span>
              <span className="text-slate-300" data-testid="jtty-mark-space-readout">
                M:{toneSpec.markHz} / S:{toneSpec.spaceHz} Hz
              </span>
            </div>

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
              <span className="text-sky-300/90">
                · {jttyConfig.kanaShift ? 'カナ SHIFT' : 'ALNUM/KANA'}
              </span>
              {loopbackStatus && (
                <span className="text-emerald-300 hidden sm:inline">· {loopbackStatus}</span>
              )}
            </div>
          </div>
        </div>

        {/* Modem Parameters */}
        <div className="flex flex-wrap items-center gap-1 font-mono-tabular">
          <select
            aria-label="JTTY Baud Rate"
            data-testid="jtty-baud-select"
            disabled={!isPoweredOn}
            value={jttyConfig.baudRate}
            onChange={(e) =>
              onChangeJttyConfig({
                ...jttyConfig,
                baudRate: Number(e.target.value) as JttyConfig['baudRate'],
              })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer disabled:opacity-40"
          >
            <option value={45.45}>45.45 Bd</option>
            <option value={50}>50 Bd</option>
            <option value={75}>75 Bd</option>
          </select>

          <select
            aria-label="JTTY FSK Shift"
            data-testid="jtty-shift-select"
            disabled={!isPoweredOn}
            value={jttyConfig.shiftHz}
            onChange={(e) =>
              onChangeJttyConfig({
                ...jttyConfig,
                shiftHz: Number(e.target.value) as JttyConfig['shiftHz'],
              })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer disabled:opacity-40"
          >
            <option value={170}>170 Hz</option>
            <option value={425}>425 Hz</option>
            <option value={850}>850 Hz</option>
          </select>

          <select
            aria-label="JTTY Mark Pitch"
            disabled={!isPoweredOn}
            value={jttyConfig.markHz}
            onChange={(e) =>
              onChangeJttyConfig({
                ...jttyConfig,
                markHz: Number(e.target.value) as JttyConfig['markHz'],
              })
            }
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-200 cursor-pointer disabled:opacity-40"
          >
            <option value={2125}>2125 Hz</option>
            <option value={1275}>1275 Hz</option>
          </select>

          <button
            type="button"
            data-testid="jtty-rev-toggle"
            disabled={!isPoweredOn}
            aria-pressed={jttyConfig.reversePolarity}
            onClick={() =>
              onChangeJttyConfig({
                ...jttyConfig,
                reversePolarity: !jttyConfig.reversePolarity,
              })
            }
            className={`px-1.5 py-0.5 rounded border cursor-pointer disabled:opacity-40 ${
              jttyConfig.reversePolarity
                ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                : 'bg-[#0a1019] border-[#24364d] text-slate-300'
            }`}
            title="Reverse Mark/Space FSK polarity"
          >
            REV
          </button>

          <button
            type="button"
            data-testid="jtty-kana-toggle"
            disabled={!isPoweredOn}
            aria-pressed={jttyConfig.kanaShift}
            onClick={handleConvertRomaji}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded border cursor-pointer disabled:opacity-40 ${
              jttyConfig.kanaShift
                ? 'bg-sky-500/25 border-sky-400 text-sky-200'
                : 'bg-[#0a1019] border-[#24364d] text-slate-300'
            }`}
            title="Convert Romaji draft to Katakana & toggle Kana shift"
          >
            <Languages className="w-2.5 h-2.5" />
            <span>カナ</span>
          </button>

          <button
            type="button"
            data-testid="jtty-qsy-button"
            disabled={!isPoweredOn}
            onClick={() => onTuneToFrequency(stdJttyHz, 'RTTY')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer disabled:opacity-40"
            title={`QSY to standard ${band} JTTY sub-band`}
          >
            <Radio className="w-2.5 h-2.5" />
            <span>QSY {(stdJttyHz / 1_000_000).toFixed(3)}</span>
          </button>

          <button
            type="button"
            data-testid="jtty-loopback-button"
            disabled={!isPoweredOn}
            onClick={handleLoopbackTest}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500 hover:text-slate-950 text-emerald-200 cursor-pointer disabled:opacity-40"
            title="Synthesize 6-unit JIS/Katakana FSK audio and run Goertzel loopback decoder"
          >
            <FlaskConical className="w-2.5 h-2.5" />
            <span>Loopback</span>
          </button>
        </div>
      </div>

      {/* Scrollable JTTY Terminal Feed */}
      <div
        className="flex-1 min-h-[68px] max-h-[92px] overflow-y-auto rounded border border-[#1c2c40] bg-[#04090f] p-1.5 font-mono-tabular text-[11px] space-y-0.5"
        data-testid="jtty-terminal-feed"
      >
        {jttyFeed.length === 0 ? (
          <div className="text-slate-500">
            JIS 6-unit Katakana / Latin FSK terminal ready on {(frequencyHz / 1_000_000).toFixed(3)} MHz. Run Loopback or Send JTTY.
          </div>
        ) : (
          jttyFeed.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => {
                const found = extractJttyCallsign(line, callsign);
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
                    : 'text-emerald-400'
                }`}
              >
                [{line.direction}]
              </span>
              <span className="text-sky-300 shrink-0">{line.callsign}:</span>
              <span className="text-amber-100 break-all">{line.text}</span>
            </button>
          ))
        )}
      </div>

      {/* DX Call + Macros */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono-tabular">
        <div className="flex flex-wrap items-center gap-1">
          <input
            type="text"
            data-testid="jtty-dxcall-input"
            aria-label="JTTY DX Callsign"
            value={dxCall}
            onChange={(e) => setDxCall(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 10))}
            placeholder="DX Call"
            className="w-24 px-1.5 py-0.5 rounded border border-[#24364d] bg-[#060b12] text-amber-200 uppercase focus:outline-none focus:border-sky-400"
          />
          {[
            { label: 'CQ', text: `CQ CQ DE ${callsign} ${callsign} K` },
            { label: 'カナ CQ', text: `CQ DE ${callsign} カナ/JTTY ハロー K` },
            {
              label: 'REPLY',
              text: `${dxCall || 'JA1AA'} DE ${callsign} UR 599 599 KN`,
            },
            { label: '599 QTH', text: `UR 599 QTH ${qth.grid} 73 BK` },
            { label: '73 SK', text: `${dxCall ? `${dxCall} ` : ''}TU DE ${callsign} サヨナラ 73 SK` },
          ].map((m) => (
            <button
              key={m.label}
              type="button"
              disabled={!isPoweredOn || isSendingJtty}
              onClick={() => setJttyInput(m.text)}
              className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-slate-300 cursor-pointer disabled:opacity-40"
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">~{estSec}s 6-FSK</span>
          {onLogQso && (
            <button
              type="button"
              data-testid="jtty-log-qso-button"
              disabled={!isPoweredOn}
              onClick={() => onLogQso(dxCall || 'JA1AA', 'RTTY')}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/25 text-sky-200 cursor-pointer disabled:opacity-40"
              title="Log JTTY contact to station logbook"
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
          const clean = sanitizeJttyText(jttyInput).trim();
          if (clean && isPoweredOn && !isSendingJtty) {
            onSendJtty(clean);
          }
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          data-testid="jtty-text-input"
          value={jttyInput}
          onChange={(e) => setJttyInput(sanitizeJttyText(e.target.value))}
          placeholder={`JTTY Katakana/Latin (e.g. CQ DE ${callsign} カナ K)`}
          className="flex-1 px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-xs text-sky-200 focus:outline-none focus:border-sky-400"
        />
        {isSendingJtty ? (
          <button
            key="jtty-stop-btn"
            type="button"
            data-testid="jtty-stop-button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onStopDigitalTx();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
          </button>
        ) : (
          <button
            key="jtty-send-btn"
            type="submit"
            disabled={!isPoweredOn || !jttyInput.trim()}
            data-testid="jtty-send-button"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/70 hover:bg-sky-500 hover:text-slate-950 text-sky-200 font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
          >
            <Send className="w-3 h-3" />
            <span>Send JTTY</span>
          </button>
        )}
      </form>
    </div>
  );
};
