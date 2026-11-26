import { BandId, QthLocation, SstvModeId } from '../types/radio';
import { getBandSpec, maidenheadFromLatLon } from './physics';

// ---------------------------------------------------------------------------
// 1. Country HR Division Prefixes & Call Sign Helpers (e.g. 26HR123 for UK)
// ---------------------------------------------------------------------------

export interface HrCountrySpec {
  code: string;
  name: string;
  division: string;
  defaultQth: QthLocation;
}

export const HR_COUNTRY_LIST: HrCountrySpec[] = [
  { code: 'GB', name: 'United Kingdom', division: '26', defaultQth: { lat: 51.5072, lon: -0.1276, grid: 'IO91' } },
  { code: 'ZA', name: 'South Africa', division: '44', defaultQth: { lat: -29.8587, lon: 31.0218, grid: 'KG43' } },
  { code: 'US', name: 'United States', division: '2', defaultQth: { lat: 40.7128, lon: -74.006, grid: 'FN30' } },
  { code: 'CA', name: 'Canada', division: '9', defaultQth: { lat: 45.4215, lon: -75.6972, grid: 'FN25' } },
  { code: 'DE', name: 'Germany', division: '13', defaultQth: { lat: 50.1109, lon: 8.6821, grid: 'JO40' } },
  { code: 'FR', name: 'France', division: '14', defaultQth: { lat: 48.8566, lon: 2.3522, grid: 'JN18' } },
  { code: 'IT', name: 'Italy', division: '1', defaultQth: { lat: 41.9028, lon: 12.4964, grid: 'JN61' } },
  { code: 'ES', name: 'Spain', division: '30', defaultQth: { lat: 40.4168, lon: -3.7038, grid: 'IN80' } },
  { code: 'PT', name: 'Portugal', division: '31', defaultQth: { lat: 38.7223, lon: -9.1393, grid: 'IM58' } },
  { code: 'NL', name: 'Netherlands', division: '19', defaultQth: { lat: 52.3676, lon: 4.9041, grid: 'JO22' } },
  { code: 'BE', name: 'Belgium', division: '16', defaultQth: { lat: 50.8503, lon: 4.3517, grid: 'JO20' } },
  { code: 'IE', name: 'Ireland', division: '29', defaultQth: { lat: 53.3498, lon: -6.2603, grid: 'IO63' } },
  { code: 'SE', name: 'Sweden', division: '21', defaultQth: { lat: 59.3293, lon: 18.0686, grid: 'JO99' } },
  { code: 'JP', name: 'Japan', division: '25', defaultQth: { lat: 35.6762, lon: 139.6503, grid: 'PM95' } },
  { code: 'AU', name: 'Australia', division: '43', defaultQth: { lat: -33.8688, lon: 151.2093, grid: 'QF56' } },
  { code: 'NZ', name: 'New Zealand', division: '41', defaultQth: { lat: -36.8485, lon: 174.7633, grid: 'RF73' } },
  { code: 'BR', name: 'Brazil', division: '3', defaultQth: { lat: -23.5505, lon: -46.6333, grid: 'GG66' } },
];

export function getHrCountrySpec(countryCode: string): HrCountrySpec {
  const upper = countryCode.trim().toUpperCase();
  return HR_COUNTRY_LIST.find((c) => c.code === upper) ?? HR_COUNTRY_LIST[0];
}

export function formatHrCallsign(countryCode: string, unitNumber: number): string {
  const spec = getHrCountrySpec(countryCode);
  const num = Math.max(1, Math.min(9999, Math.floor(unitNumber)));
  const suffix = num < 1000 ? String(num).padStart(3, '0') : String(num);
  return `${spec.division}HR${suffix}`;
}

export function detectCountryFromTimeZone(tz: string): string {
  const lower = tz.toLowerCase();
  if (lower.includes('london') || lower.includes('belfast') || lower.includes('jersey')) return 'GB';
  if (lower.includes('johannesburg') || lower.includes('africa/maseru')) return 'ZA';
  if (lower.includes('berlin') || lower.includes('busingen')) return 'DE';
  if (lower.includes('paris')) return 'FR';
  if (lower.includes('rome')) return 'IT';
  if (lower.includes('madrid')) return 'ES';
  if (lower.includes('lisbon')) return 'PT';
  if (lower.includes('amsterdam')) return 'NL';
  if (lower.includes('brussels')) return 'BE';
  if (lower.includes('dublin')) return 'IE';
  if (lower.includes('stockholm')) return 'SE';
  if (lower.includes('tokyo')) return 'JP';
  if (lower.includes('sydney') || lower.includes('melbourne') || lower.includes('perth')) return 'AU';
  if (lower.includes('auckland')) return 'NZ';
  if (lower.includes('sao_paulo')) return 'BR';
  if (lower.includes('toronto') || lower.includes('vancouver') || lower.includes('halifax')) return 'CA';
  if (lower.includes('america/new_york') || lower.includes('chicago') || lower.includes('los_angeles') || lower.includes('denver')) return 'US';
  return 'GB';
}

export function isValidHamCallsign(callsign: string): boolean {
  const cleaned = callsign.trim().toUpperCase();
  // Standard ITU amateur radio format: 1-2 prefix chars (incl digits), 1 digit, 1-4 suffix letters (+ optional /P, /M, /QRP)
  return /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,4}(\/[A-Z0-9]{1,4})?$/.test(cleaned) && !/^\d+HR\d+$/.test(cleaned);
}

// ---------------------------------------------------------------------------
// 2. RTTY Baudot FSK Codec, PCM Modulator & Goertzel DSP Demodulator
// ---------------------------------------------------------------------------

