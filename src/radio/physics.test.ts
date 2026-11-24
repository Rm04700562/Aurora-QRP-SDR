import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBearingDeg,
  clampFrequencyToBand,
  computeAntennaGainDb,
  computeMufMhz,
  computePropagationPathLossDb,
  computeSwr,
  computeTxFoldbackPower,
  DEFAULT_PROPAGATION,
  dbmToSMeterText,
  evaluateRemoteSignal,
  formatFrequencyMhz,
  hasSendableMorse,
  haversineDistanceKm,
  maidenheadFromLatLon,
  morseDurationMs,
  morseTimeline,
  sanitizeCwText,
  stepRotorToward,
  textToMorse,
} from './physics';
import { PROPAGATION_BEACONS } from './beacons';
import {
  buildAzimuthalContinentLabels,
  buildAzimuthalContinentPaths,
  buildAzimuthalGraticulePaths,
  buildWorldMapBeamPaths,
  describeBeamTarget,
  estimateQthFromTimeZone,
  projectAzimuthalPoint,
  WORLD_CONTINENT_POLYGONS,
} from './azimuthalMap';

test('formatFrequencyMhz renders dot-grouped precision frequency', () => {
  assert.equal(formatFrequencyMhz(14_250_000), '14.250.000');
  assert.equal(formatFrequencyMhz(7_090_120), '7.090.120');
});

test('clampFrequencyToBand constrains VFO within band edges', () => {
  assert.equal(clampFrequencyToBand(13_900_000, '20m'), 14_000_000);
  assert.equal(clampFrequencyToBand(14_500_000, '20m'), 14_350_000);
  assert.equal(clampFrequencyToBand(14_250_000, '20m'), 14_250_000);
});

test('great-circle distance and bearing match real geography', () => {
  const durban = { lat: -29.8587, lon: 31.0218 };
  const frankfurt = { lat: 50.1109, lon: 8.6821 };
  const dist = haversineDistanceKm(durban, frankfurt);
  assert.ok(dist > 8800 && dist < 9400, `Expected ~9100km, got ${dist}`);
  const bearing = calculateBearingDeg(durban, frankfurt);
  assert.ok(bearing >= 340 || bearing <= 355, `Expected ~346 deg, got ${bearing}`);
  assert.equal(maidenheadFromLatLon(-29.8587, 31.0218), 'KG50');
});

test('5-element Yagi exhibits strong forward gain and ~22dB F/B attenuation', () => {
  const forward = computeAntennaGainDb('yagi5', 142, 142, '20m');
  const rear = computeAntennaGainDb('yagi5', 322, 142, '20m');
  assert.ok(forward > 10, `Forward gain should exceed 10 dBi, got ${forward}`);
  assert.ok(forward - rear >= 20, `Front-to-back ratio should be >= 20 dB, got ${forward - rear}`);
});

test('SWR and QRP TX foldback react to antenna resonance and ATU tuning', () => {
  const resonantSwr = computeSwr('yagi5', '20m', 0.8);
  const mismatchedSwr = computeSwr('yagi5', '80m', 0);
  assert.ok(resonantSwr < 1.5, `Expected low resonant SWR, got ${resonantSwr}`);
  assert.ok(mismatchedSwr > 4.0, `Expected high non-resonant SWR, got ${mismatchedSwr}`);
  assert.equal(computeTxFoldbackPower(5.0, 1.3), 5.0);
  assert.ok(computeTxFoldbackPower(5.0, 5.0) < 3.0);
});

test('stepRotorToward takes shortest circular path across 0/360 boundary', () => {
  assert.equal(stepRotorToward(355, 10, 8), 3);
  assert.equal(stepRotorToward(5, 350, 8), 357);
  assert.equal(stepRotorToward(140, 142, 5), 142);
});

test('propagation model drops MUF and increases path loss during geomagnetic storms', () => {
  const quiet = { ...DEFAULT_PROPAGATION, sfi: 180, kIndex: 1, auroraActive: false };
  const storm = { ...DEFAULT_PROPAGATION, sfi: 110, kIndex: 8, auroraActive: true };
  assert.ok(computeMufMhz(quiet, 30) > computeMufMhz(storm, 30));

  const tx = { lat: 60.17, lon: 24.94, grid: 'KP20' };
  const rx = { lat: -29.85, lon: 31.02, grid: 'KG43' };
  const quietLoss = computePropagationPathLossDb('10m', 10000, tx, rx, quiet);
  const stormLoss = computePropagationPathLossDb('10m', 10000, tx, rx, storm);
  assert.ok(stormLoss.pathLossDb > quietLoss.pathLossDb);
  assert.ok(stormLoss.auroraFlutter > 0.5);
});

test('evaluateRemoteSignal detects passband tuning and S-meter formatting', () => {
  assert.equal(dbmToSMeterText(-73), 'S9');
  assert.equal(dbmToSMeterText(-53), 'S9+20');
  const beacon = PROPAGATION_BEACONS[0];
  const tuned = evaluateRemoteSignal({
    station: beacon,
    rxQth: { lat: -29.8587, lon: 31.0218, grid: 'KG43' },
    rxBand: '20m',
    rxFrequencyHz: beacon.frequencyHz,
    rxMode: 'USB',
    rxFilterWidthKhz: 2.4,
    rxAntennaId: 'yagi5',
    rxRotorHeadingDeg: 345,
    rxRfGainPct: 52,
    conditions: { sfi: 150, kIndex: 2, aIndex: 8, auroraActive: false, sporadicE: false, greylineBoost: true, utcHour: 14, presetName: 'Balanced DX' },
  });
  assert.equal(tuned.inPassband, true);
  assert.ok(tuned.snrDb > 0);
});

