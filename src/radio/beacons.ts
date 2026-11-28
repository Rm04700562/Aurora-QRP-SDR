import { RemoteStation } from '../types/radio';

/**
 * Single ARRL NEWS reference beacon (W1AW / ARRL HQ, Newington CT, FN31).
 * Never injected onto the waterfall or into the QSO logbook — the waterfall displays
 * strictly real incoming stations only.
 */
export const ARRL_NEWS_BEACON: RemoteStation = {
  id: 'beacon-arrl-news',
  callsign: 'ARRL NEWS',
  serverId: 'global',
  groupId: 'all',
  band: '20m',
  frequencyHz: 14_290_000,
  mode: 'USB',
  powerW: 100.0,
  antennaId: 'yagi5',
  rotorHeadingDeg: 110,
  qth: { lat: 41.7147, lon: -72.7272, grid: 'FN31' },
  isTransmitting: true,
  cwText: 'QST DE W1AW ARRL NEWS BULLETIN FN31 K',
  isBeacon: true,
  lastActiveAt: 0,
};

export const PROPAGATION_BEACONS: RemoteStation[] = [ARRL_NEWS_BEACON];
