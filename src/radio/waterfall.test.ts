import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaterfallColorLut,
  clearWaterfallBuffer,
  collectVisibleSignalMarkers,
  computeNotchRfOffsetHz,
  computePassbandOffsetsHz,
  computeWaterfallNormalizedIntensity,
  detectTransmissionEnded,
  frequencyHzToPixelX,
  pixelXToFrequencyHz,
  pushWaterfallSliceRow,
  shiftWaterfallBufferHorizontal,
  shouldSampleBasebandSpectrum,
  synthesizeSpectrumSlice,
  WATERFALL_PLOT_LEFT,
  WATERFALL_PLOT_RIGHT,
} from './waterfall';
import type { RemoteStation, SignalEvaluation } from '../types/radio';

function makeEval(stationId: string, overrides: Partial<SignalEvaluation> = {}): SignalEvaluation {
  return {
    stationId,
    distanceKm: 1200,
    bearingToTxDeg: 45,
    rxAntennaGainDb: 6,
    txAntennaGainDb: 4,
    pathLossDb: 96,
    rxPowerDbm: -74,
    noiseFloorDbm: -120,
    snrDb: 46,
    sMeterText: 'S9',
    sMeterNormalized: 0.6,
    auroraFlutter: 0,
    inPassband: false,
    freqOffsetHz: -14000,
    propagationOpen: true,
    propagationReason: 'Open',
    reliabilityPct: 80,
    mufMhz: 22,
    fotMhz: 18,
    lufMhz: 6,
    ...overrides,
  };
}

function makeStation(id: string, frequencyHz: number, overrides: Partial<RemoteStation> = {}): RemoteStation {
  return {
    id,
    callsign: 'DX1TEST',
    serverId: 'global',
    groupId: 'open-hf',
    band: '20m',
    frequencyHz,
    mode: 'CW',
    powerW: 25,
    antennaId: 'dipole',
    rotorHeadingDeg: 0,
    qth: { lat: 52.5, lon: 13.4, grid: 'JO62' },
    isTransmitting: true,
    lastActiveAt: 1000,
    ...overrides,
  };
}

test('pixelXToFrequencyHz accounts for 36px left axis and 8px right margin cleanly', () => {
  const canvasW = 680;
  const rectW = 680;
  const centerHz = 14_250_000;
  const spanKhz = 50;
  const zoom = 1;

  // Clicking exact left edge of plot (x = 36) yields minFreq (14.225 MHz)
  assert.equal(
    pixelXToFrequencyHz(WATERFALL_PLOT_LEFT, rectW, canvasW, centerHz, spanKhz, zoom),
    14_225_000
  );

  // Clicking inside left axis gutter clamps cleanly to minFreq
  assert.equal(pixelXToFrequencyHz(10, rectW, canvasW, centerHz, spanKhz, zoom), 14_225_000);

  // Clicking exact center of plot area (36 + (680-44)/2 = 354) yields exact centerFreqHz!
  const centerPlotX = WATERFALL_PLOT_LEFT + (canvasW - WATERFALL_PLOT_LEFT - WATERFALL_PLOT_RIGHT) / 2;
  assert.equal(pixelXToFrequencyHz(centerPlotX, rectW, canvasW, centerHz, spanKhz, zoom), 14_250_000);

  // Clicking 25% of plot area yields 14.2375 MHz
  const quarterPlotX =
    WATERFALL_PLOT_LEFT + 0.25 * (canvasW - WATERFALL_PLOT_LEFT - WATERFALL_PLOT_RIGHT);
  assert.equal(pixelXToFrequencyHz(quarterPlotX, rectW, canvasW, centerHz, spanKhz, zoom), 14_237_500);

  // Clicking with CSS scaling (rectW = 340, half of canvasW) maps linearly
  assert.equal(
    pixelXToFrequencyHz(centerPlotX / 2, 340, canvasW, centerHz, spanKhz, zoom),
    14_250_000
  );
});

test('frequencyHzToPixelX is the exact inverse of pixelXToFrequencyHz', () => {
  const canvasW = 680;
  const centerHz = 7_074_000;
  const spanKhz = 25;
  const zoom = 2;

  const targetFreq = 7_077_125;
  const px = frequencyHzToPixelX(targetFreq, canvasW, centerHz, spanKhz, zoom);
  const roundTrip = pixelXToFrequencyHz(px, canvasW, canvasW, centerHz, spanKhz, zoom);
  assert.ok(Math.abs(roundTrip - targetFreq) <= 1);
});

