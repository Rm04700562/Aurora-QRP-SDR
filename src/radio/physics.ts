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

export const MIN_TX_POWER_W = 1.0;
export const DEFAULT_TX_POWER_W = 15.0;
export const MAX_TX_POWER_W = 100.0;

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
    isRotatable: true,
    forwardGainDbi: 11.2,
    frontToBackDb: 22,
    beamwidthDeg: 52,
    resonantBands: ['10m', '12m', '15m', '17m', '20m'],
    noiseRejectionDb: 2.2,
    bandwidthPct: 0.025,
    takeoffProfile: 'low-angle',
    description: 'High-gain directional monoband/tribander beam with sharp forward lobe, side nulls, and 22 dB F/B rejection.',
  },
  {
    id: 'quad5',
    name: '6-Band 5 Element Quad',
    shortName: '6B 5E Quad',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 12.5,
    frontToBackDb: 25,
    beamwidthDeg: 46,
    resonantBands: ['10m', '12m', '15m', '17m', '20m', '40m'],
    noiseRejectionDb: 3.8,
    bandwidthPct: 0.044,
    takeoffProfile: 'low-angle',
    description: '6-band full-wave cubical quad (40/20/17/15/12/10m): closed DC-grounded loops cut static QRN by 3.8 dB, delivering 12.5 dBi / 25 dB F/B on 20m-10m and 2-el 6.8 dBi beam performance on 40m.',
  },
  {
    id: 'steppir3',
    name: '3 Element SteppIR',
    shortName: 'SteppIR 3E',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 8.6,
    frontToBackDb: 18,
    beamwidthDeg: 66,
    resonantBands: ['10m', '12m', '15m', '17m', '20m', '30m', '40m'],
    noiseRejectionDb: 1.6,
    bandwidthPct: 0.06,
    takeoffProfile: 'low-angle',
    description: 'Motor-tuned copper-beryllium elements keep near-1.1 VSWR across 40m-10m with 18 dB F/B ratio.',
  },
  {
    id: 'dx10m',
    name: '10m 6-El Long-Boom DX Yagi',
    shortName: '10m 6E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 13.8,
    frontToBackDb: 26,
    beamwidthDeg: 38,
    resonantBands: ['10m'],
    noiseRejectionDb: 2.8,
    bandwidthPct: 0.022,
    takeoffProfile: 'low-angle',
    description: 'Dedicated 10m long-range DX monoband beam (13.8 dBi, 26 dB F/B, 11° low takeoff) for intercontinental F2 & Es openings.',
  },
  {
    id: 'dx12m',
    name: '12m 5-El Long-Range DX Yagi',
    shortName: '12m 5E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 12.6,
    frontToBackDb: 24,
    beamwidthDeg: 44,
    resonantBands: ['12m'],
    noiseRejectionDb: 2.5,
    bandwidthPct: 0.025,
    takeoffProfile: 'low-angle',
    description: 'Dedicated 12m WARC long-boom DX Yagi (12.6 dBi, 24 dB F/B) tuned for 24.94 MHz long-haul paths.',
  },
  {
    id: 'dx15m',
    name: '15m 5-El Long-Boom DX Yagi',
    shortName: '15m 5E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 12.4,
    frontToBackDb: 24,
    beamwidthDeg: 45,
    resonantBands: ['15m'],
    noiseRejectionDb: 2.4,
    bandwidthPct: 0.025,
    takeoffProfile: 'low-angle',
    description: 'Full-size 15m 5-element DX array on a 42 ft boom for low-angle daylight multi-hop skip.',
  },
  {
    id: 'dx17m',
    name: '17m 4-El Long-Range DX Yagi',
    shortName: '17m 4E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 11.4,
    frontToBackDb: 22,
    beamwidthDeg: 48,
    resonantBands: ['17m'],
    noiseRejectionDb: 2.2,
    bandwidthPct: 0.026,
    takeoffProfile: 'low-angle',
    description: 'Dedicated 17m 4-element WARC DX beam with clean forward punch and deep side rejection.',
  },
  {
    id: 'dx20m',
    name: '20m 5-El Monoband DX Yagi',
    shortName: '20m 5E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 12.8,
    frontToBackDb: 25,
    beamwidthDeg: 44,
    resonantBands: ['20m'],
    noiseRejectionDb: 2.6,
    bandwidthPct: 0.024,
    takeoffProfile: 'low-angle',
    description: 'Contest-grade 20m full-size 5-element monobander for long-path & greyline DX worldwide.',
  },
  {
    id: 'dx30m',
    name: '30m 3-El Full-Size DX Yagi',
    shortName: '30m 3E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 9.8,
    frontToBackDb: 20,
    beamwidthDeg: 56,
    resonantBands: ['30m'],
    noiseRejectionDb: 2.0,
    bandwidthPct: 0.025,
    takeoffProfile: 'low-angle',
    description: 'Heavy-duty 30m 3-element DX Yagi built for 10.1 MHz CW/digital twilight propagation.',
  },
  {
    id: 'dx40m',
    name: '40m 3-El Full-Size DX Yagi',
    shortName: '40m 3E DX',
    isDirectional: true,
    isRotatable: true,
    forwardGainDbi: 9.5,
    frontToBackDb: 20,
    beamwidthDeg: 58,
    resonantBands: ['40m'],
    noiseRejectionDb: 2.0,
    bandwidthPct: 0.022,
    takeoffProfile: 'low-angle',
    description: 'Tower-mounted 40m full-size 3-element DX Yagi for 7 MHz transoceanic openings.',
  },
  {
    id: 'dx60m',
    name: '60m Fixed Long-Path Half-Wave Array',
    shortName: '60m DX Array',
    isDirectional: false,
    isRotatable: false,
    forwardGainDbi: 4.8,
    frontToBackDb: 4,
    beamwidthDeg: 240,
    resonantBands: ['60m'],
    noiseRejectionDb: 1.5,
    bandwidthPct: 0.018,
    takeoffProfile: 'low-angle',
    description: 'Fixed elevated 60m phased half-wave array (non-rotatable) tuned for 5.3 MHz greyline DX.',
  },
  {
    id: 'dx80m',
    name: '80m 4-Square Phased DX Verticals',
    shortName: '80m 4-Square',
    isDirectional: false,
    isRotatable: false,
    forwardGainDbi: 6.4,
    frontToBackDb: 12,
    beamwidthDeg: 360,
    resonantBands: ['80m'],
    noiseRejectionDb: 3.4,
    bandwidthPct: 0.024,
    takeoffProfile: 'low-angle',
    description: 'Fixed 80m 4-square vertical ground-plane array (non-rotatable) delivering low-angle DX gain on 3.5-4.0 MHz.',
  },
  {
    id: 'dx160m',
    name: '160m Top-Loaded DX Vertical & Beverage',
    shortName: '160m DX Vert',
    isDirectional: false,
    isRotatable: false,
    forwardGainDbi: 5.2,
    frontToBackDb: 10,
    beamwidthDeg: 360,
    resonantBands: ['160m'],
    noiseRejectionDb: 5.5,
    bandwidthPct: 0.018,
    takeoffProfile: 'low-angle',
    description: 'Fixed 160m top-loaded TX vertical paired with low-noise Beverage RX wire (non-rotatable) for Top-Band DX.',
  },
  {
    id: 'dipole',
    name: 'Half-Wave Dipole (Fixed Wire)',
    shortName: 'Dipole',
    isDirectional: true,
    isRotatable: false,
    isBidirectional: true,
    forwardGainDbi: 2.15,
    frontToBackDb: 0,
    beamwidthDeg: 95,
    resonantBands: ['20m', '40m', '80m'],
    noiseRejectionDb: 0.5,
    bandwidthPct: 0.032,
    takeoffProfile: 'high-angle',
    description: 'Fixed horizontal wire dipole (non-rotatable) with broadside figure-8 pattern and warm regional NVIS on 40m/80m.',
  },
  {
    id: 'vertical',
    name: '1/4 Wave Vertical (Fixed)',
    shortName: 'Vertical',
    isDirectional: false,
    isRotatable: false,
    forwardGainDbi: 1.4,
    frontToBackDb: 0,
    beamwidthDeg: 360,
    resonantBands: ['10m', '15m', '20m', '30m', '40m'],
    noiseRejectionDb: -2.2,
    bandwidthPct: 0.038,
    takeoffProfile: 'low-angle',
    description: 'Fixed omnidirectional low-takeoff DX antenna (non-rotatable) with radial ground plane.',
  },
  {
    id: 'efhw',
    name: 'End-Fed Half Wave (Fixed Wire)',
    shortName: 'EFHW',
    isDirectional: false,
    isRotatable: false,
    forwardGainDbi: 2.0,
    frontToBackDb: 2,
    beamwidthDeg: 220,
    resonantBands: ['10m', '15m', '20m', '40m', '80m'],
    noiseRejectionDb: 0,
    bandwidthPct: 0.042,
    takeoffProfile: 'balanced',
    description: 'Fixed multi-band 49:1 unun harmonic wire antenna (non-rotatable) resonant on 80/40/20/15/10m.',
  },
  {
    id: 'magloop',
    name: 'QRP Magnetic Loop (Rotatable)',
    shortName: 'MagLoop',
    isDirectional: true,
    isRotatable: true,
    isBidirectional: true,
    forwardGainDbi: -1.5,
    frontToBackDb: 0,
    beamwidthDeg: 78,
    resonantBands: ['10m', '12m', '15m', '17m', '20m', '30m', '40m'],
    noiseRejectionDb: 6.8,
    bandwidthPct: 0.004,
    takeoffProfile: 'balanced',
    description: 'High-Q vacuum-cap loop: razor-sharp 25 kHz tuning bandwidth, 6.8 dB quiet noise floor, and 26 dB broadside null.',
  },
];

