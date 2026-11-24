import { morseTimeline } from '../radio/physics';
import { RadioMode } from '../types/radio';

export interface SdrAudioParams {
  afGainPct: number; // 0..100
  rfGainPct: number; // 0..100
  noiseReductionPct: number; // 0..100
  notchPct: number; // 0 = Off, 1..100 = active notch freq
  filterWidthKhz: number; // 0.5..6.0
  mode: RadioMode;
  isTransmitting: boolean;
  audioEnabled: boolean;
  noiseFloorDbm: number;
  bestSignalSnrDb: number;
  bestSignalInPassband: boolean;
  auroraFlutter: number;
}

export class SdrAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bandpassFilter: BiquadFilterNode | null = null;
  private notchFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private micActive = false;
  private nextPlaybackTime = 0;
  private activeCwOsc: OscillatorNode | null = null;
  private activeCwGain: GainNode | null = null;

  private onMicLevel?: (db: number, alcPct: number) => void;
  private onPcmFrame?: (pcm16Base64: string, sampleRate: number, rms: number) => void;
  private currentParams: SdrAudioParams = {
    afGainPct: 68,
    rfGainPct: 52,
    noiseReductionPct: 48,
    notchPct: 0,
    filterWidthKhz: 2.4,
    mode: 'USB',
    isTransmitting: false,
    audioEnabled: false,
    noiseFloorDbm: -120,
    bestSignalSnrDb: 0,
    bestSignalInPassband: false,
    auroraFlutter: 0,
  };

  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.bandpassFilter = this.ctx.createBiquadFilter();
      this.bandpassFilter.type = 'bandpass';
      this.bandpassFilter.frequency.value = 1350;
      this.bandpassFilter.Q.value = 1.1;

      this.notchFilter = this.ctx.createBiquadFilter();
      this.notchFilter.type = 'notch';
      this.notchFilter.frequency.value = 1000;
      this.notchFilter.Q.value = 12;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0;

      // Realistic HF radio noise buffer (4 seconds):
      // Blend crisp white noise (IF thermal hiss) with warm pink QRN & sparse static ticks
      const bufferSize = this.ctx.sampleRate * 4;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
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

        // Occasional tiny ionospheric static impulses (QRN)
        if (Math.random() < 0.00045) {
          crackleEnv = 0.45 + Math.random() * 0.55;
        }
        crackleEnv *= 0.965;
        const crackle = crackleEnv * (Math.random() * 2 - 1) * 0.65;

        // Blend white thermal hiss + pink atmospheric noise + subtle QRN crackles
        const mixed = white * 0.42 + pink * 0.48 + crackle;
        data[i] = Math.max(-0.95, Math.min(0.95, mixed));
      }

      this.noiseSource = this.ctx.createBufferSource();
      this.noiseSource.buffer = noiseBuffer;
      this.noiseSource.loop = true;

      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0.14;

      this.noiseSource.connect(this.noiseGain);
      this.noiseGain.connect(this.bandpassFilter);
      this.bandpassFilter.connect(this.notchFilter);
      this.notchFilter.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.noiseSource.start();
      this.updateParams(this.currentParams);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().then(() => {
        this.updateParams(this.currentParams);
      });
    }
    return this.ctx;
  }

  public updateParams(next: SdrAudioParams) {
    this.currentParams = next;
    if (!this.ctx || !this.masterGain || !this.bandpassFilter || !this.notchFilter || !this.noiseGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const af = next.audioEnabled && !next.isTransmitting ? Math.pow(next.afGainPct / 100, 1.35) * 0.72 : 0;
    this.masterGain.gain.setTargetAtTime(af, now, 0.03);

    // Filter width shapes center freq & Q (CW = sharp 750 Hz peak, SSB = crisp voice passband, FM = wide open)
    const bwHz = Math.max(350, Math.min(6000, next.filterWidthKhz * 1000));
    const centerHz = next.mode === 'CW' ? 750 : next.mode === 'FM' ? 1800 : 320 + bwHz * 0.42;
    const q = next.mode === 'FM' ? 0.6 : Math.max(0.65, Math.min(7.5, centerHz / Math.max(250, bwHz * 0.72)));
    this.bandpassFilter.frequency.setTargetAtTime(centerHz, now, 0.03);
    this.bandpassFilter.Q.setTargetAtTime(q, now, 0.03);

    // Notch filter: 0 = bypass (high Q outside band), 1..100 = 300..2800 Hz
    if (next.notchPct <= 0) {
      this.notchFilter.Q.setTargetAtTime(0.001, now, 0.03);
      this.notchFilter.frequency.setTargetAtTime(18000, now, 0.03);
    } else {
      this.notchFilter.Q.setTargetAtTime(14, now, 0.03);
      this.notchFilter.frequency.setTargetAtTime(300 + (next.notchPct / 100) * 2500, now, 0.03);
    }

    // White noise level scales with RF gain, band QRN floor (-126..-102 dBm), FM squelch hiss, and Noise Reduction
    const rfScale = 0.25 + (next.rfGainPct / 100) * 1.15;
    const nrAttenuation = 1 - (next.noiseReductionPct / 100) * 0.78;
    const bandNoiseScale = Math.max(0.75, Math.min(1.65, 1 + (next.noiseFloorDbm + 118) / 28));
    const modeHissBoost = next.mode === 'FM' ? 1.45 : next.mode === 'CW' ? 0.85 : 1.0;
    const agcDuck = next.bestSignalInPassband && next.bestSignalSnrDb > 14 ? 0.55 : 1.0;
    const targetNoise = 0.24 * rfScale * nrAttenuation * bandNoiseScale * modeHissBoost * agcDuck;
    this.noiseGain.gain.setTargetAtTime(targetNoise, now, 0.05);
  }

  public getDiagnostics() {
    return {
      hasContext: Boolean(this.ctx),
      contextState: this.ctx?.state ?? 'uninitialized',
      masterGain: this.masterGain?.gain.value ?? 0,
      noiseGain: this.noiseGain?.gain.value ?? 0,
    };
  }

  public async startMicrophone(
    onMicLevel: (db: number, alcPct: number) => void,
    onPcmFrame: (pcm16Base64: string, sampleRate: number, rms: number) => void
  ): Promise<{ ok: boolean; error?: string }> {
    this.onMicLevel = onMicLevel;
    this.onPcmFrame = onPcmFrame;

    const ctx = this.ensureContext();
    if (!ctx) return { ok: false, error: 'Web Audio unavailable' };

    if (this.micActive && this.micStream) {
      return { ok: true };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, error: 'Microphone API unavailable in this browser context' };
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.micSource = ctx.createMediaStreamSource(this.micStream);
      this.micProcessor = ctx.createScriptProcessor(2048, 1, 1);

      const targetRate = 16000;
      const ratio = ctx.sampleRate / targetRate;

      this.micProcessor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        const db = rms > 0.0001 ? Math.max(-55, Math.min(0, 20 * Math.log10(rms))) : -55;
        const alcPct = Math.min(100, Math.round(rms * 240));
        this.onMicLevel?.(Number(db.toFixed(1)), alcPct);

        if (!this.currentParams.isTransmitting) return;

        // Downsample Float32 -> Int16 @ 16 kHz
        const outLen = Math.floor(input.length / ratio);
        const pcm16 = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        }
        const bytes = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        this.onPcmFrame?.(btoa(binary), targetRate, rms);
      };

      // Connect through silent monitor gain so processor runs without howling
      const silent = ctx.createGain();
      silent.gain.value = 0;
      this.micSource.connect(this.micProcessor);
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
    this.micActive = false;
    this.micProcessor?.disconnect();
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micProcessor = null;
    this.micSource = null;
    this.micStream = null;
  }

  /**
   * Plays an incoming VOIP PCM16 frame attenuated & distorted by real RF propagation physics.
   */
  public playIncomingVoipPcm(params: {
    pcm16Base64: string;
    sampleRate: number;
    snrDb: number;
    auroraFlutter: number;
    freqOffsetHz: number;
    inPassband: boolean;
  }) {
    if (!this.currentParams.audioEnabled || this.currentParams.isTransmitting || !params.inPassband) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.bandpassFilter) return;

    const binary = atob(params.pcm16Base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    const snrGain = Math.max(0.06, Math.min(1.15, (params.snrDb + 8) / 34));
    const flutterDepth = params.auroraFlutter;

    for (let i = 0; i < int16.length; i++) {
      let s = int16[i] / 32768;
      if (flutterDepth > 0.05) {
        const mod = 1 - flutterDepth * 0.55 * (0.5 + 0.5 * Math.sin(i * 0.065));
        s *= mod;
      }
      float32[i] = s * snrGain;
    }

    const buffer = ctx.createBuffer(1, float32.length, params.sampleRate || 16000);
    buffer.copyToChannel(float32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // Slight detune / pitch shift if off-frequency in USB/LSB
    const detuneCents = Math.max(-900, Math.min(900, params.freqOffsetHz * 0.45));
    src.detune.value = detuneCents;

    src.connect(this.bandpassFilter);

    const now = ctx.currentTime;
    if (this.nextPlaybackTime < now || this.nextPlaybackTime > now + 0.35) {
      this.nextPlaybackTime = now + 0.025;
    }
    src.start(this.nextPlaybackTime);
    this.nextPlaybackTime += buffer.duration;
  }

  public stopMorseSequence() {
    if (this.activeCwGain && this.ctx) {
      try {
        this.activeCwGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.activeCwGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.004);
      } catch {
        // Ignore already-stopped node errors
      }
    }
    if (this.activeCwOsc) {
      try {
        this.activeCwOsc.stop(this.ctx ? this.ctx.currentTime + 0.02 : undefined);
      } catch {
        // Ignore already-stopped oscillator
      }
    }
    this.activeCwOsc = null;
    this.activeCwGain = null;
  }

  /**
   * Plays synthesized CW Morse sidetone or beacon audio.
   */
  public playMorseSequence(text: string, wpm: number, pitchHz = 700, gainLevel = 0.25) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    this.stopMorseSequence();

    const dest = this.currentParams.isTransmitting ? ctx.destination : this.bandpassFilter ?? ctx.destination;
    const timeline = morseTimeline(text, wpm);
    if (timeline.length === 0) return;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = pitchHz;
    g.gain.value = 0;

    osc.connect(g);
    g.connect(dest);

    this.activeCwOsc = osc;
    this.activeCwGain = g;

    let t = ctx.currentTime + 0.02;
    const startT = t;
    for (const ev of timeline) {
      const dur = ev.durationMs / 1000;
      if (ev.on) {
        g.gain.setTargetAtTime(gainLevel, t, 0.004);
      } else {
        g.gain.setTargetAtTime(0, t, 0.004);
      }
      t += dur;
    }
    g.gain.setTargetAtTime(0, t, 0.004);
    osc.onended = () => {
      if (this.activeCwOsc === osc) {
        this.activeCwOsc = null;
        this.activeCwGain = null;
      }
      osc.disconnect();
      g.disconnect();
    };
    osc.start(startT);
    osc.stop(t + 0.05);
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
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.05);
    g.gain.setValueAtTime(0.12, now + durationMs / 1000 - 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  public dispose() {
    this.stopMorseSequence();
    this.stopMicrophone();
    this.noiseSource?.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
