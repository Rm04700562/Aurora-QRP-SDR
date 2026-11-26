export function shouldUnlockAudioState(state: string | undefined | null): boolean {
  return state === 'suspended' || state === 'interrupted';
}

export function isRetryableMicConstraintError(errorName?: string | null): boolean {
  return (
    errorName === 'OverconstrainedError' ||
    errorName === 'ConstraintNotSatisfiedError' ||
    errorName === 'NotSupportedError' ||
    errorName === 'TypeError'
  );
}

export function computeWheelStepDirection(deltaY: number, deltaMode = 0): -1 | 0 | 1 {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  // Normalize precision trackpad sub-pixel noise while preserving wheel detents
  const scaled = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 120 : deltaY;
  if (Math.abs(scaled) < 1) return 0;
  return scaled < 0 ? 1 : -1;
}

export function shouldReleasePttOnPointerLeave(
  pointerType: string,
  hasPointerCapture: boolean
): boolean {
  if (hasPointerCapture) return false;
  return pointerType === 'mouse' || pointerType === '';
}

export function buildWebSocketUrl(
  loc: { protocol: string; host: string },
  path = '/ws'
): string {
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${proto}//${loc.host}${cleanPath}`;
}

export function generateFallbackClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
