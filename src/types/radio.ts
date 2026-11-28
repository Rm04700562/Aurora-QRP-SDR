export type BandId =
  | '10m'
  | '12m'
  | '15m'
  | '17m'
  | '20m'
  | '30m'
  | '40m'
  | '60m'
  | '80m'
  | '160m';

export type RadioMode =
  | 'LSB'
  | 'USB'
  | 'CW'
  | 'AM'
  | 'FM'
  | 'RTTY'
  | 'SSTV'
  | 'FT8'
  | 'DIGITAL';

export type WorkspaceModuleTab =
  | 'waterfall'
  | 'cw'
  | 'rtty'
  | 'jtty'
  | 'sstv'
  | 'ft8'
  | 'cluster'
  | 'propmap';

export type AntennaId =
  | 'yagi5'
  | 'quad5'
  | 'steppir3'
  | 'dx10m'
  | 'dx12m'
  | 'dx15m'
  | 'dx17m'
  | 'dx20m'
  | 'dx30m'
  | 'dx40m'
  | 'dx60m'
  | 'dx80m'
  | 'dx160m'
  | 'dipole'
  | 'vertical'
  | 'efhw'
  | 'magloop';

export type StepSizeHz = 1 | 10 | 100 | 1000 | 5000;
export type TuneSpeed = 'Fine' | 'Fast' | 'Memory';

export interface BandSpec {
  id: BandId;
  label: string;
  minHz: number;
  maxHz: number;
  defaultHz: number;
  rangeLabel: string;
  centerMhz: number;
}

export interface AntennaSpec {
  id: AntennaId;
  name: string;
  shortName: string;
  isDirectional: boolean;
  isRotatable: boolean;
  isBidirectional?: boolean;
  forwardGainDbi: number;
  frontToBackDb: number;
  beamwidthDeg: number;
  resonantBands: BandId[];
  noiseRejectionDb: number;
  bandwidthPct: number; // Fractional 2:1 SWR bandwidth around band center
  takeoffProfile: 'low-angle' | 'balanced' | 'high-angle';
  description: string;
}

export interface PropagationConditions {
  sfi: number; // Solar Flux Index: 65 - 250
  kIndex: number; // Geomagnetic K-Index: 0 - 9
  aIndex: number; // Geomagnetic A-Index: 0 - 400
  auroraActive: boolean;
  sporadicE: boolean;
  greylineBoost: boolean;
  utcHour: number; // 0 - 23.99
  presetName: string;
  lastUpdatedUtc?: string;
  nextUpdateUtc?: string;
  sourceLabel?: string;
  timestampMs?: number;
}

export interface QthLocation {
  lat: number;
  lon: number;
  grid: string;
}

export interface RemoteStation {
  id: string;
  callsign: string;
  serverId: string;
  groupId: string;
  band: BandId;
  frequencyHz: number;
  mode: RadioMode;
  powerW: number;
  antennaId: AntennaId;
  rotorHeadingDeg: number;
  qth: QthLocation;
  isTransmitting: boolean;
  cwText?: string;
  isBeacon?: boolean;
  lastActiveAt: number;
  countryCode?: string;
  operatorType?: 'HAM' | 'HR';
}

export interface SignalEvaluation {
  stationId: string;
  distanceKm: number;
  bearingToTxDeg: number;
  rxAntennaGainDb: number;
  txAntennaGainDb: number;
  pathLossDb: number;
  rxPowerDbm: number;
  noiseFloorDbm: number;
  snrDb: number;
  sMeterText: string;
  sMeterNormalized: number; // 0..1
  auroraFlutter: number; // 0..1
  inPassband: boolean;
  freqOffsetHz: number;
  propagationOpen: boolean;
  propagationReason: string;
  reliabilityPct: number;
  mufMhz: number;
  fotMhz: number;
  lufMhz: number;
}

export interface QsoEntry {
  id: string;
  timestampUtc: string;
  callsign: string;
  band: BandId;
  frequencyHz: number;
  mode: RadioMode;
  rstSent: string;
  rstRcvd: string;
  powerW: number;
  grid: string;
  notes: string;
}

export interface ServerOption {
  id: string;
  label: string;
  region: string;
}

export interface GroupOption {
  id: string;
  label: string;
}

export interface CallsignRecord {
  id: string;
  callsign: string;
  type: 'HR' | 'HAM';
  countryCode: string;
  countryName: string;
  divisionPrefix?: string;
  operatorName: string;
  grid: string;
  createdAt: string;
}

export interface DxClusterSpot {
  id: string;
  spotter: string;
  dxCall: string;
  band: BandId;
  frequencyHz: number;
  mode: RadioMode;
  comment: string;
  grid: string;
  serverId: string;
  groupId: string;
  timestampUtc: string;
  createdAt: number;
}

export interface RttyConfig {
  baudRate: 45.45 | 50 | 75;
  shiftHz: 170 | 425 | 850;
  markHz: 1275 | 2125;
  fineOffsetHz: number;
  reversePolarity: boolean;
  uos: boolean;
}

export interface JttyConfig {
  baudRate: 45.45 | 50 | 75;
  shiftHz: 170 | 425 | 850;
  markHz: 1275 | 2125;
  kanaShift: boolean;
  fineOffsetHz: number;
  reversePolarity: boolean;
}

export type SstvModeId = 'Robot 36' | 'Martin M1' | 'Scottie S1' | 'PD 50';

export interface DigitalFeedLine {
  id: string;
  timestampUtc: string;
  direction: 'RX' | 'TX' | 'SYS';
  mode: 'CW' | 'RTTY' | 'JTTY' | 'FT8' | 'DIGITAL';
  callsign: string;
  frequencyHz: number;
  snrDb?: number;
  text: string;
}

export interface SstvFramePayload {
  id: string;
  callsign: string;
  sstvMode: SstvModeId;
  width: number;
  height: number;
  pixelsBase64: string; // RGB packed 3 bytes per pixel
  caption: string;
  timestampUtc: string;
  snrDb?: number;
}

export interface Ft8DecodedLine {
  id: string;
  utcTime: string;
  snrDb: number;
  dtSec: number;
  audioFreqHz: number;
  rfFreqHz: number;
  band: BandId;
  callsign: string;
  message: string;
  isCq: boolean;
  direction: 'RX' | 'TX';
}

export interface AdminNotice {
  id: string;
  fromAdmin: string;
  message: string;
  timestampUtc: string;
}