export const RTTY_MARK_HZ = 2125;
export const RTTY_SPACE_HZ = 2295;
export const RTTY_BAUD = 45.45;
export const RTTY_BIT_MS = 1000 / RTTY_BAUD; // ~22 ms
export const RTTY_FINE_STEP_HZ = 10;
export const RTTY_FINE_MIN_HZ = -500;
export const RTTY_FINE_MAX_HZ = 500;

export const DEFAULT_RTTY_CONFIG = {
  baudRate: 45.45 as 45.45 | 50 | 75,
  shiftHz: 170 as 170 | 425 | 850,
  markHz: 2125 as 1275 | 2125,
  fineOffsetHz: 0,
  reversePolarity: false,
  uos: true,
};

export type RttyCodecConfig = typeof DEFAULT_RTTY_CONFIG;

export function clampAndStepRttyFineOffset(offsetHz: number): number {
  if (!Number.isFinite(offsetHz)) return 0;
  const stepped = Math.round(offsetHz / RTTY_FINE_STEP_HZ) * RTTY_FINE_STEP_HZ;
  const clamped = Math.max(RTTY_FINE_MIN_HZ, Math.min(RTTY_FINE_MAX_HZ, stepped));
  return clamped === 0 ? 0 : clamped;
}

export function stepRttyFineOffset(currentOffsetHz: number, deltaSteps: number): number {
  const base = clampAndStepRttyFineOffset(currentOffsetHz);
  return clampAndStepRttyFineOffset(base + deltaSteps * RTTY_FINE_STEP_HZ);
}

export function findNearestRttySignalOffsetHz(
  stations: Array<{
    band: BandId;
    isTransmitting: boolean;
    mode: string;
    freqOffsetHz: number;
    propagationOpen: boolean;
  }>,
  activeBand: BandId
): number | null {
  const candidates = stations.filter(
    (s) =>
      s.band === activeBand &&
      s.isTransmitting &&
      s.propagationOpen &&
      Math.abs(s.freqOffsetHz) <= 1500
  );
  if (candidates.length === 0) return null;
  // Prefer RTTY stations first, then closest in frequency
  candidates.sort((a, b) => {
    const aRtty = a.mode === 'RTTY' ? 0 : 1;
    const bRtty = b.mode === 'RTTY' ? 0 : 1;
    if (aRtty !== bRtty) return aRtty - bRtty;
    return Math.abs(a.freqOffsetHz) - Math.abs(b.freqOffsetHz);
  });
  return Math.round(candidates[0].freqOffsetHz);
}

export function getRttyMarkSpaceFreqs(config: Partial<RttyCodecConfig> = {}): {
  markHz: number;
  spaceHz: number;
  centerHz: number;
  fineOffsetHz: number;
  baudRate: number;
  bitMs: number;
  reversePolarity: boolean;
  uos: boolean;
} {
  const baseMark = config.markHz ?? DEFAULT_RTTY_CONFIG.markHz;
  const shift = config.shiftHz ?? DEFAULT_RTTY_CONFIG.shiftHz;
  const baudRate = config.baudRate ?? DEFAULT_RTTY_CONFIG.baudRate;
  const reversePolarity = config.reversePolarity ?? false;
  const uos = config.uos ?? true;
  const rawOffset = Number.isFinite(config.fineOffsetHz) ? (config.fineOffsetHz as number) : 0;
  const fineOffsetHz = Math.max(RTTY_FINE_MIN_HZ, Math.min(RTTY_FINE_MAX_HZ, Math.round(rawOffset)));

  // Standard high-tones convention puts Space higher than Mark (2125 / 2295 Hz); REV swaps them
  const normalMark = Math.max(200, baseMark + fineOffsetHz);
  const normalSpace = Math.max(200 + shift, baseMark + shift + fineOffsetHz);
  const markHz = reversePolarity ? normalSpace : normalMark;
  const spaceHz = reversePolarity ? normalMark : normalSpace;
  const centerHz = Math.round((markHz + spaceHz) / 2);

  return {
    markHz,
    spaceHz,
    centerHz,
    fineOffsetHz: fineOffsetHz === 0 ? 0 : fineOffsetHz,
    baudRate,
    bitMs: 1000 / baudRate,
    reversePolarity,
    uos,
  };
}

export function getStandardRttyFrequency(bandId: BandId): number {
  const map: Record<BandId, number> = {
    '10m': 28_085_000,
    '12m': 24_922_000,
    '15m': 21_085_000,
    '17m': 18_104_000,
    '20m': 14_085_000,
    '30m': 10_142_000,
    '40m': 7_045_000,
    '60m': 5_366_500,
    '80m': 3_585_000,
    '160m': 1_838_000,
  };
  return map[bandId] ?? getBandSpec(bandId).defaultHz;
}

const ITA2_LTRS_SHIFT = 0b11111; // 31
const ITA2_FIGS_SHIFT = 0b11011; // 27

const LTRS_TO_CODE: Record<string, number> = {
  E: 0b00001, '\n': 0b00010, A: 0b00011, ' ': 0b00100, S: 0b00101, I: 0b00110, U: 0b00111,
  '\r': 0b01000, D: 0b01001, R: 0b01010, J: 0b01011, N: 0b01100, F: 0b01101, C: 0b01110, K: 0b01111,
  T: 0b10000, Z: 0b10001, L: 0b10010, W: 0b10011, H: 0b10100, Y: 0b10101, P: 0b10110, Q: 0b10111,
  O: 0b11000, B: 0b11001, G: 0b11010, M: 0b11100, X: 0b11101, V: 0b11110,
};

