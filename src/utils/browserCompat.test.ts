import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWebSocketUrl,
  computeWheelStepDirection,
  generateFallbackClientId,
  isRetryableMicConstraintError,
  shouldReleasePttOnPointerLeave,
  shouldUnlockAudioState,
} from './browserCompat';

test('shouldUnlockAudioState detects Safari/iOS suspended and interrupted states', () => {
  assert.equal(shouldUnlockAudioState('suspended'), true);
  assert.equal(shouldUnlockAudioState('interrupted'), true);
  assert.equal(shouldUnlockAudioState('running'), false);
  assert.equal(shouldUnlockAudioState('closed'), false);
  assert.equal(shouldUnlockAudioState(undefined), false);
});

test('isRetryableMicConstraintError allows fallback only for constraint/support errors, not permission denial', () => {
  assert.equal(isRetryableMicConstraintError('OverconstrainedError'), true);
  assert.equal(isRetryableMicConstraintError('ConstraintNotSatisfiedError'), true);
  assert.equal(isRetryableMicConstraintError('NotSupportedError'), true);
  assert.equal(isRetryableMicConstraintError('NotAllowedError'), false);
  assert.equal(isRetryableMicConstraintError('SecurityError'), false);
});

test('computeWheelStepDirection normalizes Mac trackpads, Firefox lines, and mouse wheels', () => {
  assert.equal(computeWheelStepDirection(-120, 0), 1);
  assert.equal(computeWheelStepDirection(120, 0), -1);
  assert.equal(computeWheelStepDirection(-3, 1), 1);
  assert.equal(computeWheelStepDirection(0, 0), 0);
  assert.equal(computeWheelStepDirection(0.2, 0), 0);
});

test('shouldReleasePttOnPointerLeave preserves touch hold capture on iOS/Android while releasing uncaptured mouse leave', () => {
  assert.equal(shouldReleasePttOnPointerLeave('touch', true), false);
  assert.equal(shouldReleasePttOnPointerLeave('touch', false), false);
  assert.equal(shouldReleasePttOnPointerLeave('mouse', true), false);
  assert.equal(shouldReleasePttOnPointerLeave('mouse', false), true);
});

test('buildWebSocketUrl and generateFallbackClientId work across HTTP/HTTPS and older contexts', () => {
  assert.equal(buildWebSocketUrl({ protocol: 'https:', host: 'example.com' }), 'wss://example.com/ws');
  assert.equal(buildWebSocketUrl({ protocol: 'http:', host: 'localhost:3000' }, 'ws'), 'ws://localhost:3000/ws');
  const id = generateFallbackClientId();
  assert.ok(typeof id === 'string' && id.length >= 8);
});
