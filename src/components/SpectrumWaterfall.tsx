import React, { useEffect, useRef } from 'react';
import { Crosshair, Maximize2 } from 'lucide-react';
import { BANDS } from '../radio/physics';
import { BandId, RadioMode, RemoteStation, SignalEvaluation } from '../types/radio';

interface SpectrumWaterfallProps {
  band: BandId;
  onSelectBand: (b: BandId) => void;
  frequencyHz: number;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
  filterWidthKhz: number;
  rfGainPct: number;
  noiseFloorDbm: number;
  isTransmitting: boolean;
  micRms: number;
  mode: RadioMode;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  spanKhz: number;
  onChangeSpanKhz: (khz: number) => void;
  zoom: number;
  onChangeZoom: (z: number) => void;
  isPoweredOn?: boolean;
}

function thermalColor(norm: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));
  if (t < 0.25) {
    const k = t / 0.25;
    return [4 + k * 8, 12 + k * 40, 42 + k * 110];
  }
  if (t < 0.52) {
    const k = (t - 0.25) / 0.27;
    return [12 + k * 20, 52 + k * 150, 152 + k * 90];
  }
  if (t < 0.78) {
    const k = (t - 0.52) / 0.26;
    return [32 + k * 218, 202 + k * 45, 242 - k * 180];
  }
  const k = (t - 0.78) / 0.22;
  return [250, 247 - k * 165, 62 - k * 45];
}

function modeSpectralShape(distHz: number, mode: RadioMode, timeNow: number, baseFreq: number): number {
  if (mode === 'CW') {
    return distHz < 380 ? Math.exp(-Math.pow(distHz / 110, 2)) : 0;
  }
  if (mode === 'RTTY') {
    // Classic twin-peak 170 Hz shift FSK lobes
    const markDist = Math.abs(distHz - 85);
    const spaceDist = Math.abs(distHz + 85);
    const markAmp = 0.75 + 0.25 * Math.sin(timeNow * 0.045 + baseFreq);
    const spaceAmp = 0.75 + 0.25 * Math.cos(timeNow * 0.045 + baseFreq);
    return Math.max(
      markDist < 190 ? markAmp * Math.exp(-Math.pow(markDist / 60, 2)) : 0,
      spaceDist < 190 ? spaceAmp * Math.exp(-Math.pow(spaceDist / 60, 2)) : 0
    );
  }
  if (mode === 'FT8' || mode === 'DIGITAL') {
    return distHz < 180 ? Math.exp(-Math.pow(distHz / 45, 2)) : 0;
  }
  if (mode === 'SSTV') {
    return distHz < 2200 ? Math.exp(-Math.pow(distHz / 980, 2)) * (0.8 + 0.2 * Math.sin(timeNow * 0.03)) : 0;
  }
  const bwHz = mode === 'FM' ? 6000 : 2400;
  return distHz < bwHz * 1.35 ? Math.exp(-Math.pow(distHz / (bwHz * 0.45), 2)) : 0;
}

