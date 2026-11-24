import {
  AntennaId,
  AntennaSpec,
  BandId,
  BandSpec,
  PropagationConditions,
  QthLocation,
  RadioMode,
  RemoteStation,
  SignalEvaluation,
} from '../types/radio';

export const BANDS: BandSpec[] = [
  { id: '10m', label: '10m', minHz: 28_000_000, maxHz: 29_700_000, defaultHz: 28_400_000, rangeLabel: '28.000 - 29.700', centerMhz: 28.5 },
  { id: '12m', label: '12m', minHz: 24_890_000, maxHz: 24_990_000, defaultHz: 24_940_000, rangeLabel: '24.890 - 24.990', centerMhz: 24.94 },
  { id: '15m', label: '15m', minHz: 21_000_000, maxHz: 21_450_000, defaultHz: 21_250_000, rangeLabel: '21.000 - 21.450', centerMhz: 21.2 },
  { id: '17m', label: '17m', minHz: 18_068_000, maxHz: 18_168_000, defaultHz: 18_130_000, rangeLabel: '18.068 - 18.168', centerMhz: 18.12 },
  { id: '20m', label: '20m', minHz: 14_000_000, maxHz: 14_350_000, defaultHz: 14_250_000, rangeLabel: '14.000 - 14.350', centerMhz: 14.2 },
  { id: '30m', label: '30m', minHz: 10_100_000, maxHz: 10_150_000, defaultHz: 10_125_000, rangeLabel: '10.100 - 10.150', centerMhz: 10.125 },
  { id: '40m', label: '40m', minHz: 7_000_000, maxHz: 7_300_000, defaultHz: 7_090_000, rangeLabel: '7.000 - 7.300', centerMhz: 7.15 },
  { id: '60m', label: '60m', minHz: 5_351_000, maxHz: 5_406_000, defaultHz: 5_371_500, rangeLabel: '5.351 - 5.406', centerMhz: 5.38 },
  { id: '80m', label: '80m', minHz: 3_500_000, maxHz: 4_000_000, defaultHz: 3_650_000, rangeLabel: '3.500 - 4.000', centerMhz: 3.75 },
  { id: '160m', label: '160m', minHz: 1_800_000, maxHz: 2_000_000, defaultHz: 1_840_000, rangeLabel: '1.800 - 2.000', centerMhz: 1.9 },
];

export const ANTENNAS: AntennaSpec[] = [
  {
    id: 'yagi5',
    name: '5 Element Yagi',
    shortName: '5-El Yagi',
    isDirectional: true,
    forwardGainDbi: 11.2,
    frontToBackDb: 22,
    beamwidthDeg: 52,
    resonantBands: ['10m', '12m', '15m', '17m', '20m'],
    noiseRejectionDb: 2,
    description: 'High-gain directional monoband/tribander beam with sharp forward lobe and 22 dB F/B rejection.',
  },
  {
    id: 'steppir3',
    name: '3 Element SteppIR',
    shortName: 'SteppIR 3E',
    isDirectional: true,
    forwardGainDbi: 8.6,
    frontToBackDb: 18,
    beamwidthDeg: 66,
    resonantBands: ['10m', '12m', '15m', '17m', '20m', '30m', '40m'],
    noiseRejectionDb: 1.5,
    description: 'Motor-tuned directional beam covering 40m through 10m with flat VSWR across segments.',
  },
  {
    id: 'dipole',
    name: 'Half-Wave Dipole',
    shortName: 'Dipole',
    isDirectional: true,
    isBidirectional: true,
    forwardGainDbi: 2.15,
    frontToBackDb: 0,
    beamwidthDeg: 95,
    resonantBands: ['20m', '40m', '80m'],
    noiseRejectionDb: 0,
    description: 'Classic broadside figure-8 wire antenna with deep side nulls perpendicular to the wire.',
  },
  {
    id: 'vertical',
    name: '1/4 Wave Vertical',
    shortName: 'Vertical',
    isDirectional: false,
    forwardGainDbi: 1.4,
    frontToBackDb: 0,
    beamwidthDeg: 360,
    resonantBands: ['10m', '15m', '20m', '30m', '40m'],
    noiseRejectionDb: -2,
    description: 'Omnidirectional low-takeoff DX antenna with radial ground plane; picks up more local QRN.',
  },
  {
    id: 'efhw',
    name: 'End-Fed Half Wave',
    shortName: 'EFHW',
    isDirectional: false,
    forwardGainDbi: 2.0,
    frontToBackDb: 2,
    beamwidthDeg: 220,
    resonantBands: ['10m', '15m', '20m', '40m', '80m'],
    noiseRejectionDb: 0,
    description: 'Multi-band harmonic wire antenna ideal for portable QRP expeditions.',
  },
  {
    id: 'magloop',
    name: 'QRP Magnetic Loop',
    shortName: 'MagLoop',
    isDirectional: true,
    isBidirectional: true,
    forwardGainDbi: -1.5,
    frontToBackDb: 0,
    beamwidthDeg: 78,
    resonantBands: ['10m', '12m', '15m', '17m', '20m', '30m', '40m'],
    noiseRejectionDb: 6.5,
    description: 'High-Q compact loop with ultra-low noise floor and deep 25 dB broadside null.',
  },
];

