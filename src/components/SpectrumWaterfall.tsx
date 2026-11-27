import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Maximize2 } from 'lucide-react';
import { SdrAudioEngine } from '../audio/sdrAudioEngine';
import { BANDS } from '../radio/physics';
import {
  buildWaterfallColorLut,
  collectVisibleSignalMarkers,
  computeNotchRfOffsetHz,
  computePassbandOffsetsHz,
  frequencyHzToPixelX,
  getEffectiveSpanHz,
  getWaterfallPlotWidth,
  pixelXToFrequencyHz,
  pushWaterfallSliceRow,
  shiftWaterfallBufferHorizontal,
  synthesizeSpectrumSlice,
  WATERFALL_BINS,
  WATERFALL_PLOT_LEFT,
  WATERFALL_PLOT_RIGHT,
  WaterfallPaletteId,
  WaterfallSignalBurst,
} from '../radio/waterfall';
import { BandId, RadioMode, RemoteStation, SignalEvaluation } from '../types/radio';
import { computeWheelStepDirection } from '../utils/browserCompat';

interface SpectrumWaterfallProps {
  band: BandId;
  onSelectBand: (b: BandId) => void;
  frequencyHz: number;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
  onTuneDelta?: (deltaHz: number) => void;
  stepHz?: number;
  filterWidthKhz: number;
  rfGainPct: number;
  noiseFloorDbm: number;
  noiseReductionPct?: number;
  noiseBlankerPct?: number;
  notchPct?: number;
  ritHz?: number;
  rttyShiftHz?: number;
  isTransmitting: boolean;
  micRms: number;
  mode: RadioMode;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  beaconStations?: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  signalBurstsRef?: React.RefObject<WaterfallSignalBurst[]>;
  audioEngine?: SdrAudioEngine | null;
  spanKhz: number;
  onChangeSpanKhz: (khz: number) => void;
  zoom: number;
  onChangeZoom: (z: number) => void;
  isPoweredOn?: boolean;
  isActive?: boolean;
}

const PALETTE_ORDER: WaterfallPaletteId[] = ['aurora', 'thermal', 'phosphor'];
const PALETTE_LABELS: Record<WaterfallPaletteId, string> = {
  aurora: 'AUR',
  thermal: 'THM',
  phosphor: 'PHOS',
};

