import { morseTimeline } from '../radio/physics';
import { shouldSampleBasebandSpectrum } from '../radio/waterfall';
import {
  encodeFt8Tones,
  generateSstvTestPattern,
  getJttyMarkSpaceFreqs,
  getRttyMarkSpaceFreqs,
  JttyCodecConfig,
  jttyMarkSpaceTimeline,
  RttyCodecConfig,
  rttyMarkSpaceTimeline,
  SSTV_HEIGHT,
  SSTV_WIDTH,
  synthesizeSstvAudioPcm,
} from '../radio/digitalModes';
import { RadioMode, SstvModeId } from '../types/radio';
import { isRetryableMicConstraintError, shouldUnlockAudioState } from '../utils/browserCompat';
import {
  applyNoiseBlankerBuffer,
  computeNoiseBlankerParams,
  createNoiseBlankerCurve,
} from './noiseBlanker';
import {
  computeCalibratedAfGain,
  computeRadioVoiceFilterParams,
  computeSidetoneGain,
  createDiodeSaturationCurve,
  normalizeIncomingRxVoipFrame,
  processTxMicFrame,
} from './voiceDsp';

export interface SdrAudioParams {
  afGainPct: number; // 0..100
  rfGainPct: number; // 0..100
  noiseReductionPct: number; // 0..100
  notchPct: number; // 0 = Off, 1..100 = active notch freq
  noiseBlankerPct: number; // 0 = Off, 1..100 = NB impulse blanking threshold
  filterWidthKhz: number; // 0.5..6.0
  mode: RadioMode;
  isTransmitting: boolean;
  audioEnabled: boolean;
  noiseFloorDbm: number;
  bestSignalSnrDb: number;
  bestSignalInPassband: boolean;
  auroraFlutter: number;
  compressionPct?: number; // 0..100
  isPoweredOn?: boolean;
}