export const DEFAULT_PROPAGATION: PropagationConditions = {
  sfi: 148,
  kIndex: 2,
  aIndex: 9,
  auroraActive: false,
  sporadicE: false,
  greylineBoost: true,
  utcHour: 14,
  presetName: 'Balanced DX',
};

export const PROPAGATION_PRESETS: Array<{ name: string; conditions: Omit<PropagationConditions, 'utcHour'> }> = [
  {
    name: 'Balanced DX',
    conditions: { sfi: 148, kIndex: 2, aIndex: 9, auroraActive: false, sporadicE: false, greylineBoost: true, presetName: 'Balanced DX' },
  },
  {
    name: 'Solar Max Opening',
    conditions: { sfi: 220, kIndex: 1, aIndex: 5, auroraActive: false, sporadicE: true, greylineBoost: true, presetName: 'Solar Max Opening' },
  },
  {
    name: 'Aurora Storm',
    conditions: { sfi: 135, kIndex: 7, aIndex: 112, auroraActive: true, sporadicE: false, greylineBoost: false, presetName: 'Aurora Storm' },
  },
  {
    name: 'Quiet Low-Band Night',
    conditions: { sfi: 82, kIndex: 1, aIndex: 4, auroraActive: false, sporadicE: false, greylineBoost: true, presetName: 'Quiet Low-Band Night' },
  },
];

export function getBandSpec(bandId: BandId): BandSpec {
  return BANDS.find((b) => b.id === bandId) ?? BANDS[4]; // default 20m
}

export function getAntennaSpec(antennaId: AntennaId): AntennaSpec {
  return ANTENNAS.find((a) => a.id === antennaId) ?? ANTENNAS[0];
}

export function findBandForFrequency(freqHz: number): BandSpec {
  const exact = BANDS.find((b) => freqHz >= b.minHz && freqHz <= b.maxHz);
  if (exact) return exact;
  let closest = BANDS[4];
  let minDiff = Infinity;
  for (const band of BANDS) {
    const mid = (band.minHz + band.maxHz) / 2;
    const diff = Math.abs(freqHz - mid);
    if (diff < minDiff) {
      minDiff = diff;
      closest = band;
    }
  }
  return closest;
}

export function clampFrequencyToBand(freqHz: number, bandId: BandId): number {
  const band = getBandSpec(bandId);
  return Math.max(band.minHz, Math.min(band.maxHz, Math.round(freqHz)));
}

export function formatFrequencyMhz(freqHz: number): string {
  const mhz = Math.floor(freqHz / 1_000_000);
  const khz = Math.floor((freqHz % 1_000_000) / 1_000);
  const hz = Math.floor(freqHz % 1_000);
  return `${mhz}.${String(khz).padStart(3, '0')}.${String(hz).padStart(3, '0')}`;
}

export function normalizeAzimuth(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return Math.round(wrapped);
}

export function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs(normalizeAzimuth(a) - normalizeAzimuth(b));
  return diff > 180 ? 360 - diff : diff;
}

export function stepRotorToward(currentDeg: number, targetDeg: number, maxStepDeg: number): number {
  const cur = normalizeAzimuth(currentDeg);
  const tgt = normalizeAzimuth(targetDeg);
  let delta = tgt - cur;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  if (Math.abs(delta) <= maxStepDeg) return tgt;
  return normalizeAzimuth(cur + Math.sign(delta) * maxStepDeg);
}

export function maidenheadFromLatLon(lat: number, lon: number): string {
  const adjLon = Math.max(-180, Math.min(179.999, lon)) + 180;
  const adjLat = Math.max(-90, Math.min(89.999, lat)) + 90;
  const fieldLon = String.fromCharCode(65 + Math.floor(adjLon / 20));
  const fieldLat = String.fromCharCode(65 + Math.floor(adjLat / 10));
  const sqLon = Math.floor((adjLon % 20) / 2);
  const sqLat = Math.floor(adjLat % 10);
  return `${fieldLon}${fieldLat}${sqLon}${sqLat}`;
}

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calculateBearingDeg(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeAzimuth(toDeg(Math.atan2(y, x)));
}

