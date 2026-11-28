import { RadioMode } from '../types/radio';

export type PttStopReason =
  | 'pointerup'
  | 'pointerleave'
  | 'pointercancel'
  | 'lostpointercapture'
  | 'button_blur'
  | 'contextmenu'
  | 'keyup'
  | 'window_blur'
  | 'visibility_hidden'
  | 'pagehide'
  | 'power_off'
  | 'mic_ended'
  | 'manual_rx';

export interface PttMicState {
  isPoweredOn: boolean;
  isTransmitting: boolean;
  pttHeld: boolean;
  pttLatched: boolean;
  micCapturing: boolean;
  sessionId: number;
}

export interface MicResolutionResult {
  nextState: PttMicState;
  shouldStopStreamImmediately: boolean;
}

export interface MicBadgeVisual {
  label: string;
  isMicLive: boolean;
  isTx: boolean;
}

export const INITIAL_PTT_MIC_STATE: PttMicState = {
  isPoweredOn: true,
  isTransmitting: false,
  pttHeld: false,
  pttLatched: false,
  micCapturing: false,
  sessionId: 0,
};

export const STARTUP_TRANSCEIVER_STATE = {
  isPoweredOn: true,
  audioEnabled: true,
} as const;

export function createStartupPttMicState(): PttMicState {
  return {
    ...INITIAL_PTT_MIC_STATE,
    isPoweredOn: STARTUP_TRANSCEIVER_STATE.isPoweredOn,
    isTransmitting: false,
    pttHeld: false,
    pttLatched: false,
    micCapturing: false,
  };
}

export function canCaptureAudio(state: PttMicState): boolean {
  return (
    state.isPoweredOn &&
    state.isTransmitting &&
    (state.pttHeld || state.pttLatched) &&
    state.micCapturing
  );
}

export function beginPttHold(state: PttMicState): PttMicState {
  if (!state.isPoweredOn) {
    return {
      ...state,
      isTransmitting: false,
      pttHeld: false,
      pttLatched: false,
      micCapturing: false,
    };
  }
  if ((state.pttHeld || state.pttLatched) && state.isTransmitting) {
    return state;
  }
  return {
    ...state,
    isTransmitting: true,
    pttHeld: true,
    pttLatched: false,
    micCapturing: false,
    sessionId: state.sessionId + 1,
  };
}

export function beginPttLatch(state: PttMicState): PttMicState {
  if (!state.isPoweredOn) {
    return {
      ...state,
      isTransmitting: false,
      pttHeld: false,
      pttLatched: false,
      micCapturing: false,
    };
  }
  if (state.pttLatched && state.isTransmitting) {
    return state;
  }
  return {
    ...state,
    isTransmitting: true,
    pttHeld: false,
    pttLatched: true,
    micCapturing: state.pttHeld ? state.micCapturing : false,
    sessionId: state.pttHeld ? state.sessionId : state.sessionId + 1,
  };
}

export function togglePttLatch(state: PttMicState): PttMicState {
  if (!state.isPoweredOn) {
    return {
      ...state,
      isTransmitting: false,
      pttHeld: false,
      pttLatched: false,
      micCapturing: false,
    };
  }
  if (state.pttLatched && state.isTransmitting) {
    return endPttHold(state, 'manual_rx');
  }
  return beginPttLatch(state);
}

export function resolvePttMicStart(
  state: PttMicState,
  requestSessionId: number,
  granted: boolean
): MicResolutionResult {
  const stillActiveSameSession =
    state.isPoweredOn &&
    state.isTransmitting &&
    (state.pttHeld || state.pttLatched) &&
    state.sessionId === requestSessionId;

  if (!granted || !stillActiveSameSession) {
    return {
      nextState: {
        ...state,
        micCapturing: false,
      },
      shouldStopStreamImmediately: granted && !stillActiveSameSession,
    };
  }

  return {
    nextState: {
      ...state,
      micCapturing: true,
    },
    shouldStopStreamImmediately: false,
  };
}

export function endPttHold(state: PttMicState, _reason: PttStopReason): PttMicState {
  return {
    ...state,
    isTransmitting: false,
    pttHeld: false,
    pttLatched: false,
    micCapturing: false,
    sessionId: state.sessionId + 1,
  };
}

export function setPowerState(state: PttMicState, isPoweredOn: boolean): PttMicState {
  if (!isPoweredOn) {
    return {
      isPoweredOn: false,
      isTransmitting: false,
      pttHeld: false,
      pttLatched: false,
      micCapturing: false,
      sessionId: state.sessionId + 1,
    };
  }
  return {
    ...state,
    isPoweredOn: true,
  };
}

export function beginAutomatedTx(state: PttMicState): PttMicState {
  if (!state.isPoweredOn) return state;
  return {
    ...state,
    isTransmitting: true,
    pttHeld: false,
    pttLatched: false,
    micCapturing: false,
    sessionId: state.sessionId + 1,
  };
}

export function endAutomatedTx(state: PttMicState): PttMicState {
  if (state.pttHeld || state.pttLatched) return state;
  return {
    ...state,
    isTransmitting: false,
    pttHeld: false,
    pttLatched: false,
    micCapturing: false,
    sessionId: state.sessionId + 1,
  };
}

export function getMicBadgeVisual(
  isPoweredOn: boolean,
  isTransmitting: boolean,
  micActive: boolean,
  mode: RadioMode
): MicBadgeVisual {
  const isDigital = mode === 'CW' || mode === 'RTTY' || mode === 'SSTV' || mode === 'FT8';
  if (!isPoweredOn) {
    return { label: 'Off', isMicLive: false, isTx: false };
  }
  if (!isTransmitting) {
    return { label: 'RX · Mic Off', isMicLive: false, isTx: false };
  }
  if (micActive) {
    return {
      label: isDigital ? `${mode} · Mic Live` : 'TX · Mic Live',
      isMicLive: true,
      isTx: true,
    };
  }
  return {
    label: isDigital ? `${mode} TX` : 'TX · Mic Off',
    isMicLive: false,
    isTx: true,
  };
}