export class SdrAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private sidetoneGain: GainNode | null = null;
  private rxHighpassFilter: BiquadFilterNode | null = null;
  private bandpassFilter: BiquadFilterNode | null = null;
  private rxLowpassFilter: BiquadFilterNode | null = null;
  private rxPresenceFilter: BiquadFilterNode | null = null;
  private rxVoiceShaper: WaveShaperNode | null = null;
  private rxAgcCompressor: DynamicsCompressorNode | null = null;
  private notchFilter: BiquadFilterNode | null = null;
  private noiseBlankerShaper: WaveShaperNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private impulseGain: GainNode | null = null;
  private impulseSource: AudioBufferSourceNode | null = null;
  private rxAnalyser: AnalyserNode | null = null;
  private txAnalyser: AnalyserNode | null = null;
  private micMonitorGain: GainNode | null = null;
  private fftScratch: Float32Array | null = null;
  private basebandBinsScratch: Float32Array = new Float32Array(96);

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private micSilentGain: GainNode | null = null;
  private micActive = false;
  private micRequestId = 0;
  private nextPlaybackTime = 0;

  private activeToneOsc: OscillatorNode | null = null;
  private activeToneGain: GainNode | null = null;
  private activeToneBufferSrc: AudioBufferSourceNode | null = null;
  private continuousLoopTimer: number | null = null;

  private toneTelemetry: {
    mode: 'IDLE' | 'CW' | 'RTTY' | 'JTTY' | 'SSTV' | 'FT8';
    markActive: boolean;
    freqHz: number;
    activeUntilMs: number;
  } = {
    mode: 'IDLE',
    markActive: true,
    freqHz: 0,
    activeUntilMs: 0,
  };
  private activeRttyPlayback: {
    mode: 'RTTY' | 'JTTY';
    startMs: number;
    endMs: number;
    segs: Array<{ endOffsetMs: number; freqHz: number; isMark: boolean }>;
  } | null = null;
  private activeCwPlayback: {
    startMs: number;
    endMs: number;
    segs: Array<{ endOffsetMs: number; on: boolean }>;
  } | null = null;
  private rxSignalActiveUntilMs = 0;

  private onMicLevel?: (db: number, alcPct: number) => void;
  private onPcmFrame?: (pcm16Base64: string, sampleRate: number, rms: number) => void;
  private onMicInterrupted?: () => void;
  private currentParams: SdrAudioParams = {
    afGainPct: 68,
    rfGainPct: 52,
    noiseReductionPct: 48,
    notchPct: 20,
    noiseBlankerPct: 0,
    filterWidthKhz: 2.4,
    mode: 'USB',
    isTransmitting: false,
    audioEnabled: true,
    noiseFloorDbm: -120,
    bestSignalSnrDb: 0,
    bestSignalInPassband: false,
    auroraFlutter: 0,
    compressionPct: 5,
    isPoweredOn: true,
  };

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.noiseBlankerShaper = this.ctx.createWaveShaper();
      this.noiseBlankerShaper.oversample = 'none';
      this.noiseBlankerShaper.curve = null;

      // Multi-stage communications receiver IF filter chain (320-2750 Hz SSB crystal roof + presence)
      this.rxHighpassFilter = this.ctx.createBiquadFilter();
      this.rxHighpassFilter.type = 'highpass';
      this.rxHighpassFilter.frequency.value = 340;
      this.rxHighpassFilter.Q.value = 1.45;

      this.bandpassFilter = this.ctx.createBiquadFilter();
      this.bandpassFilter.type = 'bandpass';
      this.bandpassFilter.frequency.value = 1350;
      this.bandpassFilter.Q.value = 1.1;

      this.rxLowpassFilter = this.ctx.createBiquadFilter();
      this.rxLowpassFilter.type = 'lowpass';
      this.rxLowpassFilter.frequency.value = 2550;
      this.rxLowpassFilter.Q.value = 1.75;

      this.rxPresenceFilter = this.ctx.createBiquadFilter();
      this.rxPresenceFilter.type = 'peaking';
      this.rxPresenceFilter.frequency.value = 1420;
      this.rxPresenceFilter.Q.value = 1.45;
      this.rxPresenceFilter.gain.value = 4.5;

      this.rxVoiceShaper = this.ctx.createWaveShaper();
      this.rxVoiceShaper.oversample = '2x';
      this.rxVoiceShaper.curve = createDiodeSaturationCurve(0.28);

      this.notchFilter = this.ctx.createBiquadFilter();
      this.notchFilter.type = 'notch';
      this.notchFilter.frequency.value = 1000;
      this.notchFilter.Q.value = 12;

      // Communications IF AGC stage normalizes quiet & loud voices across OS platforms before AF Gain
      this.rxAgcCompressor = this.ctx.createDynamicsCompressor();
      this.rxAgcCompressor.threshold.value = -24;
      this.rxAgcCompressor.knee.value = 14;
      this.rxAgcCompressor.ratio.value = 4.5;
      this.rxAgcCompressor.attack.value = 0.006;
      this.rxAgcCompressor.release.value = 0.16;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      // Brickwall safety output limiter protects mobile/desktop speakers at high AF Gain
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -2.5;
      this.masterLimiter.knee.value = 3;
      this.masterLimiter.ratio.value = 16;
      this.masterLimiter.attack.value = 0.002;
      this.masterLimiter.release.value = 0.12;

      // TX sidetone monitor bus obeys operator AF Gain & mute state consistently across all platforms
      this.sidetoneGain = this.ctx.createGain();
      this.sidetoneGain.gain.value = 0;

      this.rxAnalyser = this.ctx.createAnalyser();
      this.rxAnalyser.fftSize = 1024;
      this.rxAnalyser.smoothingTimeConstant = 0.62;
      this.rxAnalyser.minDecibels = -115;
      this.rxAnalyser.maxDecibels = -15;

      this.txAnalyser = this.ctx.createAnalyser();
      this.txAnalyser.fftSize = 1024;
      this.txAnalyser.smoothingTimeConstant = 0.55;
      this.txAnalyser.minDecibels = -115;
      this.txAnalyser.maxDecibels = -15;

      this.fftScratch = new Float32Array(this.rxAnalyser.frequencyBinCount);

      this.sidetoneGain.connect(this.txAnalyser);
      this.sidetoneGain.connect(this.masterLimiter);
      this.masterLimiter.connect(this.ctx.destination);

      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const impulseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      const impulseData = impulseBuffer.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let crackleEnv = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        const pink = (b0 + b1 + b2 + white * 0.1848) * 0.22;

        const mixed = white * 0.36 + pink * 0.44;
        data[i] = Math.max(-0.95, Math.min(0.95, mixed));

        // Sharp atmospheric QRN / ignition impulse bursts on dedicated bus for NB stage
        if (Math.random() < 0.0007) {
          crackleEnv = 0.55 + Math.random() * 0.45;
        }
        crackleEnv *= 0.92;
        impulseData[i] = crackleEnv > 0.02 ? crackleEnv * (Math.random() * 2 - 1) * 0.88 : 0;
      }

      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;

      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0.11;

      this.impulseSource = this.ctx.createBufferSource();
      this.impulseSource.buffer = impulseBuffer;
      this.impulseSource.loop = true;

      this.impulseGain = this.ctx.createGain();
      this.impulseGain.gain.value = 0.14;

      this.noiseSource.connect(this.noiseGain);
      this.noiseGain.connect(this.noiseBlankerShaper);
      this.impulseSource.connect(this.impulseGain);
      this.impulseGain.connect(this.noiseBlankerShaper);
      this.noiseBlankerShaper.connect(this.rxHighpassFilter);
      this.rxHighpassFilter.connect(this.bandpassFilter);
      this.bandpassFilter.connect(this.rxLowpassFilter);
      this.rxLowpassFilter.connect(this.rxPresenceFilter);
      this.rxPresenceFilter.connect(this.rxVoiceShaper);
      this.rxVoiceShaper.connect(this.notchFilter);
      this.notchFilter.connect(this.rxAgcCompressor);
      this.rxAgcCompressor.connect(this.rxAnalyser);
      this.rxAgcCompressor.connect(this.masterGain);
      this.masterGain.connect(this.masterLimiter);

      this.noiseSource.start();
      this.impulseSource.start();
      this.updateParams(this.currentParams);
    }

    if (shouldUnlockAudioState(this.ctx.state)) {
      void this.ctx
        .resume()
        .then(() => {
          this.updateParams(this.currentParams);
        })
        .catch(() => {});
    }
    return this.ctx;
  }

  public async resumeIfNeeded(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (shouldUnlockAudioState(ctx.state)) {
      try {
        await ctx.resume();
        this.updateParams(this.currentParams);
      } catch {
        return false;
      }
    }
    return ctx.state === 'running';
  }

  public setTransmitting(tx: boolean) {
    if (tx) {
      this.rxSignalActiveUntilMs = 0;
    } else if (this.micActive || this.micStream) {
      this.stopMicrophone();
    }
    this.updateParams({ ...this.currentParams, isTransmitting: tx });
  }

  public updateParams(next: SdrAudioParams) {
    if ((!next.isTransmitting || next.isPoweredOn === false) && (this.micActive || this.micStream)) {
      this.stopMicrophone();
    }
    if (next.isPoweredOn === false || !next.audioEnabled) {
      this.rxSignalActiveUntilMs = 0;
    }
    this.currentParams = next;
    if (!this.ctx || !this.masterGain || !this.bandpassFilter || !this.notchFilter || !this.noiseGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const powered = next.isPoweredOn ?? true;
    const af = computeCalibratedAfGain(next.afGainPct, next.audioEnabled, powered, next.isTransmitting);
    this.masterGain.gain.setTargetAtTime(af, now, 0.02);

    if (this.sidetoneGain) {
      const side = computeSidetoneGain(next.afGainPct, next.audioEnabled, powered);
      this.sidetoneGain.gain.setTargetAtTime(side, now, 0.015);
    }

    const voiceParams = computeRadioVoiceFilterParams(next.mode, next.filterWidthKhz);
    if (this.rxHighpassFilter) {
      this.rxHighpassFilter.frequency.setTargetAtTime(voiceParams.highpassHz, now, 0.025);
      this.rxHighpassFilter.Q.setTargetAtTime(voiceParams.highpassQ, now, 0.025);
    }
    this.bandpassFilter.frequency.setTargetAtTime(voiceParams.bandpassCenterHz, now, 0.025);
    this.bandpassFilter.Q.setTargetAtTime(voiceParams.bandpassQ, now, 0.025);
    if (this.rxLowpassFilter) {
      this.rxLowpassFilter.frequency.setTargetAtTime(voiceParams.lowpassHz, now, 0.025);
      this.rxLowpassFilter.Q.setTargetAtTime(voiceParams.lowpassQ, now, 0.025);
    }
    if (this.rxPresenceFilter) {
      this.rxPresenceFilter.frequency.setTargetAtTime(voiceParams.presenceFreqHz, now, 0.025);
      this.rxPresenceFilter.Q.setTargetAtTime(voiceParams.presenceQ, now, 0.025);
      this.rxPresenceFilter.gain.setTargetAtTime(voiceParams.presenceGainDb, now, 0.025);
    }
    if (this.rxVoiceShaper) {
      this.rxVoiceShaper.curve =
        voiceParams.voiceSaturationAmount > 0
          ? createDiodeSaturationCurve(voiceParams.voiceSaturationAmount)
          : null;
    }

    if (next.notchPct <= 0) {
      this.notchFilter.Q.setTargetAtTime(0.001, now, 0.03);
      this.notchFilter.frequency.setTargetAtTime(18000, now, 0.03);
    } else {
      this.notchFilter.Q.setTargetAtTime(14, now, 0.03);
      this.notchFilter.frequency.setTargetAtTime(300 + (next.notchPct / 100) * 2500, now, 0.03);
    }

    const rfScale = 0.25 + (next.rfGainPct / 100) * 1.1;
    const nrAttenuation = 1 - (next.noiseReductionPct / 100) * 0.8;
    const bandNoiseScale = Math.max(0.7, Math.min(1.55, 1 + (next.noiseFloorDbm + 118) / 30));
    const modeHissBoost = next.mode === 'FM' ? 1.35 : next.mode === 'CW' ? 0.75 : 0.95;
    const agcDuck = next.bestSignalInPassband && next.bestSignalSnrDb > 10 ? 0.48 : 1.0;
    const targetNoise = powered
      ? 0.16 * rfScale * nrAttenuation * bandNoiseScale * modeHissBoost * agcDuck
      : 0;
    this.noiseGain.gain.setTargetAtTime(targetNoise, now, 0.05);

    const nbParams = computeNoiseBlankerParams(next.noiseBlankerPct);
    if (this.noiseBlankerShaper) {
      this.noiseBlankerShaper.curve = createNoiseBlankerCurve(nbParams.pct);
    }
    if (this.impulseGain) {
      const targetImpulse = powered
        ? 0.2 * rfScale * bandNoiseScale * agcDuck * nbParams.impulseAttenuation
        : 0;
      this.impulseGain.gain.setTargetAtTime(targetImpulse, now, 0.03);
    }
  }

  public getDiagnostics() {
    const nb = computeNoiseBlankerParams(this.currentParams.noiseBlankerPct);
    const voiceParams = computeRadioVoiceFilterParams(
      this.currentParams.mode,
      this.currentParams.filterWidthKhz
    );
    return {
      hasContext: Boolean(this.ctx),
      contextState: this.ctx?.state ?? 'uninitialized',
      afGainPct: this.currentParams.afGainPct,
      audioEnabled: this.currentParams.audioEnabled,
      masterGain: this.masterGain?.gain.value ?? 0,
      sidetoneGain: this.sidetoneGain?.gain.value ?? 0,
      noiseGain: this.noiseGain?.gain.value ?? 0,
      impulseGain: this.impulseGain?.gain.value ?? 0,
      rxHighpassHz: voiceParams.highpassHz,
      rxLowpassHz: voiceParams.lowpassHz,
      rxPresenceGainDb: voiceParams.presenceGainDb,
      voiceShaperActive: voiceParams.voiceSaturationAmount > 0,
      noiseBlankerPct: nb.pct,
      noiseBlankerActive: nb.active,
      noiseBlankerThreshold: nb.gateThreshold,
    };
  }

  public async startMicrophone(
    onMicLevel: (db: number, alcPct: number) => void,
    onPcmFrame: (pcm16Base64: string, sampleRate: number, rms: number) => void,
    options?: { shouldContinue?: () => boolean; onInterrupted?: () => void }
  ): Promise<{ ok: boolean; error?: string }> {
    this.onMicLevel = onMicLevel;
    this.onPcmFrame = onPcmFrame;
    this.onMicInterrupted = options?.onInterrupted;

    if (!this.currentParams.isTransmitting || (options?.shouldContinue && !options.shouldContinue())) {
      this.stopMicrophone();
      return { ok: false, error: 'Microphone capture blocked while receiving (RX)' };
    }

    if (this.micActive && this.micStream) {
      return { ok: true };
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'Microphone API unavailable in this browser context' };
    }

    const requestId = ++this.micRequestId;

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (constraintErr) {
        const errName = constraintErr instanceof Error ? constraintErr.name : undefined;
        if (!isRetryableMicConstraintError(errName)) {
          throw constraintErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const stillValid =
        requestId === this.micRequestId &&
        this.currentParams.isTransmitting &&
        (!options?.shouldContinue || options.shouldContinue());

      if (!stillValid) {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, error: 'PTT released before microphone stream initialized' };
      }

      const ctx = this.ensureContext();
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, error: 'Web Audio unavailable' };
      }
      if (shouldUnlockAudioState(ctx.state)) {
        try {
          await ctx.resume();
        } catch {
          // Proceed; processor will start once user audio context runs
        }
      }

      this.micStream = stream;
      for (const track of stream.getTracks()) {
        track.onended = () => {
          if (this.micStream === stream) {
            this.stopMicrophone();
            this.onMicInterrupted?.();
          }
        };
      }

      this.micSource = ctx.createMediaStreamSource(stream);
      this.micProcessor = ctx.createScriptProcessor(2048, 1, 1);

      const targetRate = 16000;

      this.micProcessor.onaudioprocess = (ev) => {
        if (!this.micActive || !this.currentParams.isTransmitting || this.currentParams.isPoweredOn === false) {
          return;
        }
        const input = ev.inputBuffer.getChannelData(0);
        const processed = processTxMicFrame(
          input,
          ctx.sampleRate,
          this.currentParams.compressionPct ?? 5,
          targetRate
        );
        this.onMicLevel?.(processed.db, processed.alcPct);

        const bytes = new Uint8Array(processed.pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        this.onPcmFrame?.(btoa(binary), targetRate, processed.rms);
      };

      const silent = ctx.createGain();
      silent.gain.value = 0;
      this.micSilentGain = silent;
      this.micSource.connect(this.micProcessor);
      if (this.txAnalyser) {
        this.micMonitorGain = ctx.createGain();
        this.micMonitorGain.gain.value = 1.0;
        this.micSource.connect(this.micMonitorGain);
        this.micMonitorGain.connect(this.txAnalyser);
      }
      this.micProcessor.connect(silent);
      silent.connect(ctx.destination);

      this.micActive = true;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Microphone permission denied',
      };
    }
  }

  public stopMicrophone() {
    this.micRequestId += 1;
    this.micActive = false;
    if (this.micProcessor) {
      this.micProcessor.onaudioprocess = null;
      this.micProcessor.disconnect();
    }
    this.micSource?.disconnect();
    this.micMonitorGain?.disconnect();
    this.micSilentGain?.disconnect();
    this.micStream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.micProcessor = null;
    this.micSource = null;
    this.micMonitorGain = null;
    this.micSilentGain = null;
    this.micStream = null;
  }

  public playIncomingVoipPcm(params: {
    pcm16Base64: string;
    sampleRate: number;
    snrDb: number;
    auroraFlutter: number;
    freqOffsetHz: number;
    inPassband: boolean;
  }) {
    if (
      !this.currentParams.audioEnabled ||
      this.currentParams.isPoweredOn === false ||
      this.currentParams.isTransmitting ||
      !params.inPassband
    ) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.bandpassFilter || ctx.state !== 'running') return;

    const binary = atob(params.pcm16Base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    if (int16.length === 0) return;

    const float32 = normalizeIncomingRxVoipFrame(int16, params.snrDb, params.auroraFlutter);
    const nbResult = applyNoiseBlankerBuffer(float32, this.currentParams.noiseBlankerPct);
    const buffer = ctx.createBuffer(1, nbResult.output.length, params.sampleRate || 16000);
    buffer.getChannelData(0).set(nbResult.output);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const detuneCents = Math.max(-600, Math.min(600, params.freqOffsetHz * 0.35));
    src.detune.value = detuneCents;

    src.connect(this.noiseBlankerShaper ?? this.rxHighpassFilter ?? this.bandpassFilter);
    src.onended = () => {
      src.disconnect();
    };

    const now = ctx.currentTime;
    if (this.nextPlaybackTime < now || this.nextPlaybackTime > now + 0.35) {
      this.nextPlaybackTime = now + 0.02;
    }
    src.start(this.nextPlaybackTime);
    this.nextPlaybackTime += buffer.duration;
    this.rxSignalActiveUntilMs = Math.max(
      this.rxSignalActiveUntilMs,
      Date.now() + Math.round(buffer.duration * 1000) + 120
    );
  }

  public getToneTelemetry() {
    const now = Date.now();
    if (this.activeCwPlayback && now <= this.activeCwPlayback.endMs) {
      const elapsed = Math.max(0, now - this.activeCwPlayback.startMs);
      const segs = this.activeCwPlayback.segs;
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (segs[mid].endOffsetMs < elapsed) lo = mid + 1;
        else hi = mid;
      }
      const cur = segs[lo] ?? segs[segs.length - 1];
      return {
        mode: 'CW' as const,
        markActive: cur ? cur.on : true,
        freqHz: this.toneTelemetry.freqHz || 720,
      };
    }
    if (this.activeRttyPlayback && now <= this.activeRttyPlayback.endMs) {
      const elapsed = Math.max(0, now - this.activeRttyPlayback.startMs);
      const segs = this.activeRttyPlayback.segs;
      // Binary search current FSK bit segment
      let lo = 0;
      let hi = segs.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (segs[mid].endOffsetMs < elapsed) lo = mid + 1;
        else hi = mid;
      }
      const cur = segs[lo] ?? segs[segs.length - 1];
      return {
        mode: this.activeRttyPlayback.mode,
        markActive: cur ? cur.isMark : true,
        freqHz: cur ? cur.freqHz : 2125,
      };
    }
    if (now > this.toneTelemetry.activeUntilMs) {
      return { mode: 'IDLE' as const, markActive: true, freqHz: 0 };
    }
    return {
      mode: this.toneTelemetry.mode,
      markActive: this.toneTelemetry.markActive,
      freqHz: this.toneTelemetry.freqHz,
    };
  }

  /**
   * Reads live Web Audio FFT spectrum across 0..maxAudioHz (in dBFS) without allocations.
   */
  public getBasebandSpectrum(targetBins = 96, maxAudioHz = 3600): {
    active: boolean;
    isTx: boolean;
    binsDb: Float32Array;
    maxAudioHz: number;
  } {
    if (this.basebandBinsScratch.length !== targetBins) {
      this.basebandBinsScratch = new Float32Array(targetBins);
    }
    const ctx = this.ctx;
    const isTx = this.currentParams.isTransmitting;
    const analyser = isTx ? this.txAnalyser : this.rxAnalyser;

    if (
      !ctx ||
      ctx.state !== 'running' ||
      !analyser ||
      !this.fftScratch ||
      !shouldSampleBasebandSpectrum(isTx, Date.now(), this.rxSignalActiveUntilMs)
    ) {
      this.basebandBinsScratch.fill(-120);
      return { active: false, isTx, binsDb: this.basebandBinsScratch, maxAudioHz };
    }

    if (this.fftScratch.length !== analyser.frequencyBinCount) {
      this.fftScratch = new Float32Array(analyser.frequencyBinCount);
    }
    analyser.getFloatFrequencyData(this.fftScratch as Float32Array<ArrayBuffer>);

    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    for (let i = 0; i < targetBins; i++) {
      const f0 = (i / targetBins) * maxAudioHz;
      const f1 = ((i + 1) / targetBins) * maxAudioHz;
      const k0 = Math.max(1, Math.floor(f0 / hzPerBin));
      const k1 = Math.min(this.fftScratch.length - 1, Math.max(k0, Math.ceil(f1 / hzPerBin)));
      let peakDb = -120;
      for (let k = k0; k <= k1; k++) {
        const val = this.fftScratch[k];
        if (Number.isFinite(val) && val > peakDb) {
          peakDb = val;
        }
      }
      this.basebandBinsScratch[i] = peakDb;
    }

    return {
      active: true,
      isTx,
      binsDb: this.basebandBinsScratch,
      maxAudioHz,
    };
  }

  private clearContinuousLoop() {
    if (this.continuousLoopTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.continuousLoopTimer);
      this.continuousLoopTimer = null;
    }
  }

  public stopMorseSequence() {
    this.clearContinuousLoop();
    this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
    this.activeRttyPlayback = null;
    this.activeCwPlayback = null;
    if (!this.currentParams.isTransmitting) {
      this.rxSignalActiveUntilMs = 0;
    }
    if (this.activeToneGain && this.ctx) {
      try {
        this.activeToneGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.activeToneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.004);
      } catch {
        // Ignore already-stopped node errors
      }
    }
    if (this.activeToneOsc) {
      try {
        this.activeToneOsc.stop(this.ctx ? this.ctx.currentTime + 0.02 : undefined);
      } catch {
        // Ignore already-stopped oscillator
      }
    }
    if (this.activeToneBufferSrc) {
      try {
        this.activeToneBufferSrc.stop(this.ctx ? this.ctx.currentTime + 0.02 : undefined);
      } catch {
        // Ignore already-stopped source
      }
    }
    this.activeToneOsc = null;
    this.activeToneGain = null;
    this.activeToneBufferSrc = null;
  }

  private scheduleTimedSequence(
    run: (ctx: AudioContext, dest: AudioNode) => void,
    isSidetone: boolean
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const execute = () => {
      const dest = isSidetone
        ? this.sidetoneGain ?? ctx.destination
        : this.rxHighpassFilter ?? this.bandpassFilter ?? this.masterGain ?? ctx.destination;
      run(ctx, dest);
    };

    if (shouldUnlockAudioState(ctx.state)) {
      void ctx.resume().then(execute).catch(() => {});
    } else {
      execute();
    }
  }

  /**
   * Plays synthesized CW Morse sidetone (on TX) or RX station audio.
   */
  public playMorseSequence(
    text: string,
    wpm: number,
    pitchHz = 720,
    gainLevel = 0.28,
    isSidetone = false
  ) {
    const timeline = morseTimeline(text, wpm);
    if (timeline.length === 0) return;

    this.stopMorseSequence();
    this.scheduleTimedSequence((ctx, dest) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = pitchHz;
      g.gain.value = 0;

      osc.connect(g);
      g.connect(dest);

      this.activeToneOsc = osc;
      this.activeToneGain = g;

      let t = ctx.currentTime + 0.02;
      const startT = t;
      let totalMs = 0;
      const indexedSegs: Array<{ endOffsetMs: number; on: boolean }> = [];
      for (const ev of timeline) {
        const dur = ev.durationMs / 1000;
        g.gain.setTargetAtTime(ev.on ? gainLevel : 0, t, 0.004);
        t += dur;
        totalMs += ev.durationMs;
        indexedSegs.push({ endOffsetMs: totalMs, on: ev.on });
      }
      g.gain.setTargetAtTime(0, t, 0.004);

      const nowMs = Date.now() + 20;
      this.activeCwPlayback = {
        startMs: nowMs,
        endMs: nowMs + totalMs + 80,
        segs: indexedSegs,
      };
      this.toneTelemetry = {
        mode: 'CW',
        markActive: true,
        freqHz: pitchHz,
        activeUntilMs: nowMs + totalMs + 80,
      };
      if (!isSidetone) {
        this.rxSignalActiveUntilMs = Math.max(this.rxSignalActiveUntilMs, nowMs + totalMs + 80);
      }

      osc.onended = () => {
        if (this.activeToneOsc === osc) {
          this.activeToneOsc = null;
          this.activeToneGain = null;
          this.activeCwPlayback = null;
          this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
        }
        osc.disconnect();
        g.disconnect();
      };
      osc.start(startT);
      osc.stop(t + 0.05);
    }, isSidetone);
  }

  /**
   * Plays authentic configurable FSK RTTY tone stream (start + 5 Baudot bits + 1.5 stop).
   */
  public playRttySequence(
    text: string,
    gainLevel = 0.18,
    isSidetone = false,
    config: Partial<RttyCodecConfig> = {}
  ) {
    const segs = rttyMarkSpaceTimeline(text, config);
    if (segs.length === 0) return;

    const { markHz } = getRttyMarkSpaceFreqs(config);
    this.stopMorseSequence();
    this.scheduleTimedSequence((ctx, dest) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = markHz;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(dest);

      this.activeToneOsc = osc;
      this.activeToneGain = g;

      let t = ctx.currentTime + 0.02;
      const startT = t;
      let totalMs = 0;
      const indexedSegs: Array<{ endOffsetMs: number; freqHz: number; isMark: boolean }> = [];
      g.gain.setTargetAtTime(gainLevel, startT, 0.005);

      for (const seg of segs) {
        osc.frequency.setValueAtTime(seg.freqHz, t);
        totalMs += seg.durationMs;
        indexedSegs.push({ endOffsetMs: totalMs, freqHz: seg.freqHz, isMark: seg.isMark });
        t += seg.durationMs / 1000;
      }

      const nowMs = Date.now() + 20;
      this.activeRttyPlayback = {
        mode: 'RTTY',
        startMs: nowMs,
        endMs: nowMs + totalMs + 80,
        segs: indexedSegs,
      };
      this.toneTelemetry = {
        mode: 'RTTY',
        markActive: true,
        freqHz: markHz,
        activeUntilMs: nowMs + totalMs + 80,
      };
      if (!isSidetone) {
        this.rxSignalActiveUntilMs = Math.max(this.rxSignalActiveUntilMs, nowMs + totalMs + 80);
      }
      g.gain.setTargetAtTime(0, t, 0.006);

      osc.onended = () => {
        if (this.activeToneOsc === osc) {
          this.activeToneOsc = null;
          this.activeToneGain = null;
          this.activeRttyPlayback = null;
          this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
        }
        osc.disconnect();
        g.disconnect();
      };
      osc.start(startT);
      osc.stop(t + 0.05);
    }, isSidetone);
  }

  /**
   * Plays authentic 6-unit JIS/Latin JTTY FSK tone stream (start + 6 data bits + 1.5 stop).
   */
  public playJttySequence(
    text: string,
    gainLevel = 0.18,
    isSidetone = false,
    config: Partial<JttyCodecConfig> = {}
  ) {
    const segs = jttyMarkSpaceTimeline(text, config);
    if (segs.length === 0) return;

    const { markHz } = getJttyMarkSpaceFreqs(config);
    this.stopMorseSequence();
    this.scheduleTimedSequence((ctx, dest) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = markHz;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(dest);

      this.activeToneOsc = osc;
      this.activeToneGain = g;

      let t = ctx.currentTime + 0.02;
      const startT = t;
      let totalMs = 0;
      const indexedSegs: Array<{ endOffsetMs: number; freqHz: number; isMark: boolean }> = [];
      g.gain.setTargetAtTime(gainLevel, startT, 0.005);

      for (const seg of segs) {
        osc.frequency.setValueAtTime(seg.freqHz, t);
        totalMs += seg.durationMs;
        indexedSegs.push({ endOffsetMs: totalMs, freqHz: seg.freqHz, isMark: seg.isMark });
        t += seg.durationMs / 1000;
      }

      const nowMs = Date.now() + 20;
      this.activeRttyPlayback = {
        mode: 'JTTY',
        startMs: nowMs,
        endMs: nowMs + totalMs + 80,
        segs: indexedSegs,
      };
      this.toneTelemetry = {
        mode: 'JTTY',
        markActive: true,
        freqHz: markHz,
        activeUntilMs: nowMs + totalMs + 80,
      };
      if (!isSidetone) {
        this.rxSignalActiveUntilMs = Math.max(this.rxSignalActiveUntilMs, nowMs + totalMs + 80);
      }
      g.gain.setTargetAtTime(0, t, 0.006);

      osc.onended = () => {
        if (this.activeToneOsc === osc) {
          this.activeToneOsc = null;
          this.activeToneGain = null;
          this.activeRttyPlayback = null;
          this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
        }
        osc.disconnect();
        g.disconnect();
      };
      osc.start(startT);
      osc.stop(t + 0.05);
    }, isSidetone);
  }

  /**
   * Plays 8-FSK FT8 tone sequence (base audio freq + 6.25 Hz * toneIndex).
   */
  public playFt8Sequence(tones: number[], baseFreqHz = 1250, gainLevel = 0.24, isSidetone = false) {
    if (tones.length === 0) return;

    this.stopMorseSequence();
    this.scheduleTimedSequence((ctx, dest) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = baseFreqHz + tones[0] * 6.25;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(dest);

      this.activeToneOsc = osc;
      this.activeToneGain = g;

      let t = ctx.currentTime + 0.02;
      const startT = t;
      const symSec = 0.055; // Compressed audio monitor cadence for responsive operator feedback
      osc.frequency.setValueAtTime(baseFreqHz + tones[0] * 6.25, startT);
      g.gain.setTargetAtTime(gainLevel, startT, 0.006);

      for (const toneIdx of tones) {
        osc.frequency.setValueAtTime(baseFreqHz + toneIdx * 6.25, t);
        t += symSec;
      }
      g.gain.setTargetAtTime(0, t, 0.008);

      const totalMs = tones.length * symSec * 1000;
      this.toneTelemetry = {
        mode: 'FT8',
        markActive: true,
        freqHz: baseFreqHz,
        activeUntilMs: Date.now() + totalMs + 80,
      };
      if (!isSidetone) {
        this.rxSignalActiveUntilMs = Math.max(this.rxSignalActiveUntilMs, Date.now() + totalMs + 80);
      }

      osc.onended = () => {
        if (this.activeToneOsc === osc) {
          this.activeToneOsc = null;
          this.activeToneGain = null;
          this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
        }
        osc.disconnect();
        g.disconnect();
      };
      osc.start(startT);
      osc.stop(t + 0.06);
    }, isSidetone);
  }

  /**
   * Plays authentic image-derived SSTV audio (1900/1200 Hz VIS header + 1200 Hz sync + 1500..2300 Hz RGB scanlines).
   */
  public playSstvSequenceFromRgb(
    rgb: Uint8Array,
    width: number,
    height: number,
    sstvMode: SstvModeId = 'Robot 36',
    durationMs = 2800,
    gainLevel = 0.2,
    isSidetone = false
  ) {
    this.stopMorseSequence();
    this.scheduleTimedSequence((ctx, dest) => {
      const sampleRate = 24000;
      const pcm = synthesizeSstvAudioPcm(rgb, width, height, sstvMode, sampleRate, 3);
      const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
      buffer.getChannelData(0).set(pcm);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const naturalMs = (pcm.length / sampleRate) * 1000;
      const rate = Math.max(0.5, Math.min(2.2, naturalMs / Math.max(800, durationMs)));
      src.playbackRate.value = rate;

      const g = ctx.createGain();
      const now = ctx.currentTime + 0.02;
      g.gain.setValueAtTime(0.001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.02, gainLevel), now + 0.04);

      src.connect(g);
      g.connect(dest);
      this.activeToneBufferSrc = src;
      this.activeToneGain = g;
      this.toneTelemetry = {
        mode: 'SSTV',
        markActive: true,
        freqHz: 1900,
        activeUntilMs: Date.now() + durationMs,
      };
      if (!isSidetone) {
        this.rxSignalActiveUntilMs = Math.max(this.rxSignalActiveUntilMs, Date.now() + durationMs + 80);
      }

      src.onended = () => {
        if (this.activeToneBufferSrc === src) {
          this.activeToneBufferSrc = null;
          this.activeToneGain = null;
          this.toneTelemetry = { mode: 'IDLE', markActive: true, freqHz: 0, activeUntilMs: 0 };
        }
        src.disconnect();
        g.disconnect();
      };
      src.start(now);
      src.stop(now + durationMs / 1000 + 0.05);
    }, isSidetone);
  }

  /**
   * Plays fallback SSTV calibration + chirp sequence when no pixel array is supplied.
   */
  public playSstvSequence(durationMs = 2600, gainLevel = 0.16, isSidetone = false) {
    const empty = new Uint8Array(64 * 48 * 3);
    for (let i = 0; i < empty.length; i += 3) {
      empty[i] = 40;
      empty[i + 1] = 160;
      empty[i + 2] = 220;
    }
    this.playSstvSequenceFromRgb(empty, 64, 48, 'Robot 36', durationMs, gainLevel, isSidetone);
  }

  public playTuneTone(durationMs = 900) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 780;
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.14, now + 0.05);
    g.gain.setValueAtTime(0.14, now + durationMs / 1000 - 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.connect(g);
    g.connect(this.sidetoneGain ?? ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  /**
   * Plays continuous TX sidetone when PTT/Hold/Spacebar is engaged in CW, RTTY, SSTV, or FT8 mode.
   */
  public startContinuousModeTxTone(
    mode: RadioMode,
    rttyConfig: Partial<RttyCodecConfig> = {},
    callsign = 'DX'
  ) {
    if (mode !== 'CW' && mode !== 'RTTY' && mode !== 'SSTV' && mode !== 'FT8') {
      return;
    }

    this.stopMorseSequence();

    if (mode === 'CW') {
      this.scheduleTimedSequence((ctx, dest) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 720;
        const now = ctx.currentTime + 0.01;
        g.gain.setValueAtTime(0, now);
        g.gain.setTargetAtTime(0.28, now, 0.006);
        osc.connect(g);
        g.connect(dest);
        this.activeToneOsc = osc;
        this.activeToneGain = g;
        this.toneTelemetry = {
          mode: 'CW',
          markActive: true,
          freqHz: 720,
          activeUntilMs: Date.now() + 3600_000,
        };
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
        osc.start(now);
      }, true);
      return;
    }

    if (mode === 'RTTY') {
      const diddle = `RYRYRY DE ${callsign} `;
      const segs = rttyMarkSpaceTimeline(diddle, rttyConfig);
      let loopMs = 0;
      for (const s of segs) loopMs += s.durationMs;
      const playBurst = () => {
        this.playRttySequence(diddle, 0.24, true, rttyConfig);
      };
      // Trigger immediately and loop cleanly while PTT stays held
      playBurst();
      if (typeof window !== 'undefined' && loopMs > 200) {
        this.continuousLoopTimer = window.setInterval(playBurst, Math.max(400, Math.round(loopMs)));
      }
      return;
    }

    if (mode === 'SSTV') {
      this.scheduleTimedSequence((ctx, dest) => {
        const sampleRate = 24000;
        const pattern = generateSstvTestPattern('bars', SSTV_WIDTH, SSTV_HEIGHT);
        const pcm = synthesizeSstvAudioPcm(pattern, SSTV_WIDTH, SSTV_HEIGHT, 'Robot 36', sampleRate, 3);
        const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
        buffer.getChannelData(0).set(pcm);

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.playbackRate.value = 1.65;

        const g = ctx.createGain();
        const now = ctx.currentTime + 0.01;
        g.gain.setValueAtTime(0.001, now);
        g.gain.exponentialRampToValueAtTime(0.22, now + 0.04);

        src.connect(g);
        g.connect(dest);
        this.activeToneBufferSrc = src;
        this.activeToneGain = g;
        this.toneTelemetry = {
          mode: 'SSTV',
          markActive: true,
          freqHz: 1900,
          activeUntilMs: Date.now() + 3600_000,
        };
        src.onended = () => {
          src.disconnect();
          g.disconnect();
        };
        src.start(now);
      }, true);
      return;
    }

    // FT8 continuous 8-FSK Costas + payload tone burst while PTT is held
    const tones = encodeFt8Tones(`CQ ${callsign} IO91`);
    const playFt8Burst = () => {
      this.playFt8Sequence(tones, 1250, 0.24, true);
    };
    playFt8Burst();
    if (typeof window !== 'undefined') {
      this.continuousLoopTimer = window.setInterval(playFt8Burst, tones.length * 55 + 120);
    }
  }

  public dispose() {
    this.stopMorseSequence();
    this.stopMicrophone();
    this.noiseSource?.stop();
    this.impulseSource?.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
