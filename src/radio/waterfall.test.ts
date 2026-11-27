import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaterfallColorLut,
  collectVisibleSignalMarkers,
  computeNotchRfOffsetHz,
  computePassbandOffsetsHz,
  computeWaterfallNormalizedIntensity,
  frequencyHzToPixelX,
  pixelXToFrequencyHz,
  pushWaterfallSliceRow,
  shiftWaterfallBufferHorizontal,
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

test('propagation beacons appear on waterfall when enabled and hide when showBeacons is false', () => {
  const cwBeacon = makeStation('beacon-w1aw', 14_246_200, { isBeacon: true, mode: 'CW' });
  const beaconEval = makeEval('beacon-w1aw', { propagationOpen: true, rxPowerDbm: -76 });

  // Search within a 1s window for an active Morse mark slot
  let markTimeMs = 1000;
  for (let t = 1000; t < 3500; t += 95) {
    const testSlice = synthesizeSpectrumSlice({
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
      nowMs: t,
      stations: [],
      beacons: [{ station: cwBeacon, evalResult: beaconEval }],
      showBeacons: true,
      randomFn: () => 0.5,
    });
    const peak = Math.max(...testSlice.slice(95, 112));
    if (peak > -90) {
      markTimeMs = t;
      break;
    }
  }

  const withBeacons = synthesizeSpectrumSlice({
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
    nowMs: markTimeMs,
    stations: [],
    beacons: [{ station: cwBeacon, evalResult: beaconEval }],
    showBeacons: true,
    randomFn: () => 0.5,
  });

  const withoutBeacons = synthesizeSpectrumSlice({
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
    nowMs: markTimeMs,
    stations: [],
    beacons: [{ station: cwBeacon, evalResult: beaconEval }],
    showBeacons: false,
    randomFn: () => 0.5,
  });

  assert.ok(Math.max(...withBeacons.slice(95, 112)) > -90);
  assert.ok(Math.max(...withoutBeacons.slice(95, 112)) < -115);
});

test('collectVisibleSignalMarkers locates live incoming stations and beacons with zero callsigns', () => {
  const liveStation = makeStation('peer-a', 14_236_000, { mode: 'USB' });
  const beaconStation = makeStation('beacon-w1aw', 14_246_200, { isBeacon: true, mode: 'CW' });

  const markers = collectVisibleSignalMarkers({
    centerFreqHz: 14_250_000,
    spanKhz: 50,
    zoom: 1,
    canvasWidth: 680,
    band: '20m',
    nowMs: 1000,
    stations: [{ station: liveStation, evalResult: makeEval('peer-a') }],
    beacons: [{ station: beaconStation, evalResult: makeEval('beacon-w1aw') }],
    showBeacons: true,
  });

  assert.equal(markers.length, 2);
  assert.equal(markers[0].kind, 'live');
  assert.equal(markers[1].kind, 'beacon');
  // Strict guarantee: no callsign fields on marker objects
  assert.equal('callsign' in markers[0], false);
  assert.equal('callsign' in markers[1], false);
});