export const DEFAULT_PROPAGATION: PropagationConditions = {
  sfi: 148,
  kIndex: 2,
  aIndex: 9,
  auroraActive: false,
  sporadicE: false,
  greylineBoost: true,
  utcHour: new Date().getUTCHours(),
  presetName: 'Hourly Solar Live',
  lastUpdatedUtc: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  sourceLabel: 'Hourly Ionospheric Feed',
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

/**
 * Returns effective band-specific directional parameters.
 * On a real-world 6-band 5-element HF cubical quad, 20m-10m run full 5-element closed loops
 * (12.5 dBi, 25 dB F/B, 46 deg beam), while the 40m wire loop acts as a 2-element directional quad
 * (6.8 dBi, 13 dB F/B, 68 deg beam).
 */
export function getEffectiveAntennaBandPerformance(
  antennaId: AntennaId,
  bandId: BandId
): {
  forwardGainDbi: number;
  frontToBackDb: number;
  beamwidthDeg: number;
  noiseRejectionDb: number;
} {
  const ant = getAntennaSpec(antennaId);
  if (antennaId === 'quad5' && bandId === '40m') {
    return {
      forwardGainDbi: 6.8,
      frontToBackDb: 13,
      beamwidthDeg: 68,
      noiseRejectionDb: 3.1,
    };
  }
  return {
    forwardGainDbi: ant.forwardGainDbi,
    frontToBackDb: ant.frontToBackDb,
    beamwidthDeg: ant.beamwidthDeg,
    noiseRejectionDb: ant.noiseRejectionDb,
  };
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
 * Computes realistic takeoff-angle & band-efficiency modifier in dB for how real HF antennas
 * perform on NVIS short-hop vs long-haul DX paths.
 */
export function computeAntennaTakeoffBonusDb(
  antennaId: AntennaId,
  bandId: BandId,
  distanceKm: number
): number {
  const ant = getAntennaSpec(antennaId);
  const band = getBandSpec(bandId);
  const isShortHop = distanceKm < 900;
  const isLongDx = distanceKm >= 2500;

  if (ant.id === 'magloop') {
    // Small loops lose radiation efficiency sharply below 20m (14 MHz)
    const lowBandEffLoss = band.centerMhz < 10 ? -4.5 : band.centerMhz < 14 ? -2.0 : 0;
    return lowBandEffLoss + (isLongDx ? -0.8 : 0.6);
  }

  if (ant.id === 'quad5') {
    if (bandId === '40m') {
      if (isLongDx) return 1.6;
      if (isShortHop) return -1.0;
      return 0.3;
    }
    // Full-wave closed quad loops launch DX energy at a lower takeoff angle at moderate boom heights
    if (isLongDx) return 2.7;
    if (isShortHop && band.centerMhz <= 10.5) return -2.2;
    return 0.4;
  }

  if (ant.id.startsWith('dx')) {
    const isTargetBand = ant.resonantBands.includes(bandId);
    if (!isTargetBand) return -3.5;
    if (isLongDx) return 3.1;
    if (isShortHop && band.centerMhz <= 10.5) return -2.0;
    return 0.6;
  }

  if (ant.takeoffProfile === 'low-angle') {
    if (isLongDx) return 2.2;
    if (isShortHop && band.centerMhz <= 10.5) return -2.5; // Low-angle vertical struggles on NVIS 40/80m
    return 0;
  }

  if (ant.takeoffProfile === 'high-angle') {
    // Horizontal dipole shines at NVIS regional 40/80m contacts
    if (isShortHop && band.centerMhz <= 10.5) return 3.0;
    if (isLongDx) return -1.2;
    return 0.5;
  }

  return 0;
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
  const perf = getEffectiveAntennaBandPerformance(antennaId, bandId);
  const isResonant = ant.resonantBands.includes(bandId);
  const resonantBonus = isResonant
    ? 0
    : ant.id.startsWith('dx')
    ? -13.0
    : (antennaId === 'yagi5' || antennaId === 'quad5') && (bandId === '80m' || bandId === '160m')
    ? -11.5
    : -4.5;

  if (!ant.isDirectional) {
    return perf.forwardGainDbi + resonantBonus;
  }

  // Non-rotatable dipole keeps a fixed E/W broadside orientation unless rotated physically
  const effectiveHeading = ant.isRotatable ? rotorHeadingDeg : 90;
  let offAxis = angularDiffDeg(signalBearingDeg, effectiveHeading);
  if (ant.isBidirectional && offAxis > 90) {
    offAxis = 180 - offAxis;
  }

  const halfBeam = perf.beamwidthDeg / 2;
  if (ant.isBidirectional) {
    // Dipole / Magloop realistic figure-8 cos pattern with deep broadside/end null at 90 deg
    const rad = (offAxis * Math.PI) / 180;
    const minLobe = antennaId === 'magloop' ? 0.048 : 0.075; // ~26 dB null for magloop, ~22.5 dB for dipole
    const lobeFactor = Math.max(minLobe, Math.cos(rad));
    const attenuation = -20 * Math.log10(1 / lobeFactor);
    return perf.forwardGainDbi + attenuation + resonantBonus;
  }

  // Yagi / Quad / SteppIR realistic main lobe + minor side ripple + deep F/B rear rejection
  if (offAxis <= halfBeam) {
    const t = offAxis / halfBeam;
    return perf.forwardGainDbi - 3 * t * t + resonantBonus;
  }
  const backFraction = Math.min(1, (offAxis - halfBeam) / (180 - halfBeam));
  // Realistic minor side lobe bump around ~115° before rear F/B minimum (quads exhibit cleaner side suppression)
  const sideRippleAmp = antennaId === 'quad5' ? 0.9 : 1.4;
  const sideLobeRipple = Math.sin(backFraction * Math.PI * 2) * sideRippleAmp;
  const dropDb = Math.max(3, 3 + (perf.frontToBackDb - 3) * Math.pow(backFraction, 0.85) - sideLobeRipple);
  return perf.forwardGainDbi - dropDb + resonantBonus;
}

/**
 * Computes realistic VSWR from antenna band resonance, frequency detune away from band center,
 * and ATU matching factor (0 = bypassed/untuned, 1 = ATU matched within tuner range).
 */
export function computeSwr(
  antennaId: AntennaId,
  bandId: BandId,
  atuMatchFactor = 0,
  frequencyHz?: number
): number {
  const ant = getAntennaSpec(antennaId);
  const band = getBandSpec(bandId);
  const isResonant = ant.resonantBands.includes(bandId);

  let detunePenalty = 0;
  if (typeof frequencyHz === 'number' && Number.isFinite(frequencyHz)) {
    const centerHz = (band.minHz + band.maxHz) / 2;
    const halfSpan = Math.max(10_000, (band.maxHz - band.minHz) / 2);
    const fracFromCenter = Math.min(1.2, Math.abs(frequencyHz - centerHz) / halfSpan);
    // High-Q antennas (MagLoop) detune rapidly across the band unless capacitor-tuned (ATU)
    let qScale = ant.bandwidthPct <= 0.01 ? 2.4 : ant.bandwidthPct <= 0.03 ? 0.65 : 0.35;
    if (antennaId === 'quad5' && bandId === '40m') {
      // 40m full-wave quad loop spans 300 kHz (~4.2% BW), showing moderate band-edge rise
      qScale = 0.78;
    }
    detunePenalty = fracFromCenter * fracFromCenter * qScale;
  }

  // SteppIR motor-tunes physical element length for flat SWR across resonant bands
  if (antennaId === 'steppir3' && isResonant) {
    detunePenalty *= 0.15;
  }

  const resonantBase =
    antennaId === 'quad5' ? (bandId === '40m' ? 1.24 : 1.12) : ant.id.startsWith('dx') ? 1.10 : 1.18;
  const baseSwr = isResonant ? resonantBase + detunePenalty : 3.9 + detunePenalty * 0.6;

  let mismatchPenalty = 0;
  if (!isResonant) {
    if (ant.id.startsWith('dx')) {
      const targetBand = getBandSpec(ant.resonantBands[0]);
      const ratio = Math.max(targetBand.centerMhz / band.centerMhz, band.centerMhz / targetBand.centerMhz);
      mismatchPenalty = Math.min(5.2, 1.4 + (ratio - 1) * 1.45);
    } else if ((antennaId === 'yagi5' || antennaId === 'quad5') && (bandId === '80m' || bandId === '160m')) {
      mismatchPenalty = antennaId === 'quad5' ? 3.4 : 3.1;
    } else if (antennaId === 'vertical' && bandId === '160m') {
      mismatchPenalty = 2.2;
    }
  }

  const rawSwr = baseSwr + mismatchPenalty;
  // Real internal ATU matches moderate SWR (up to ~4:1) cleanly, while severe off-band mismatches stay > 1.6
  const maxReduction = rawSwr <= 4.3 ? 0.92 : Math.max(0.55, 0.92 - (rawSwr - 4.3) * 0.085);
  const clampedAtu = Math.max(0, Math.min(maxReduction, atuMatchFactor));
  const matchedSwr = 1.0 + (rawSwr - 1.0) * (1 - clampedAtu);
  return Number(Math.max(1.05, Math.min(9.9, matchedSwr)).toFixed(2));
}

export const SWR_RED_THRESHOLD = 1.6;

export function isSwrHigh(swr: number): boolean {
  return Number.isFinite(swr) && swr > SWR_RED_THRESHOLD;
}

export function computeTxFoldbackPower(requestedPowerW: number, swr: number): number {
  const clampedReq = Math.max(0.5, Math.min(MAX_TX_POWER_W, requestedPowerW));
  if (swr <= 1.5) return Number(clampedReq.toFixed(1));
  const foldback = Math.max(0.25, 1 - (swr - 1.5) * 0.16);
  return Number((clampedReq * foldback).toFixed(1));
}

export const MAX_PA_POWER_W = 500.0;
export const PA_SWR_TRIP_THRESHOLD = 2.0;
export type PaGainDb = 7 | 10; // +7 dB (5x) or +10 dB (10x)

export interface PowerAmpResult {
  outputPowerW: number;
  exciterPowerW: number;
  gainMultiplier: number;
  paActive: boolean;
  paTripped: boolean;
}

/**
 * Models a compact desktop solid-state HF linear power amplifier driven by the transceiver exciter.
 * Trips safely into bypass if feedline SWR exceeds 2.0:1, protecting finals until ATU matches the load.
 */
export function computePowerAmpOutput(params: {
  exciterPowerW: number;
  swr: number;
  paEnabled: boolean;
  gainDb: PaGainDb;
}): PowerAmpResult {
  const exciterPowerW = computeTxFoldbackPower(params.exciterPowerW, params.swr);
  const gainMultiplier = params.gainDb === 10 ? 10 : 5;

  if (!params.paEnabled) {
    return {
      outputPowerW: exciterPowerW,
      exciterPowerW,
      gainMultiplier,
      paActive: false,
      paTripped: false,
    };
  }

  if (!Number.isFinite(params.swr) || params.swr > PA_SWR_TRIP_THRESHOLD) {
    return {
      outputPowerW: exciterPowerW,
      exciterPowerW,
      gainMultiplier,
      paActive: false,
      paTripped: true,
    };
  }

  const rawAmplified = Math.min(MAX_PA_POWER_W, Math.max(0.5, params.exciterPowerW) * gainMultiplier);
  const swrFoldback = params.swr <= 1.5 ? 1 : Math.max(0.6, 1 - (params.swr - 1.5) * 0.25);
  return {
    outputPowerW: Number((rawAmplified * swrFoldback).toFixed(1)),
    exciterPowerW,
    gainMultiplier,
    paActive: true,
    paTripped: false,
  };
}

export function getDayOfYearUtc(nowMs = Date.now()): number {
  const d = new Date(nowMs);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.max(1, Math.min(366, Math.floor((nowMs - startOfYear) / 86_400_000)));
}

export function getSolarDeclinationDeg(nowMs = Date.now()): number {
  const doy = getDayOfYearUtc(nowMs);
  return Number((-23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10))).toFixed(2));
}

