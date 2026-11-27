import { BandId, RadioMode, RemoteStation, SignalEvaluation } from '../types/radio';

export const WATERFALL_PLOT_LEFT = 36;
export const WATERFALL_PLOT_RIGHT = 8;
export const WATERFALL_BINS = 240;

export type WaterfallPaletteId = 'aurora' | 'thermal' | 'phosphor';

export interface WaterfallSignalBurst {
  id: string;
  band: BandId;
  frequencyHz: number;
  audioOffsetHz?: number;
  mode: RadioMode;
  powerDbm: number;
  startedAtMs: number;
  expiresAtMs: number;
  isSelf?: boolean;
  rttyShiftHz?: number;
  isVoice?: boolean;
}

export interface SpectrumSampleInput {
  bins?: number;
  centerFreqHz: number;
  spanKhz: number;
  zoom: number;
  mode: RadioMode;
  band: BandId;
  filterWidthKhz: number;
  rfGainPct: number;
  noiseFloorDbm: number;
  noiseReductionPct: number;
  noiseBlankerPct: number;
  notchPct: number;
  isTransmitting: boolean;
  micRms: number;
  nowMs: number;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  beacons?: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  showBeacons?: boolean;
  bursts?: WaterfallSignalBurst[];
  toneTelemetry?: {
    mode: 'IDLE' | 'CW' | 'RTTY' | 'SSTV' | 'FT8';
    markActive: boolean;
    freqHz: number;
  };
  rttyShiftHz?: number;
  basebandFft?: {
    active: boolean;
    isTx: boolean;
    binsDb: Float32Array;
    maxAudioHz: number;
  } | null;
  randomFn?: () => number;
}

export interface VisibleSignalMarker {
  x: number;
  freqHz: number;
  kind: 'live' | 'beacon';
}

export interface CollectVisibleSignalMarkersInput {
  centerFreqHz: number;
  spanKhz: number;
  zoom: number;
  canvasWidth: number;
  band: BandId;
  nowMs: number;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  bursts?: WaterfallSignalBurst[];
  beacons?: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  showBeacons?: boolean;
}

const BEACON_KEY_PATTERN = [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0];

/**
 * Computes realistic NCDXF staggered duty cycle and Morse keying envelope for a propagation beacon.
 */
export function computeBeaconKeyingEnvelope(
  station: RemoteStation,
  nowMs: number
): { windowOpen: boolean; markActive: boolean } {
  const sec = Math.floor(nowMs / 1000);
  // Center-frequency 20m voice/test beacon (DL2QRP/B @ 14.250 MHz) transmits 4s of every 12s
  // so center VFO stays clear for operator traffic most of the time.
  if (station.id === 'beacon-dl2qrp') {
    const windowOpen = sec % 12 < 4;
    return { windowOpen, markActive: windowOpen };
  }

  if (station.mode === 'CW') {
    const phaseSlots = Math.floor(station.frequencyHz / 100) % BEACON_KEY_PATTERN.length;
    const slot = (Math.floor(nowMs / 95) + phaseSlots) % BEACON_KEY_PATTERN.length;
    const markActive = BEACON_KEY_PATTERN[slot] === 1;
    return { windowOpen: true, markActive };
  }

  const phaseSec = Math.floor(station.frequencyHz / 1000) % 11;
  const windowOpen = (sec + phaseSec) % 11 < 7;
  return { windowOpen, markActive: windowOpen };
}

/**
 * Collects deduplicated x-positions for visible incoming live stations and active band beacons
 * strictly without exposing any callsign labels.
 */