/**
 * Directional gain in dBi for an antenna oriented at `rotorHeadingDeg`
 * receiving or transmitting along `signalBearingDeg`.
 */
export function computeAntennaGainDb(
  antennaId: AntennaId,
  signalBearingDeg: number,
  rotorHeadingDeg: number,
  bandId: BandId
): number {
  const ant = getAntennaSpec(antennaId);
  const resonantBonus = ant.resonantBands.includes(bandId) ? 0 : -4.5;

  if (!ant.isDirectional) {
    return ant.forwardGainDbi + resonantBonus;
  }

  let offAxis = angularDiffDeg(signalBearingDeg, rotorHeadingDeg);
  if (ant.isBidirectional && offAxis > 90) {
    offAxis = 180 - offAxis;
  }

  const halfBeam = ant.beamwidthDeg / 2;
  if (ant.isBidirectional) {
    // Dipole / Magloop figure-8 cos^2 pattern with deep null at 90 deg
    const rad = (offAxis * Math.PI) / 180;
    const lobeFactor = Math.max(0.06, Math.cos(rad));
    const attenuation = -20 * Math.log10(1 / lobeFactor);
    return ant.forwardGainDbi + attenuation + resonantBonus;
  }

  // Yagi / SteppIR cardioid + main lobe pattern
  if (offAxis <= halfBeam) {
    const t = offAxis / halfBeam;
    return ant.forwardGainDbi - 3 * t * t + resonantBonus;
  }
  const backFraction = Math.min(1, (offAxis - halfBeam) / (180 - halfBeam));
  const dropDb = 3 + (ant.frontToBackDb - 3) * Math.pow(backFraction, 0.85);
  return ant.forwardGainDbi - dropDb + resonantBonus;
}

/**
 * Computes realistic VSWR from antenna band resonance + ATU matching factor (0 = uncalibrated, 1 = ATU tuned).
 */
export function computeSwr(antennaId: AntennaId, bandId: BandId, atuMatchFactor = 0.75): number {
  const ant = getAntennaSpec(antennaId);
  const baseSwr = ant.resonantBands.includes(bandId) ? 1.25 : 3.8;
  // Special case: 5-El Yagi on 80m/160m is highly reactive without ATU
  const mismatchPenalty =
    antennaId === 'yagi5' && (bandId === '80m' || bandId === '160m') ? 2.8 : 0;
  const rawSwr = baseSwr + mismatchPenalty;
  const matchedSwr = 1.0 + (rawSwr - 1.0) * (1 - Math.max(0, Math.min(0.92, atuMatchFactor)));
  return Number(Math.max(1.05, Math.min(9.9, matchedSwr)).toFixed(2));
}

export function computeTxFoldbackPower(requestedPowerW: number, swr: number): number {
  if (swr <= 1.5) return Number(requestedPowerW.toFixed(1));
  const foldback = Math.max(0.25, 1 - (swr - 1.5) * 0.16);
  return Number((requestedPowerW * foldback).toFixed(1));
}

export function computeMufMhz(conditions: PropagationConditions, midLatAbs: number): number {
  // Approximate F2 Maximum Usable Frequency from SFI, K-index, and solar zenith hour
  const solarFactor = 9.5 + (conditions.sfi - 65) * 0.13;
  const daytimeBoost = 1 + 0.32 * Math.cos(((conditions.utcHour - 13) / 12) * Math.PI);
  const stormDepression = Math.max(0.45, 1 - conditions.kIndex * 0.055);
  const latFactor = Math.max(0.7, 1.1 - midLatAbs * 0.004);
  return Number(Math.max(4.5, solarFactor * daytimeBoost * stormDepression * latFactor).toFixed(1));
}