export const SpectrumWaterfall: React.FC<SpectrumWaterfallProps> = ({
  band,
  onSelectBand,
  frequencyHz,
  onTuneToFrequency,
  onTuneDelta,
  stepHz = 100,
  filterWidthKhz,
  rfGainPct,
  noiseFloorDbm,
  noiseReductionPct = 48,
  noiseBlankerPct = 0,
  notchPct = 0,
  ritHz = 0,
  rttyShiftHz = 170,
  isTransmitting,
  micRms,
  mode,
  stations,
  beaconStations = [],
  signalBurstsRef,
  audioEngine = null,
  spanKhz,
  onChangeSpanKhz,
  zoom,
  onChangeZoom,
  isPoweredOn = true,
  isActive = true,
}) => {
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [palette, setPalette] = useState<WaterfallPaletteId>('aurora');
  const [peakHoldEnabled, setPeakHoldEnabled] = useState<boolean>(true);
  const [showBeacons, setShowBeacons] = useState<boolean>(true);

  const lutRef = useRef<Uint8ClampedArray>(buildWaterfallColorLut('aurora'));
  useEffect(() => {
    lutRef.current = buildWaterfallColorLut(palette);
  }, [palette]);

  // Persistent waterfall RGBA history & scope traces survive tab switches seamlessly
  const wfBufRef = useRef<Uint8ClampedArray | null>(null);
  const wfImgRef = useRef<ImageData | null>(null);
  const smoothedRef = useRef<Float32Array>(new Float32Array(WATERFALL_BINS).fill(-124));
  const peakHoldRef = useRef<Float32Array>(new Float32Array(WATERFALL_BINS).fill(-124));
  const prevViewRef = useRef<{
    band: BandId;
    frequencyHz: number;
    spanKhz: number;
    zoom: number;
  }>({ band, frequencyHz, spanKhz, zoom });

  const hoverRef = useRef<{ active: boolean; canvasX: number; canvasY: number }>({
    active: false,
    canvasX: 0,
    canvasY: 0,
  });

  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    startClientX: number;
    startFreqHz: number;
    rectWidth: number;
    didDrag: boolean;
  }>({
    active: false,
    pointerId: -1,
    startClientX: 0,
    startFreqHz: frequencyHz,
    rectWidth: 680,
    didDrag: false,
  });

  // Strictly real connected users in stations list; beacons stay isolated for scope/waterfall only
  const realUsers = stations.filter((s) => !s.station.isBeacon);

  const stateRef = useRef({
    band,
    frequencyHz,
    filterWidthKhz,
    rfGainPct,
    noiseFloorDbm,
    noiseReductionPct,
    noiseBlankerPct,
    notchPct,
    ritHz,
    rttyShiftHz,
    isTransmitting,
    micRms,
    mode,
    stations: realUsers,
    beaconStations,
    showBeacons,
    spanKhz,
    zoom,
    isPoweredOn,
    isActive,
    peakHoldEnabled,
    stepHz,
    audioEngine,
    onTuneToFrequency,
    onTuneDelta,
  });
  stateRef.current = {
    band,
    frequencyHz,
    filterWidthKhz,
    rfGainPct,
    noiseFloorDbm,
    noiseReductionPct,
    noiseBlankerPct,
    notchPct,
    ritHz,
    rttyShiftHz,
    isTransmitting,
    micRms,
    mode,
    stations: realUsers,
    beaconStations,
    showBeacons,
    spanKhz,
    zoom,
    isPoweredOn,
    isActive,
    peakHoldEnabled,
    stepHz,
    audioEngine,
    onTuneToFrequency,
    onTuneDelta,
  };

  // Attach native non-passive wheel listeners so Mac/Windows/Linux wheel/trackpad scrolling tunes cleanly without page scroll
  useEffect(() => {
    const scopeEl = scopeCanvasRef.current;
    const wfEl = waterfallCanvasRef.current;
    if (!scopeEl || !wfEl) return;

    const handleWheel = (e: WheelEvent) => {
      const s = stateRef.current;
      if (!s.isPoweredOn) return;
      const dir = computeWheelStepDirection(e.deltaY, e.deltaMode);
      if (dir === 0) return;
      e.preventDefault();
      const tuneStep = e.shiftKey ? 10 : Math.max(10, s.stepHz);
      if (s.onTuneDelta) {
        s.onTuneDelta(dir * tuneStep);
      } else {
        s.onTuneToFrequency(s.frequencyHz + dir * tuneStep);
      }
    };

    scopeEl.addEventListener('wheel', handleWheel, { passive: false });
    wfEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      scopeEl.removeEventListener('wheel', handleWheel);
      wfEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    let lastTick = 0;

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      const s = stateRef.current;
      const frameIntervalMs = s.isActive ? 72 : 240;
      if (now - lastTick < frameIntervalMs) return;
      lastTick = now;

      const scopeCanvas = scopeCanvasRef.current;
      const wfCanvas = waterfallCanvasRef.current;
      if (!scopeCanvas || !wfCanvas) return;

      const W = scopeCanvas.width;
      const H = scopeCanvas.height;
      const WH = wfCanvas.height;

      if (!wfBufRef.current || wfBufRef.current.length !== W * WH * 4) {
        wfBufRef.current = new Uint8ClampedArray(W * WH * 4);
        for (let i = 0; i < wfBufRef.current.length; i += 4) {
          wfBufRef.current[i] = 6;
          wfBufRef.current[i + 1] = 12;
          wfBufRef.current[i + 2] = 24;
          wfBufRef.current[i + 3] = 255;
        }
        wfImgRef.current = null;
      }

      const sCtx = scopeCanvas.getContext('2d');
      const wCtx = wfCanvas.getContext('2d');
      if (!sCtx || !wCtx) return;

      if (!s.isPoweredOn) {
        if (s.isActive) {
          sCtx.fillStyle = '#03060c';
          sCtx.fillRect(0, 0, W, H);
          sCtx.font = '11px "JetBrains Mono", monospace';
          sCtx.fillStyle = '#475569';
          sCtx.textAlign = 'center';
          sCtx.fillText('TRANSCEIVER POWERED OFF · PRESS ON/OFF TO START', W / 2, H / 2 + 4);
          sCtx.textAlign = 'start';
          wCtx.fillStyle = '#03060c';
          wCtx.fillRect(0, 0, W, WH);
        }
        return;
      }

      // Track band/span/zoom/frequency changes so existing waterfall trails shift cleanly with VFO tuning
      const prev = prevViewRef.current;
      const effectiveSpanHz = getEffectiveSpanHz(s.spanKhz, s.zoom);
      const plotWidth = getWaterfallPlotWidth(W);
      if (prev.band !== s.band || prev.spanKhz !== s.spanKhz || prev.zoom !== s.zoom) {
        for (let i = 0; i < wfBufRef.current.length; i += 4) {
          wfBufRef.current[i] = 6;
          wfBufRef.current[i + 1] = 12;
          wfBufRef.current[i + 2] = 24;
          wfBufRef.current[i + 3] = 255;
        }
        smoothedRef.current.fill(s.noiseFloorDbm);
        peakHoldRef.current.fill(s.noiseFloorDbm);
      } else if (prev.frequencyHz !== s.frequencyHz) {
        const deltaFreqHz = prev.frequencyHz - s.frequencyHz;
        const shiftPx = Math.round((deltaFreqHz / effectiveSpanHz) * plotWidth);
        if (shiftPx !== 0) {
          shiftWaterfallBufferHorizontal(wfBufRef.current, W, WH, shiftPx);
          peakHoldRef.current.fill(s.noiseFloorDbm);
        }
      }
      prevViewRef.current = {
        band: s.band,
        frequencyHz: s.frequencyHz,
        spanKhz: s.spanKhz,
        zoom: s.zoom,
      };

      const minFreq = s.frequencyHz - effectiveSpanHz / 2;
      const nowEpochMs = Date.now();
      const toneTel = s.audioEngine?.getToneTelemetry();
      const basebandFft = s.audioEngine?.getBasebandSpectrum(96, 3600) ?? null;

      const rawSlice = synthesizeSpectrumSlice({
        bins: WATERFALL_BINS,
        centerFreqHz: s.frequencyHz,
        spanKhz: s.spanKhz,
        zoom: s.zoom,
        mode: s.mode,
        band: s.band,
        filterWidthKhz: s.filterWidthKhz,
        rfGainPct: s.rfGainPct,
        noiseFloorDbm: s.noiseFloorDbm,
        noiseReductionPct: s.noiseReductionPct,
        noiseBlankerPct: s.noiseBlankerPct,
        notchPct: s.notchPct,
        isTransmitting: s.isTransmitting,
        micRms: s.micRms,
        nowMs: nowEpochMs,
        stations: s.stations,
        beacons: s.beaconStations,
        showBeacons: s.showBeacons,
        bursts: signalBurstsRef?.current,
        toneTelemetry: toneTel,
        rttyShiftHz: s.rttyShiftHz,
        basebandFft,
      });

      const smoothed = smoothedRef.current;
      const peakHold = peakHoldRef.current;
      for (let i = 0; i < WATERFALL_BINS; i++) {
        const val = rawSlice[i];
        // Fast attack, smooth decay for crisp readable trace
        const prevS = smoothed[i];
        smoothed[i] = val > prevS ? prevS * 0.35 + val * 0.65 : prevS * 0.62 + val * 0.38;

        const prevP = peakHold[i];
        peakHold[i] = Math.max(smoothed[i], prevP - 0.32);
      }

      const baseFloor = s.noiseFloorDbm + (s.rfGainPct - 50) * 0.16;
      pushWaterfallSliceRow(wfBufRef.current, W, WH, rawSlice, baseFloor, lutRef.current);

      // Skip painting visible canvas frames if currently hidden on another tab (buffer kept ticking cleanly!)
      if (!s.isActive) return;

      // 1. Draw Spectrum Scope
      sCtx.clearRect(0, 0, W, H);
      const bgGrad = sCtx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#040a13');
      bgGrad.addColorStop(1, '#081424');
      sCtx.fillStyle = bgGrad;
      sCtx.fillRect(0, 0, W, H);

      const dbmToY = (dbm: number) => {
        const norm = (dbm - -140) / (-16 - -140);
        return H - 17 - Math.max(0, Math.min(1, norm)) * (H - 27);
      };

      sCtx.strokeStyle = 'rgba(56, 94, 138, 0.28)';
      sCtx.lineWidth = 1;
      sCtx.font = '10px "JetBrains Mono", monospace';
      sCtx.fillStyle = '#7b97b6';
      for (const db of [-20, -40, -60, -80, -100, -120, -140]) {
        const y = dbmToY(db);
        sCtx.beginPath();
        sCtx.moveTo(WATERFALL_PLOT_LEFT, y);
        sCtx.lineTo(W - WATERFALL_PLOT_RIGHT, y);
        sCtx.stroke();
        sCtx.fillText(`${db}`, 5, y + 3);
      }

      const tickCount = 6;
      for (let t = 1; t < tickCount; t++) {
        const frac = t / tickCount;
        const x = WATERFALL_PLOT_LEFT + frac * plotWidth;
        const fMhz = (minFreq + frac * effectiveSpanHz) / 1_000_000;
        sCtx.strokeStyle = 'rgba(56, 94, 138, 0.22)';
        sCtx.beginPath();
        sCtx.moveTo(x, 8);
        sCtx.lineTo(x, H - 15);
        sCtx.stroke();
        sCtx.fillStyle = '#8faac7';
        sCtx.fillText(fMhz.toFixed(3), x - 18, H - 3);
      }

      // Passband filter skirt shading (asymmetric for USB/LSB/FT8/SSTV, symmetric for CW/RTTY/AM/FM)
      const pb = computePassbandOffsetsHz(s.mode, s.filterWidthKhz);
      const pbLeftX = Math.max(
        WATERFALL_PLOT_LEFT,
        frequencyHzToPixelX(s.frequencyHz + pb.lowHz, W, s.frequencyHz, s.spanKhz, s.zoom)
      );
      const pbRightX = Math.min(
        W - WATERFALL_PLOT_RIGHT,
        frequencyHzToPixelX(s.frequencyHz + pb.highHz, W, s.frequencyHz, s.spanKhz, s.zoom)
      );
      const pbDrawWidth = Math.max(4, pbRightX - pbLeftX);
      const pbDrawX = pbRightX - pbLeftX < 4 ? (pbLeftX + pbRightX) / 2 - 2 : pbLeftX;

      sCtx.fillStyle = s.isTransmitting ? 'rgba(244, 63, 94, 0.18)' : 'rgba(34, 184, 255, 0.15)';
      sCtx.fillRect(pbDrawX, 8, pbDrawWidth, H - 23);

      // Center VFO hairline
      const centerX = WATERFALL_PLOT_LEFT + 0.5 * plotWidth;
      sCtx.strokeStyle = s.isTransmitting ? '#fb7185' : '#38bdf8';
      sCtx.lineWidth = 1.5;
      sCtx.beginPath();
      sCtx.moveTo(centerX, 8);
      sCtx.lineTo(centerX, H - 15);
      sCtx.stroke();

      // Optional Notch filter marker inside passband
      const notchOffsetHz = computeNotchRfOffsetHz(s.notchPct, s.mode);
      if (notchOffsetHz !== null) {
        const nx = frequencyHzToPixelX(s.frequencyHz + notchOffsetHz, W, s.frequencyHz, s.spanKhz, s.zoom);
        if (nx >= WATERFALL_PLOT_LEFT && nx <= W - WATERFALL_PLOT_RIGHT) {
          sCtx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
          sCtx.lineWidth = 1;
          sCtx.setLineDash([2, 2]);
          sCtx.beginPath();
          sCtx.moveTo(nx, 10);
          sCtx.lineTo(nx, H - 16);
          sCtx.stroke();
          sCtx.setLineDash([]);
        }
      }

      // Peak-Hold trace
      if (s.peakHoldEnabled) {
        sCtx.beginPath();
        for (let i = 0; i < WATERFALL_BINS; i++) {
          const x = WATERFALL_PLOT_LEFT + (i / (WATERFALL_BINS - 1)) * plotWidth;
          const y = dbmToY(peakHold[i]);
          if (i === 0) sCtx.moveTo(x, y);
          else sCtx.lineTo(x, y);
        }
        sCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        sCtx.lineWidth = 1;
        sCtx.stroke();
      }

      // Primary Smoothed Spectrum Trace + Gradient Fill
      sCtx.beginPath();
      for (let i = 0; i < WATERFALL_BINS; i++) {
        const x = WATERFALL_PLOT_LEFT + (i / (WATERFALL_BINS - 1)) * plotWidth;
        const y = dbmToY(smoothed[i]);
        if (i === 0) sCtx.moveTo(x, y);
        else sCtx.lineTo(x, y);
      }
      const traceGrad = sCtx.createLinearGradient(0, 10, 0, H - 15);
      traceGrad.addColorStop(0, s.isTransmitting ? 'rgba(251, 113, 133, 0.48)' : 'rgba(56, 189, 248, 0.46)');
      traceGrad.addColorStop(1, 'rgba(14, 165, 233, 0.04)');
      sCtx.strokeStyle = s.isTransmitting ? '#fecdd3' : '#e0f2fe';
      sCtx.lineWidth = 1.5;
      sCtx.stroke();

      sCtx.lineTo(W - WATERFALL_PLOT_RIGHT, H - 15);
      sCtx.lineTo(WATERFALL_PLOT_LEFT, H - 15);
      sCtx.closePath();
      sCtx.fillStyle = traceGrad;
      sCtx.fill();

      // Incoming signal pip markers along top of spectrum plot (emerald = live peer, cyan = beacon; NO callsigns)
      const signalMarkers = collectVisibleSignalMarkers({
        centerFreqHz: s.frequencyHz,
        spanKhz: s.spanKhz,
        zoom: s.zoom,
        canvasWidth: W,
        band: s.band,
        nowMs: nowEpochMs,
        stations: s.stations,
        bursts: signalBurstsRef?.current,
        beacons: s.beaconStations,
        showBeacons: s.showBeacons,
      });
      for (const mk of signalMarkers) {
        sCtx.fillStyle = mk.kind === 'live' ? '#34d399' : '#38bdf8';
        sCtx.beginPath();
        sCtx.moveTo(mk.x, 12);
        sCtx.lineTo(mk.x - 3.5, 6);
        sCtx.lineTo(mk.x + 3.5, 6);
        sCtx.closePath();
        sCtx.fill();
      }

      // Top-left RF status readout & top-right Hover Crosshair Frequency/dBm HUD (no callsigns)
      sCtx.font = '9.5px "JetBrains Mono", monospace';
      sCtx.fillStyle = s.isTransmitting ? '#fda4af' : '#7dd3fc';
      const statusText = `${s.isTransmitting ? 'TX' : 'RX'} ${s.mode} · BW ${s.filterWidthKhz.toFixed(1)}k${
        s.ritHz !== 0 ? ` · RIT ${s.ritHz > 0 ? '+' : ''}${s.ritHz}` : ''
      }`;
      sCtx.fillText(statusText, WATERFALL_PLOT_LEFT + 6, 14);

      if (hoverRef.current.active) {
        const hx = Math.max(WATERFALL_PLOT_LEFT, Math.min(W - WATERFALL_PLOT_RIGHT, hoverRef.current.canvasX));
        const hoverNorm = (hx - WATERFALL_PLOT_LEFT) / plotWidth;
        const hoverFreqHz = Math.round(minFreq + hoverNorm * effectiveSpanHz);
        const hoverBin = Math.min(WATERFALL_BINS - 1, Math.max(0, Math.round(hoverNorm * (WATERFALL_BINS - 1))));
        const hoverDbm = smoothed[hoverBin];

        sCtx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        sCtx.lineWidth = 1;
        sCtx.setLineDash([3, 3]);
        sCtx.beginPath();
        sCtx.moveTo(hx, 8);
        sCtx.lineTo(hx, H - 15);
        sCtx.stroke();
        sCtx.setLineDash([]);

        const readout = `${(hoverFreqHz / 1_000_000).toFixed(4)} MHz · ${hoverDbm.toFixed(0)} dBm`;
        sCtx.textAlign = 'right';
        sCtx.fillStyle = '#fde68a';
        sCtx.fillText(readout, W - WATERFALL_PLOT_RIGHT - 6, 14);
        sCtx.textAlign = 'start';
      }

      // 2. Draw Waterfall Canvas directly from persistent RGBA buffer (no getImageData readback stall)
      if (!wfImgRef.current) {
        wfImgRef.current = new ImageData(W, WH);
      }
      wfImgRef.current.data.set(wfBufRef.current);
      wCtx.putImageData(wfImgRef.current, 0, 0);

      // Left gutter vertical color scale legend (aligned with dBm axis)
      for (let py = 6; py < WH - 6; py++) {
        const t = 1 - (py - 6) / Math.max(1, WH - 12);
        const lutOff = Math.min(255, Math.max(0, Math.round(t * 255))) * 3;
        wCtx.fillStyle = `rgb(${lutRef.current[lutOff]},${lutRef.current[lutOff + 1]},${lutRef.current[lutOff + 2]})`;
        wCtx.fillRect(10, py, 6, 1);
      }
      wCtx.font = '8.5px "JetBrains Mono", monospace';
      wCtx.fillStyle = '#64748b';
      wCtx.fillText('HI', 19, 13);
      wCtx.fillText('LO', 19, WH - 6);

      // Overlay passband boundary guides + VFO hairline on Waterfall canvas
      wCtx.strokeStyle = s.isTransmitting ? 'rgba(251, 113, 133, 0.45)' : 'rgba(56, 189, 248, 0.35)';
      wCtx.lineWidth = 1;
      wCtx.setLineDash([2, 3]);
      wCtx.beginPath();
      wCtx.moveTo(pbDrawX, 0);
      wCtx.lineTo(pbDrawX, WH);
      wCtx.moveTo(pbDrawX + pbDrawWidth, 0);
      wCtx.lineTo(pbDrawX + pbDrawWidth, WH);
      wCtx.stroke();
      wCtx.setLineDash([]);

      wCtx.strokeStyle = s.isTransmitting ? 'rgba(251, 113, 133, 0.85)' : 'rgba(56, 189, 248, 0.78)';
      wCtx.lineWidth = 1.25;
      wCtx.beginPath();
      wCtx.moveTo(centerX, 0);
      wCtx.lineTo(centerX, WH);
      wCtx.stroke();

      if (hoverRef.current.active) {
        const hx = Math.max(WATERFALL_PLOT_LEFT, Math.min(W - WATERFALL_PLOT_RIGHT, hoverRef.current.canvasX));
        wCtx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
        wCtx.lineWidth = 1;
        wCtx.setLineDash([3, 3]);
        wCtx.beginPath();
        wCtx.moveTo(hx, 0);
        wCtx.lineTo(hx, WH);
        wCtx.stroke();
        wCtx.setLineDash([]);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [signalBurstsRef]);

  const updateHoverCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const canvasX = ((e.clientX - rect.left) / rect.width) * e.currentTarget.width;
    const canvasY = ((e.clientY - rect.top) / rect.height) * e.currentTarget.height;
    hoverRef.current = { active: true, canvasX, canvasY };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (isPoweredOn) {
      void audioEngine?.resumeIfNeeded();
    }
    const rect = e.currentTarget.getBoundingClientRect();
    updateHoverCoords(e);
    dragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startFreqHz: frequencyHz,
      rectWidth: rect.width,
      didDrag: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic event environments lacking active pointer capture
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updateHoverCoords(e);
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    if (!drag.didDrag && Math.abs(dx) < 4) return;
    drag.didDrag = true;

    const plotCssWidth =
      drag.rectWidth * (getWaterfallPlotWidth(e.currentTarget.width) / e.currentTarget.width);
    const effectiveSpanHz = getEffectiveSpanHz(spanKhz, zoom);
    const deltaHz = -Math.round((dx / Math.max(1, plotCssWidth)) * effectiveSpanHz);
    onTuneToFrequency(drag.startFreqHz + deltaHz);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== e.pointerId) return;
    drag.active = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if already released
    }

    if (!drag.didDrag) {
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const clickedHz = pixelXToFrequencyHz(
        localX,
        rect.width,
        e.currentTarget.width,
        frequencyHz,
        spanKhz,
        zoom
      );
      onTuneToFrequency(clickedHz);
    }
  };

  const handlePointerLeave = () => {
    hoverRef.current.active = false;
  };

  const cyclePalette = () => {
    setPalette((cur) => PALETTE_ORDER[(PALETTE_ORDER.indexOf(cur) + 1) % PALETTE_ORDER.length]);
  };

  return (
    <div className="flex flex-col gap-1 flex-1 min-h-0">
      {/* Scope Header Bar */}
      <div className="flex flex-wrap landscape:flex-nowrap lg:flex-nowrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
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
            onClick={() => setPeakHoldEnabled((v) => !v)}
            aria-pressed={peakHoldEnabled}
            className={`px-1 py-0.5 rounded border text-[9.5px] font-mono-tabular cursor-pointer whitespace-nowrap ${
              peakHoldEnabled
                ? 'border-sky-400/70 bg-sky-500/15 text-sky-300'
                : 'border-[#24364d] bg-[#0a1019] text-slate-400'
            }`}
            title="Toggle spectrum peak-hold envelope"
          >
            PK
          </button>

          <button
            type="button"
            data-testid="waterfall-beacons-toggle"
            onClick={() => setShowBeacons((v) => !v)}
            aria-pressed={showBeacons}
            className={`px-1 py-0.5 rounded border text-[9.5px] font-mono-tabular cursor-pointer whitespace-nowrap ${
              showBeacons
                ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-300'
                : 'border-[#24364d] bg-[#0a1019] text-slate-400'
            }`}
            title="Show band beacons & incoming stations on waterfall"
          >
            BCN
          </button>

          <button
            type="button"
            onClick={cyclePalette}
            className="px-1 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[9.5px] font-mono-tabular text-amber-300 cursor-pointer whitespace-nowrap"
            aria-label={`Waterfall Palette ${PALETTE_LABELS[palette]}`}
            title="Cycle waterfall color palette (Aurora / Thermal / Phosphor)"
          >
            {PALETTE_LABELS[palette]}
          </button>

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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          data-testid="spectrum-scope-canvas"
          className="w-full h-[84px] block cursor-crosshair touch-none select-none"
        />
        <canvas
          ref={waterfallCanvasRef}
          width={680}
          height={62}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          data-testid="waterfall-canvas"
          className="w-full h-[60px] block border-t border-[#162538] cursor-crosshair touch-none select-none"
        />
      </div>
    </div>
  );
};