test('computePassbandOffsetsHz distinguishes USB, LSB, and symmetric CW/AM/RTTY', () => {
  const usb = computePassbandOffsetsHz('USB', 2.4);
  assert.ok(usb.lowHz >= 0 && usb.highHz === 2400);

  const lsb = computePassbandOffsetsHz('LSB', 2.4);
  assert.ok(lsb.lowHz === -2400 && lsb.highHz <= 0);

  const cw = computePassbandOffsetsHz('CW', 0.5);
  assert.equal(cw.lowHz, -250);
  assert.equal(cw.highHz, 250);
});

test('synthesizeSpectrumSlice renders FT8 tone offset, RTTY twin FSK, CW peak, and Notch cut', () => {
  const deterministicRand = () => 0.5;

  // FT8 offset tone at +1500 Hz
  const ft8 = synthesizeSpectrumSlice({
    bins: 240,
    centerFreqHz: 14_074_000,
    spanKhz: 10,
    zoom: 1,
    mode: 'FT8',
    band: '20m',
    filterWidthKhz: 2.4,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 0,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: true,
    micRms: 0,
    nowMs: 1000,
    stations: [],
    toneTelemetry: { mode: 'FT8', markActive: true, freqHz: 1500 },
    randomFn: deterministicRand,
  });

  // Bin corresponding to +1500 Hz above 14.074 MHz (14.0755 MHz -> norm = (6500)/10000 = 0.65 -> bin ~ 155)
  const ft8PeakIdx = ft8.reduce((best, val, idx, arr) => (val > arr[best] ? idx : best), 0);
  const ft8PeakFreq = 14_069_000 + (ft8PeakIdx / 239) * 10_000;
  assert.ok(Math.abs(ft8PeakFreq - 14_075_500) < 120, `Expected FT8 peak near +1500 Hz, got ${ft8PeakFreq}`);
  assert.ok(ft8[ft8PeakIdx] > -35);

  // Notch filter creates a visible cut inside USB passband when enabled
  const notchOffset = computeNotchRfOffsetHz(50, 'USB');
  assert.ok(notchOffset !== null && notchOffset > 1400 && notchOffset < 1700);
});

test('noise blanker reduces broadband QRN spike amplitude on spectrum slice', () => {
  // Force randomFn to return < 0.075 so QRN burst triggers
  const lowRand = () => 0.02;

  const noNb = synthesizeSpectrumSlice({
    bins: 120,
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    mode: 'USB',
    band: '20m',
    filterWidthKhz: 2.4,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 0,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: false,
    micRms: 0,
    nowMs: 500,
    stations: [],
    randomFn: lowRand,
  });

  const maxNb = synthesizeSpectrumSlice({
    bins: 120,
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    mode: 'USB',
    band: '20m',
    filterWidthKhz: 2.4,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 0,
    noiseBlankerPct: 100,
    notchPct: 0,
    isTransmitting: false,
    micRms: 0,
    nowMs: 500,
    stations: [],
    randomFn: lowRand,
  });

  const noNbPeak = Math.max(...noNb);
  const maxNbPeak = Math.max(...maxNb);
  assert.ok(noNbPeak > maxNbPeak + 2, `Expected QRN burst without NB (${noNbPeak}) > with 100% NB (${maxNbPeak})`);
});

test('pushWaterfallSliceRow scrolls rows down and writes thermal LUT colors', () => {
  const W = 120;
  const H = 4;
  const buf = new Uint8ClampedArray(W * H * 4);
  const lut = buildWaterfallColorLut('aurora');

  const slice1 = new Float32Array(64).fill(-120);
  slice1[32] = -40; // strong center peak
  pushWaterfallSliceRow(buf, W, H, slice1, -120, lut);

  // Peak pixel in row 0 around center of plot [36 .. 112] -> x ~ 74 should be bright red/white/amber
  const centerX = WATERFALL_PLOT_LEFT + Math.floor((W - WATERFALL_PLOT_LEFT - WATERFALL_PLOT_RIGHT) / 2);
  const r0 = buf[centerX * 4];
  assert.ok(r0 > 200, `Expected hot peak color at center of row 0, got R=${r0}`);

  // Left gutter stays dark
  assert.equal(buf[4], 6);

  // Push quiet slice2 -> slice1's peak should scroll down to row 1
  const slice2 = new Float32Array(64).fill(-122);
  pushWaterfallSliceRow(buf, W, H, slice2, -120, lut);
  const row1CenterOff = (W + centerX) * 4;
  assert.ok(buf[row1CenterOff] > 200, 'Expected row 0 peak to scroll cleanly into row 1');
});