export function collectVisibleSignalMarkers(
  input: CollectVisibleSignalMarkersInput
): VisibleSignalMarker[] {
  const markers: VisibleSignalMarker[] = [];
  const minX = WATERFALL_PLOT_LEFT + 2;
  const maxX = input.canvasWidth - WATERFALL_PLOT_RIGHT - 2;
  if (maxX <= minX) return markers;

  const isDuplicate = (x: number, kind: 'live' | 'beacon') =>
    markers.some(
      (m) => Math.abs(m.x - x) < 6 && (m.kind === kind || kind === 'beacon')
    );

  // 1. Live connected stations currently transmitting on this band
  for (const item of input.stations) {
    if (item.station.band !== input.band || !item.station.isTransmitting) continue;
    const x = frequencyHzToPixelX(
      item.station.frequencyHz,
      input.canvasWidth,
      input.centerFreqHz,
      input.spanKhz,
      input.zoom
    );
    if (x >= minX && x <= maxX && !isDuplicate(x, 'live')) {
      markers.push({ x, freqHz: item.station.frequencyHz, kind: 'live' });
    }
  }

  // 2. Active incoming RF bursts (VoIP, CW, RTTY, FT8, SSTV, out-of-passband rf:activity)
  if (input.bursts) {
    for (const burst of input.bursts) {
      if (burst.isSelf || burst.band !== input.band || burst.expiresAtMs <= input.nowMs) continue;
      const rfTargetHz =
        burst.mode === 'FT8' || burst.mode === 'DIGITAL'
          ? burst.frequencyHz + (burst.audioOffsetHz ?? 1250)
          : burst.frequencyHz;
      const x = frequencyHzToPixelX(
        rfTargetHz,
        input.canvasWidth,
        input.centerFreqHz,
        input.spanKhz,
        input.zoom
      );
      if (x >= minX && x <= maxX && !isDuplicate(x, 'live')) {
        markers.push({ x, freqHz: rfTargetHz, kind: 'live' });
      }
    }
  }

  // 3. Active propagation beacons on this band (when enabled)
  if (input.showBeacons !== false && input.beacons) {
    for (const item of input.beacons) {
      if (item.station.band !== input.band || !item.station.isTransmitting) continue;
      const env = computeBeaconKeyingEnvelope(item.station, input.nowMs);
      if (!env.windowOpen) continue;
      const x = frequencyHzToPixelX(
        item.station.frequencyHz,
        input.canvasWidth,
        input.centerFreqHz,
        input.spanKhz,
        input.zoom
      );
      if (x >= minX && x <= maxX && !isDuplicate(x, 'beacon')) {
        markers.push({ x, freqHz: item.station.frequencyHz, kind: 'beacon' });
      }
    }
  }

  return markers;
}

export function getWaterfallPlotWidth(canvasWidth: number): number {
  return Math.max(1, canvasWidth - WATERFALL_PLOT_LEFT - WATERFALL_PLOT_RIGHT);
}

export function getEffectiveSpanHz(spanKhz: number, zoom: number): number {
  const safeSpanKhz = Math.max(1, spanKhz);
  const safeZoom = Math.max(0.5, zoom);
  return (safeSpanKhz * 1000) / safeZoom;
}

/**
 * Converts a local CSS X coordinate inside a canvas element into the exact RF frequency in Hz,
 * accounting for the 36px left dBm axis gutter and 8px right margin.
 */
export function pixelXToFrequencyHz(
  localCssX: number,
  rectWidth: number,
  canvasWidth: number,
  centerFreqHz: number,
  spanKhz: number,
  zoom: number
): number {
  if (rectWidth <= 0 || canvasWidth <= 0) return Math.round(centerFreqHz);
  const canvasX = (localCssX / rectWidth) * canvasWidth;
  const plotWidth = getWaterfallPlotWidth(canvasWidth);
  const norm = Math.max(0, Math.min(1, (canvasX - WATERFALL_PLOT_LEFT) / plotWidth));
  const effectiveSpanHz = getEffectiveSpanHz(spanKhz, zoom);
  const minFreq = centerFreqHz - effectiveSpanHz / 2;
  return Math.round(minFreq + norm * effectiveSpanHz);
}

/**
 * Inverse of pixelXToFrequencyHz: converts an RF frequency in Hz into canvas X coordinate.
 */
