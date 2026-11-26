import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS,
  calculateBearingDeg,
  clampFrequencyToBand,
  computeAntennaGainDb,
  computeAntennaTakeoffBonusDb,
  computeHourlyPropagationSnapshot,
  computeMufMhz,
  computePowerAmpOutput,
  computePropagationPathLossDb,
  computeSwr,
  computeTxFoldbackPower,
  computeTxSMeterReading,
  DEFAULT_PROPAGATION,
  DEFAULT_TX_POWER_W,
  dbmToSMeterText,
  evaluateAllWorldRegions,
  evaluateBandCondition,
  evaluateGlobalPropagationCell,
  evaluateRemoteSignal,
  evaluateVoacapCoverageFromQth,
  evaluateVoacapPath,
  formatFrequencyMhz,
  getAntennaSpec,
  getEffectiveAntennaBandPerformance,
  getMsUntilNextUtcHour,
  getNextTopOfHourUtcLabel,
  getSubsolarPoint,
  hasSendableMorse,
  haversineDistanceKm,
  isSameFrequencyAndPropagationOpen,
  isSwrHigh,
  maidenheadFromLatLon,
  MAX_PA_POWER_W,
  MAX_TX_POWER_W,
  morseDurationMs,
  morseTimeline,
  sanitizeCwText,
  stepMeterNeedleNormalized,
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