const FIGS_TO_CODE: Record<string, number> = {
  '3': 0b00001, '\n': 0b00010, '-': 0b00011, ' ': 0b00100, "'": 0b00101, '8': 0b00110, '7': 0b00111,
  '\r': 0b01000, '4': 0b01010, ',': 0b01100, '!': 0b01101, ':': 0b01110, '(': 0b01111,
  '5': 0b10000, '+': 0b10001, ')': 0b10010, '2': 0b10011, '6': 0b10101, '0': 0b10110, '1': 0b10111,
  '9': 0b11000, '?': 0b11001, '&': 0b11010, '.': 0b11100, '/': 0b11101, '=': 0b11110,
};

const CODE_TO_LTRS: Record<number, string> = {};
const CODE_TO_FIGS: Record<number, string> = {};
for (const [ch, code] of Object.entries(LTRS_TO_CODE)) CODE_TO_LTRS[code] = ch;
for (const [ch, code] of Object.entries(FIGS_TO_CODE)) CODE_TO_FIGS[code] = ch;

export function sanitizeRttyText(text: string, maxLen = 160): string {
  return text.toUpperCase().replace(/[^A-Z0-9 .,/+\-?!:=()'\n\r]/g, '').slice(0, maxLen);
}

/**
 * Encodes text into ITA2 5-bit Baudot characters (automatically emitting LTRS/FIGS shift words).
 */
export function encodeBaudotChars(text: string, uos = false): number[] {
  const clean = sanitizeRttyText(text);
  const words: number[] = [ITA2_LTRS_SHIFT];
  let shift: 'LTRS' | 'FIGS' = 'LTRS';

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === ' ') {
      words.push(0b00100);
      if (uos) shift = 'LTRS';
      continue;
    }
    if (ch in LTRS_TO_CODE) {
      if (shift !== 'LTRS') {
        words.push(ITA2_LTRS_SHIFT);
        shift = 'LTRS';
      }
      words.push(LTRS_TO_CODE[ch]);
    } else if (ch in FIGS_TO_CODE) {
      if (shift !== 'FIGS') {
        words.push(ITA2_FIGS_SHIFT);
        shift = 'FIGS';
      }
      words.push(FIGS_TO_CODE[ch]);
    }
  }
  return words;
}

export function decodeBaudotChars(words: number[], uos = false): string {
  let shift: 'LTRS' | 'FIGS' = 'LTRS';
  let out = '';
  for (const w of words) {
    const code = w & 0b11111;
    if (code === ITA2_LTRS_SHIFT) {
      shift = 'LTRS';
      continue;
    }
    if (code === ITA2_FIGS_SHIFT) {
      shift = 'FIGS';
      continue;
    }
    if (code === 0b00100) {
      out += ' ';
      if (uos) shift = 'LTRS';
      continue;
    }
    const ch = shift === 'LTRS' ? CODE_TO_LTRS[code] : CODE_TO_FIGS[code];
    if (ch) out += ch;
  }
  return out;
}

export interface RttyToneSegment {
  freqHz: number;
  durationMs: number;
  isMark: boolean;
}

/**
 * Generates exact FSK Mark/Space tone timeline (start bit + 5 LSB-first data bits + 1.5 stop bits).
 */
export function rttyMarkSpaceTimeline(
  text: string,
  config: Partial<RttyCodecConfig> = {}
): RttyToneSegment[] {
  const { markHz, spaceHz, bitMs, uos } = getRttyMarkSpaceFreqs(config);
  const words = encodeBaudotChars(text, uos);
  const segments: RttyToneSegment[] = [
    // Brief carrier mark preamble (diddle idle)
    { freqHz: markHz, durationMs: 110, isMark: true },
  ];

  for (const word of words) {
    // Start bit (Space = 0)
    segments.push({ freqHz: spaceHz, durationMs: bitMs, isMark: false });
    // 5 data bits LSB-first
    for (let b = 0; b < 5; b++) {
      const bit = (word >> b) & 1;
      segments.push({
        freqHz: bit === 1 ? markHz : spaceHz,
        durationMs: bitMs,
        isMark: bit === 1,
      });
    }
    // 1.5 stop bits (Mark = 1)
    segments.push({ freqHz: markHz, durationMs: bitMs * 1.5, isMark: true });
  }
  segments.push({ freqHz: markHz, durationMs: 65, isMark: true });
  return segments;
}

export function rttyDurationMs(text: string, config: Partial<RttyCodecConfig> = {}): number {
  const segs = rttyMarkSpaceTimeline(text, config);
  let total = 0;
  for (const s of segs) total += s.durationMs;
  return Math.round(total);
}

/**
 * Synthesizes phase-continuous FSK PCM audio for RTTY transmission or DSP loopback testing.
 */