test('shiftWaterfallBufferHorizontal keeps RF trails aligned when tuning VFO', () => {
  const W = 100;
  const H = 2;
  const buf = new Uint8ClampedArray(W * H * 4);
  // Paint bright marker at x = 60 in row 0
  buf[60 * 4] = 250;
  buf[60 * 4 + 1] = 120;
  buf[60 * 4 + 2] = 40;
  buf[60 * 4 + 3] = 255;

  shiftWaterfallBufferHorizontal(buf, W, H, 10);
  // Marker moves from x=60 to x=70, vacated left edge (x=40 inside plot) gets bgColor [6, 12, 24]
  assert.equal(buf[70 * 4], 250);
  assert.equal(buf[40 * 4], 6);
  assert.ok(computeWaterfallNormalizedIntensity(-90, -120) > 0.5);
});

test('incoming off-frequency live station renders even when marginal (propagationOpen=false) and across bursts', () => {
  const marginalStation = makeStation('peer-1', 14_236_000, { mode: 'CW' });
  const marginalEval = makeEval('peer-1', { propagationOpen: false, rxPowerDbm: -115 });

  const slice = synthesizeSpectrumSlice({
    bins: 240,
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    mode: 'USB',
    band: '20m',
    filterWidthKhz: 2.4,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 50,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: false,
    micRms: 0,
    nowMs: 1000,
    stations: [{ station: marginalStation, evalResult: marginalEval }],
    bursts: [
      {
        id: 'rf-peer-2',
        band: '20m',
        frequencyHz: 14_264_000,
        mode: 'USB',
        powerDbm: -78,
        startedAtMs: 800,
        expiresAtMs: 2000,
      },
    ],
    randomFn: () => 0.5,
  });

  // Bin near 14.236 MHz (norm = (14236000 - 14225000)/50000 = 0.22 -> bin ~ 53)
  const peer1Bin = Math.round(0.22 * 239);
  assert.ok(slice[peer1Bin] > -115, `Expected marginal live station peak above floor, got ${slice[peer1Bin]}`);

  // Bin near 14.264 MHz + ~1200 Hz voice energy (norm = (14265200 - 14225000)/50000 = 0.804 -> bin ~ 192)
  const peer2Peak = Math.max(...slice.slice(185, 200));
  assert.ok(peer2Peak > -95, `Expected incoming RF burst peak above -95 dBm, got ${peer2Peak}`);
});

test('waterfall excludes beacons and only renders real incoming stations and bursts', () => {
  const realStation = makeStation('peer-a', 14_236_000, { mode: 'USB', isBeacon: false });
  const arrlBeacon = makeStation('beacon-arrl-news', 14_290_000, {
    callsign: 'ARRL NEWS',
    isBeacon: true,
    mode: 'USB',
  });

  const slice = synthesizeSpectrumSlice({
    bins: 240,
    centerFreqHz: 14_265_000,
    spanKhz: 60,
    zoom: 1,
    mode: 'USB',
    band: '20m',
    filterWidthKhz: 2.4,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 50,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: false,
    micRms: 0,
    nowMs: 1000,
    stations: [
      { station: realStation, evalResult: makeEval('peer-a', { rxPowerDbm: -74 }) },
      { station: arrlBeacon, evalResult: makeEval('beacon-arrl-news', { rxPowerDbm: -60 }) },
    ],
    randomFn: () => 0.5,
  });

  // Real station near 14.236 MHz (+1kHz voice = 14.237 MHz -> norm = (14237000 - 14235000)/60000 = 0.033 -> bin ~ 8)
  const realPeak = Math.max(...slice.slice(4, 16));
  assert.ok(realPeak > -95, `Expected real station peak above -95 dBm, got ${realPeak}`);

  // ARRL NEWS beacon at 14.290 MHz (norm ~ 0.93 -> bin ~ 223) must remain at noise floor on waterfall
  const beaconAreaMax = Math.max(...slice.slice(215, 232));
  assert.ok(beaconAreaMax < -115, `Expected beacon excluded from waterfall, got ${beaconAreaMax}`);

  const markers = collectVisibleSignalMarkers({
    centerFreqHz: 14_265_000,
    spanKhz: 60,
    zoom: 1,
    canvasWidth: 680,
    band: '20m',
    nowMs: 1000,
    stations: [
      { station: realStation, evalResult: makeEval('peer-a') },
      { station: arrlBeacon, evalResult: makeEval('beacon-arrl-news') },
    ],
  });

  assert.equal(markers.length, 1);
  assert.equal(markers[0].kind, 'live');
  assert.equal(markers[0].freqHz, 14_236_000);
  assert.equal('callsign' in markers[0], false);
});