test('SWR and 100W TX foldback react to antenna resonance, band-edge detune, and ATU tuning', () => {
  assert.equal(DEFAULT_TX_POWER_W, 15.0);
  assert.equal(MAX_TX_POWER_W, 100.0);
  const resonantSwr = computeSwr('yagi5', '20m', 0.8, 14_175_000);
  const magloopEdgeSwr = computeSwr('magloop', '20m', 0, 14_350_000);
  const magloopCenterSwr = computeSwr('magloop', '20m', 0, 14_175_000);
  const mismatchedSwr = computeSwr('yagi5', '80m', 0);
  assert.ok(resonantSwr < 1.5, `Expected low resonant SWR, got ${resonantSwr}`);
  assert.ok(magloopEdgeSwr > magloopCenterSwr + 1.0, 'Magloop SWR should rise sharply off band center');
  assert.ok(mismatchedSwr > 4.0, `Expected high non-resonant SWR, got ${mismatchedSwr}`);
  assert.equal(computeTxFoldbackPower(15.0, 1.3), 15.0);
  assert.equal(computeTxFoldbackPower(100.0, 1.3), 100.0);
  assert.ok(computeTxFoldbackPower(100.0, 5.0) < 55.0);
  assert.equal(isSwrHigh(1.1), false);
  assert.equal(isSwrHigh(1.6), false);
  assert.equal(isSwrHigh(1.61), true);
  assert.equal(isSwrHigh(2.4), true);
  assert.equal(isSwrHigh(Number.NaN), false);
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

test('hourly propagation snapshot and global propagation map evaluator reflect time and solar storm state', () => {
  const fixedMs = Date.UTC(2026, 10, 25, 12, 0, 0);
  const liveSnap = computeHourlyPropagationSnapshot(fixedMs, { sfi: 175, kIndex: 2, aIndex: 8 });
  assert.equal(liveSnap.sfi, 175);
  assert.equal(liveSnap.kIndex, 2);
  assert.equal(liveSnap.aIndex, 8);
  assert.equal(liveSnap.utcHour, 12);
  assert.equal(liveSnap.lastUpdatedUtc, '2026-11-25 12:00 UTC');
  assert.equal(liveSnap.nextUpdateUtc, '2026-11-25 13:00 UTC');
  assert.equal(liveSnap.sourceLabel, 'NOAA SWPC Hourly');

  // Top-of-hour scheduler timing
  const midHourMs = Date.UTC(2026, 10, 25, 12, 45, 0);
  assert.equal(getMsUntilNextUtcHour(midHourMs), 15 * 60_000);
  assert.equal(getNextTopOfHourUtcLabel(midHourMs), '2026-11-25 13:00 UTC');

  // Seasonal subsolar latitude: November southern tilt vs June northern tilt
  const novSubsolar = getSubsolarPoint(12, Date.UTC(2026, 10, 25, 12, 0, 0));
  const junSubsolar = getSubsolarPoint(12, Date.UTC(2026, 5, 21, 12, 0, 0));
  assert.ok(novSubsolar.lat < -15 && Math.abs(novSubsolar.lon) < 1);
  assert.ok(junSubsolar.lat > 20 && Math.abs(junSubsolar.lon) < 1);

  const noonEurope = evaluateGlobalPropagationCell(48, 0, '20m', liveSnap);
  assert.equal(noonEurope.isDaylight, true);
  assert.equal(noonEurope.rating, 'Excellent');

  const midnightLowBand = evaluateGlobalPropagationCell(48, 180, '80m', { ...liveSnap, kIndex: 2 });
  assert.equal(midnightLowBand.isDaylight, false);
  assert.ok(midnightLowBand.rating === 'Excellent' || midnightLowBand.rating === 'Good');

  // Whole-world regional matrix rotates daylight and MUF accurately around the Earth by UTC hour
  const asiaNoonMs = Date.UTC(2026, 10, 25, 4, 0, 0);
  const asiaNoonSnap = computeHourlyPropagationSnapshot(asiaNoonMs, { sfi: 170, kIndex: 1, aIndex: 5 });
  const regions04Z = evaluateAllWorldRegions(asiaNoonSnap);
  assert.equal(regions04Z.length, 7);
  const asia04Z = regions04Z.find((r) => r.id === 'as')!;
  const na04Z = regions04Z.find((r) => r.id === 'na')!;
  assert.equal(asia04Z.solarPhase, 'Day');
  assert.equal(na04Z.solarPhase, 'Night');
  assert.ok(asia04Z.localMufMhz > na04Z.localMufMhz + 4);

  // QTH-aware band condition reflects Tokyo daytime vs New York nighttime at 04:00 UTC
  const tokyo10m = evaluateBandCondition('10m', asiaNoonSnap, { lat: 35.7, lon: 139.6 });
  const ny10m = evaluateBandCondition('10m', asiaNoonSnap, { lat: 40.7, lon: -74.0 });
  assert.ok(tokyo10m.mufMhz > ny10m.mufMhz + 4);

  const stormSnap = computeHourlyPropagationSnapshot(fixedMs, { sfi: 130, kIndex: 7, aIndex: 112 });
  const polarCell = evaluateGlobalPropagationCell(66, 15, '20m', stormSnap);
  assert.equal(polarCell.rating, 'Aurora');
  const stormRegions = evaluateAllWorldRegions(stormSnap);
  assert.equal(stormRegions.find((r) => r.id === 'polar')!.bands['20m'], 'Aurora');
});

test('6-Band 5-Element Quad models real-world 6-band resonance, gain, low noise floor, and SWR mismatch', () => {
  const spec = getAntennaSpec('quad5');
  assert.equal(spec.name, '6-Band 5 Element Quad');
  assert.deepEqual(spec.resonantBands, ['10m', '12m', '15m', '17m', '20m', '40m']);

  // Full 5-el performance on 20m-10m (> 5-el Yagi) and 25 dB F/B
  const quadFwd20 = computeAntennaGainDb('quad5', 142, 142, '20m');
  const yagiFwd20 = computeAntennaGainDb('yagi5', 142, 142, '20m');
  const quadRear20 = computeAntennaGainDb('quad5', 322, 142, '20m');
  assert.ok(quadFwd20 > yagiFwd20, `Quad 20m gain (${quadFwd20}) should exceed Yagi (${yagiFwd20})`);
  assert.ok(quadFwd20 - quadRear20 >= 24, `Expected >= 24 dB F/B on 20m, got ${quadFwd20 - quadRear20}`);

  // 40m uses 2-element wire loop on the same boom with wider beamwidth & lower gain
  const perf40 = getEffectiveAntennaBandPerformance('quad5', '40m');
  assert.equal(perf40.forwardGainDbi, 6.8);
  assert.equal(perf40.beamwidthDeg, 68);
  const quadFwd40 = computeAntennaGainDb('quad5', 90, 90, '40m');
  const quadRear40 = computeAntennaGainDb('quad5', 270, 90, '40m');
  assert.ok(quadFwd40 - quadRear40 >= 12 && quadFwd40 - quadRear40 <= 15);

  // Resonant SWR across all 6 bands vs high mismatch on 80m/160m
  for (const band of spec.resonantBands) {
    const swr = computeSwr('quad5', band, 0);
    assert.ok(swr <= 1.3, `Expected resonant SWR <= 1.3 on ${band}, got ${swr}`);
  }
  const swr80Unmatched = computeSwr('quad5', '80m', 0);
  assert.ok(swr80Unmatched > 6.0 && isSwrHigh(swr80Unmatched), `Expected severe mismatch on 80m, got ${swr80Unmatched}`);
  assert.ok(computeSwr('quad5', '40m', 0, 7_300_000) > computeSwr('quad5', '40m', 0, 7_150_000));

  // Closed-loop static rejection & low-angle DX takeoff bonus improve DX SNR vs Yagi
  assert.ok(computeAntennaTakeoffBonusDb('quad5', '20m', 8000) > computeAntennaTakeoffBonusDb('yagi5', '20m', 8000));
  const beacon = PROPAGATION_BEACONS[0];
  const rxQth = { lat: -29.8587, lon: 31.0218, grid: 'KG43' };
  const bearing = calculateBearingDeg(rxQth, beacon.qth);
  const quadEval = evaluateRemoteSignal({
    station: beacon,
    rxQth,
    rxBand: '20m',
    rxFrequencyHz: beacon.frequencyHz,
    rxMode: 'USB',
    rxFilterWidthKhz: 2.4,
    rxAntennaId: 'quad5',
    rxRotorHeadingDeg: bearing,
    rxRfGainPct: 52,
    conditions: DEFAULT_PROPAGATION,
  });
  const yagiEval = evaluateRemoteSignal({
    station: beacon,
    rxQth,
    rxBand: '20m',
    rxFrequencyHz: beacon.frequencyHz,
    rxMode: 'USB',
    rxFilterWidthKhz: 2.4,
    rxAntennaId: 'yagi5',
    rxRotorHeadingDeg: bearing,
    rxRfGainPct: 52,
    conditions: DEFAULT_PROPAGATION,
  });
  assert.ok(quadEval.noiseFloorDbm < yagiEval.noiseFloorDbm, 'Quad closed loop should be quieter than Yagi');
  assert.ok(quadEval.snrDb > yagiEval.snrDb + 2.0, 'Quad DX SNR should beat Yagi on long-haul DX');
});

test('TX S-meter moves realistically by voice level, CW keying, digital carriers, and power foldback', () => {
  // USB voice tracks real microphone RMS dynamically (tested at 100W full output and 15W default)
  const usbQuiet = computeTxSMeterReading({
    mode: 'USB',
    deliveredPowerW: 100,
    micRms: 0.002,
    micEnabled: true,
    compressionPct: 5,
    timeSec: 1.0,
  });
  const usbSpeaking = computeTxSMeterReading({
    mode: 'USB',
    deliveredPowerW: 100,
    micRms: 0.25,
    micEnabled: true,
    compressionPct: 5,
    timeSec: 1.0,
  });
  assert.ok(usbSpeaking.normalized > usbQuiet.normalized + 0.25);
  assert.ok(usbSpeaking.dbm > -65);

  const usb15W = computeTxSMeterReading({
    mode: 'USB',
    deliveredPowerW: 15,
    micRms: 0.25,
    micEnabled: true,
    compressionPct: 5,
    timeSec: 1.0,
  });
  assert.ok(usbSpeaking.normalized > usb15W.normalized + 0.15, '100W TX should deflect S-meter higher than 15W');

  // CW keys crisply between key-down and key-up spaces
  const cwDown = computeTxSMeterReading({
    mode: 'CW',
    deliveredPowerW: 100,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    keyDown: true,
    timeSec: 0.5,
  });
  const cwUp = computeTxSMeterReading({
    mode: 'CW',
    deliveredPowerW: 100,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    keyDown: false,
    timeSec: 0.5,
  });
  assert.ok(cwDown.normalized > 0.7 && cwUp.normalized < 0.25);

  // Reduced delivered power under SWR foldback lowers TX S-meter deflection
  const fmFull = computeTxSMeterReading({
    mode: 'FM',
    deliveredPowerW: 100,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    timeSec: 0.5,
  });
  const fmFoldback = computeTxSMeterReading({
    mode: 'FM',
    deliveredPowerW: 25,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    timeSec: 0.5,
  });
  assert.ok(fmFull.normalized > fmFoldback.normalized + 0.15);

  // RTTY FSK mark/space modulation produces slight carrier ripple
  const rttyMark = computeTxSMeterReading({
    mode: 'RTTY',
    deliveredPowerW: 100,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    keyDown: true,
    timeSec: 0.1,
  });
  const rttySpace = computeTxSMeterReading({
    mode: 'RTTY',
    deliveredPowerW: 100,
    micRms: 0,
    micEnabled: false,
    compressionPct: 0,
    keyDown: false,
    timeSec: 0.1,
  });
  assert.ok(rttyMark.normalized > rttySpace.normalized && rttySpace.normalized > 0.65);

  // Analog needle ballistics: faster attack than decay
  const attackStep = stepMeterNeedleNormalized(0.1, 0.9, 0.04);
  const decayStep = stepMeterNeedleNormalized(0.9, 0.1, 0.04);
  const attackDelta = attackStep - 0.1;
  const decayDelta = 0.9 - decayStep;
  assert.ok(attackDelta > decayDelta * 2, `Expected faster attack (${attackDelta}) than decay (${decayDelta})`);
});

test('all bands have long-range DX antennas with realistic resonance, SWR, and rotatable vs fixed flags', () => {
  for (const band of BANDS) {
    const dxId = `dx${band.id}` as const;
    const spec = getAntennaSpec(dxId);
    assert.deepEqual(spec.resonantBands, [band.id]);
    const onBandSwr = computeSwr(dxId, band.id, 0, band.defaultHz);
    assert.ok(onBandSwr <= 1.45, `Expected low on-band SWR for ${dxId}, got ${onBandSwr}`);

    // Severe mismatch when used far off-band
    const offBand = band.id === '10m' ? '160m' : '10m';
    const offBandSwr = computeSwr(dxId, offBand, 0);
    assert.ok(isSwrHigh(offBandSwr), `Expected red high SWR for ${dxId} on ${offBand}, got ${offBandSwr}`);
    assert.ok(
      computeAntennaGainDb(dxId, 90, 90, band.id) > computeAntennaGainDb(dxId, 90, 90, offBand),
      `${dxId} gain should drop sharply on off-band ${offBand}`
    );
  }

  // Rotatable vs fixed antenna properties
  for (const fixedId of ['dipole', 'vertical', 'efhw', 'dx60m', 'dx80m', 'dx160m'] as const) {
    assert.equal(getAntennaSpec(fixedId).isRotatable, false, `${fixedId} must be non-rotatable`);
  }
  for (const rotId of ['yagi5', 'quad5', 'steppir3', 'magloop', 'dx10m', 'dx15m', 'dx20m', 'dx40m'] as const) {
    assert.equal(getAntennaSpec(rotId).isRotatable, true, `${rotId} must be rotatable`);
  }
});

test('VOACAP path & coverage models QTH-relative propagation and gates audio/signals strictly by frequency and open path', () => {
  const london = { lat: 51.5072, lon: -0.1276, grid: 'IO91' };
  const tokyo = { lat: 35.6762, lon: 139.6503, grid: 'PM95' };
  const durban = { lat: -29.8587, lon: 31.0218, grid: 'KG43' };

  const noonSnap = computeHourlyPropagationSnapshot(Date.UTC(2026, 10, 25, 12, 0, 0), { sfi: 175, kIndex: 1, aIndex: 5 });
  const stormLowSfi = computeHourlyPropagationSnapshot(Date.UTC(2026, 10, 25, 2, 0, 0), { sfi: 72, kIndex: 7, aIndex: 112 });

  // London <-> Durban on 20m at 12:00 UTC high SFI should be open
  const euAf20 = evaluateVoacapPath({
    bandId: '20m',
    txQth: london,
    rxQth: durban,
    powerW: 15,
    conditions: noonSnap,
  });
  assert.equal(euAf20.circuitOpen, true);
  assert.ok(euAf20.reliabilityPct >= 50);

  // London <-> Tokyo on 10m during low SFI + K=7 geomagnetic storm at night should be closed
  const storm10m = evaluateVoacapPath({
    bandId: '10m',
    txQth: london,
    rxQth: tokyo,
    powerW: 15,
    conditions: stormLowSfi,
  });
  assert.equal(storm10m.circuitOpen, false);

  // Coverage from London differs from coverage from Tokyo at same UTC hour
  const fromLondon = evaluateVoacapCoverageFromQth(london, tokyo.lat, tokyo.lon, '10m', stormLowSfi);
  const localTokyo = evaluateVoacapCoverageFromQth(tokyo, tokyo.lat + 0.5, tokyo.lon + 0.5, '10m', stormLowSfi);
  assert.equal(fromLondon.circuitOpen, false);
  assert.equal(localTokyo.circuitOpen, true);

  // Strict same-frequency + VOACAP gate
  assert.equal(
    isSameFrequencyAndPropagationOpen({
      rxQth: london,
      txQth: durban,
      rxBand: '20m',
      txBand: '20m',
      rxFrequencyHz: 14_250_000,
      txFrequencyHz: 14_250_200,
      conditions: noonSnap,
    }).allowed,
    true
  );
  // Different frequency on same open band must be blocked
  assert.equal(
    isSameFrequencyAndPropagationOpen({
      rxQth: london,
      txQth: durban,
      rxBand: '20m',
      txBand: '20m',
      rxFrequencyHz: 14_250_000,
      txFrequencyHz: 14_265_000,
      conditions: noonSnap,
    }).allowed,
    false
  );
  // Exact same frequency on closed VOACAP circuit must be blocked
  assert.equal(
    isSameFrequencyAndPropagationOpen({
      rxQth: london,
      txQth: tokyo,
      rxBand: '10m',
      txBand: '10m',
      rxFrequencyHz: 28_400_000,
      txFrequencyHz: 28_400_000,
      conditions: stormLowSfi,
    }).allowed,
    false
  );
});

test('small desktop power amplifier boosts exciter output up to 500W and trips safely on high SWR', () => {
  const bypass = computePowerAmpOutput({ exciterPowerW: 15, swr: 1.3, paEnabled: false, gainDb: 10 });
  assert.equal(bypass.paActive, false);
  assert.equal(bypass.paTripped, false);
  assert.equal(bypass.outputPowerW, 15.0);

  const stage5x = computePowerAmpOutput({ exciterPowerW: 15, swr: 1.3, paEnabled: true, gainDb: 7 });
  assert.equal(stage5x.paActive, true);
  assert.equal(stage5x.paTripped, false);
  assert.equal(stage5x.outputPowerW, 75.0);

  const stage10x = computePowerAmpOutput({ exciterPowerW: 15, swr: 1.3, paEnabled: true, gainDb: 10 });
  assert.equal(stage10x.paActive, true);
  assert.equal(stage10x.outputPowerW, 150.0);

  const capped = computePowerAmpOutput({ exciterPowerW: 80, swr: 1.2, paEnabled: true, gainDb: 10 });
  assert.equal(capped.outputPowerW, MAX_PA_POWER_W);

  const tripped = computePowerAmpOutput({ exciterPowerW: 15, swr: 2.5, paEnabled: true, gainDb: 10 });
  assert.equal(tripped.paActive, false);
  assert.equal(tripped.paTripped, true);
  assert.equal(tripped.outputPowerW, tripped.exciterPowerW);
});