export function synthesizeRttyAudioPcm(
  text: string,
  sampleRate = 16000,
  config: Partial<RttyCodecConfig> = {}
): Float32Array {
  const segs = rttyMarkSpaceTimeline(text, config);
  const totalSamples = segs.reduce((acc, s) => acc + Math.max(1, Math.round((s.durationMs / 1000) * sampleRate)), 0);
  const out = new Float32Array(totalSamples);

  let phase = 0;
  let offset = 0;
  for (const seg of segs) {
    const count = Math.max(1, Math.round((seg.durationMs / 1000) * sampleRate));
    const phaseInc = (2 * Math.PI * seg.freqHz) / sampleRate;
    for (let i = 0; i < count && offset < out.length; i++) {
      out[offset++] = Math.sin(phase) * 0.72;
      phase += phaseInc;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
  }
  return out;
}

function goertzelPower(samples: Float32Array, start: number, len: number, targetHz: number, sampleRate: number): number {
  const omega = (2 * Math.PI * targetHz) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q1 = 0;
  let q2 = 0;
  const end = Math.min(samples.length, start + len);
  for (let i = start; i < end; i++) {
    const q0 = coeff * q1 - q2 + samples[i];
    q2 = q1;
    q1 = q0;
  }
  return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
}

/**
 * Real Goertzel dual-tone FSK DSP demodulator: recovers ITA2 Baudot characters from audio PCM.
 */
export function demodulateRttyPcm(
  samples: Float32Array,
  sampleRate = 16000,
  config: Partial<RttyCodecConfig> = {}
): { text: string; words: number[]; markSnrRatio: number } {
  const { markHz, spaceHz, baudRate, uos } = getRttyMarkSpaceFreqs(config);
  const bitSamples = sampleRate / baudRate;
  const winLen = Math.max(48, Math.round(bitSamples * 0.45));

  const decisionAt = (centerIdx: number): { isMark: boolean; markPwr: number; spacePwr: number } => {
    const start = Math.max(0, Math.round(centerIdx - winLen / 2));
    const markPwr = goertzelPower(samples, start, winLen, markHz, sampleRate);
    const spacePwr = goertzelPower(samples, start, winLen, spaceHz, sampleRate);
    return { isMark: markPwr >= spacePwr, markPwr, spacePwr };
  };

  const words: number[] = [];
  const scanStep = Math.max(6, Math.round(bitSamples / 18));
  let idx = Math.round(winLen / 2);
  let prevMark = true;
  let totalRatio = 0;
  let ratioCount = 0;

  while (idx + Math.round(bitSamples * 7.2) < samples.length) {
    const d = decisionAt(idx);
    if (prevMark && !d.isMark) {
      // Refine falling edge locally to within +/- scanStep
      let edge = idx;
      while (edge > winLen / 2 && !decisionAt(edge - 4).isMark) {
        edge -= 4;
      }
      // Verify start bit center is Space
      const startCenter = edge + bitSamples * 0.5;
      const startDec = decisionAt(startCenter);
      if (!startDec.isMark) {
        let word = 0;
        for (let b = 0; b < 5; b++) {
          const bitCenter = edge + bitSamples * (1.5 + b);
          const bitDec = decisionAt(bitCenter);
          if (bitDec.isMark) word |= 1 << b;
          const hi = Math.max(bitDec.markPwr, bitDec.spacePwr);
          const lo = Math.max(1e-6, Math.min(bitDec.markPwr, bitDec.spacePwr));
          totalRatio += hi / lo;
          ratioCount += 1;
        }
        const stopCenter = edge + bitSamples * 6.75;
        const stopDec = decisionAt(stopCenter);
        if (stopDec.isMark) {
          words.push(word);
          // Jump to mid-stop-bit so next falling edge triggers cleanly
          idx = Math.round(edge + bitSamples * 6.8);
          prevMark = true;
          continue;
        }
      }
    }
    prevMark = d.isMark;
    idx += scanStep;
  }

  return {
    text: decodeBaudotChars(words, uos),
    words,
    markSnrRatio: ratioCount > 0 ? Number((totalRatio / ratioCount).toFixed(1)) : 1,
  };
}

// ---------------------------------------------------------------------------
// 3. FT8 / Digital 8-GFSK Encoder & Parser (6.25 Hz tone spacing, 15s slots)
// ---------------------------------------------------------------------------

export function sanitizeFt8Message(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9 /+\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28);
}

export function formatFt8Cq(callsign: string, grid: string): string {
  return `CQ ${callsign.toUpperCase()} ${grid.toUpperCase().slice(0, 4)}`;
}

export function formatFt8Reply(dxCall: string, myCall: string, myGridOrReport: string): string {
  return `${dxCall.toUpperCase()} ${myCall.toUpperCase()} ${myGridOrReport.toUpperCase()}`.slice(0, 28);
}

export function parseFt8Message(message: string): {
  isCq: boolean;
  toCall: string;
  fromCall: string;
  extra: string;
} {
  const parts = sanitizeFt8Message(message).split(' ').filter(Boolean);
  if (parts[0] === 'CQ') {
    const isDirected = parts.length >= 4;
    return {
      isCq: true,
      toCall: isDirected ? `${parts[0]} ${parts[1]}` : 'CQ',
      fromCall: isDirected ? parts[2] : parts[1] ?? '',
      extra: isDirected ? parts[3] : parts[2] ?? '',
    };
  }
  return {
    isCq: false,
    toCall: parts[0] ?? '',
    fromCall: parts[1] ?? '',
    extra: parts.slice(2).join(' '),
  };
}

export function canAutoReplyFt8Row(
  row: { direction: 'RX' | 'TX'; isCq: boolean; callsign: string },
  myCallsign: string
): boolean {
  const dx = row.callsign.trim().toUpperCase();
  const mine = myCallsign.trim().toUpperCase();
  return row.direction === 'RX' && row.isCq && Boolean(dx) && dx !== mine;
}

