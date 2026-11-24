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
  const stateRef = useRef({
    frequencyHz,
    filterWidthKhz,
    rfGainPct,
    noiseFloorDbm,
    isTransmitting,
    micRms,
    mode,
    stations,
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
    stations,
    spanKhz,
    zoom,
    isPoweredOn,
  };

  useEffect(() => {
    let rafId = 0;
    let lastTick = 0;

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      // Throttle waterfall/spectrum to ~24 fps for clean visual motion & low CPU
      if (now - lastTick < 42) return;
      lastTick = now;

      const s = stateRef.current;
      const scopeCanvas = scopeCanvasRef.current;
      const wfCanvas = waterfallCanvasRef.current;
      if (!scopeCanvas || !wfCanvas) return;

      const sCtx = scopeCanvas.getContext('2d');
      const wCtx = wfCanvas.getContext('2d');
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

      // Populate RF spectrum bins
      for (let i = 0; i < bins; i++) {
        const binFreq = minFreq + (i / (bins - 1)) * effectiveSpanHz;
        let dbm = baseFloor + (Math.random() - 0.5) * 6.5;

        // Add each active station on the current band
        for (const item of s.stations) {
          if (!item.station.isTransmitting) continue;
          const distHz = Math.abs(binFreq - item.station.frequencyHz);
          const bwHz = item.station.mode === 'CW' ? 280 : item.station.mode === 'FM' ? 6000 : 2400;
          if (distHz < bwHz * 1.4) {
            const shape = Math.exp(-Math.pow(distHz / (bwHz * 0.45), 2));
            const pulse = item.station.isBeacon
              ? 0.8 + 0.2 * Math.sin(now * 0.008 + item.station.frequencyHz)
              : 0.9 + 0.1 * Math.sin(now * 0.015);
            const sigPeak = item.evalResult.rxPowerDbm * pulse;
            if (sigPeak > dbm) {
              dbm = dbm + (sigPeak - dbm) * shape;
            }
          }
        }

        // Add own TX spike when PTT or CW TX is active
        if (s.isTransmitting) {
          const distHz = Math.abs(binFreq - s.frequencyHz);
          const txBw = s.mode === 'CW' ? 350 : 2500;
          if (distHz < txBw) {
            const shape = Math.exp(-Math.pow(distHz / (txBw * 0.38), 2));
            const txLevel = -26 + Math.min(12, s.micRms * 45) + (Math.random() - 0.5) * 3;
            dbm = Math.max(dbm, baseFloor + (txLevel - baseFloor) * shape);
          }
        }

        spectrumDbm[i] = Math.max(-140, Math.min(-18, dbm));
      }

      // Draw Spectrum Scope
      sCtx.clearRect(0, 0, W, H);
      const bgGrad = sCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#050b14');
      bgGrad.addColorStop(1, '#081322');
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, W, H);

      const dbmToY = (dbm: number) => {
        const norm = (dbm - -140) / (-18 - -140);
        return H - 20 - Math.max(0, Math.min(1, norm)) * (H - 30);
      };

      // Horizontal dBm gridlines
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

      // Vertical frequency gridlines & axis labels
      const tickCount = 6;
      for (let t = 1; t < tickCount; t++) {
        const frac = t / tickCount;
        const x = 36 + frac * (W - 44);
        const fMhz = (minFreq + frac * effectiveSpanHz) / 1_000_000;
        sCtx.strokeStyle = 'rgba(56, 94, 138, 0.22)';
        sCtx.beginPath();
        sCtx.moveTo(x, 8);
        sCtx.lineTo(x, H - 18);
        sCtx.stroke();
        sCtx.fillStyle = '#8faac7';
        sCtx.fillText(fMhz.toFixed(3), x - 18, H - 5);
      }

      // Tuned Filter Passband Highlight around center frequency
      const centerX = 36 + 0.5 * (W - 44);
      const passbandPx = Math.max(6, ((s.filterWidthKhz * 1000) / effectiveSpanHz) * (W - 44));
      sCtx.fillStyle = s.isTransmitting ? 'rgba(244, 63, 94, 0.18)' : 'rgba(34, 184, 255, 0.16)';
      sCtx.fillRect(centerX - passbandPx / 2, 8, passbandPx, H - 26);

      sCtx.strokeStyle = s.isTransmitting ? '#fb7185' : '#38bdf8';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.moveTo(centerX, 8);
      sCtx.lineTo(centerX, H - 18);
      sCtx.stroke();

      // Spectrum Trace Fill & Line
      sCtx.beginPath();
      for (let i = 0; i < bins; i++) {
        const x = 36 + (i / (bins - 1)) * (W - 44);
        const y = dbmToY(spectrumDbm[i]);
        if (i === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      const traceGrad = sCtx.createLinearGradient(0, 10, 0, H - 18);
      traceGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      traceGrad.addColorStop(1, 'rgba(14, 165, 233, 0.04)');
      sCtx.strokeStyle = '#bae6fd';
      sCtx.lineWidth = 1.5;
      sCtx.stroke();

      sCtx.lineTo(W - 8, H - 18);
      sCtx.lineTo(36, H - 18);
      sCtx.closePath();
      sCtx.fillStyle = traceGrad;
      sCtx.fill();

      // Station Callsign Labels on Scope
      sCtx.font = '10px "JetBrains Mono", monospace';
      for (const item of s.stations) {
        if (!item.station.isTransmitting) continue;
        if (item.station.frequencyHz < minFreq || item.station.frequencyHz > maxFreq) continue;
        const frac = (item.station.frequencyHz - minFreq) / effectiveSpanHz;
        const x = 36 + frac * (W - 44);
        const y = Math.max(18, dbmToY(item.evalResult.rxPowerDbm) - 8);
        sCtx.fillStyle = item.station.isBeacon ? '#7dd3fc' : '#34d399';
        sCtx.fillText(item.station.callsign, Math.max(40, Math.min(W - 65, x - 22)), y);
      }

      // Waterfall scroll down 2px
      wCtx.drawImage(wfCanvas, 0, 0, W, WH - 2, 0, 2, W, WH - 2);
      const rowImg = wCtx.createImageData(W, 2);
      for (let px = 0; px < W; px++) {
        const idxNorm = px < 36 ? 0 : Math.min(1, Math.max(0, (px - 36) / (W - 44)));
        const binIdx = Math.min(bins - 1, Math.floor(idxNorm * (bins - 1)));
        const dbm = spectrumDbm[binIdx];
        const norm = (dbm - -132) / (-45 - -132);
        const [r, g, b] = px < 36 ? [6, 12, 24] : thermalColor(norm);
        for (let row = 0; row < 2; row++) {
          const offset = (row * W + px) * 4;
          rowImg.data[offset] = r;
          rowImg.data[offset + 1] = g;
          rowImg.data[offset + 2] = b;
          rowImg.data[offset + 3] = 255;
        }
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

  const stationsOnBand = stations.filter((s) => s.station.band === band);

  return (
    <section className="sdr-panel rounded-md p-1.5 flex flex-col gap-1 flex-1 min-h-0">
      {/* Scope Header Bar */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <h2 className="text-[11px] font-display font-semibold tracking-wider uppercase text-slate-200 whitespace-nowrap">
            Scope
          </h2>
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

        {/* Active Signals Quick-Tune Strip */}
        <div className="flex flex-wrap items-center gap-1 min-w-0">
          {stationsOnBand.slice(0, 2).map(({ station, evalResult }) => (
            <button
              key={station.id}
              type="button"
              onClick={() => onTuneToFrequency(station.frequencyHz, station.mode)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono-tabular border transition-colors cursor-pointer whitespace-nowrap ${
                Math.abs(station.frequencyHz - frequencyHz) < 800
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-[#0b121d] border-[#1f3147] text-slate-300 hover:border-sky-400/50'
              }`}
              title={`Tune to ${station.callsign} (${(station.frequencyHz / 1_000_000).toFixed(3)} MHz ${station.mode}, ${evalResult.sMeterText})`}
            >
              {station.callsign} · {evalResult.sMeterText}
            </button>
          ))}
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

      {/* Spectrum Canvas */}
      <div className="border border-[#1c2c40] rounded overflow-hidden bg-[#060c16] flex-1 flex flex-col">
        <canvas
          ref={scopeCanvasRef}
          width={680}
          height={112}
          onClick={handleCanvasClick}
          data-testid="spectrum-scope-canvas"
          className="w-full h-[108px] block cursor-crosshair"
        />
        <canvas
          ref={waterfallCanvasRef}
          width={680}
          height={80}
          onClick={handleCanvasClick}
          data-testid="waterfall-canvas"
          className="w-full h-[78px] block border-t border-[#162538] cursor-crosshair"
        />
      </div>
    </section>
  );
};
