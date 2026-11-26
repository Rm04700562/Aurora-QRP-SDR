export const NOISE_BLANKER_CURVE_SIZE = 1025;

export interface NoiseBlankerParams {
  active: boolean;
  pct: number;
  gateThreshold: number;
  impulseAttenuation: number;
}

export function clampNoiseBlankerPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function computeNoiseBlankerParams(thresholdPct: number): NoiseBlankerParams {
  const pct = clampNoiseBlankerPct(thresholdPct);
  if (pct <= 0) {
    return {
      active: false,
      pct: 0,
      gateThreshold: 1,
      impulseAttenuation: 1,
    };
  }
  const norm = pct / 100;
  const gateThreshold = Number((0.88 - norm * 0.74).toFixed(4));
  const impulseAttenuation = Number(Math.max(0.06, Math.pow(1 - norm * 0.88, 1.5)).toFixed(4));
  return {
    active: true,
    pct,
    gateThreshold,
    impulseAttenuation,
  };
}

/**
 * Generates an odd-length WaveShaper transfer curve that preserves linear signals
 * below the Noise Blanker threshold while blanking high-amplitude impulse spikes.
 */
export function createNoiseBlankerCurve(thresholdPct: number): Float32Array<ArrayBuffer> | null {
  const params = computeNoiseBlankerParams(thresholdPct);
  if (!params.active) return null;

  const curve = new Float32Array(new ArrayBuffer(NOISE_BLANKER_CURVE_SIZE * 4));
  const mid = (NOISE_BLANKER_CURVE_SIZE - 1) / 2;
  const threshold = params.gateThreshold;
  const knee = 0.08;
  const blankFloor = 0.04 * threshold;

  for (let i = 0; i < NOISE_BLANKER_CURVE_SIZE; i++) {
    const x = (i - mid) / mid;
    const ax = Math.abs(x);
    const sign = x < 0 ? -1 : 1;

    if (ax <= threshold) {
      curve[i] = x;
    } else if (ax <= threshold + knee) {
      const t = (ax - threshold) / knee;
      const eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
      const y = threshold * (1 - eased) + blankFloor * eased;
      curve[i] = sign * y;
    } else {
      curve[i] = sign * blankFloor;
    }
  }

  curve[mid] = 0;
  return curve;
}

/**
 * Time-domain impulse blanker for incoming PCM frames.
 * Suppresses short, high-slew transient spikes above the configured NB threshold
 * while leaving steady voice and digital waveforms intact.
 */
export function applyNoiseBlankerBuffer(
  samples: Float32Array,
  thresholdPct: number,
  baselineRms?: number
): { output: Float32Array; blankedCount: number } {
  const params = computeNoiseBlankerParams(thresholdPct);
  if (!params.active || samples.length === 0) {
    return { output: samples, blankedCount: 0 };
  }

  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i];
  }
  const frameRms = Math.sqrt(sumSq / samples.length);
  const refRms = Math.max(0.035, baselineRms ?? frameRms);
  const norm = params.pct / 100;
  const dynamicCeiling = refRms * (3.6 - norm * 2.4);
  const spikeCeiling = Math.max(0.08, Math.min(params.gateThreshold, dynamicCeiling));

  const output = new Float32Array(samples.length);
  let blankedCount = 0;
  let holdRemaining = 0;
  let prevClean = 0;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const absS = Math.abs(s);
    const slew = Math.abs(s - prevClean);
    const isImpulse = absS > spikeCeiling && slew > spikeCeiling * 0.55;

    if (isImpulse) {
      holdRemaining = 2;
      blankedCount += 1;
    }

    if (holdRemaining > 0) {
      output[i] = prevClean * 0.25;
      holdRemaining -= 1;
    } else {
      output[i] = s;
      prevClean = s;
    }
  }

  return { output, blankedCount };
}