export function buildFt8AutoReplyPayload(
  row: { callsign: string; audioFreqHz: number },
  myCallsign: string,
  myGrid: string,
  fallbackAudioFreqHz = 1250
): { dxCall: string; message: string; audioFreqHz: number } {
  const dxCall = row.callsign.trim().toUpperCase();
  const grid4 = myGrid.trim().toUpperCase().slice(0, 4) || 'IO91';
  const audioFreqHz =
    Number.isFinite(row.audioFreqHz) && row.audioFreqHz >= 200 && row.audioFreqHz <= 3000
      ? Math.round(row.audioFreqHz)
      : fallbackAudioFreqHz;
  return {
    dxCall,
    message: formatFt8Reply(dxCall, myCallsign, grid4),
    audioFreqHz,
  };
}

export function formatFt8SnrReport(snrDb: number): string {
  const clamped = Math.max(-24, Math.min(24, Math.round(snrDb)));
  const absStr = String(Math.abs(clamped)).padStart(2, '0');
  return clamped >= 0 ? `+${absStr}` : `-${absStr}`;
}

export function resolveFt8ReportTarget(params: {
  ft8DxCall: string;
  ft8Message: string;
  ft8Log: Array<{ direction: 'RX' | 'TX'; callsign: string; snrDb: number; audioFreqHz: number; message?: string }>;
  myCallsign: string;
  fallbackAudioFreqHz?: number;
  activeStations?: Array<{
    callsign: string;
    snrDb: number;
    inPassband?: boolean;
    propagationOpen?: boolean;
  }>;
}): { dxCall: string; report: string; message: string; audioFreqHz: number } | null {
  const mine = params.myCallsign.trim().toUpperCase();
  let dxCall = params.ft8DxCall.trim().toUpperCase();

  if (!dxCall || dxCall === mine) {
    const parsed = parseFt8Message(params.ft8Message);
    if (parsed.toCall && parsed.toCall !== 'CQ' && !parsed.toCall.startsWith('CQ ') && parsed.toCall !== mine) {
      dxCall = parsed.toCall;
    } else if (parsed.fromCall && parsed.fromCall !== 'CQ' && parsed.fromCall !== mine) {
      dxCall = parsed.fromCall;
    }
  }

  const matchingRow = dxCall
    ? params.ft8Log.find((r) => r.direction === 'RX' && r.callsign.trim().toUpperCase() === dxCall)
    : undefined;
  const fallbackRow = params.ft8Log.find(
    (r) => r.direction === 'RX' && r.callsign.trim().toUpperCase() && r.callsign.trim().toUpperCase() !== mine
  );

  if (!dxCall && fallbackRow) {
    dxCall = fallbackRow.callsign.trim().toUpperCase();
  }

  if (!dxCall) {
    const txReplyRow = params.ft8Log.find((r) => {
      if (r.direction !== 'TX' || !r.message) return false;
      const p = parseFt8Message(r.message);
      return Boolean(p.toCall && p.toCall !== 'CQ' && !p.toCall.startsWith('CQ ') && p.toCall !== mine);
    });
    if (txReplyRow?.message) {
      dxCall = parseFt8Message(txReplyRow.message).toCall.toUpperCase();
    }
  }

  const matchingStation = params.activeStations?.find(
    (s) => s.callsign.trim().toUpperCase() === dxCall && dxCall !== ''
  );
  const bestStation =
    params.activeStations?.find(
      (s) => s.callsign.trim().toUpperCase() !== mine && s.inPassband && s.propagationOpen !== false
    ) ??
    params.activeStations?.find(
      (s) => s.callsign.trim().toUpperCase() !== mine && s.propagationOpen !== false
    ) ??
    params.activeStations?.find((s) => s.callsign.trim().toUpperCase() && s.callsign.trim().toUpperCase() !== mine);

  if (!dxCall && bestStation) {
    dxCall = bestStation.callsign.trim().toUpperCase();
  }
  if (!dxCall) return null;

  const refRow = matchingRow ?? (fallbackRow?.callsign.trim().toUpperCase() === dxCall ? fallbackRow : undefined);
  const stationForReport = matchingStation ?? (bestStation?.callsign.trim().toUpperCase() === dxCall ? bestStation : undefined);
  const report = refRow
    ? formatFt8SnrReport(refRow.snrDb)
    : stationForReport
    ? formatFt8SnrReport(stationForReport.snrDb)
    : '-07';
  const audioFreqHz =
    refRow && Number.isFinite(refRow.audioFreqHz) && refRow.audioFreqHz >= 200 && refRow.audioFreqHz <= 3000
      ? Math.round(refRow.audioFreqHz)
      : params.fallbackAudioFreqHz ?? 1250;

  return {
    dxCall,
    report,
    message: formatFt8Reply(dxCall, mine, report),
    audioFreqHz,
  };
}

const COSTAS_ARRAY = [3, 1, 4, 0, 6, 5, 2];

/**
 * Generates a realistic 79-symbol FT8 8-FSK tone index stream (values 0..7) with Costas sync arrays
 * at symbols 0..6, 36..42, 72..78.
 */
export function encodeFt8Tones(message: string): number[] {
  const clean = sanitizeFt8Message(message);
  const tones = new Array<number>(79).fill(0);

  // Place Costas 7x7 sync arrays
  for (let i = 0; i < 7; i++) {
    tones[i] = COSTAS_ARRAY[i];
    tones[36 + i] = COSTAS_ARRAY[i];
    tones[72 + i] = COSTAS_ARRAY[i];
  }

  // Deterministic pseudo-LDPC payload mapping into the 58 data symbols (7..35 and 43..71)
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const dataIndices: number[] = [];
  for (let i = 7; i <= 35; i++) dataIndices.push(i);
  for (let i = 43; i <= 71; i++) dataIndices.push(i);

  for (let k = 0; k < dataIndices.length; k++) {
    const ch = clean.charCodeAt(k % Math.max(1, clean.length)) || 32;
    const mixed = (hash ^ (ch * (k + 13)) ^ (k * 97)) >>> 0;
    tones[dataIndices[k]] = mixed % 8;
  }

  return tones;
}