export function getSubsolarPoint(utcHour: number, timestampMs = Date.now()): { lat: number; lon: number } {
  const rawLon = (12 - utcHour) * 15;
  const wrappedLon = ((((rawLon + 180) % 360) + 360) % 360) - 180;
  return {
    lat: getSolarDeclinationDeg(timestampMs),
    lon: Number(wrappedLon.toFixed(2)),
  };
}

export interface GreyLineGeometry {
  subsolarLat: number;
  subsolarLon: number;
  points: Array<{ lon: number; lat: number }>;
  terminatorPathD: string;
  nightPolygonD: string;
}

/**
 * Computes the astronomical grey-line solar terminator curve and night-hemisphere polygon
 * in equirectangular 0..360 x 0..180 SVG coordinates for any UTC hour and seasonal date.
 */
export function computeGreyLineTerminator(
  utcHour: number,
  timestampMs = Date.now()
): GreyLineGeometry {
  const subsolar = getSubsolarPoint(utcHour, timestampMs);
  // Avoid tan(0) singularity right on equinoxes while keeping 89.9° vertical precision
  const effDeclDeg = Math.abs(subsolar.lat) < 0.12 ? (subsolar.lat >= 0 ? 0.12 : -0.12) : subsolar.lat;
  const tanDecl = Math.tan((effDeclDeg * Math.PI) / 180);
  const subLonRad = (subsolar.lon * Math.PI) / 180;

  const points: Array<{ lon: number; lat: number }> = [];
  const svgPts: Array<{ x: number; y: number }> = [];

  for (let lon = -180; lon <= 180; lon += 4) {
    const dLonRad = (lon * Math.PI) / 180 - subLonRad;
    const latRad = Math.atan(-Math.cos(dLonRad) / tanDecl);
    const lat = (latRad * 180) / Math.PI;
    points.push({ lon, lat: Number(lat.toFixed(2)) });
    svgPts.push({
      x: ((lon + 180) / 360) * 360,
      y: ((90 - lat) / 180) * 180,
    });
  }

  const terminatorPathD = svgPts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Northern summer (decl > 0): South Pole (y=180) is in night; Northern winter (decl < 0): North Pole (y=0) is in night
  const nightEdgeY = effDeclDeg >= 0 ? '180.0' : '0.0';
  const nightPolygonD = `${terminatorPathD} L 360.0 ${nightEdgeY} L 0.0 ${nightEdgeY} Z`;

  return {
    subsolarLat: subsolar.lat,
    subsolarLon: subsolar.lon,
    points,
    terminatorPathD,
    nightPolygonD,
  };
}

