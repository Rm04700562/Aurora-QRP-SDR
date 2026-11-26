import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNoiseBlankerBuffer,
  computeNoiseBlankerParams,
  createNoiseBlankerCurve,
  NOISE_BLANKER_CURVE_SIZE,
} from './noiseBlanker';

test('computeNoiseBlankerParams disables blanking at 0 and tightens threshold up to 100', () => {
  const off = computeNoiseBlankerParams(0);
  assert.equal(off.active, false);
  assert.equal(off.gateThreshold, 1);
  assert.equal(off.impulseAttenuation, 1);

  const low = computeNoiseBlankerParams(25);
  const high = computeNoiseBlankerParams(90);
  assert.equal(low.active, true);
  assert.equal(high.active, true);
  assert.ok(high.gateThreshold < low.gateThreshold);
  assert.ok(high.impulseAttenuation < low.impulseAttenuation);
});

test('createNoiseBlankerCurve preserves small signals linearly and blanks high-amplitude spikes', () => {
  assert.equal(createNoiseBlankerCurve(0), null);

  const curve = createNoiseBlankerCurve(70);
  assert.ok(curve !== null);
  assert.equal(curve.length, NOISE_BLANKER_CURVE_SIZE);

  const mid = (NOISE_BLANKER_CURVE_SIZE - 1) / 2;
  assert.equal(curve[mid], 0);

  // Small signal at +0.1 should pass through linearly
  const lowIdx = mid + Math.round(0.1 * mid);
  assert.ok(Math.abs(curve[lowIdx] - 0.1) < 0.01);

  // Extreme impulse at +0.98 should be heavily blanked near zero
  const peakIdx = NOISE_BLANKER_CURVE_SIZE - 1;
  assert.ok(Math.abs(curve[peakIdx]) < 0.05);
});

test('applyNoiseBlankerBuffer suppresses sharp impulse spikes without distorting steady sine signal', () => {
  const n = 256;
  const clean = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    clean[i] = 0.12 * Math.sin(i * 0.15);
  }

  // With clean steady sine and moderate threshold, no samples should be blanked
  const cleanRes = applyNoiseBlankerBuffer(clean, 50, 0.085);
  assert.equal(cleanRes.blankedCount, 0);
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(cleanRes.output[i] - clean[i]) < 1e-6);
  }

  // Inject two sharp impulse interference spikes
  const noisy = new Float32Array(clean);
  noisy[64] = 0.94;
  noisy[180] = -0.92;

  const blankedRes = applyNoiseBlankerBuffer(noisy, 75, 0.085);
  assert.ok(blankedRes.blankedCount >= 2);
  assert.ok(Math.abs(blankedRes.output[64]) < 0.15);
  assert.ok(Math.abs(blankedRes.output[180]) < 0.15);
});
