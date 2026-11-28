import { RadioMode } from '../types/radio';

export interface RadioVoiceFilterParams {
  highpassHz: number;
  highpassQ: number;
  bandpassCenterHz: number;
  bandpassQ: number;
  lowpassHz: number;
  lowpassQ: number;
  presenceFreqHz: number;
  presenceGainDb: number;
  presenceQ: number;
  voiceSaturationAmount: number;
}

/**
 * Calibrated AF Gain curve consistent across Windows, macOS, iOS, and Android audio mixers.
 * Guarantees exact silence (0) at 0%, when Audio is Off, or when the radio is powered off.
 */
export function computeCalibratedAfGain(
  afGainPct: number,
  audioEnabled: boolean,
  isPoweredOn: boolean,
  isTransmitting: boolean
): number {
  if (!isPoweredOn || !audioEnabled || isTransmitting) return 0;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(afGainPct) ? afGainPct : 0));
  if (clamped <= 0) return 0;
  return Number((Math.pow(clamped / 100, 1.75) * 0.88).toFixed(5));
}

/**
 * Sidetone / TX monitor gain strictly tracks the operator's AF Gain setting and mute state
 * so turning AF Gain to 0% or Audio Off silences monitor tones as well across all platforms.
 */
export function computeSidetoneGain(
  afGainPct: number,
  audioEnabled: boolean,
  isPoweredOn: boolean
): number {
  if (!isPoweredOn || !audioEnabled) return 0;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(afGainPct) ? afGainPct : 0));
  if (clamped <= 0) return 0;
  return Number((Math.pow(clamped / 100, 1.65) * 0.72).toFixed(5));
}

/**
 * Computes multi-stage IF crystal filter & communications voice EQ parameters
 * so voice modes (USB/LSB/AM/FM) sound like an HF transceiver rather than wideband VoIP chat.
 */
export function computeRadioVoiceFilterParams(
  mode: RadioMode,
  filterWidthKhz: number
): RadioVoiceFilterParams {
  const bwHz = Math.max(350, Math.min(6000, Number.isFinite(filterWidthKhz) ? filterWidthKhz * 1000 : 2400));

  if (mode === 'CW') {
    const halfBw = Math.max(150, bwHz * 0.5);
    return {
      highpassHz: Math.max(250, 720 - halfBw),
      highpassQ: 1.2,
      bandpassCenterHz: 750,
      bandpassQ: Math.max(1.2, Math.min(6.5, 750 / Math.max(280, bwHz * 0.8))),
      lowpassHz: Math.min(2600, 750 + halfBw),
      lowpassQ: 1.4,
      presenceFreqHz: 750,
      presenceGainDb: 0,
      presenceQ: 1.0,
      voiceSaturationAmount: 0,
    };
  }

  if (mode === 'RTTY') {
    return {
      highpassHz: 700,
      highpassQ: 0.9,
      bandpassCenterHz: 2125,
      bandpassQ: Math.max(1.0, Math.min(5.5, 2125 / Math.max(350, bwHz))),
      lowpassHz: Math.min(3400, 2200 + bwHz * 0.5),
      lowpassQ: 1.2,
      presenceFreqHz: 2125,
      presenceGainDb: 0,
      presenceQ: 1.0,
      voiceSaturationAmount: 0,
    };
  }

  if (mode === 'FT8' || mode === 'DIGITAL') {
    return {
      highpassHz: 240,
      highpassQ: 0.8,
      bandpassCenterHz: 1500,
      bandpassQ: 0.65,
      lowpassHz: Math.min(3400, 300 + bwHz),
      lowpassQ: 1.1,
      presenceFreqHz: 1500,
      presenceGainDb: 0,
      presenceQ: 1.0,
      voiceSaturationAmount: 0,
    };
  }

  if (mode === 'SSTV') {
    return {
      highpassHz: 600,
      highpassQ: 0.85,
      bandpassCenterHz: 1800,
      bandpassQ: 0.6,
      lowpassHz: 2700,
      lowpassQ: 1.3,
      presenceFreqHz: 1800,
      presenceGainDb: 0,
      presenceQ: 1.0,
      voiceSaturationAmount: 0,
    };
  }

  if (mode === 'FM') {
    return {
      highpassHz: 320,
      highpassQ: 1.4,
      bandpassCenterHz: 1450,
      bandpassQ: 0.72,
      lowpassHz: Math.min(3150, Math.max(2300, bwHz * 0.55)),
      lowpassQ: 1.6,
      presenceFreqHz: 1550,
      presenceGainDb: 3.2,
      presenceQ: 1.2,
      voiceSaturationAmount: 0.16,
    };
  }

  if (mode === 'AM') {
    return {
      highpassHz: 240,
      highpassQ: 1.2,
      bandpassCenterHz: 1320,
      bandpassQ: 0.78,
      lowpassHz: Math.min(3300, Math.max(1800, 280 + bwHz * 0.75)),
      lowpassQ: 1.45,
      presenceFreqHz: 1420,
      presenceGainDb: 3.6,
      presenceQ: 1.3,
      voiceSaturationAmount: 0.22,
    };
  }

  // USB / LSB crisp HF SSB communications IF passband (300 Hz .. 2.7 kHz roof + 1.4 kHz presence hump)
  const lowCut = mode === 'LSB' ? 320 : 340;
  const highCut = Math.max(1100, Math.min(2850, lowCut + bwHz * 0.92));
  const centerHz = Math.round((lowCut + highCut) * 0.48);
  return {
    highpassHz: lowCut,
    highpassQ: 1.45,
    bandpassCenterHz: centerHz,
    bandpassQ: Math.max(0.75, Math.min(3.4, centerHz / Math.max(380, bwHz * 0.75))),
    lowpassHz: highCut,
    lowpassQ: 1.75,
    presenceFreqHz: Math.min(highCut - 200, 1420),
    presenceGainDb: 4.5,
    presenceQ: 1.45,
    voiceSaturationAmount: 0.28,
  };
}