export const SpectrumWaterfall: React.FC<SpectrumWaterfallProps> = ({
  band,
  onSelectBand,
  frequencyHz,
  onTuneToFrequency,
  filterWidthKhz,
  rfGainPct,
  noiseFloorDbm,
  isTransmitting,
  micRms,
  mode,
  stations,
  spanKhz,
  onChangeSpanKhz,
  zoom,
  onChangeZoom,
  isPoweredOn = true,
}) => {
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Strictly real connected users ONLY (no simulated propagation beacons on waterfall)
  const realUsers = stations.filter((s) => !s.station.isBeacon);

  const stateRef = useRef({
    frequencyHz,
    filterWidthKhz,
    rfGainPct,
    noiseFloorDbm,
    isTransmitting,
    micRms,
    mode,
    stations: realUsers,
    spanKhz,
    zoom,
    isPoweredOn,
  });
  stateRef.current = {
    frequencyHz,
    filterWidthKhz,
    rfGainPct,
    noiseFloorDbm,
    isTransmitting,
    micRms,
    mode,
    stations: realUsers,
    spanKhz,
    zoom,
    isPoweredOn,
  };

  useEffect(() => {
    let rafId = 0;
    let lastTick = 0;

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      if (now - lastTick < 95) return;
      lastTick = now;

      const s = stateRef.current;
      const scopeCanvas = scopeCanvasRef.current;
      const wfCanvas = waterfallCanvasRef.current;
      if (!scopeCanvas || !wfCanvas) return;

      const sCtx = scopeCanvas.getContext('2d');
      const wCtx = wfCanvas.getContext('2d', { willReadFrequently: true });
      if (!sCtx || !wCtx) return;

      const W = scopeCanvas.width;
      const H = scopeCanvas.height;
      const WH = wfCanvas.height;

      if (!s.isPoweredOn) {
        sCtx.fillStyle = '#03060c';
        sCtx.fillRect(0, 0, W, H);
        sCtx.font = '11px "JetBrains Mono", monospace';
        sCtx.fillStyle = '#475569';
        sCtx.textAlign = 'center';
        sCtx.fillText('TRANSCEIVER POWERED OFF · PRESS ON/OFF TO START', W / 2, H / 2 + 4);
        sCtx.textAlign = 'start';
        wCtx.fillStyle = '#03060c';
        wCtx.fillRect(0, 0, W, WH);
        return;
      }

      const effectiveSpanHz = (s.spanKhz * 1000) / s.zoom;
      const minFreq = s.frequencyHz - effectiveSpanHz / 2;
      const maxFreq = s.frequencyHz + effectiveSpanHz / 2;

      const bins = 240;
      const spectrumDbm = new Float32Array(bins);
      const baseFloor = s.noiseFloorDbm + (s.rfGainPct - 50) * 0.14;

      for (let i = 0; i < bins; i++) {
        const binFreq = minFreq + (i / (bins - 1)) * effectiveSpanHz;
        let dbm = baseFloor + (Math.random() - 0.5) * 5.2;

        // Plot ONLY real connected users transmitting on air whose VOACAP propagation circuit is open
        for (const item of s.stations) {
          if (!item.station.isTransmitting || !item.evalResult.propagationOpen) continue;
          const distHz = Math.abs(binFreq - item.station.frequencyHz);
          const shape = modeSpectralShape(distHz, item.station.mode, now, item.station.frequencyHz);
          if (shape > 0.01) {
            const pulse = 0.92 + 0.08 * Math.sin(now * 0.015);
            const sigPeak = item.evalResult.rxPowerDbm * pulse;
            if (sigPeak > dbm) {
              dbm = dbm + (sigPeak - dbm) * shape;
            }
          }
        }

        // Plot own active TX RF carrier
        if (s.isTransmitting) {
          const distHz = Math.abs(binFreq - s.frequencyHz);
          const shape = modeSpectralShape(distHz, s.mode, now, s.frequencyHz);
          if (shape > 0.01) {
            const txLevel = -24 + Math.min(10, s.micRms * 42) + (Math.random() - 0.5) * 2.5;
            dbm = Math.max(dbm, baseFloor + (txLevel - baseFloor) * shape);
          }
        }

        spectrumDbm[i] = Math.max(-140, Math.min(-18, dbm));
      }

      sCtx.clearRect(0, 0, W, H);
      const bgGrad = sCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#050b14');
      bgGrad.addColorStop(1, '#081322');
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, W, H);

      const dbmToY = (dbm: number) => {
        const norm = (dbm - -140) / (-18 - -140);
        return H - 18 - Math.max(0, Math.min(1, norm)) * (H - 28);
      };

      sCtx.strokeStyle = 'rgba(56, 94, 138, 0.28)';
      sCtx.lineWidth = 1;
      sCtx.font = '10px "JetBrains Mono", monospace';
      sCtx.fillStyle = '#7b97b6';
      for (const db of [-20, -40, -60, -80, -100, -120, -140]) {
        const y = dbmToY(db);
        sCtx.beginPath();
        sCtx.moveTo(36, y);
        sCtx.lineTo(W, y);
        sCtx.stroke();
        sCtx.fillText(`${db}`, 6, y + 3);
      }

      const tickCount = 6;
      for (let t = 1; t < tickCount; t++) {
        const frac = t / tickCount;
        const x = 36 + frac * (W - 44);
        const fMhz = (minFreq + frac * effectiveSpanHz) / 1_000_000;
        sCtx.strokeStyle = 'rgba(56, 94, 138, 0.22)';
        sCtx.beginPath();
        sCtx.moveTo(x, 8);
        sCtx.lineTo(x, H - 16);
        sCtx.stroke();
        sCtx.fillStyle = '#8faac7';
        sCtx.fillText(fMhz.toFixed(3), x - 18, H - 4);
      }

      const centerX = 36 + 0.5 * (W - 44);
      const passbandPx = Math.max(6, ((s.filterWidthKhz * 1000) / effectiveSpanHz) * (W - 44));
      sCtx.fillStyle = s.isTransmitting ? 'rgba(244, 63, 94, 0.18)' : 'rgba(34, 184, 255, 0.16)';
      sCtx.fillRect(centerX - passbandPx / 2, 8, passbandPx, H - 24);

      sCtx.strokeStyle = s.isTransmitting ? '#fb7185' : '#38bdf8';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.moveTo(centerX, 8);
      sCtx.lineTo(centerX, H - 16);
      sCtx.stroke();

      sCtx.beginPath();
      for (let i = 0; i < bins; i++) {
        const x = 36 + (i / (bins - 1)) * (W - 44);
        const y = dbmToY(spectrumDbm[i]);
        if (i === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      const traceGrad = sCtx.createLinearGradient(0, 10, 0, H - 16);
      traceGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      traceGrad.addColorStop(1, 'rgba(14, 165, 233, 0.04)');
      sCtx.strokeStyle = '#bae6fd';
      sCtx.lineWidth = 1.5;
      sCtx.stroke();

      sCtx.lineTo(W - 8, H - 16);
      sCtx.lineTo(36, H - 16);
      sCtx.closePath();
      sCtx.fillStyle = traceGrad;
      sCtx.fill();

      // Callsign labels for real transmitting users with open propagation
      sCtx.font = '10px "JetBrains Mono", monospace';
      for (const item of s.stations) {
        if (!item.station.isTransmitting || !item.evalResult.propagationOpen) continue;
        if (item.station.frequencyHz < minFreq || item.station.frequencyHz > maxFreq) continue;
        const frac = (item.station.frequencyHz - minFreq) / effectiveSpanHz;
        const x = 36 + frac * (W - 44);
        const y = Math.max(18, dbmToY(item.evalResult.rxPowerDbm) - 8);
        sCtx.fillStyle = '#34d399';
        sCtx.fillText(item.station.callsign, Math.max(40, Math.min(W - 65, x - 22)), y);
      }

      // Waterfall scroll down 1px per tick via ImageData copy (Safari/WebKit Metal 2D safe)
      if (WH > 1) {
        const prevImg = wCtx.getImageData(0, 0, W, WH - 1);
        wCtx.putImageData(prevImg, 0, 1);
      }
      const rowImg = wCtx.createImageData(W, 1);
      for (let px = 0; px < W; px++) {
        const idxNorm = px < 36 ? 0 : Math.min(1, Math.max(0, (px - 36) / (W - 44)));
        const binIdx = Math.min(bins - 1, Math.floor(idxNorm * (bins - 1)));
        const dbm = spectrumDbm[binIdx];
        const norm = (dbm - -132) / (-45 - -132);
        const [r, g, b] = px < 36 ? [6, 12, 24] : thermalColor(norm);
        const offset = px * 4;
        rowImg.data[offset] = r;
        rowImg.data[offset + 1] = g;
        rowImg.data[offset + 2] = b;
        rowImg.data[offset + 3] = 255;
      }
      wCtx.putImageData(rowImg, 0, 0);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const effectiveSpanHz = (spanKhz * 1000) / zoom;
    const minFreq = frequencyHz - effectiveSpanHz / 2;
    const clickedHz = Math.round(minFreq + relX * effectiveSpanHz);
    onTuneToFrequency(clickedHz);
  };

  const realUsersOnBand = realUsers.filter((s) => s.station.band === band);

  return (
    <div className="flex flex-col gap-1 flex-1 min-h-0">
      {/* Scope Header Bar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-display font-semibold tracking-wider uppercase text-emerald-300 whitespace-nowrap">
            Live Users Only
          </span>
          <label className="sr-only" htmlFor="scope-band-select">
            Scope Band
          </label>
          <select
            id="scope-band-select"
            value={band}
            onChange={(e) => onSelectBand(e.target.value as BandId)}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-[11px] text-sky-300 cursor-pointer"
          >
            {BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        {/* Active Live Operators Quick-Tune Strip */}
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {realUsersOnBand.length === 0 ? (
            <span className="text-[10px] font-mono-tabular text-slate-400 whitespace-nowrap">
              No active TX on {band}
            </span>
          ) : (
            realUsersOnBand.slice(0, 3).map(({ station, evalResult }) => (
              <button
                key={station.id}
                type="button"
                onClick={() => onTuneToFrequency(station.frequencyHz, station.mode)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer whitespace-nowrap ${
                  !evalResult.propagationOpen
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : Math.abs(station.frequencyHz - frequencyHz) < 800
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-[#0b121d] border-[#1f3147] text-slate-300 hover:border-sky-400/50'
                }`}
                title={`Tune to ${station.callsign} (${(station.frequencyHz / 1_000_000).toFixed(3)} MHz ${station.mode}, ${evalResult.propagationOpen ? evalResult.sMeterText : 'Prop Closed'})`}
              >
                {station.callsign} · {evalResult.propagationOpen ? evalResult.sMeterText : 'Closed'}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <label className="sr-only" htmlFor="scope-span-select">
            Spectrum Span
          </label>
          <select
            id="scope-span-select"
            value={spanKhz}
            onChange={(e) => onChangeSpanKhz(Number(e.target.value))}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
          >
            <option value={10}>Span: 10 kHz</option>
            <option value={25}>Span: 25 kHz</option>
            <option value={50}>Span: 50 kHz</option>
            <option value={100}>Span: 100 kHz</option>
          </select>

          <label className="sr-only" htmlFor="scope-zoom-select">
            Spectrum Zoom
          </label>
          <select
            id="scope-zoom-select"
            value={zoom}
            onChange={(e) => onChangeZoom(Number(e.target.value))}
            className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-[11px] text-slate-200 cursor-pointer"
          >
            <option value={1}>Zoom: 1x</option>
            <option value={2}>Zoom: 2x</option>
            <option value={4}>Zoom: 4x</option>
          </select>

          <button
            type="button"
            onClick={() => onChangeZoom(1)}
            className="p-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-300 hover:border-sky-400 cursor-pointer"
            aria-label="Center Spectrum Scope"
            title="Reset Zoom to 1x"
          >
            <Crosshair className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onChangeSpanKhz(spanKhz === 50 ? 25 : 50)}
            className="p-0.5 rounded border border-[#24364d] bg-[#0a1019] text-slate-300 hover:border-sky-400 cursor-pointer"
            aria-label="Toggle Span Width"
            title="Toggle 25 kHz / 50 kHz span"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Spectrum & Waterfall Canvases */}
      <div className="border border-[#1c2c40] rounded overflow-hidden bg-[#060c16] flex-1 flex flex-col">
        <canvas
          ref={scopeCanvasRef}
          width={680}
          height={88}
          onClick={handleCanvasClick}
          data-testid="spectrum-scope-canvas"
          className="w-full h-[84px] block cursor-crosshair"
        />
        <canvas
          ref={waterfallCanvasRef}
          width={680}
          height={62}
          onClick={handleCanvasClick}
          data-testid="waterfall-canvas"
          className="w-full h-[60px] block border-t border-[#162538] cursor-crosshair"
        />
      </div>
    </div>
  );
};