export function frequencyHzToPixelX(
  freqHz: number,
  canvasWidth: number,
  centerFreqHz: number,
  spanKhz: number,
  zoom: number
): number {
  const effectiveSpanHz = getEffectiveSpanHz(spanKhz, zoom);
  const minFreq = centerFreqHz - effectiveSpanHz / 2;
  const norm = (freqHz - minFreq) / effectiveSpanHz;
  const plotWidth = getWaterfallPlotWidth(canvasWidth);
  return WATERFALL_PLOT_LEFT + norm * plotWidth;
}

/**
 * Computes passband lower/upper RF offsets relative to the VFO dial frequency.
 */
export function computePassbandOffsetsHz(
  mode: RadioMode,
  filterWidthKhz: number
): { lowHz: number; highHz: number } {
  const bwHz = Math.max(250, Math.min(8000, filterWidthKhz * 1000));
  if (mode === 'USB' || mode === 'FT8' || mode === 'DIGITAL' || mode === 'SSTV') {
    return { lowHz: 80, highHz: bwHz };
  }
  if (mode === 'LSB') {
    return { lowHz: -bwHz, highHz: -80 };
  }
  const half = bwHz / 2;
  return { lowHz: -half, highHz: half };
}

/**
 * Maps an audio offset frequency (Hz) from baseband into an RF offset relative to the VFO dial.
 */
export function basebandAudioHzToRfOffsetHz(audioHz: number, mode: RadioMode): number {
  if (mode === 'LSB') return -audioHz;
  if (mode === 'USB' || mode === 'FT8' || mode === 'DIGITAL' || mode === 'SSTV') return audioHz;
  if (mode === 'CW') return audioHz - 720;
  if (mode === 'RTTY') return audioHz - 2210;
  return audioHz - 1500;
}

export function computeNotchRfOffsetHz(
  notchPct: number,
  mode: RadioMode
): number | null {
  if (notchPct <= 0) return null;
  const audioHz = 300 + (Math.min(100, notchPct) / 100) * 2500;
  return basebandAudioHzToRfOffsetHz(audioHz, mode);
}

/**
 * Computes normalized waterfall intensity (0..1) using an adaptive SDR reference floor
 * so weak signals, medium S9 stations, and local TX peaks produce crisp dynamic contrast.
 */
export function computeWaterfallNormalizedIntensity(
  dbm: number,
  baseFloorDbm: number
): number {
  const dynamicRefFloor = baseFloorDbm - 4;
  const dynamicSpanDb = 58;
  return Math.max(0, Math.min(1, (dbm - dynamicRefFloor) / dynamicSpanDb));
}

export function thermalColorRgb(
  norm: number,
  palette: WaterfallPaletteId = 'aurora'
): [number, number, number] {
  const t = Math.max(0, Math.min(1, norm));

  if (palette === 'phosphor') {
    if (t < 0.28) {
      const k = t / 0.28;
      return [4, 14 + Math.round(k * 28), 10 + Math.round(k * 16)];
    }
    if (t < 0.62) {
      const k = (t - 0.28) / 0.34;
      return [8 + Math.round(k * 24), 42 + Math.round(k * 165), 26 + Math.round(k * 52)];
    }
    if (t < 0.86) {
      const k = (t - 0.62) / 0.24;
      return [32 + Math.round(k * 180), 207 + Math.round(k * 45), 78 + Math.round(k * 90)];
    }
    const k = (t - 0.86) / 0.14;
    return [212 + Math.round(k * 43), 252, 168 + Math.round(k * 85)];
  }

  if (palette === 'thermal') {
    if (t < 0.24) {
      const k = t / 0.24;
      return [10 + Math.round(k * 38), 6 + Math.round(k * 10), 24 + Math.round(k * 64)];
    }
    if (t < 0.52) {
      const k = (t - 0.24) / 0.28;
      return [48 + Math.round(k * 145), 16 + Math.round(k * 38), 88 + Math.round(k * 20)];
    }
    if (t < 0.80) {
      const k = (t - 0.52) / 0.28;
      return [193 + Math.round(k * 58), 54 + Math.round(k * 146), 108 - Math.round(k * 88)];
    }
    const k = (t - 0.80) / 0.20;
    return [251 + Math.round(k * 4), 200 + Math.round(k * 55), 20 + Math.round(k * 215)];
  }

  // Default 'aurora' high-contrast SDR palette: abyssal blue -> cobalt -> cyan -> gold -> red-orange -> white-hot
  if (t < 0.20) {
    const k = t / 0.20;
    return [5 + Math.round(k * 9), 12 + Math.round(k * 34), 32 + Math.round(k * 86)];
  }
  if (t < 0.45) {
    const k = (t - 0.20) / 0.25;
    return [14 + Math.round(k * 14), 46 + Math.round(k * 146), 118 + Math.round(k * 124)];
  }
  if (t < 0.70) {
    const k = (t - 0.45) / 0.25;
    return [28 + Math.round(k * 212), 192 + Math.round(k * 46), 242 - Math.round(k * 170)];
  }
  if (t < 0.88) {
    const k = (t - 0.70) / 0.18;
    return [240 + Math.round(k * 15), 238 - Math.round(k * 145), 72 - Math.round(k * 52)];
  }
  const k = (t - 0.88) / 0.12;
  return [255, 93 + Math.round(k * 155), 20 + Math.round(k * 225)];
}