test('clearWaterfallBuffer resets all RGBA pixels to dark slate after transmission ends', () => {
  const W = 120;
  const H = 6;
  const buf = new Uint8ClampedArray(W * H * 4);
  const lut = buildWaterfallColorLut('aurora');

  const txSlice = new Float32Array(64).fill(-24);
  pushWaterfallSliceRow(buf, W, H, txSlice, -120, lut);
  pushWaterfallSliceRow(buf, W, H, txSlice, -120, lut);

  const centerOff = (WATERFALL_PLOT_LEFT + 32) * 4;
  assert.ok(buf[centerOff] > 200, 'Expected bright TX pixels before clearing');

  clearWaterfallBuffer(buf, W, H);
  for (let i = 0; i < buf.length; i += 4) {
    assert.equal(buf[i], 6);
    assert.equal(buf[i + 1], 12);
    assert.equal(buf[i + 2], 24);
    assert.equal(buf[i + 3], 255);
  }
});

test('detectTransmissionEnded triggers when local or remote transmission finishes', () => {
  assert.equal(detectTransmissionEnded({ localTx: false, remoteTx: false }, { localTx: true, remoteTx: false }), false);
  assert.equal(detectTransmissionEnded({ localTx: true, remoteTx: false }, { localTx: true, remoteTx: false }), false);
  assert.equal(detectTransmissionEnded({ localTx: true, remoteTx: false }, { localTx: false, remoteTx: false }), true);
  assert.equal(detectTransmissionEnded({ localTx: true, remoteTx: true }, { localTx: false, remoteTx: true }), true);
  assert.equal(detectTransmissionEnded({ localTx: false, remoteTx: true }, { localTx: false, remoteTx: false }), true);
  assert.equal(detectTransmissionEnded({ localTx: false, remoteTx: false }, { localTx: false, remoteTx: false }), false);
});

test('shouldSampleBasebandSpectrum gates idle RX hiss after TX ends while allowing active TX or RX audio', () => {
  assert.equal(shouldSampleBasebandSpectrum(true, 1000, 0), true);
  assert.equal(shouldSampleBasebandSpectrum(false, 1000, 0), false);
  assert.equal(shouldSampleBasebandSpectrum(false, 1000, 1500), true);
  assert.equal(shouldSampleBasebandSpectrum(false, 1600, 1500), false);
});

test('after transmission ends, TX trace scrolls down row by row until exiting bottom of waterfall', () => {
  const W = 120;
  const H = 6;
  const buf = new Uint8ClampedArray(W * H * 4);
  clearWaterfallBuffer(buf, W, H);
  const lut = buildWaterfallColorLut('aurora');
  const centerX = WATERFALL_PLOT_LEFT + Math.floor((W - WATERFALL_PLOT_LEFT - WATERFALL_PLOT_RIGHT) / 2);

  // Transmit 1 bright slice on row 0
  const txSlice = synthesizeSpectrumSlice({
    bins: 64,
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    mode: 'CW',
    band: '20m',
    filterWidthKhz: 0.5,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 50,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: true,
    micRms: 0,
    nowMs: 1000,
    stations: [],
    randomFn: () => 0.5,
  });
  pushWaterfallSliceRow(buf, W, H, txSlice, -120, lut);
  assert.ok(buf[centerX * 4] > 200, 'Expected bright TX trace at row 0');

  // Transmission ends: push quiet RX noise rows; TX trace must step down 1 row at a time until row H-1 then exit
  const rxSlice = synthesizeSpectrumSlice({
    bins: 64,
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    mode: 'CW',
    band: '20m',
    filterWidthKhz: 0.5,
    rfGainPct: 50,
    noiseFloorDbm: -120,
    noiseReductionPct: 50,
    noiseBlankerPct: 0,
    notchPct: 0,
    isTransmitting: false,
    micRms: 0,
    nowMs: 1100,
    stations: [],
    randomFn: () => 0.5,
  });

  for (let row = 1; row < H; row++) {
    pushWaterfallSliceRow(buf, W, H, rxSlice, -120, lut);
    assert.ok(buf[centerX * 4] < 40, `Expected quiet RX floor at row 0 on step ${row}`);
    const movedOff = (row * W + centerX) * 4;
    assert.ok(buf[movedOff] > 200, `Expected TX trace to advance to row ${row}`);
  }

  // One more RX row pushes the TX trace off the bottom edge of the waterfall
  pushWaterfallSliceRow(buf, W, H, rxSlice, -120, lut);
  const bottomOff = ((H - 1) * W + centerX) * 4;
  assert.ok(buf[bottomOff] < 40, 'Expected TX trace to exit cleanly after reaching bottom of waterfall');
});