export function getFt8SlotInfo(nowMs = Date.now()): {
  slotIndex: number;
  isEvenSlot: boolean;
  elapsedSec: number;
  remainingSec: number;
  utcTimeStr: string;
} {
  const d = new Date(nowMs);
  const secInMin = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  const slotIndex = Math.floor(secInMin / 15) % 4;
  const elapsedSec = secInMin % 15;
  const remainingSec = Math.max(0, 15 - elapsedSec);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(Math.floor(d.getUTCSeconds() / 15) * 15).padStart(2, '0');
  return {
    slotIndex,
    isEvenSlot: slotIndex % 2 === 0,
    elapsedSec: Number(elapsedSec.toFixed(1)),
    remainingSec: Number(remainingSec.toFixed(1)),
    utcTimeStr: `${hh}${mm}${ss}`,
  };
}

// Recommended standard FT8 sub-band frequencies
export function getStandardFt8Frequency(bandId: BandId): number {
  const map: Record<BandId, number> = {
    '10m': 28_074_000,
    '12m': 24_915_000,
    '15m': 21_074_000,
    '17m': 18_100_000,
    '20m': 14_074_000,
    '30m': 10_136_000,
    '40m': 7_074_000,
    '60m': 5_357_000,
    '80m': 3_573_000,
    '160m': 1_840_000,
  };
  return map[bandId] ?? getBandSpec(bandId).defaultHz;
}

// ---------------------------------------------------------------------------
// 4. SSTV Scanline Pixel Codec (128 x 96 RGB + VIS + 1200/1500-2300 Hz FM Audio)
// ---------------------------------------------------------------------------

export const SSTV_WIDTH = 128;
export const SSTV_HEIGHT = 96;

export interface SstvModeSpec {
  id: SstvModeId;
  visCode: number;
  txSweepMs: number;
  channelOrder: 'RGB' | 'GBR';
  description: string;
}

export const SSTV_MODE_SPECS: Record<SstvModeId, SstvModeSpec> = {
  'Robot 36': {
    id: 'Robot 36',
    visCode: 8,
    txSweepMs: 2600,
    channelOrder: 'RGB',
    description: 'Fast HF DX color standard (VIS 08)',
  },
  'Martin M1': {
    id: 'Martin M1',
    visCode: 44,
    txSweepMs: 3600,
    channelOrder: 'GBR',
    description: 'European crisp RGB scan standard (VIS 44)',
  },
  'Scottie S1': {
    id: 'Scottie S1',
    visCode: 60,
    txSweepMs: 3800,
    channelOrder: 'GBR',
    description: 'North American high-contrast RGB (VIS 60)',
  },
  'PD 50': {
    id: 'PD 50',
    visCode: 93,
    txSweepMs: 3200,
    channelOrder: 'RGB',
    description: 'Wide-dynamic-range dual-line PD mode (VIS 93)',
  },
};

export function getStandardSstvFrequency(bandId: BandId): number {
  const map: Record<BandId, number> = {
    '10m': 28_680_000,
    '12m': 24_975_000,
    '15m': 21_340_000,
    '17m': 18_160_000,
    '20m': 14_230_000,
    '30m': 10_132_000,
    '40m': 7_171_000,
    '60m': 5_371_500,
    '80m': 3_845_000,
    '160m': 1_900_000,
  };
  return map[bandId] ?? getBandSpec(bandId).defaultHz;
}

export function luminanceToSstvFreqHz(val0to255: number): number {
  const clamped = Math.max(0, Math.min(255, val0to255));
  return Math.round(1500 + (clamped / 255) * 800); // 1500 Hz black -> 2300 Hz white
}

export function sstvFreqHzToLuminance(freqHz: number): number {
  const norm = Math.max(0, Math.min(1, (freqHz - 1500) / 800));
  return Math.round(norm * 255);
}

/**
 * Generates an RGB Uint8Array (width * height * 3) SSTV test card with QSL themes.
 */