export function evaluateBandCondition(
  bandId: BandId,
  conditions: PropagationConditions
): { rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Aurora'; mufMhz: number; noiseDbm: number } {
  const band = getBandSpec(bandId);
  const mufMhz = computeMufMhz(conditions, 32);
  const isDay = conditions.utcHour >= 7 && conditions.utcHour <= 18;

  // Base atmospheric QRN noise floor (higher on lower HF bands, lower with magloop handled per-station)
  const bandNoiseBase = -124 + Math.max(0, (14 - band.centerMhz) * 1.15);
  const stormNoise = conditions.kIndex * 1.3 + (conditions.auroraActive ? 4 : 0);
  const noiseDbm = Number((bandNoiseBase + stormNoise).toFixed(1));

  if (conditions.auroraActive && conditions.kIndex >= 6 && band.centerMhz >= 14) {
    return { rating: 'Aurora', mufMhz, noiseDbm };
  }

  if (band.centerMhz > mufMhz * 1.15) {
    if (conditions.sporadicE && band.centerMhz >= 21) {
      return { rating: 'Fair', mufMhz, noiseDbm };
    }
    return { rating: 'Poor', mufMhz, noiseDbm };
  }

  // Lower bands (160m, 80m, 60m) suffer daytime D-layer absorption
  if (band.centerMhz <= 5.5 && isDay) {
    return { rating: 'Poor', mufMhz, noiseDbm };
  }
  if (band.centerMhz <= 7.5 && isDay && conditions.sfi > 130) {
    return { rating: 'Fair', mufMhz, noiseDbm };
  }

  if (conditions.kIndex <= 2 && conditions.sfi >= 135 && band.centerMhz <= mufMhz) {
    return { rating: 'Excellent', mufMhz, noiseDbm };
  }
  if (conditions.kIndex <= 4 && band.centerMhz <= mufMhz) {
    return { rating: 'Good', mufMhz, noiseDbm };
  }
  return { rating: 'Fair', mufMhz, noiseDbm };
}

export function computePropagationPathLossDb(
  bandId: BandId,
  distanceKm: number,
  txQth: QthLocation,
  rxQth: QthLocation,
  conditions: PropagationConditions
): { pathLossDb: number; auroraFlutter: number } {
  const band = getBandSpec(bandId);
  const safeDist = Math.max(25, distanceKm);
  const midLatAbs = Math.abs((txQth.lat + rxQth.lat) / 2);
  const muf = computeMufMhz(conditions, midLatAbs);

  // Free-space + ionospheric hop baseline (calibrated for QRP 5W HF DX)
  const fspl = 32.45 + 20 * Math.log10(band.centerMhz) + 20 * Math.log10(safeDist);
  // Ionospheric reflection recovers much of pure line-of-sight spreading vs UHF; apply HF ducting factor
  let loss = fspl * 0.72;

  // MUF cutoff penalty if operating frequency exceeds F2 MUF
  if (band.centerMhz > muf) {
    const excessMhz = band.centerMhz - muf;
    const esRelief = conditions.sporadicE && safeDist >= 500 && safeDist <= 2400 ? 18 : 0;
    loss += Math.max(0, excessMhz * 5.5 - esRelief);
  }

  // Daytime D-layer absorption on low bands
  const isDay = conditions.utcHour >= 7 && conditions.utcHour <= 18;
  if (isDay && band.centerMhz < 10.5) {
    const absorption = ((10.5 - band.centerMhz) / 8.5) * (14 + conditions.sfi * 0.04);
    loss += absorption;
  }

  // Geomagnetic K-index / Aurora attenuation + flutter on high-latitude paths
  const stormPenalty = conditions.kIndex * (midLatAbs > 45 ? 3.2 : 1.6);
  loss += stormPenalty;

  const greylineBonus = conditions.greylineBoost && safeDist > 2500 ? -6.5 : 0;
  loss += greylineBonus;

  const auroraFlutter = conditions.auroraActive
    ? Math.min(1, 0.35 + conditions.kIndex * 0.07 + (midLatAbs > 45 ? 0.2 : 0))
    : Math.max(0, (conditions.kIndex - 4) * 0.08);

  return {
    pathLossDb: Number(Math.max(48, loss).toFixed(1)),
    auroraFlutter: Number(auroraFlutter.toFixed(2)),
  };
}

export function dbmToSMeterText(dbm: number): string {
  // Standard IARU S9 = -73 dBm, 6 dB per S-unit
  if (dbm >= -73) {
    const over = Math.round(dbm - -73);
    if (over < 5) return 'S9';
    return `S9+${Math.min(60, over)}`;
  }
  const sUnit = Math.max(1, Math.min(9, Math.round(9 - (-73 - dbm) / 6)));
  return `S${sUnit}`;
}

export function dbmToNormalizedMeter(dbm: number): number {
  // Maps -127 dBm (S0) -> 0.05, -73 dBm (S9) -> 0.60, -13 dBm (S9+60) -> 1.0
  if (dbm <= -127) return 0.04;
  if (dbm <= -73) {
    return 0.04 + ((dbm - -127) / 54) * 0.56;
  }
  return Math.min(1, 0.6 + ((dbm - -73) / 60) * 0.4);
}