export function buildWaterfallColorLut(palette: WaterfallPaletteId): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = thermalColorRgb(i / 255, palette);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

export function modeSpectralShape(
  distFromCenterHz: number,
  signedOffsetHz: number,
  mode: RadioMode,
  timeMs: number,
  seedFreqHz: number,
  options?: {
    rttyShiftHz?: number;
    markActive?: boolean;
    audioOffsetHz?: number;
    micRms?: number;
    minKernelHz?: number;
  }
): number {
  const minK = options?.minKernelHz ?? 40;

  if (mode === 'CW') {
    const gate = options?.markActive === false ? 0.12 : 1;
    const width = Math.max(78, minK);
    return distFromCenterHz < width * 3.8 ? gate * Math.exp(-Math.pow(distFromCenterHz / width, 2)) : 0;
  }

  if (mode === 'RTTY') {
    const shift = options?.rttyShiftHz ?? 170;
    const halfShift = shift / 2;
    const markDist = Math.abs(signedOffsetHz - halfShift);
    const spaceDist = Math.abs(signedOffsetHz + halfShift);
    const isMark =
      options?.markActive !== undefined
        ? options.markActive
        : Math.sin(timeMs * 0.045 + seedFreqHz * 0.001) >= 0;
    const markAmp = isMark ? 1.0 : 0.42;
    const spaceAmp = isMark ? 0.42 : 1.0;
    const width = Math.max(52, minK);
    return Math.max(
      markDist < width * 3.5 ? markAmp * Math.exp(-Math.pow(markDist / width, 2)) : 0,
      spaceDist < width * 3.5 ? spaceAmp * Math.exp(-Math.pow(spaceDist / width, 2)) : 0
    );
  }

  if (mode === 'FT8' || mode === 'DIGITAL') {
    const toneCenter = options?.audioOffsetHz ?? 1250;
    const d = Math.abs(signedOffsetHz - toneCenter);
    const width = Math.max(46, minK);
    return d < width * 3.5 ? Math.exp(-Math.pow(d / width, 2)) : 0;
  }

  if (mode === 'SSTV') {
    // SSTV occupies ~1200..2300 Hz USB baseband (sync @ 1200, luminance/color @ 1500..2300)
    if (signedOffsetHz < 950 || signedOffsetHz > 2550) return 0;
    const width = Math.max(110, minK);
    const syncPeak = Math.exp(-Math.pow((signedOffsetHz - 1200) / width, 2)) * 0.92;
    const scanCenter = 1880 + 260 * Math.sin(timeMs * 0.014);
    const videoPeak = Math.exp(-Math.pow((signedOffsetHz - scanCenter) / Math.max(260, minK), 2)) * 0.88;
    return Math.max(syncPeak, videoPeak);
  }

  if (mode === 'USB') {
    if (signedOffsetHz < -180 || signedOffsetHz > 2900) return 0;
    const voiceCenter = 1150 + 220 * Math.sin(timeMs * 0.011 + seedFreqHz);
    const env = Math.exp(-Math.pow((signedOffsetHz - voiceCenter) / 760, 2));
    const formant =
      0.72 +
      0.28 * Math.exp(-Math.pow((signedOffsetHz - (650 + 140 * Math.cos(timeMs * 0.019))) / 210, 2));
    const voiceBoost = options?.micRms !== undefined ? 0.45 + Math.min(0.55, options.micRms * 4.5) : 1;
    return Math.min(1, env * formant * voiceBoost);
  }

  if (mode === 'LSB') {
    if (signedOffsetHz > 180 || signedOffsetHz < -2900) return 0;
    const voiceCenter = -(1150 + 220 * Math.sin(timeMs * 0.011 + seedFreqHz));
    const env = Math.exp(-Math.pow((signedOffsetHz - voiceCenter) / 760, 2));
    const voiceBoost = options?.micRms !== undefined ? 0.45 + Math.min(0.55, options.micRms * 4.5) : 1;
    return Math.min(1, env * voiceBoost);
  }

  if (mode === 'AM') {
    const carrier = distFromCenterHz < Math.max(220, minK * 3)
      ? Math.exp(-Math.pow(distFromCenterHz / Math.max(75, minK), 2))
      : 0;
    const sidebands = distFromCenterHz < 3800 ? 0.56 * Math.exp(-Math.pow(distFromCenterHz / 1650, 2)) : 0;
    return Math.max(carrier, sidebands);
  }

  // FM
  return distFromCenterHz < 7200 ? Math.exp(-Math.pow(distFromCenterHz / 2900, 2)) : 0;
}