test('Morse encoder and timeline produce valid CW elements', () => {
  assert.equal(textToMorse('CQ'), '-.-. --.-');
  assert.equal(textToMorse('BT = AR +'), '-... - / -...- / .- .-. / .-.-.');
  const timeline = morseTimeline('CQ', 20);
  assert.ok(timeline.length > 6);
  assert.equal(timeline[0].on, true);
});

test('CW text helpers sanitize, validate, and compute WPM-scaled durations', () => {
  assert.equal(sanitizeCwText('  cq   dx de zs1rom k '), 'CQ DX DE ZS1ROM K ');
  assert.equal(sanitizeCwText('A'.repeat(100)).length, 80);
  assert.equal(hasSendableMorse('CQ 73'), true);
  assert.equal(hasSendableMorse('   !!!   '), false);
  assert.equal(morseDurationMs('', 15), 0);
  const dur15 = morseDurationMs('CQ DE ZS1ROM', 15);
  const dur30 = morseDurationMs('CQ DE ZS1ROM', 30);
  assert.ok(dur15 > 1000);
  assert.ok(dur30 < dur15 * 0.6);
});

test('azimuthal equidistant projection centers QTH and preserves great-circle bearings', () => {
  const qth = { lat: -29.8587, lon: 31.0218, grid: 'KG43' };
  const centerPt = projectAzimuthalPoint(qth.lon, qth.lat, qth);
  assert.ok(Math.abs(centerPt.x - 50) < 0.01 && Math.abs(centerPt.y - 50) < 0.01);

  const northPt = projectAzimuthalPoint(qth.lon, 20, qth);
  assert.ok(Math.abs(northPt.x - 50) < 0.2 && northPt.y < 45);

  const eastPt = projectAzimuthalPoint(95, qth.lat, qth);
  assert.ok(eastPt.x > 55);

  const paths = buildAzimuthalContinentPaths(qth);
  assert.equal(paths.length, WORLD_CONTINENT_POLYGONS.length);
  for (const d of paths) {
    assert.ok(d.startsWith('M ') && d.endsWith(' Z') && !d.includes('NaN'));
  }

  const grat = buildAzimuthalGraticulePaths(qth);
  assert.ok(grat.length >= 10);
  assert.ok(grat.every((d) => d.startsWith('M ') && !d.includes('NaN')));

  const regionNorth = describeBeamTarget(qth, 355, [], '20m');
  assert.equal(regionNorth, 'Africa');

  // Great-circle World Map beam paths should split across antimeridian and avoid NaN
  const westBeam = buildWorldMapBeamPaths(qth, 270, 140);
  assert.ok(westBeam.length >= 1);
  assert.ok(westBeam.every((d) => d.startsWith('M ') && !d.includes('NaN')));

  // Cross-band live user target detection
  const tokyoPeer = {
    id: 'peer-ja',
    callsign: 'JA1XYZ',
    serverId: 'eu',
    groupId: 'south-africa',
    band: '40m' as const,
    frequencyHz: 7_090_000,
    mode: 'LSB' as const,
    powerW: 5,
    antennaId: 'yagi5' as const,
    rotorHeadingDeg: 240,
    qth: { lat: 35.6762, lon: 139.6503, grid: 'PM95' },
    isTransmitting: false,
    lastActiveAt: Date.now(),
  };
  const bearingToTokyo = calculateBearingDeg(qth, tokyoPeer.qth);
  const evalPeer = evaluateRemoteSignal({
    station: tokyoPeer,
    rxQth: qth,
    rxBand: '20m',
    rxFrequencyHz: 14_250_000,
    rxMode: 'USB',
    rxFilterWidthKhz: 2.4,
    rxAntennaId: 'yagi5',
    rxRotorHeadingDeg: bearingToTokyo,
    rxRfGainPct: 52,
    conditions: DEFAULT_PROPAGATION,
  });
  assert.equal(
    describeBeamTarget(qth, bearingToTokyo, [{ station: tokyoPeer, evalResult: evalPeer }], '20m'),
    'JA1XYZ'
  );

  // Continent labels and antipode-safe projection for northern/eastern QTH locations
  const londonQth = estimateQthFromTimeZone('Europe/London');
  assert.ok(londonQth && londonQth.grid.startsWith('IO'));
  const labelsFromLondon = buildAzimuthalContinentLabels(londonQth);
  assert.equal(labelsFromLondon.length, 6);
  const euFromLondon = labelsFromLondon.find((l) => l.code === 'EU')!;
  const naFromLondon = labelsFromLondon.find((l) => l.code === 'NA')!;
  assert.ok(naFromLondon.x < euFromLondon.x, 'North America should appear West of Europe from London');

  // Antipode check: Beijing (antipode in South America) produces valid SVG paths without NaN
  const beijing = { lat: 39.9, lon: 116.4, grid: 'OM89' };
  const beijingContinents = buildAzimuthalContinentPaths(beijing);
  assert.equal(beijingContinents.length, WORLD_CONTINENT_POLYGONS.length);
  assert.ok(beijingContinents.every((d) => d.startsWith('M ') && d.endsWith(' Z') && !d.includes('NaN')));
});