export function getMsUntilNextUtcHour(nowMs = Date.now()): number {
  const nextHourMs = (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
  return Math.max(1_000, nextHourMs - nowMs);
}

export function getNextTopOfHourUtcLabel(nowMs = Date.now()): string {
  const nextHourMs = (Math.floor(nowMs / 3_600_000) + 1) * 3_600_000;
  const d = new Date(nextHourMs);
  return `${d.toISOString().slice(0, 13)}:00 UTC`.replace('T', ' ');
}

export function computeMufMhz(
  conditions: PropagationConditions,
  midLatAbs: number,
  lonDeg?: number
): number {
  const solarFactor = 9.5 + (conditions.sfi - 65) * 0.13;
  const localSolarHour =
    typeof lonDeg === 'number' && Number.isFinite(lonDeg)
      ? (((conditions.utcHour + lonDeg / 15) % 24) + 24) % 24
      : conditions.utcHour;
  const daytimeBoost = 1 + 0.32 * Math.cos(((localSolarHour - 13) / 12) * Math.PI);
  const stormDepression = Math.max(0.45, 1 - conditions.kIndex * 0.055);
  const latFactor = Math.max(0.7, 1.1 - midLatAbs * 0.004);
  return Number(Math.max(4.5, solarFactor * daytimeBoost * stormDepression * latFactor).toFixed(1));
}

export function evaluateBandCondition(
  bandId: BandId,
  conditions: PropagationConditions,
  qth?: { lat: number; lon: number }
): { rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Aurora'; mufMhz: number; noiseDbm: number } {
  const band = getBandSpec(bandId);
  const lat = qth?.lat ?? 32;
  const lon = qth?.lon ?? 0;

  const bandNoiseBase = -124 + Math.max(0, (14 - band.centerMhz) * 1.15);
  const stormNoise = conditions.kIndex * 1.3 + (conditions.auroraActive ? 4 : 0);
  const noiseDbm = Number((bandNoiseBase + stormNoise).toFixed(1));

  const cell = evaluateGlobalPropagationCell(lat, lon, bandId, conditions);
  return { rating: cell.rating, mufMhz: cell.mufMhz, noiseDbm };
}

export type PropagationRating = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Aurora';

/**
 * Generates an hourly propagation snapshot synchronized to the current UTC hour,
 * optionally blending live NOAA SWPC solar flux & planetary K-index measurements.
 */
export function computeHourlyPropagationSnapshot(
  nowMs = Date.now(),
  liveSwpc?: { sfi?: number; kIndex?: number; aIndex?: number }
): PropagationConditions {
  const d = new Date(nowMs);
  const utcHour = d.getUTCHours() + d.getUTCMinutes() / 60;
  const hourBucket = Math.floor(nowMs / 3_600_000);
  const sfiWave = Math.round(145 + 18 * Math.sin(hourBucket * 0.41) + 9 * Math.cos(hourBucket * 0.17));
  const kWave = Math.max(1, Math.min(5, Math.round(2 + 1.2 * Math.sin(hourBucket * 0.63))));

  const hasLiveSfi = typeof liveSwpc?.sfi === 'number' && Number.isFinite(liveSwpc.sfi);
  const hasLiveK = typeof liveSwpc?.kIndex === 'number' && Number.isFinite(liveSwpc.kIndex);

  const sfi = Math.round(
    Math.max(65, Math.min(250, hasLiveSfi ? (liveSwpc!.sfi as number) : sfiWave))
  );
  const kIndex = Math.round(
    Math.max(0, Math.min(9, hasLiveK ? (liveSwpc!.kIndex as number) : kWave))
  );
  const aIndex =
    typeof liveSwpc?.aIndex === 'number' && Number.isFinite(liveSwpc.aIndex)
      ? Math.round(Math.max(0, Math.min(400, liveSwpc.aIndex)))
      : Math.round(Math.pow(2, kIndex * 0.8) * 2.5);

  const stamp = `${d.toISOString().slice(0, 13)}:00 UTC`.replace('T', ' ');
  return {
    sfi,
    kIndex,
    aIndex,
    auroraActive: kIndex >= 5,
    sporadicE: (hourBucket % 5 === 0) || sfi >= 165,
    greylineBoost: true,
    utcHour: Number(utcHour.toFixed(2)),
    presetName: hasLiveSfi || hasLiveK ? 'NOAA Hourly Live' : 'Hourly Solar Live',
    lastUpdatedUtc: stamp,
    nextUpdateUtc: getNextTopOfHourUtcLabel(nowMs),
    sourceLabel: hasLiveSfi || hasLiveK ? 'NOAA SWPC Hourly' : 'Hourly Solar Model',
    timestampMs: nowMs,
  };
}

/**
 * Computes solar illumination cosine at (lat, lon) for a given UTC hour & seasonal date.
 * Positive => daylight, near zero => greyline twilight, negative => night.
 */
export function computeSolarZenithCos(
  latDeg: number,
  lonDeg: number,
  utcHour: number,
  timestampMs = Date.now()
): number {
  const subsolar = getSubsolarPoint(utcHour, timestampMs);
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(latDeg);
  const lat2 = toRad(subsolar.lat);
  const dLon = toRad(lonDeg - subsolar.lon);
  return Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
}

/**
 * Evaluates regional HF propagation quality at a geographic coordinate for color-coding
 * the global propagation map across bands and hourly conditions.
 */
export function evaluateGlobalPropagationCell(
  lat: number,
  lon: number,
  bandId: BandId,
  conditions: PropagationConditions
): { rating: PropagationRating; mufMhz: number; isDaylight: boolean; solarZenithCos: number } {
  const band = getBandSpec(bandId);
  const solarZenithCos = computeSolarZenithCos(lat, lon, conditions.utcHour, conditions.timestampMs);
  const isDaylight = solarZenithCos > 0.05;
  const isGreyline = Math.abs(solarZenithCos) <= 0.22;
  const absLat = Math.abs(lat);

  // Local F2 MUF responds strongly to solar illumination & SFI, penalized by K-index
  const solarFactor = 9.4 + (conditions.sfi - 65) * 0.138;
  const illumFactor = 0.78 + Math.max(-0.24, Math.min(0.46, solarZenithCos * 0.5));
  const stormDepression = Math.max(0.42, 1 - conditions.kIndex * 0.058);
  const latFactor = absLat <= 28 ? 1.12 : Math.max(0.64, 1.08 - (absLat - 28) * 0.0055);
  const mufMhz = Number(Math.max(4.5, solarFactor * illumFactor * stormDepression * latFactor).toFixed(1));

  // Polar auroral oval absorption & flutter
  if (absLat >= 58 && (conditions.auroraActive || conditions.kIndex >= 5)) {
    return { rating: 'Aurora', mufMhz, isDaylight, solarZenithCos };
  }

  // High bands above local MUF
  if (band.centerMhz > mufMhz * 1.14) {
    if (conditions.sporadicE && absLat >= 20 && absLat <= 55 && band.centerMhz >= 18) {
      return { rating: 'Fair', mufMhz, isDaylight, solarZenithCos };
    }
    return { rating: 'Poor', mufMhz, isDaylight, solarZenithCos };
  }

  // Low-band daytime D-layer absorption
  if (band.centerMhz <= 5.5 && solarZenithCos > 0.15) {
    return { rating: 'Poor', mufMhz, isDaylight, solarZenithCos };
  }
  if (band.centerMhz <= 7.5 && solarZenithCos > 0.25 && conditions.sfi > 125) {
    return { rating: 'Fair', mufMhz, isDaylight, solarZenithCos };
  }

  // Greyline twilight boost
  if (conditions.greylineBoost && isGreyline && conditions.kIndex <= 4 && band.centerMhz <= mufMhz * 1.08) {
    return { rating: 'Excellent', mufMhz, isDaylight, solarZenithCos };
  }

  if (band.centerMhz <= mufMhz * 0.88 && conditions.kIndex <= 2 && conditions.sfi >= 130) {
    return { rating: 'Excellent', mufMhz, isDaylight, solarZenithCos };
  }
  if (band.centerMhz <= mufMhz && conditions.kIndex <= 4) {
    return { rating: 'Good', mufMhz, isDaylight, solarZenithCos };
  }
  return { rating: 'Fair', mufMhz, isDaylight, solarZenithCos };
}

export interface WorldPropagationRegionSpec {
  id: string;
  name: string;
  shortName: string;
  lat: number;
  lon: number;
}

export const WORLD_PROPAGATION_REGIONS: WorldPropagationRegionSpec[] = [
  { id: 'na', name: 'North America', shortName: 'N. Amer', lat: 40, lon: -100 },
  { id: 'sa', name: 'South America', shortName: 'S. Amer', lat: -15, lon: -60 },
  { id: 'eu', name: 'Europe', shortName: 'Europe', lat: 50, lon: 10 },
  { id: 'af', name: 'Africa', shortName: 'Africa', lat: 5, lon: 20 },
  { id: 'as', name: 'Asia', shortName: 'Asia', lat: 38, lon: 98 },
  { id: 'oc', name: 'Oceania / VK', shortName: 'Oceania', lat: -25, lon: 138 },
  { id: 'polar', name: 'Polar / Arctic', shortName: 'Polar', lat: 68, lon: 15 },
];

export interface WorldRegionPropagationSummary extends WorldPropagationRegionSpec {
  solarPhase: 'Day' | 'Greyline' | 'Night';
  localMufMhz: number;
  bands: Record<BandId, PropagationRating>;
}

/**
 * Evaluates hourly propagation conditions across all major regions of the whole world
 * and every HF amateur band (10m through 160m).
 */
export function evaluateAllWorldRegions(
  conditions: PropagationConditions
): WorldRegionPropagationSummary[] {
  return WORLD_PROPAGATION_REGIONS.map((region) => {
    const sample20m = evaluateGlobalPropagationCell(region.lat, region.lon, '20m', conditions);
    const solarPhase: 'Day' | 'Greyline' | 'Night' =
      Math.abs(sample20m.solarZenithCos) <= 0.22
        ? 'Greyline'
        : sample20m.solarZenithCos > 0.22
        ? 'Day'
        : 'Night';

    const bands = {} as Record<BandId, PropagationRating>;
    for (const band of BANDS) {
      bands[band.id] = evaluateGlobalPropagationCell(region.lat, region.lon, band.id, conditions).rating;
    }

    return {
      ...region,
      solarPhase,
      localMufMhz: sample20m.mufMhz,
      bands,
    };
  });
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
  const midLat = (txQth.lat + rxQth.lat) / 2;
  const midLatAbs = Math.abs(midLat);
  const midLon = (txQth.lon + rxQth.lon) / 2;
  const muf = computeMufMhz(conditions, midLatAbs, midLon);

  const fspl = 32.45 + 20 * Math.log10(band.centerMhz) + 20 * Math.log10(safeDist);
  let loss = fspl * 0.72;

  if (band.centerMhz > muf) {
    const excessMhz = band.centerMhz - muf;
    const esRelief = conditions.sporadicE && safeDist >= 500 && safeDist <= 2400 ? 18 : 0;
    loss += Math.max(0, excessMhz * 5.5 - esRelief);
  }

  const midSolarCos = computeSolarZenithCos(midLat, midLon, conditions.utcHour, conditions.timestampMs);
  const isDay = midSolarCos > 0.08;
  if (isDay && band.centerMhz < 10.5) {
    const absorption = ((10.5 - band.centerMhz) / 8.5) * (14 + conditions.sfi * 0.04) * Math.max(0.35, midSolarCos);
    loss += absorption;
  }

  const stormPenalty = conditions.kIndex * (midLatAbs > 45 ? 3.2 : 1.6);
  loss += stormPenalty;

  const txSolarCos = computeSolarZenithCos(txQth.lat, txQth.lon, conditions.utcHour, conditions.timestampMs);
  const rxSolarCos = computeSolarZenithCos(rxQth.lat, rxQth.lon, conditions.utcHour, conditions.timestampMs);
  const crossesTerminator = Math.abs(txSolarCos) <= 0.25 || Math.abs(rxSolarCos) <= 0.25 || Math.abs(midSolarCos) <= 0.22;
  const greylineBonus = conditions.greylineBoost && (crossesTerminator || safeDist > 2500) ? -6.5 : 0;
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
  if (dbm >= -73) {
    const over = Math.round(dbm - -73);
    if (over < 5) return 'S9';
    return `S9+${Math.min(60, over)}`;
  }
  const sUnit = Math.max(1, Math.min(9, Math.round(9 - (-73 - dbm) / 6)));
  return `S${sUnit}`;
}

export function dbmToNormalizedMeter(dbm: number): number {
  if (dbm <= -127) return 0.04;
  if (dbm <= -73) {
    return 0.04 + ((dbm - -127) / 54) * 0.56;
  }
  return Math.min(1, 0.6 + ((dbm - -73) / 60) * 0.4);
}

/**
 * Models realistic RF/S-meter deflection while transmitting across phone, CW, and digital modes,
 * scaling with delivered TX power (including SWR foldback) and live speech/keying/FSK envelopes.
 */
export function computeTxSMeterReading(params: {
  mode: RadioMode;
  deliveredPowerW: number;
  maxPowerW?: number;
  micRms: number;
  micEnabled: boolean;
  compressionPct: number;
  keyDown?: boolean;
  toneFreqHz?: number;
  isTuningAtu?: boolean;
  timeSec: number;
}): { dbm: number; text: string; normalized: number } {
  const maxW = Math.max(1, params.maxPowerW ?? MAX_TX_POWER_W);
  const powerRatio = Math.max(0.05, Math.min(1, params.deliveredPowerW / maxW));
  const powerFactor = 0.18 + 0.82 * Math.pow(powerRatio, 0.55);
  const t = params.timeSec;

  let envelope = 0.5;
  if (params.isTuningAtu) {
    // ATU relay & matching impedance sweep produces rhythmic SWR/RF swings
    envelope = 0.55 + 0.22 * Math.sin(t * 14) + 0.09 * Math.cos(t * 23);
  } else if (params.mode === 'CW') {
    envelope = params.keyDown === false ? 0.06 : 0.86 + 0.025 * Math.sin(t * 11);
  } else if (params.mode === 'RTTY') {
    envelope = (params.keyDown === false ? 0.77 : 0.85) + 0.025 * Math.sin(t * 29);
  } else if (params.mode === 'FT8' || params.mode === 'DIGITAL') {
    const toneRipple = params.toneFreqHz ? ((params.toneFreqHz % 50) / 50) * 0.03 : 0;
    envelope = 0.82 + 0.03 * Math.sin(t * 18) + toneRipple;
  } else if (params.mode === 'SSTV') {
    envelope = 0.76 + 0.10 * Math.sin(t * 9.5) + 0.04 * Math.cos(t * 23);
  } else if (params.mode === 'FM') {
    envelope = 0.84 + 0.012 * Math.sin(t * 8);
  } else if (params.mode === 'AM') {
    const compBoost = 1 + (params.compressionPct / 100) * 0.28;
    const modPeak =
      params.micEnabled && params.micRms > 0.012
        ? Math.min(0.42, Math.pow(params.micRms * 2.8, 0.75) * 0.42 * compBoost)
        : !params.micEnabled
        ? 0.22 * Math.abs(Math.sin(t * 5.2)) + 0.08 * Math.sin(t * 13.1)
        : 0.04 * Math.abs(Math.sin(t * 4.5));
    envelope = 0.52 + modPeak;
  } else {
    // USB / LSB single-sideband suppressed carrier: follows live voice RMS + speech compression
    const compBoost = 1 + (params.compressionPct / 100) * 0.35;
    if (params.micEnabled && params.micRms > 0.012) {
      const speech = Math.min(1, Math.pow(params.micRms * 3.6, 0.72) * compBoost);
      envelope = 0.2 + 0.76 * speech;
    } else if (!params.micEnabled) {
      // Natural syllabic SSB TX modulation cadence when keying PTT without an active microphone
      const cadence =
        0.52 +
        0.24 * Math.abs(Math.sin(t * 4.8)) +
        0.12 * Math.sin(t * 11.7) +
        0.06 * Math.cos(t * 19.3);
      envelope = Math.max(0.24, Math.min(0.94, cadence * (0.9 + (compBoost - 1) * 0.25)));
    } else {
      // Active mic at quiet room level: distinct PTT bias kick with light breath/room shimmer
      envelope = 0.32 + 0.06 * Math.abs(Math.sin(t * 4.2)) + 0.03 * Math.sin(t * 11);
    }
  }

  const clampedEnv = Math.max(0, Math.min(1, envelope));
  const dbm = Number((-114 + clampedEnv * powerFactor * 68).toFixed(1));
  return {
    dbm,
    text: dbmToSMeterText(dbm),
    normalized: dbmToNormalizedMeter(dbm),
  };
}

/**
 * Simulates D'Arsonval analog meter mechanical ballistics:
 * crisp upward attack (~45 ms time constant) and smooth damped decay (~160 ms).
 */
export function stepMeterNeedleNormalized(
  currentNorm: number,
  targetNorm: number,
  dtSec: number
): number {
  const cur = Math.max(0, Math.min(1, currentNorm));
  const tgt = Math.max(0, Math.min(1, targetNorm));
  const safeDt = Math.max(0.001, Math.min(0.25, dtSec));
  const tau = tgt >= cur ? 0.045 : 0.16;
  const alpha = 1 - Math.exp(-safeDt / tau);
  const next = cur + (tgt - cur) * alpha;
  if (Math.abs(tgt - next) < 0.002) return tgt;
  return Number(next.toFixed(4));
}

export interface VoacapPathEvaluation {
  mufMhz: number;
  fotMhz: number;
  lufMhz: number;
  reliabilityPct: number;
  circuitOpen: boolean;
  rating: PropagationRating;
  auroraFlutter: number;
  pathLossDb: number;
  modeLabel: string;
  reason: string;
}

function interpolateGreatCirclePoint(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  frac: number
): { lat: number; lon: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon2 - lon1) / 2), 2)
      )
    );
  if (d < 1e-4) return { lat: a.lat, lon: a.lon };

  const A = Math.sin((1 - frac) * d) / Math.sin(d);
  const B = Math.sin(frac * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return {
    lat: Number(toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))).toFixed(2)),
    lon: Number(toDeg(Math.atan2(y, x)).toFixed(2)),
  };
}