/**
 * Generates a complete RF spectrum slice in dBm across [minFreq .. maxFreq].
 * Integrates live Web Audio baseband FFT (when active), real connected RX stations,
 * transient RX/TX bursts, active-band beacons, local TX RF modulation, NR smoothing, NB QRN blanking, and Notch cut.
 */
export function synthesizeSpectrumSlice(input: SpectrumSampleInput): Float32Array {
  const bins = input.bins ?? WATERFALL_BINS;
  const spectrumDbm = new Float32Array(bins);
  const rand = input.randomFn ?? Math.random;

  const effectiveSpanHz = getEffectiveSpanHz(input.spanKhz, input.zoom);
  const minFreq = input.centerFreqHz - effectiveSpanHz / 2;
  const minKernelHz = (effectiveSpanHz / Math.max(1, bins - 1)) * 0.85;

  const baseFloor = input.noiseFloorDbm + (input.rfGainPct - 50) * 0.16;
  const nrSmoothFactor = 1 - (Math.max(0, Math.min(100, input.noiseReductionPct)) / 100) * 0.65;
  const nbAttenuation = 1 - Math.max(0, Math.min(100, input.noiseBlankerPct)) / 100;

  // Occasional broadband QRN static impulse burst (attenuated by Noise Blanker)
  const qrnBurstStrengthDb =
    nbAttenuation > 0.05 && rand() < 0.055 ? (7 + rand() * 11) * nbAttenuation : 0;

  const notchOffsetHz = computeNotchRfOffsetHz(input.notchPct, input.mode);
  const pb = computePassbandOffsetsHz(input.mode, input.filterWidthKhz);

  for (let i = 0; i < bins; i++) {
    const binFreq = minFreq + (i / (bins - 1)) * effectiveSpanHz;
    const signedFromVfoHz = binFreq - input.centerFreqHz;
    const distFromVfoHz = Math.abs(signedFromVfoHz);

    // Band noise grass + organic QRN impulse spikes
    const grass = (rand() - 0.5) * 5.2 * nrSmoothFactor;
    const qrnEnvelope = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.19 + input.nowMs * 0.007));
    const qrnBinRipple =
      qrnBurstStrengthDb > 0 ? qrnBurstStrengthDb * qrnEnvelope * (0.45 + 0.55 * rand()) : 0;
    let dbm = baseFloor + grass + qrnBinRipple;

    // 1. Live Web Audio AnalyserNode baseband FFT energy projected into passband RF frequencies
    if (input.basebandFft && input.basebandFft.active && input.basebandFft.binsDb.length > 0) {
      const fft = input.basebandFft;
      const inRfPassband = signedFromVfoHz >= pb.lowHz - 250 && signedFromVfoHz <= pb.highHz + 250;
      if (inRfPassband) {
        let audioHz = 0;
        if (input.mode === 'LSB') audioHz = -signedFromVfoHz;
        else if (input.mode === 'USB' || input.mode === 'FT8' || input.mode === 'DIGITAL' || input.mode === 'SSTV') {
          audioHz = signedFromVfoHz;
        } else if (input.mode === 'CW') {
          audioHz = 720 + signedFromVfoHz;
        } else if (input.mode === 'RTTY') {
          audioHz = 2210 + signedFromVfoHz;
        } else {
          audioHz = 1500 + signedFromVfoHz;
        }
        if (audioHz >= 80 && audioHz <= fft.maxAudioHz) {
          const fftIdx = Math.min(
            fft.binsDb.length - 1,
            Math.max(0, Math.round((audioHz / fft.maxAudioHz) * (fft.binsDb.length - 1)))
          );
          const dbfs = fft.binsDb[fftIdx];
          // Reject low ambient audio-graph noise so only true signals/tones project onto RF scope
          if (Number.isFinite(dbfs) && dbfs > -78) {
            const norm = Math.max(0, Math.min(1, (dbfs - -78) / 62));
            const peakTargetDbm = fft.isTx ? -22 : Math.min(-42, baseFloor + 46);
            const mappedDbm = baseFloor + norm * (peakTargetDbm - baseFloor);
            if (mappedDbm > dbm) {
              dbm = dbm + (mappedDbm - dbm) * 0.88;
            }
          }
        }
      }
    }

    // 2. Real connected stations actively transmitting on this band (including marginal/off-beam paths)
    for (const item of input.stations) {
      if (!item.station.isTransmitting) continue;
      if (item.station.band !== input.band) continue;
      const signedOffset = binFreq - item.station.frequencyHz;
      const distHz = Math.abs(signedOffset);
      const shape = modeSpectralShape(distHz, signedOffset, item.station.mode, input.nowMs, item.station.frequencyHz, {
        minKernelHz,
      });
      if (shape > 0.01) {
        const pulseDb = item.evalResult.propagationOpen
          ? 1.4 * Math.sin(input.nowMs * 0.015 + item.station.frequencyHz)
          : 2.4 * Math.sin(input.nowMs * 0.008 + item.station.frequencyHz);
        const minVisibleFloor = baseFloor + (item.evalResult.propagationOpen ? 16 : 9);
        const sigPeak = Math.max(minVisibleFloor, item.evalResult.rxPowerDbm) + pulseDb;
        if (sigPeak > dbm) {
          dbm = dbm + (sigPeak - dbm) * shape;
        }
      }
    }

    // 3. Transient RX/TX signal bursts (FT8, CW, RTTY, SSTV, VoIP, and full-band rf:activity frames)
    if (input.bursts) {
      for (const burst of input.bursts) {
        if (burst.band !== input.band || input.nowMs > burst.expiresAtMs) continue;
        const signedOffset = binFreq - burst.frequencyHz;
        const distHz = Math.abs(signedOffset);
        const shape = modeSpectralShape(distHz, signedOffset, burst.mode, input.nowMs, burst.frequencyHz, {
          audioOffsetHz: burst.audioOffsetHz,
          rttyShiftHz: burst.rttyShiftHz,
          markActive: burst.isSelf ? input.toneTelemetry?.markActive : undefined,
          minKernelHz,
        });
        if (shape > 0.01) {
          const targetDbm = burst.isSelf
            ? Math.max(-24, burst.powerDbm)
            : Math.max(baseFloor + 14, burst.powerDbm);
          if (targetDbm > dbm) {
            dbm = dbm + (targetDbm - dbm) * shape;
          }
        }
      }
    }

    // 4. Active-band propagation beacons (when enabled; keyed with realistic NCDXF/Morse patterns)
    if (input.showBeacons !== false && input.beacons) {
      for (const item of input.beacons) {
        if (!item.station.isTransmitting || item.station.band !== input.band) continue;
        const env = computeBeaconKeyingEnvelope(item.station, input.nowMs);
        if (!env.windowOpen) continue;
        const signedOffset = binFreq - item.station.frequencyHz;
        const distHz = Math.abs(signedOffset);
        const shape = modeSpectralShape(
          distHz,
          signedOffset,
          item.station.mode,
          input.nowMs,
          item.station.frequencyHz,
          {
            markActive: item.station.mode === 'CW' ? env.markActive : undefined,
            minKernelHz,
          }
        );
        if (shape > 0.01) {
          const qsbDb = 1.8 * Math.sin(input.nowMs * 0.004 + item.station.frequencyHz * 0.01);
          const minBeaconPeak = baseFloor + (item.evalResult.propagationOpen ? 15 : 6);
          const targetDbm = Math.max(minBeaconPeak, item.evalResult.rxPowerDbm) + qsbDb;
          if (targetDbm > dbm) {
            dbm = dbm + (targetDbm - dbm) * shape;
          }
        }
      }
    }

    // 4. Local TX RF carrier / modulation envelope
    if (input.isTransmitting) {
      const hasTelemetry = input.toneTelemetry && input.toneTelemetry.mode !== 'IDLE';
      const activeAudioOffset =
        input.mode === 'FT8' || input.mode === 'DIGITAL'
          ? hasTelemetry && input.toneTelemetry!.freqHz > 0
            ? input.toneTelemetry!.freqHz
            : 1250
          : undefined;
      const shape = modeSpectralShape(
        distFromVfoHz,
        signedFromVfoHz,
        input.mode,
        input.nowMs,
        input.centerFreqHz,
        {
          rttyShiftHz: input.rttyShiftHz ?? 170,
          markActive: hasTelemetry ? input.toneTelemetry!.markActive : undefined,
          audioOffsetHz: activeAudioOffset,
          micRms: input.mode === 'USB' || input.mode === 'LSB' ? input.micRms : undefined,
          minKernelHz,
        }
      );
      if (shape > 0.01) {
        const txLevel = -22 + Math.min(10, input.micRms * 40) + (rand() - 0.5) * 1.6;
        const shapedTx = baseFloor + (txLevel - baseFloor) * shape;
        if (shapedTx > dbm) {
          dbm = shapedTx;
        }
      }
    }

    // 5. Apply visual manual Notch filter dip (deeply rejects excess carrier/signals; gentle 3.5 dB dip at noise floor)
    if (notchOffsetHz !== null) {
      const notchDist = Math.abs(signedFromVfoHz - notchOffsetHz);
      if (notchDist < 220) {
        const weight = Math.exp(-Math.pow(notchDist / 68, 2));
        const notchedFloor = baseFloor - 3.5;
        dbm = dbm - weight * Math.max(0, dbm - notchedFloor);
      }
    }

    spectrumDbm[i] = Math.max(-140, Math.min(-16, dbm));
  }

  return spectrumDbm;
}