/**
 * Generates an asymmetric soft-diode product-detector / RF clipper waveshaper curve
 * that imparts subtle transceiver warmth on voice signals without harsh clipping.
 */
export function createDiodeSaturationCurve(amount = 0.28, size = 256): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(size * 4));
  const k = Math.max(0.05, Math.min(2.5, amount * 4.2));
  const posScale = 1 + amount * 0.18;
  const negScale = 1 - amount * 0.08;
  const maxDenom = Math.tanh(posScale * (1 + k));
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    // Slight asymmetry mimics real diode balanced modulator / product detector character
    const asym = x >= 0 ? x * posScale : x * negScale;
    const norm = Math.tanh(asym * (1 + k)) / maxDenom;
    curve[i] = Math.max(-1, Math.min(1, norm));
  }
  return curve;
}

/**
 * Processes a raw microphone buffer into an anti-aliased, 300 Hz HPF + speech-compressed 16 kHz
 * transceiver TX baseband PCM16 frame, ensuring uniform loudness across platform mics.
 */
export function processTxMicFrame(
  input: Float32Array,
  inputSampleRate: number,
  compressionPct: number,
  targetRate = 16000
): { pcm16: Int16Array; rms: number; db: number; alcPct: number } {
  const safeRate = Math.max(8000, inputSampleRate || 48000);
  const ratio = Math.max(1, safeRate / targetRate);
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const downsampled = new Float32Array(outLen);

  // Boxcar anti-aliasing average + linear tail for crisp decimation without high-freq foldback
  for (let i = 0; i < outLen; i++) {
    const startF = i * ratio;
    const endF = Math.min(input.length, (i + 1) * ratio);
    const startIdx = Math.floor(startF);
    const endIdx = Math.max(startIdx + 1, Math.ceil(endF));
    let acc = 0;
    let count = 0;
    for (let k = startIdx; k < endIdx && k < input.length; k++) {
      acc += input[k];
      count += 1;
    }
    downsampled[i] = count > 0 ? acc / count : 0;
  }

  // First-order 300 Hz highpass + 2.8 kHz RF TX lowpass + gentle speech processor compression
  const dt = 1 / targetRate;
  const rcHp = 1 / (2 * Math.PI * 300);
  const alphaHp = rcHp / (rcHp + dt);
  const rcLp = 1 / (2 * Math.PI * 2750);
  const alphaLp = dt / (rcLp + dt);

  const filtered = new Float32Array(outLen);
  let hpPrevOut = 0;
  let hpPrevIn = 0;
  let lpPrev = 0;
  let rawSumSq = 0;

  for (let i = 0; i < outLen; i++) {
    const x = downsampled[i];
    const hp = alphaHp * (hpPrevOut + x - hpPrevIn);
    hpPrevOut = hp;
    hpPrevIn = x;

    // Slight upper-mid voice presence boost (differentiator blend)
    const preEmph = hp + 0.22 * (hp - lpPrev);
    const lp = lpPrev + alphaLp * (preEmph - lpPrev);
    lpPrev = lp;
    filtered[i] = lp;
    rawSumSq += lp * lp;
  }

  const rawRms = Math.sqrt(rawSumSq / outLen);
  const compNorm = Math.max(0, Math.min(1, compressionPct / 100));

  // Cross-platform AGC auto-leveling + RF speech processor drive
  const autoGain =
    rawRms > 0.0025
      ? Math.max(0.65, Math.min(4.2, (0.14 + compNorm * 0.14) / rawRms))
      : 1.0;
  const drive = autoGain * (1 + compNorm * 1.45);

  const pcm16 = new Int16Array(outLen);
  let outSumSq = 0;

  for (let i = 0; i < outLen; i++) {
    // Soft RF speech compressor curve (smooth limiting, punchy talk power)
    const driven = filtered[i] * drive;
    const processed =
      compNorm > 0.02
        ? Math.tanh(driven * (1 + compNorm * 0.65)) * 0.92
        : Math.max(-0.96, Math.min(0.96, driven));
    const clamped = Math.max(-0.98, Math.min(0.98, processed));
    outSumSq += clamped * clamped;
    pcm16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  const outRms = Math.sqrt(outSumSq / outLen);
  const db = outRms > 0.0001 ? Math.max(-55, Math.min(0, 20 * Math.log10(outRms))) : -55;
  const alcPct = Math.min(100, Math.round(outRms * 220 + compNorm * 16 * (outRms > 0.01 ? 1 : 0)));

  return {
    pcm16,
    rms: outRms,
    db: Number(db.toFixed(1)),
    alcPct,
  };
}

/**
 * Levels incoming remote operator VoIP PCM frames across heterogeneous platform mics
 * and applies authentic SSB RF path scaling & aurora flutter before feeding the IF filter chain.
 */
export function normalizeIncomingRxVoipFrame(
  int16: Int16Array,
  snrDb: number,
  auroraFlutter: number
): Float32Array {
  const len = int16.length;
  const out = new Float32Array(len);
  if (len === 0) return out;

  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const s = int16[i] / 32768;
    sumSq += s * s;
  }
  const frameRms = Math.sqrt(sumSq / len);

  // Normalize heterogeneous peer mic levels toward consistent 0.19 communications speech RMS
  const levelNormalize =
    frameRms > 0.0025 ? Math.max(0.22, Math.min(8.5, 0.19 / frameRms)) : 1.0;
  const snrGain = Math.max(0.36, Math.min(1.25, (snrDb + 18) / 28));
  const combinedGain = levelNormalize * snrGain;

  for (let i = 0; i < len; i++) {
    let s = (int16[i] / 32768) * combinedGain;
    if (auroraFlutter > 0.05) {
      const mod = 1 - auroraFlutter * 0.45 * (0.5 + 0.5 * Math.sin(i * 0.065));
      s *= mod;
    }
    // Soft RF detector limiting so loud remote spikes match the operator's AF gain smoothly
    out[i] = Math.tanh(s * 1.15) * 0.92;
  }

  return out;
}
