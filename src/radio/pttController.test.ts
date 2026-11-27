import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAutomatedTx,
  beginPttHold,
  beginPttLatch,
  canCaptureAudio,
  endAutomatedTx,
  endPttHold,
  getMicBadgeVisual,
  INITIAL_PTT_MIC_STATE,
  PttStopReason,
  resolvePttMicStart,
  setPowerState,
  togglePttLatch,
} from './pttController';

test('microphone starts inactive by default in RX', () => {
  assert.equal(INITIAL_PTT_MIC_STATE.isTransmitting, false);
  assert.equal(INITIAL_PTT_MIC_STATE.pttHeld, false);
  assert.equal(INITIAL_PTT_MIC_STATE.pttLatched, false);
  assert.equal(INITIAL_PTT_MIC_STATE.micCapturing, false);
  assert.equal(canCaptureAudio(INITIAL_PTT_MIC_STATE), false);
});

test('microphone activates only while PTT is pressed and held and deactivates immediately on release', () => {
  const held = beginPttHold(INITIAL_PTT_MIC_STATE);
  assert.equal(held.isTransmitting, true);
  assert.equal(held.pttHeld, true);
  assert.equal(held.micCapturing, false);

  const granted = resolvePttMicStart(held, held.sessionId, true);
  assert.equal(granted.shouldStopStreamImmediately, false);
  assert.equal(granted.nextState.micCapturing, true);
  assert.equal(canCaptureAudio(granted.nextState), true);

  const released = endPttHold(granted.nextState, 'pointerup');
  assert.equal(released.isTransmitting, false);
  assert.equal(released.pttHeld, false);
  assert.equal(released.micCapturing, false);
  assert.equal(canCaptureAudio(released), false);
});

test('releasing PTT while getUserMedia is pending immediately stops the late stream and keeps mic off', () => {
  const held = beginPttHold(INITIAL_PTT_MIC_STATE);
  const pendingSessionId = held.sessionId;

  // User releases PTT before browser resolves getUserMedia
  const releasedEarly = endPttHold(held, 'pointerleave');
  assert.equal(releasedEarly.isTransmitting, false);
  assert.equal(releasedEarly.pttHeld, false);

  // Stale getUserMedia resolves afterwards
  const lateResolution = resolvePttMicStart(releasedEarly, pendingSessionId, true);
  assert.equal(lateResolution.shouldStopStreamImmediately, true);
  assert.equal(lateResolution.nextState.micCapturing, false);
  assert.equal(canCaptureAudio(lateResolution.nextState), false);
});

test('all accidental release, focus loss, and browser interruption reasons stop TX and mic capture', () => {
  const reasons: PttStopReason[] = [
    'pointerup',
    'pointerleave',
    'pointercancel',
    'lostpointercapture',
    'button_blur',
    'contextmenu',
    'keyup',
    'window_blur',
    'visibility_hidden',
    'pagehide',
    'power_off',
    'mic_ended',
  ];

  for (const reason of reasons) {
    const held = beginPttHold(INITIAL_PTT_MIC_STATE);
    const active = resolvePttMicStart(held, held.sessionId, true).nextState;
    assert.equal(canCaptureAudio(active), true);
    const stopped = endPttHold(active, reason);
    assert.equal(stopped.isTransmitting, false, `Expected RX after ${reason}`);
    assert.equal(stopped.pttHeld, false, `Expected pttHeld=false after ${reason}`);
    assert.equal(stopped.micCapturing, false, `Expected micCapturing=false after ${reason}`);
    assert.equal(canCaptureAudio(stopped), false);
  }
});

test('powering off stops active PTT and prevents starting PTT while off', () => {
  const held = beginPttHold(INITIAL_PTT_MIC_STATE);
  const active = resolvePttMicStart(held, held.sessionId, true).nextState;
  const poweredOff = setPowerState(active, false);
  assert.equal(poweredOff.isPoweredOn, false);
  assert.equal(poweredOff.isTransmitting, false);
  assert.equal(poweredOff.micCapturing, false);

  const attemptWhileOff = beginPttHold(poweredOff);
  assert.equal(attemptWhileOff.isTransmitting, false);
  assert.equal(attemptWhileOff.pttHeld, false);
});

test('automated digital TX never captures microphone audio in background', () => {
  const tx = beginAutomatedTx(INITIAL_PTT_MIC_STATE);
  assert.equal(tx.isTransmitting, true);
  assert.equal(tx.pttHeld, false);
  assert.equal(tx.micCapturing, false);
  assert.equal(canCaptureAudio(tx), false);

  const rx = endAutomatedTx(tx);
  assert.equal(rx.isTransmitting, false);
  assert.equal(rx.micCapturing, false);
});

test('PTT latch locks TX and mic active until toggled off or powered off', () => {
  const latched = beginPttLatch(INITIAL_PTT_MIC_STATE);
  assert.equal(latched.isTransmitting, true);
  assert.equal(latched.pttLatched, true);
  assert.equal(latched.pttHeld, false);

  const active = resolvePttMicStart(latched, latched.sessionId, true).nextState;
  assert.equal(canCaptureAudio(active), true);

  // Automated TX end does not drop a latched operator PTT
  const stillLatched = endAutomatedTx(active);
  assert.equal(stillLatched.isTransmitting, true);
  assert.equal(stillLatched.pttLatched, true);

  // Toggling latch returns safely to RX
  const unlatched = togglePttLatch(stillLatched);
  assert.equal(unlatched.isTransmitting, false);
  assert.equal(unlatched.pttLatched, false);
  assert.equal(unlatched.micCapturing, false);
  assert.equal(canCaptureAudio(unlatched), false);

  // Power off also clears latch safely
  const reLatched = togglePttLatch(unlatched);
  const off = setPowerState(reLatched, false);
  assert.equal(off.isTransmitting, false);
  assert.equal(off.pttLatched, false);
});

test('mic visual badge accurately reflects RX, TX Mic Live, and digital TX states', () => {
  assert.deepEqual(getMicBadgeVisual(true, false, false, 'USB'), {
    label: 'RX · Mic Off',
    isMicLive: false,
    isTx: false,
  });
  assert.deepEqual(getMicBadgeVisual(true, true, true, 'USB'), {
    label: 'TX · Mic Live',
    isMicLive: true,
    isTx: true,
  });
  assert.deepEqual(getMicBadgeVisual(true, true, false, 'CW'), {
    label: 'CW TX',
    isMicLive: false,
    isTx: true,
  });
  assert.deepEqual(getMicBadgeVisual(true, true, true, 'FT8'), {
    label: 'FT8 · Mic Live',
    isMicLive: true,
    isTx: true,
  });
});