/**
 * Shifts an RGBA waterfall buffer horizontally inside the plot region when the user tunes/drags,
 * keeping RF signals anchored to their true RF frequency across VFO moves.
 */
export function shiftWaterfallBufferHorizontal(
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  deltaPixelsX: number,
  bgColor: [number, number, number] = [6, 12, 24]
): void {
  const shift = Math.trunc(deltaPixelsX);
  if (shift === 0 || width <= WATERFALL_PLOT_LEFT + WATERFALL_PLOT_RIGHT) return;

  const plotStart = WATERFALL_PLOT_LEFT;
  const plotEnd = width - WATERFALL_PLOT_RIGHT;
  const plotWidth = plotEnd - plotStart;

  if (Math.abs(shift) >= plotWidth) {
    for (let y = 0; y < height; y++) {
      const rowBase = y * width * 4;
      for (let x = plotStart; x < plotEnd; x++) {
        const off = rowBase + x * 4;
        buffer[off] = bgColor[0];
        buffer[off + 1] = bgColor[1];
        buffer[off + 2] = bgColor[2];
        buffer[off + 3] = 255;
      }
    }
    return;
  }

  for (let y = 0; y < height; y++) {
    const rowBase = y * width * 4;
    if (shift > 0) {
      // Shift plot pixels right by `shift`, fill left edge with background
      for (let x = plotEnd - 1; x >= plotStart + shift; x--) {
        const dst = rowBase + x * 4;
        const src = rowBase + (x - shift) * 4;
        buffer[dst] = buffer[src];
        buffer[dst + 1] = buffer[src + 1];
        buffer[dst + 2] = buffer[src + 2];
        buffer[dst + 3] = 255;
      }
      for (let x = plotStart; x < plotStart + shift; x++) {
        const dst = rowBase + x * 4;
        buffer[dst] = bgColor[0];
        buffer[dst + 1] = bgColor[1];
        buffer[dst + 2] = bgColor[2];
        buffer[dst + 3] = 255;
      }
    } else {
      const absShift = -shift;
      // Shift plot pixels left by `absShift`, fill right edge with background
      for (let x = plotStart; x < plotEnd - absShift; x++) {
        const dst = rowBase + x * 4;
        const src = rowBase + (x + absShift) * 4;
        buffer[dst] = buffer[src];
        buffer[dst + 1] = buffer[src + 1];
        buffer[dst + 2] = buffer[src + 2];
        buffer[dst + 3] = 255;
      }
      for (let x = plotEnd - absShift; x < plotEnd; x++) {
        const dst = rowBase + x * 4;
        buffer[dst] = bgColor[0];
        buffer[dst + 1] = bgColor[1];
        buffer[dst + 2] = bgColor[2];
        buffer[dst + 3] = 255;
      }
    }
  }
}