/**
 * VOACAP-grade HF circuit prediction across great-circle F2 control points.
 * Models MUF, FOT (0.85*MUF), LUF (D-layer absorption & power), Sporadic-E,
 * Greyline ducting, Aurora oval blackout, and hourly UTC variation.
 */
export function evaluateVoacapPath(params: {
  bandId: BandId;
  txQth: QthLocation;
  rxQth: QthLocation;
  powerW?: number;
  txAntennaGainDb?: number;
  rxAntennaGainDb?: number;
  conditions: PropagationConditions;
}): VoacapPathEvaluation {
  const { bandId, txQth, rxQth, conditions } = params;
  const band = getBandSpec(bandId);
  const distanceKm = haversineDistanceKm(rxQth, txQth);
  const safeDist = Math.max(25, distanceKm);
  const powerW = Math.max(0.5, params.powerW ?? 15);
  const txGainDb = params.txAntennaGainDb ?? 4;
  const rxGainDb = params.rxAntennaGainDb ?? 4;

  const hops = Math.max(1, Math.min(5, Math.ceil(safeDist / 3200)));
  const controlPoints: Array<{ lat: number; lon: number }> = [];
  for (let h = 0; h < hops; h++) {
    controlPoints.push(interpolateGreatCirclePoint(txQth, rxQth, (h + 0.5) / hops));
  }

  let bottleneckMuf = 99;
  let maxSolarDayCos = -1;
  let maxAbsLat = Math.max(Math.abs(txQth.lat), Math.abs(rxQth.lat));
  let greylineHits = 0;

  for (const pt of controlPoints) {
    const solarCos = computeSolarZenithCos(pt.lat, pt.lon, conditions.utcHour, conditions.timestampMs);
    maxSolarDayCos = Math.max(maxSolarDayCos, solarCos);
    const absLat = Math.abs(pt.lat);
    maxAbsLat = Math.max(maxAbsLat, absLat);
    if (Math.abs(solarCos) <= 0.24) greylineHits += 1;

    const solarFactor = 9.4 + (conditions.sfi - 65) * 0.138;
    const illumFactor = 0.78 + Math.max(-0.24, Math.min(0.46, solarCos * 0.5));
    const stormDepression = Math.max(0.42, 1 - conditions.kIndex * 0.058);
    const latFactor = absLat <= 28 ? 1.12 : Math.max(0.64, 1.08 - (absLat - 28) * 0.0055);
    const hopMuf = Math.max(4.5, solarFactor * illumFactor * stormDepression * latFactor);
    bottleneckMuf = Math.min(bottleneckMuf, hopMuf);
  }

  const txSolarCos = computeSolarZenithCos(txQth.lat, txQth.lon, conditions.utcHour, conditions.timestampMs);
  const rxSolarCos = computeSolarZenithCos(rxQth.lat, rxQth.lon, conditions.utcHour, conditions.timestampMs);
  if (Math.abs(txSolarCos) <= 0.24 || Math.abs(rxSolarCos) <= 0.24) greylineHits += 1;

  const mufMhz = Number(bottleneckMuf.toFixed(1));
  const fotMhz = Number((mufMhz * 0.85).toFixed(1));

  // LUF scales with sunlit D-layer absorption, distance, K-index, and ERP
  const erpRelief = Math.max(-1.2, Math.min(2.6, (10 * Math.log10(powerW / 15) + (txGainDb + rxGainDb - 8) * 0.35) * 0.18));
  const sunlitFactor = Math.max(0, maxSolarDayCos);
  const lufBase =
    1.5 +
    sunlitFactor * (2.6 + (conditions.sfi - 70) * 0.015) * (0.65 + Math.min(1.6, safeDist / 7500)) +
    conditions.kIndex * 0.42 -
    erpRelief;
  const lufMhz = Number(Math.max(1.4, Math.min(18.0, lufBase)).toFixed(1));

  const { pathLossDb, auroraFlutter } = computePropagationPathLossDb(
    bandId,
    safeDist,
    txQth,
    rxQth,
    conditions
  );

  // Local groundwave (< 160 km) bypasses skywave skip zone unless extreme high-band blackout
  if (distanceKm <= 160) {
    const stormBlocked = conditions.auroraActive && conditions.kIndex >= 8 && band.centerMhz >= 21;
    return {
      mufMhz,
      fotMhz,
      lufMhz,
      reliabilityPct: stormBlocked ? 10 : 96,
      circuitOpen: !stormBlocked,
      rating: stormBlocked ? 'Aurora' : 'Excellent',
      auroraFlutter,
      pathLossDb,
      modeLabel: 'Groundwave',
      reason: stormBlocked ? 'Severe storm blackout' : 'Local Groundwave Open',
    };
  }

  const polarStorm = maxAbsLat >= 58 && (conditions.auroraActive || conditions.kIndex >= 6);
  const esOpen =
    conditions.sporadicE &&
    distanceKm >= 450 &&
    distanceKm <= 2600 &&
    band.centerMhz >= 14 &&
    maxAbsLat <= 60;

  let rel = 88;
  let modeLabel = `${hops}-Hop F2`;
  let reason = `F2 Open (MUF ${mufMhz} MHz)`;

  if (band.centerMhz > mufMhz * 1.12) {
    if (esOpen) {
      rel = Math.max(42, 74 - (band.centerMhz - mufMhz) * 3.5 - conditions.kIndex * 4);
      modeLabel = 'Sporadic-E';
      reason = `Es Skip Open (${Math.round(rel)}% REL)`;
    } else {
      const overRatio = (band.centerMhz - mufMhz) / Math.max(2, mufMhz);
      rel = Math.max(2, Math.round(28 - overRatio * 85 - conditions.kIndex * 4));
      modeLabel = 'Above MUF';
      reason = `Closed: ${band.centerMhz} MHz > MUF ${mufMhz} MHz`;
    }
  } else if (band.centerMhz > fotMhz) {
    // Between FOT and MUF+12% — transition band
    const frac = (band.centerMhz - fotMhz) / Math.max(0.5, mufMhz * 1.12 - fotMhz);
    rel = Math.round(86 - frac * 42 - conditions.kIndex * 4);
    reason = `Marginal MUF (${Math.round(rel)}% REL)`;
  }

  if (band.centerMhz < lufMhz) {
    const deficit = lufMhz - band.centerMhz;
    rel = Math.max(3, Math.round(rel - deficit * 26));
    modeLabel = 'D-Layer Abs';
    reason = `Closed: D-Layer LUF ${lufMhz} MHz`;
  }

  if (conditions.greylineBoost && greylineHits > 0 && conditions.kIndex <= 4 && band.centerMhz <= mufMhz * 1.08) {
    rel = Math.min(99, rel + 12);
    if (rel >= 45) reason = `Greyline Duct (${Math.round(rel)}% REL)`;
  }

  if (polarStorm) {
    rel = Math.min(rel, conditions.kIndex >= 7 ? 12 : 24);
    modeLabel = 'Aurora Scatter';
    reason = rel < 18 ? 'Aurora Polar Blackout' : 'Aurora Flutter Path';
  } else if (conditions.kIndex >= 5) {
    rel = Math.max(5, rel - (conditions.kIndex - 4) * 14);
  }

  rel = Math.max(1, Math.min(99, Math.round(rel)));
  const circuitOpen = rel >= 18;

  const rating: PropagationRating = polarStorm && rel < 30
    ? 'Aurora'
    : rel >= 80
    ? 'Excellent'
    : rel >= 55
    ? 'Good'
    : rel >= 25
    ? 'Fair'
    : 'Poor';

  return {
    mufMhz,
    fotMhz,
    lufMhz,
    reliabilityPct: rel,
    circuitOpen,
    rating,
    auroraFlutter,
    pathLossDb,
    modeLabel,
    reason,
  };
}