export function generateSstvTestPattern(
  style: 'bars' | 'cq' | 'grid' | 'horizon',
  width = SSTV_WIDTH,
  height = SSTV_HEIGHT
): Uint8Array {
  const buf = new Uint8Array(width * height * 3);
  const barColors: Array<[number, number, number]> = [
    [225, 225, 225],
    [235, 210, 45],
    [45, 215, 225],
    [55, 215, 85],
    [215, 65, 215],
    [225, 55, 55],
    [45, 95, 235],
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      let r = 12;
      let g = 24;
      let b = 40;

      if (style === 'bars') {
        if (y < height * 0.65) {
          const barIdx = Math.min(barColors.length - 1, Math.floor((x / width) * barColors.length));
          [r, g, b] = barColors[barIdx];
        } else {
          const ramp = Math.round((x / Math.max(1, width - 1)) * 255);
          r = ramp;
          g = Math.round(ramp * 0.85);
          b = 255 - Math.round(ramp * 0.35);
        }
      } else if (style === 'cq') {
        const border = x < 3 || x >= width - 3 || y < 3 || y >= height - 3;
        if (border) {
          [r, g, b] = [56, 189, 248];
        } else if (y < Math.round(height * 0.24)) {
          [r, g, b] = [14, 116, 144];
        } else if (y > Math.round(height * 0.78)) {
          [r, g, b] = [217, 119, 6];
        } else {
          const dx = x - width / 2;
          const dy = y - height / 2;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < Math.min(width, height) * 0.2) {
            [r, g, b] = [16, 185, 129];
          } else {
            [r, g, b] = [15, 28, 46];
          }
        }
      } else if (style === 'horizon') {
        // Golden DX sunset over dark ocean + radio ionosphere arcs
        const horizonY = Math.round(height * 0.58);
        const dx = x - width / 2;
        const dy = y - horizonY;
        const sunDist = Math.sqrt(dx * dx + dy * dy);
        if (y < horizonY) {
          if (sunDist < height * 0.22) {
            [r, g, b] = [251, 191, 36];
          } else {
            const t = y / horizonY;
            r = Math.round(14 + t * 180);
            g = Math.round(28 + t * 65);
            b = Math.round(85 - t * 40);
          }
        } else {
          const shimmer = Math.abs(dx) < Math.max(4, (height - y) * 0.45) && (y + x) % 3 === 0;
          [r, g, b] = shimmer ? [245, 158, 11] : [10, 32, 62];
        }
      } else {
        // Azimuth test reticle
        const dx = x - width / 2;
        const dy = y - height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const onCircle = Math.abs(dist - Math.min(width, height) * 0.34) < 1.3 || Math.abs(dist - Math.min(width, height) * 0.17) < 1.1;
        const onCross = Math.abs(dx) < 1 || Math.abs(dy) < 1;
        if (onCircle) {
          [r, g, b] = [56, 189, 248];
        } else if (onCross) {
          [r, g, b] = [245, 158, 11];
        } else {
          [r, g, b] = [10, 22, 36];
        }
      }

      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
    }
  }
  return buf;
}

/**
 * Synthesizes authentic SSTV audio (1900/1200 Hz VIS header + 1200 Hz line sync + 1500..2300 Hz RGB scanlines).
 */
export function synthesizeSstvAudioPcm(
  rgb: Uint8Array,
  width = SSTV_WIDTH,
  height = SSTV_HEIGHT,
  sstvMode: SstvModeId = 'Robot 36',
  sampleRate = 24000,
  samplesPerPixel = 5
): Float32Array {
  const spec = SSTV_MODE_SPECS[sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];
  const visBitSamples = Math.round(sampleRate * 0.014); // 14ms per VIS bit
  const leaderSamples = Math.round(sampleRate * 0.075);
  const breakSamples = Math.round(sampleRate * 0.012);
  const syncSamples = Math.round(sampleRate * 0.0025); // 60 samples at 24 kHz
  const porchSamples = Math.round(sampleRate * 0.0005); // 12 samples
  const visSamples = leaderSamples * 2 + breakSamples + visBitSamples * 10 + syncSamples; // includes 1500 Hz post-VIS gap

  const lineSamples = syncSamples + porchSamples + width * 3 * samplesPerPixel;
  const totalSamples = visSamples + height * lineSamples;

  const out = new Float32Array(totalSamples);
  let phase = 0;
  let cursor = 0;

  const emitTone = (freqHz: number, count: number) => {
    const inc = (2 * Math.PI * freqHz) / sampleRate;
    for (let i = 0; i < count && cursor < out.length; i++) {
      phase += inc;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
      out[cursor++] = Math.sin(phase) * 0.68;
    }
  };

  // Calibration Leader + VIS Code
  emitTone(1900, leaderSamples);
  emitTone(1200, breakSamples);
  emitTone(1900, leaderSamples);
  emitTone(1200, visBitSamples); // VIS start bit
  let parity = 0;
  for (let b = 0; b < 7; b++) {
    const bit = (spec.visCode >> b) & 1;
    parity ^= bit;
    emitTone(bit === 1 ? 1100 : 1300, visBitSamples);
  }
  emitTone(parity === 1 ? 1100 : 1300, visBitSamples);
  emitTone(1200, visBitSamples); // VIS stop bit
  emitTone(1500, syncSamples); // Post-VIS porch separating VIS stop from Line 0 sync

  // RGB Scanlines
  const order = spec.channelOrder === 'GBR' ? [1, 2, 0] : [0, 1, 2];
  for (let y = 0; y < height; y++) {
    emitTone(1200, syncSamples);
    emitTone(1500, porchSamples);
    for (const ch of order) {
      for (let x = 0; x < width; x++) {
        const val = rgb[(y * width + x) * 3 + ch] ?? 0;
        emitTone(luminanceToSstvFreqHz(val), samplesPerPixel);
      }
    }
  }

  return out;
}

/**
 * Estimates instantaneous sinusoid frequency in Hz over [start, start + len) using the exact 3-tap cosine identity.
 */
function estimateToneFreqHz(samples: Float32Array, start: number, len: number, sampleRate: number): number {
  let num = 0;
  let den = 0;
  const from = Math.max(1, start);
  const to = Math.min(samples.length - 1, start + len);
  for (let n = from; n < to; n++) {
    const x = samples[n];
    num += (samples[n + 1] + samples[n - 1]) * x;
    den += 2 * x * x;
  }
  if (den < 1e-7) return 1500;
  const cosW = Math.max(-1, Math.min(1, num / den));
  const w = Math.acos(cosW);
  return (w / (2 * Math.PI)) * sampleRate;
}

/**
 * Real SSTV FM Audio Scanline Demodulator: locates VIS stop & 1200 Hz horizontal sync pulses
 * and reconstructs RGB image pixels from 1500..2300 Hz audio tones.
 */
