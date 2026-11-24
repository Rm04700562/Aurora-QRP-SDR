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
  | 'DIGITAL';

export type AntennaId =
  | 'yagi5'
  | 'steppir3'
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
  isBidirectional?: boolean;
  forwardGainDbi: number;
  frontToBackDb: number;
  beamwidthDeg: number;
  resonantBands: BandId[];
  noiseRejectionDb: number;
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