export function evaluateRemoteSignal(params: {
  station: RemoteStation;
  rxQth: QthLocation;
  rxBand: BandId;
  rxFrequencyHz: number;
  rxMode: RadioMode;
  rxFilterWidthKhz: number;
  rxAntennaId: AntennaId;
  rxRotorHeadingDeg: number;
  rxRfGainPct: number;
  conditions: PropagationConditions;
}): SignalEvaluation {
  const {
    station,
    rxQth,
    rxBand,
    rxFrequencyHz,
    rxFilterWidthKhz,
    rxAntennaId,
    rxRotorHeadingDeg,
    rxRfGainPct,
    conditions,
  } = params;

  const distanceKm = haversineDistanceKm(rxQth, station.qth);
  const bearingToTxDeg = calculateBearingDeg(rxQth, station.qth);
  const bearingToRxDeg = calculateBearingDeg(station.qth, rxQth);

  const rxAntennaGainDb = computeAntennaGainDb(rxAntennaId, bearingToTxDeg, rxRotorHeadingDeg, rxBand);
  const txAntennaGainDb = computeAntennaGainDb(
    station.antennaId,
    bearingToRxDeg,
    station.rotorHeadingDeg,
    station.band
  );

  const { pathLossDb, auroraFlutter } = computePropagationPathLossDb(
    station.band,
    distanceKm,
    station.qth,
    rxQth,
    conditions
  );

  const txPowerDbm = 10 * Math.log10(Math.max(0.1, station.powerW) * 1000);
  const rfGainOffset = (rxRfGainPct - 50) * 0.25;
  const rxPowerDbm = Number((txPowerDbm + txAntennaGainDb + rxAntennaGainDb - pathLossDb + rfGainOffset).toFixed(1));

  const ant = getAntennaSpec(rxAntennaId);
  const bandRating = evaluateBandCondition(rxBand, conditions);
  const noiseFloorDbm = Number((bandRating.noiseDbm - ant.noiseRejectionDb + rfGainOffset * 0.5).toFixed(1));

  const freqOffsetHz = station.frequencyHz - rxFrequencyHz;
  const halfPassbandHz = Math.max(250, (rxFilterWidthKhz * 1000) / 2);
  const inPassband = station.band === rxBand && Math.abs(freqOffsetHz) <= halfPassbandHz + 600;

  const snrDb = Number((rxPowerDbm - noiseFloorDbm).toFixed(1));
  const effectiveDbm = station.band === rxBand ? Math.max(noiseFloorDbm, rxPowerDbm) : noiseFloorDbm;

  return {
    stationId: station.id,
    distanceKm: Math.round(distanceKm),
    bearingToTxDeg,
    rxAntennaGainDb: Number(rxAntennaGainDb.toFixed(1)),
    txAntennaGainDb: Number(txAntennaGainDb.toFixed(1)),
    pathLossDb,
    rxPowerDbm,
    noiseFloorDbm,
    snrDb,
    sMeterText: dbmToSMeterText(effectiveDbm),
    sMeterNormalized: dbmToNormalizedMeter(effectiveDbm),
    auroraFlutter,
    inPassband,
    freqOffsetHz,
  };
}

const MORSE_TABLE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..', '0': '-----', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '/': '-..-.', '?': '..--..', '.': '.-.-.-', ',': '--..--', '-': '-....-',
  '+': '.-.-.', '=': '-...-', '@': '.--.-.',
};

export function sanitizeCwText(text: string, maxLen = 80): string {
  return text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, maxLen);
}

export function hasSendableMorse(text: string): boolean {
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    if (MORSE_TABLE[upper[i]]) return true;
  }
  return false;
}

export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .map((ch) => (ch === ' ' ? '/' : MORSE_TABLE[ch] ?? ''))
    .filter(Boolean)
    .join(' ');
}

export function morseTimeline(text: string, wpm = 15): Array<{ on: boolean; durationMs: number }> {
  const dotMs = Math.round(1200 / Math.max(5, Math.min(40, wpm)));
  const events: Array<{ on: boolean; durationMs: number }> = [];
  const upper = text.toUpperCase();

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    if (ch === ' ') {
      events.push({ on: false, durationMs: dotMs * 4 });
      continue;
    }
    const code = MORSE_TABLE[ch];
    if (!code) continue;
    for (let j = 0; j < code.length; j++) {
      const sym = code[j];
      events.push({ on: true, durationMs: sym === '-' ? dotMs * 3 : dotMs });
      events.push({ on: false, durationMs: dotMs });
    }
    events.push({ on: false, durationMs: dotMs * 2 });
  }
  return events;
}

export function morseDurationMs(text: string, wpm = 15): number {
  const events = morseTimeline(text, wpm);
  let total = 0;
  for (const ev of events) {
    total += ev.durationMs;
  }
  return total;
}