export function demodulateSstvAudioToRgb(
  samples: Float32Array,
  width = SSTV_WIDTH,
  height = SSTV_HEIGHT,
  sstvMode: SstvModeId = 'Robot 36',
  sampleRate = 24000,
  samplesPerPixel = 5
): { rgb: Uint8Array; syncLockCount: number; visDetected: boolean } {
  const spec = SSTV_MODE_SPECS[sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];
  const rgb = new Uint8Array(width * height * 3);
  const syncSamples = Math.round(sampleRate * 0.0025);
  const porchSamples = Math.round(sampleRate * 0.0005);
  const lineSamples = syncSamples + porchSamples + width * 3 * samplesPerPixel;

  const visBitSamples = Math.round(sampleRate * 0.014);
  const leaderSamples = Math.round(sampleRate * 0.075);
  const breakSamples = Math.round(sampleRate * 0.012);
  const expectedVisEnd = leaderSamples * 2 + breakSamples + visBitSamples * 10 + syncSamples;

  // Verify VIS calibration tone around start of buffer
  const leaderFreq = estimateToneFreqHz(samples, Math.round(leaderSamples * 0.2), Math.round(leaderSamples * 0.6), sampleRate);
  const visDetected = leaderFreq > 1750 && leaderFreq < 2050;

  // Locate first horizontal 1200 Hz sync falling edge around expectedVisEnd
  const findSyncEdgeNear = (approxIdx: number, radius: number): number => {
    const lo = Math.max(8, approxIdx - radius);
    const hi = Math.min(samples.length - syncSamples, approxIdx + radius);
    for (let p = lo; p <= hi; p++) {
      const preFreq = estimateToneFreqHz(samples, p - 6, 4, sampleRate);
      const edgeFreq = estimateToneFreqHz(samples, p, 4, sampleRate);
      const postFreq = estimateToneFreqHz(samples, p + 1, 8, sampleRate);
      if (preFreq >= 1450 && edgeFreq <= 1280 && postFreq <= 1220) {
        return p;
      }
    }
    return approxIdx;
  };

  let lineStart = findSyncEdgeNear(expectedVisEnd, 20);

  const order = spec.channelOrder === 'GBR' ? [1, 2, 0] : [0, 1, 2];
  let syncLockCount = 0;

  for (let y = 0; y < height; y++) {
    if (lineStart + syncSamples + porchSamples >= samples.length) break;

    const syncFreq = estimateToneFreqHz(samples, lineStart + 6, Math.max(8, syncSamples - 12), sampleRate);
    if (syncFreq >= 1050 && syncFreq <= 1350) {
      syncLockCount += 1;
    }

    let pixCursor = lineStart + syncSamples + porchSamples;
    for (const ch of order) {
      for (let x = 0; x < width; x++) {
        // Measure strictly centered interior samples so +/-1 sample sync jitter never bleeds into neighbors
        const innerStart = samplesPerPixel >= 5 ? pixCursor + 2 : pixCursor + 1;
        const innerLen = Math.max(2, samplesPerPixel - 3);
        const freq = estimateToneFreqHz(samples, innerStart, innerLen, sampleRate);
        rgb[(y * width + x) * 3 + ch] = sstvFreqHzToLuminance(freq);
        pixCursor += samplesPerPixel;
      }
    }

    // Track next horizontal sync pulse with PLL edge lock
    lineStart = findSyncEdgeNear(lineStart + lineSamples, 12);
  }

  return { rgb, syncLockCount, visDetected };
}

export function encodeRgbToBase64(rgb: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < rgb.byteLength; i++) {
    binary += String.fromCharCode(rgb[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(rgb).toString('base64');
}

export function decodeBase64ToRgb(b64: string, expectedLen: number): Uint8Array {
  let bytes: Uint8Array;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  if (bytes.length === expectedLen) return bytes;
  const out = new Uint8Array(expectedLen);
  out.set(bytes.subarray(0, expectedLen));
  return out;
}

export function estimateCountryAndQth(): { countryCode: string; qth: QthLocation } {
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
  const code = detectCountryFromTimeZone(tz || '');
  const spec = getHrCountrySpec(code);
  return {
    countryCode: spec.code,
    qth: {
      lat: spec.defaultQth.lat,
      lon: spec.defaultQth.lon,
      grid: spec.defaultQth.grid || maidenheadFromLatLon(spec.defaultQth.lat, spec.defaultQth.lon),
    },
  };
}

export interface TxToneProfile {
  hasTone: boolean;
  modeLabel: 'CW' | 'RTTY' | 'SSTV' | 'FT8' | 'NONE';
  baseFreqHz: number;
  secondaryFreqHz?: number;
}

export function getTxToneProfile(
  mode: string,
  rttyConfig: Partial<RttyCodecConfig> = {},
  ft8BaseFreqHz = 1250
): TxToneProfile {
  if (mode === 'CW') {
    return { hasTone: true, modeLabel: 'CW', baseFreqHz: 720 };
  }
  if (mode === 'RTTY') {
    const { markHz, spaceHz } = getRttyMarkSpaceFreqs(rttyConfig);
    return { hasTone: true, modeLabel: 'RTTY', baseFreqHz: markHz, secondaryFreqHz: spaceHz };
  }
  if (mode === 'SSTV') {
    return { hasTone: true, modeLabel: 'SSTV', baseFreqHz: 1900, secondaryFreqHz: 1200 };
  }
  if (mode === 'FT8') {
    return { hasTone: true, modeLabel: 'FT8', baseFreqHz: ft8BaseFreqHz, secondaryFreqHz: ft8BaseFreqHz + 43.75 };
  }
  return { hasTone: false, modeLabel: 'NONE', baseFreqHz: 0 };
}
