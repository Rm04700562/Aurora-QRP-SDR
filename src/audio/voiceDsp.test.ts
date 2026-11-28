import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCalibratedAfGain,
  computeRadioVoiceFilterParams,
  computeSidetoneGain,
  createDiodeSaturationCurve,
  normalizeIncomingRxVoipFrame,
  processTxMicFrame,
} from './voiceDsp';

test('AF gain and sidetone strictly mute at 0%, Audio Off, and Power Off', () => {
  assert.equal(computeCalibratedAfGain(0, true, true, false), 0);
  assert.equal(computeCalibratedAfGain(68, false, true, false), 0);
  assert.equal(computeCalibratedAfGain(68, true, false, false), 0);
  assert.equal(computeCalibratedAfGain(68, true, true, true), 0);

  assert.equal(computeSidetoneGain(0, true, true), 0);
  assert.equal(computeSidetoneGain(68, false, true), 0);
  assert.equal(computeSidetoneGain(68, true, false), 0);

  const low = computeCalibratedAfGain(25, true, true, false);
  const mid = computeCalibratedAfGain(68, true, true, false);
  const high = computeCalibratedAfGain(100, true, true, false);
  assert.ok(low > 0 && low < mid && mid < high && high <= 0.9);

  const sideLow = computeSidetoneGain(25, true, true);
  const sideHigh = computeSidetoneGain(90, true, true);
  assert.ok(sideLow > 0 && sideLow < sideHigh && sideHigh <= 0.75);
});

test('SSB communications IF filter restricts voice to 300-2850 Hz radio passband with presence boost', () => {
  const usb = computeRadioVoiceFilterParams('USB', 2.4);
  assert.ok(usb.highpassHz >= 320 && usb.highpassHz <= 360);
  assert.ok(usb.lowpassHz <= 2850 && usb.lowpassHz >= 2400);
  assert.ok(usb.presenceGainDb >= 4.0);
  assert.ok(usb.voiceSaturationAmount > 0.2);

  const cw = computeRadioVoiceFilterParams('CW', 0.5);
  assert.equal(cw.bandpassCenterHz, 750);
  assert.equal(cw.voiceSaturationAmount, 0);

  const ft8 = computeRadioVoiceFilterParams('FT8', 2.4);
  assert.equal(ft8.voiceSaturationAmount, 0);
});

test('createDiodeSaturationCurve produces bounded nonlinear transfer curve', () => {
  const curve = createDiodeSaturationCurve(0.28, 128);
  assert.equal(curve.length, 128);
  assert.ok(curve[0] < -0.7 && curve[0] >= -1.0);
  assert.ok(curve[127] > 0.7 && curve[127] <= 1.0);
});

test('processTxMicFrame removes 80Hz studio rumble, preserves 1kHz speech, and responds to compression', () => {
  const sampleRate = 48000;
  const len = 2048;

  const rumble = new Float32Array(len);
  const speech = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    rumble[i] = Math.sin(2 * Math.PI * 80 * t) * 0.25;
    speech[i] = Math.sin(2 * Math.PI * 1100 * t) * 0.06;
  }

  const rumbleOut = processTxMicFrame(rumble, sampleRate, 5);
  const speechLowComp = processTxMicFrame(speech, sampleRate, 5);
  const speechHighComp = processTxMicFrame(speech, sampleRate, 80);

  assert.equal(rumbleOut.pcm16.length, Math.floor(len / (sampleRate / 16000)));
  assert.ok(
    speechLowComp.rms > rumbleOut.rms,
    `Expected 1.1kHz speech (${speechLowComp.rms}) to exceed attenuated 80Hz rumble (${rumbleOut.rms})`
  );
  assert.ok(
    speechHighComp.rms > speechLowComp.rms,
    `Expected high compression (${speechHighComp.rms}) to raise speech talk power above low comp (${speechLowComp.rms})`
  );
});

test('normalizeIncomingRxVoipFrame levels quiet and hot remote mics smoothly within bounds', () => {
  const len = 512;
  const quiet = new Int16Array(len);
  const loud = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const tone = Math.sin(i * 0.25);
    quiet[i] = Math.round(tone * 1200);
    loud[i] = Math.round(tone * 28000);
  }

  const normQuiet = normalizeIncomingRxVoipFrame(quiet, 10, 0);
  const normLoud = normalizeIncomingRxVoipFrame(loud, 10, 0);

  const rms = (arr: Float32Array) => {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i];
    return Math.sqrt(s / arr.length);
  };

  const rQ = rms(normQuiet);
  const rL = rms(normLoud);
  assert.ok(rQ > 0.08 && rQ < 0.45);
  assert.ok(rL > 0.08 && rL < 0.45);
  assert.ok(Math.abs(rQ - rL) < 0.12, `Expected cross-platform normalized levels within 0.12, got ${rQ} vs ${rL}`);
});