/**
 * Scrolls the waterfall buffer down by 1 row and renders the newest spectrum slice into row 0.
 */
export function pushWaterfallSliceRow(
  buffer: Uint8ClampedArray,
  width: number,
  height: number,
  spectrumDbm: Float32Array,
  baseFloorDbm: number,
  lut: Uint8ClampedArray,
  gutterColor: [number, number, number] = [6, 12, 24]
): void {
  if (height <= 0 || width <= 0) return;
  const rowBytes = width * 4;
  if (height > 1) {
    buffer.copyWithin(rowBytes, 0, (height - 1) * rowBytes);
  }

  const plotWidth = getWaterfallPlotWidth(width);
  const bins = spectrumDbm.length;

  for (let px = 0; px < width; px++) {
    const off = px * 4;
    if (px < WATERFALL_PLOT_LEFT || px >= width - WATERFALL_PLOT_RIGHT || bins === 0) {
      buffer[off] = gutterColor[0];
      buffer[off + 1] = gutterColor[1];
      buffer[off + 2] = gutterColor[2];
      buffer[off + 3] = 255;
      continue;
    }

    const idxNorm = Math.min(1, Math.max(0, (px - WATERFALL_PLOT_LEFT) / plotWidth));
    const exactBin = idxNorm * (bins - 1);
    const b0 = Math.floor(exactBin);
    const b1 = Math.min(bins - 1, b0 + 1);
    const frac = exactBin - b0;
    const dbm = spectrumDbm[b0] * (1 - frac) + spectrumDbm[b1] * frac;

    const norm = computeWaterfallNormalizedIntensity(dbm, baseFloorDbm);
    const lutIdx = Math.min(255, Math.max(0, Math.round(norm * 255))) * 3;

    buffer[off] = lut[lutIdx];
    buffer[off + 1] = lut[lutIdx + 1];
    buffer[off + 2] = lut[lutIdx + 2];
    buffer[off + 3] = 255;
  }
}