/**
 * Evaluates VOACAP area propagation from the operator's own QTH location (`originQth`)
 * to any coordinate `(targetLat, targetLon)` across the world map, updated hourly.
 */
export function evaluateVoacapCoverageFromQth(
  originQth: QthLocation,
  targetLat: number,
  targetLon: number,
  bandId: BandId,
  conditions: PropagationConditions
): {
  rating: PropagationRating;
  reliabilityPct: number;
  mufMhz: number;
  fotMhz: number;
  lufMhz: number;
  circuitOpen: boolean;
  modeLabel: string;
  isDaylight: boolean;
  solarZenithCos: number;
} {
  const targetSolarCos = computeSolarZenithCos(
    targetLat,
    targetLon,
    conditions.utcHour,
    conditions.timestampMs
  );
  const path = evaluateVoacapPath({
    bandId,
    txQth: originQth,
    rxQth: { lat: targetLat, lon: targetLon, grid: maidenheadFromLatLon(targetLat, targetLon) },
    powerW: 15,
    conditions,
  });
  return {
    rating: path.rating,
    reliabilityPct: path.reliabilityPct,
    mufMhz: path.mufMhz,
    fotMhz: path.fotMhz,
    lufMhz: path.lufMhz,
    circuitOpen: path.circuitOpen,
    modeLabel: path.modeLabel,
    isDaylight: targetSolarCos > 0.05,
    solarZenithCos: targetSolarCos,
  };
}

/**
 * Strict gate: users can only hear and talk to each other when tuned to the same frequency
 * (same band & within passband frequency tolerance) AND when VOACAP propagation allows the circuit.
 */
export function isSameFrequencyAndPropagationOpen(params: {
  rxQth: QthLocation;
  txQth: QthLocation;
  rxBand: BandId;
  txBand: BandId;
  rxFrequencyHz: number;
  txFrequencyHz: number;
  rxFilterWidthKhz?: number;
  txPowerW?: number;
  conditions: PropagationConditions;
  maxFreqDeltaHz?: number;
  weakSignalDigital?: boolean;
}): { allowed: boolean; freqDiffHz: number; voacap: VoacapPathEvaluation } {
  const freqDiffHz = Math.abs(params.txFrequencyHz - params.rxFrequencyHz);
  const toleranceHz =
    params.maxFreqDeltaHz ??
    Math.min(1800, Math.max(450, ((params.rxFilterWidthKhz ?? 2.4) * 1000) / 2 + 400));
  const sameFreq = params.txBand === params.rxBand && freqDiffHz <= toleranceHz;
  const voacap = evaluateVoacapPath({
    bandId: params.txBand,
    txQth: params.txQth,
    rxQth: params.rxQth,
    powerW: params.txPowerW ?? 15,
    conditions: params.conditions,
  });
  const circuitOpen = params.weakSignalDigital
    ? voacap.circuitOpen || voacap.reliabilityPct >= 4
    : voacap.circuitOpen;
  return {
    allowed: sameFreq && circuitOpen,
    freqDiffHz,
    voacap,
  };
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

  const rxAntennaGainDb =
    computeAntennaGainDb(rxAntennaId, bearingToTxDeg, rxRotorHeadingDeg, rxBand) +
    computeAntennaTakeoffBonusDb(rxAntennaId, rxBand, distanceKm);
  const txAntennaGainDb =
    computeAntennaGainDb(station.antennaId, bearingToRxDeg, station.rotorHeadingDeg, station.band) +
    computeAntennaTakeoffBonusDb(station.antennaId, station.band, distanceKm);

  const voacap = evaluateVoacapPath({
    bandId: station.band,
    txQth: station.qth,
    rxQth,
    powerW: station.powerW,
    txAntennaGainDb,
    rxAntennaGainDb,
    conditions,
  });

  const txPowerDbm = 10 * Math.log10(Math.max(0.1, station.powerW) * 1000);
  const rfGainOffset = (rxRfGainPct - 50) * 0.25;
  const propPenaltyDb = voacap.circuitOpen ? 0 : 28;
  const rxPowerDbm = Number(
    (txPowerDbm + txAntennaGainDb + rxAntennaGainDb - voacap.pathLossDb - propPenaltyDb + rfGainOffset).toFixed(1)
  );

  const rxPerf = getEffectiveAntennaBandPerformance(rxAntennaId, rxBand);
  const bandRating = evaluateBandCondition(rxBand, conditions, rxQth);
  const noiseFloorDbm = Number((bandRating.noiseDbm - rxPerf.noiseRejectionDb + rfGainOffset * 0.5).toFixed(1));

  const freqOffsetHz = station.frequencyHz - rxFrequencyHz;
  const passbandToleranceHz = Math.min(1800, Math.max(450, (rxFilterWidthKhz * 1000) / 2 + 400));
  const sameFreq = station.band === rxBand && Math.abs(freqOffsetHz) <= passbandToleranceHz;
  const inPassband = sameFreq && voacap.circuitOpen;

  const snrDb = Number((rxPowerDbm - noiseFloorDbm).toFixed(1));
  const effectiveDbm = station.band === rxBand && voacap.circuitOpen ? Math.max(noiseFloorDbm, rxPowerDbm) : noiseFloorDbm;

  return {
    stationId: station.id,
    distanceKm: Math.round(distanceKm),
    bearingToTxDeg,
    rxAntennaGainDb: Number(rxAntennaGainDb.toFixed(1)),
    txAntennaGainDb: Number(txAntennaGainDb.toFixed(1)),
    pathLossDb: voacap.pathLossDb,
    rxPowerDbm,
    noiseFloorDbm,
    snrDb,
    sMeterText: dbmToSMeterText(effectiveDbm),
    sMeterNormalized: dbmToNormalizedMeter(effectiveDbm),
    auroraFlutter: voacap.auroraFlutter,
    inPassband,
    freqOffsetHz,
    propagationOpen: voacap.circuitOpen,
    propagationReason: voacap.reason,
    reliabilityPct: voacap.reliabilityPct,
    mufMhz: voacap.mufMhz,
    fotMhz: voacap.fotMhz,
    lufMhz: voacap.lufMhz,
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
