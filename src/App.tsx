import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SdrAudioEngine } from './audio/sdrAudioEngine';
import { AdminPanelModal } from './components/AdminPanelModal';
import { AnalogMeter } from './components/AnalogMeter';
import { BeginnerGuideModal } from './components/BeginnerGuideModal';
import { CallsignRegistryModal } from './components/CallsignRegistryModal';
import { CenterModeSwitcher } from './components/CenterModeSwitcher';
import { DspControlPanel } from './components/DspControlPanel';
import { HeaderBar } from './components/HeaderBar';
import { LeftControlColumn } from './components/LeftControlColumn';
import { PropagationModal } from './components/PropagationModal';
import { PttMicPanel } from './components/PttMicPanel';
import { QsoLogModal } from './components/QsoLogModal';
import { SpeakerGrille } from './components/SpeakerGrille';
import { StationSettingsModal } from './components/StationSettingsModal';
import { VfoDeck } from './components/VfoDeck';
import { WorldMapPanel } from './components/WorldMapPanel';
import { estimateQthFromTimeZone } from './radio/azimuthalMap';
import { ARRL_NEWS_BEACON } from './radio/beacons';
import { WaterfallSignalBurst } from './radio/waterfall';
import {
  decodeBase64ToRgb,
  DEFAULT_JTTY_CONFIG,
  DEFAULT_RTTY_CONFIG,
  detectCountryFromTimeZone,
  encodeFt8Tones,
  formatHrCallsign,
  getHrCountrySpec,
  jttyDurationMs,
  parseFt8Message,
  resolveGridForCallsign,
  rttyDurationMs,
  sanitizeFt8Message,
  sanitizeJttyText,
  sanitizeRttyText,
  SSTV_HEIGHT,
  SSTV_MODE_SPECS,
  SSTV_WIDTH,
} from './radio/digitalModes';
import {
  calculateBearingDeg,
  clampFrequencyToBand,
  computeHourlyPropagationSnapshot,
  computePowerAmpOutput,
  computeSwr,
  computeTxSMeterReading,
  dbmToNormalizedMeter,
  dbmToSMeterText,
  DEFAULT_TX_POWER_W,
  evaluateBandCondition,
  evaluateRemoteSignal,
  findBandForFrequency,
  getAntennaSpec,
  getBandSpec,
  hasSendableMorse,
  isSameFrequencyAndPropagationOpen,
  isSwrHigh,
  maidenheadFromLatLon,
  MAX_PA_POWER_W,
  MAX_TX_POWER_W,
  MIN_TX_POWER_W,
  morseDurationMs,
  PaGainDb,
  sanitizeCwText,
  stepMeterNeedleNormalized,
  stepRotorToward,
} from './radio/physics';
import {
  beginAutomatedTx,
  beginPttHold,
  canCaptureAudio,
  createStartupPttMicState,
  endAutomatedTx,
  endPttHold,
  PttMicState,
  PttStopReason,
  resolvePttMicStart,
  setPowerState,
  STARTUP_TRANSCEIVER_STATE,
  togglePttLatch,
} from './radio/pttController';
import {
  AdminNotice,
  AntennaId,
  BandId,
  CallsignRecord,
  DigitalFeedLine,
  DxClusterSpot,
  Ft8DecodedLine,
  JttyConfig,
  PropagationConditions,
  QsoEntry,
  QthLocation,
  RadioMode,
  RemoteStation,
  RttyConfig,
  SstvFramePayload,
  SstvModeId,
  StepSizeHz,
  TuneSpeed,
  WorkspaceModuleTab,
} from './types/radio';
import { buildWebSocketUrl, generateFallbackClientId } from './utils/browserCompat';

const STATION_STORAGE_KEY = 'aurora_qrp_station_v1';
const RADIO_ID_STORAGE_KEY = 'aurora_radio_id_v1';
const DEFAULT_QTH: QthLocation = { lat: -33.9249, lon: 18.4241, grid: 'JF96' };

interface SavedStationProfile {
  callsign?: string;
  callsignPermanent?: boolean;
  qth?: QthLocation;
  qthExplicit?: boolean;
  txPowerW?: number;
  powerVersion?: number;
  compressionPct?: number;
}

function getOrCreateRadioId(): string {
  if (typeof window === 'undefined') return 'radio-ssr';
  try {
    const existing = window.localStorage.getItem(RADIO_ID_STORAGE_KEY);
    if (existing && existing.length >= 6) return existing;
    const created = generateFallbackClientId();
    window.localStorage.setItem(RADIO_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return generateFallbackClientId();
  }
}

function loadSavedStationProfile(): SavedStationProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedStationProfile;
  } catch {
    return null;
  }
}

function saveStationProfile(profile: SavedStationProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATION_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function nowUtcTimeShort(): string {
  const d = new Date();
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}${String(
    d.getUTCSeconds()
  ).padStart(2, '0')}`;
}

function nowUtcStamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function App() {
  const radioId = useMemo(() => getOrCreateRadioId(), []);
  const initialSaved = useMemo(() => loadSavedStationProfile(), []);
  const initialIdentity = useMemo(() => {
    if (initialSaved?.callsign) {
      let savedQth = initialSaved.qth ?? DEFAULT_QTH;
      if (initialSaved.callsign.toUpperCase() === 'ZS1ROM' && savedQth.grid === 'KG43') {
        savedQth = DEFAULT_QTH;
        saveStationProfile({ ...initialSaved, qth: DEFAULT_QTH, qthExplicit: true });
      }
      return {
        callsign: initialSaved.callsign,
        callsignPermanent: Boolean(initialSaved.callsignPermanent),
        qth: savedQth,
      };
    }
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const countryCode = detectCountryFromTimeZone(tz || '');
    const spec = getHrCountrySpec(countryCode);
    const num = 100 + Math.floor(Math.random() * 899);
    const provisionalCall = `${spec.division}SWL${num}`;
    const nextQth = initialSaved?.qth ?? spec.defaultQth;
    saveStationProfile({ callsign: provisionalCall, callsignPermanent: false });
    return { callsign: provisionalCall, callsignPermanent: false, qth: nextQth };
  }, [initialSaved]);

  // Station identity & network
  const [callsign, setCallsign] = useState(initialIdentity.callsign);
  const [callsignPermanent, setCallsignPermanent] = useState(initialIdentity.callsignPermanent);
  const [qth, setQth] = useState<QthLocation>(initialIdentity.qth);
  const [serverId, setServerId] = useState('global');
  const [groupId, setGroupId] = useState('open-hf');
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [clientId, setClientId] = useState<string>('');
  const [remotePeers, setRemotePeers] = useState<RemoteStation[]>([]);
  const [allGlobalStations, setAllGlobalStations] = useState<RemoteStation[]>([]);
  const [callsignDirectory, setCallsignDirectory] = useState<CallsignRecord[]>([]);

  // VFO & Radio State
  const [activeVfo, setActiveVfo] = useState<'A' | 'B'>('A');
  const [vfoAFreqHz, setVfoAFreqHz] = useState(14_250_000);
  const [vfoBFreqHz, setVfoBFreqHz] = useState(7_090_000);
  const [activeBand, setActiveBand] = useState<BandId>('20m');
  const [mode, setMode] = useState<RadioMode>('USB');
  const [activeModuleTab, setActiveModuleTab] = useState<WorkspaceModuleTab>('waterfall');
  const activeModuleTabRef = useRef(activeModuleTab);
  activeModuleTabRef.current = activeModuleTab;
  const [ritHz, setRitHz] = useState(0);
  const [xitHz, setXitHz] = useState(0);
  const [clarifierHz, setClarifierHz] = useState(0);
  const [stepHz, setStepHz] = useState<StepSizeHz>(10);
  const [tuneSpeed, setTuneSpeed] = useState<TuneSpeed>('Fine');

  // Antenna, Rotor & ATU
  const [antennaId, setAntennaId] = useState<AntennaId>('yagi5');
  const [rotorHeadingDeg, setRotorHeadingDeg] = useState(142);
  const [rotorTargetDeg, setRotorTargetDeg] = useState(142);
  const [atuMatchFactor, setAtuMatchFactor] = useState(0);
  const [isTuningAtu, setIsTuningAtu] = useState(false);

  // DSP & Audio
  const [filterWidthKhz, setFilterWidthKhz] = useState(2.4);
  const [rfGainPct, setRfGainPct] = useState(52);
  const [afGainPct, setAfGainPct] = useState(68);
  const [noiseReductionPct, setNoiseReductionPct] = useState(48);
  const [notchPct, setNotchPct] = useState(20);
  const [noiseBlankerPct, setNoiseBlankerPct] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(STARTUP_TRANSCEIVER_STATE.audioEnabled);
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const [isPoweredOn, setIsPoweredOn] = useState<boolean>(STARTUP_TRANSCEIVER_STATE.isPoweredOn);
  const isPoweredOnRef = useRef(isPoweredOn);
  isPoweredOnRef.current = isPoweredOn;

  // Scope Controls
  const [spanKhz, setSpanKhz] = useState(50);
  const [zoom, setZoom] = useState(1);

  // TX / PTT / Mic / Keyer (up to 100W RF, 15W startup default; mic strictly inactive in RX)
  const pttMicRef = useRef<PttMicState>(createStartupPttMicState());
  const [isTransmitting, setIsTransmitting] = useState(false);
  const isTransmittingRef = useRef(isTransmitting);
  isTransmittingRef.current = isTransmitting;
  const [pttHeld, setPttHeld] = useState(false);
  const [pttLatched, setPttLatched] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micLevelDb, setMicLevelDb] = useState(-55.0);
  const [micRms, setMicRms] = useState(0);
  const micRmsRef = useRef(micRms);
  micRmsRef.current = micRms;
  const [alcPct, setAlcPct] = useState(12);
  const [compressionPct, setCompressionPct] = useState(initialSaved?.compressionPct ?? 5);
  const [txPowerW, setTxPowerW] = useState(DEFAULT_TX_POWER_W);
  const [paEnabled, setPaEnabled] = useState(false);
  const [paGainDb, setPaGainDb] = useState<PaGainDb>(10);
  const [txSMeterState, setTxSMeterState] = useState<{ text: string; normalized: number } | null>(null);

  // CW State
  const [cwWpm, setCwWpm] = useState(15);
  const [cwDecodeEnabled, setCwDecodeEnabled] = useState(true);
  const [cwDecodedText, setCwDecodedText] = useState('READY FOR LIVE CW RX / TX');
  const [cwTextInput, setCwTextInput] = useState('');
  const [isSendingCw, setIsSendingCw] = useState(false);
  const isSendingCwRef = useRef(isSendingCw);
  isSendingCwRef.current = isSendingCw;
  const [cwTxProgress, setCwTxProgress] = useState(0);
  const [cwFeed, setCwFeed] = useState<DigitalFeedLine[]>([]);
  const cwEndTimerRef = useRef<number | null>(null);
  const cwProgressTimerRef = useRef<number | null>(null);

  // RTTY / JTTY / SSTV / FT8 State
  const [rttyConfig, setRttyConfig] = useState<RttyConfig>(DEFAULT_RTTY_CONFIG);
  const rttyConfigRef = useRef(rttyConfig);
  rttyConfigRef.current = rttyConfig;
  const [rttyFeed, setRttyFeed] = useState<DigitalFeedLine[]>([]);
  const [isSendingRtty, setIsSendingRtty] = useState(false);
  const [jttyConfig, setJttyConfig] = useState<JttyConfig>(DEFAULT_JTTY_CONFIG);
  const jttyConfigRef = useRef(jttyConfig);
  jttyConfigRef.current = jttyConfig;
  const [jttyFeed, setJttyFeed] = useState<DigitalFeedLine[]>([]);
  const [isSendingJtty, setIsSendingJtty] = useState(false);
  const [sstvRxFrame, setSstvRxFrame] = useState<SstvFramePayload | null>(null);
  const [sstvRxProgress, setSstvRxProgress] = useState(0);
  const [sstvRxStats, setSstvRxStats] = useState<{
    visDetected: boolean;
    syncLocks: number;
    sourceLabel: string;
  } | null>(null);
  const [sstvGallery, setSstvGallery] = useState<SstvFramePayload[]>([]);
  const [isSendingSstv, setIsSendingSstv] = useState(false);
  const [sstvTxProgress, setSstvTxProgress] = useState(0);
  const [ft8Log, setFt8Log] = useState<Ft8DecodedLine[]>([]);
  const [isSendingFt8, setIsSendingFt8] = useState(false);
  const digitalTimerRef = useRef<number | null>(null);
  const digitalProgressRef = useRef<number | null>(null);
  const sstvRxSweepRef = useRef<number | null>(null);

  // Live DX Cluster & Admin State
  const [clusterSpots, setClusterSpots] = useState<DxClusterSpot[]>([]);
  const [adminToken, setAdminToken] = useState<string | null>(null); // In-memory only
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const [removedBanner, setRemovedBanner] = useState<string | null>(null);

  // Propagation & Logbook & Modals
  const [propagation, setPropagation] = useState<PropagationConditions>(() =>
    computeHourlyPropagationSnapshot(Date.now())
  );
  const [isRefreshingHourlyProp, setIsRefreshingHourlyProp] = useState(false);
  const [qsos, setQsos] = useState<QsoEntry[]>([]);
  const [showPropModal, setShowPropModal] = useState(false);
  const [showQsoModal, setShowQsoModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLearnModal, setShowLearnModal] = useState(false);
  const [showCallsignModal, setShowCallsignModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Beginner Learning Progress
  const [checklist, setChecklist] = useState({
    tunedBand: false,
    rotatedAntenna: false,
    checkedPropagation: false,
    transmittedOrCw: false,
    loggedQso: false,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioEngineRef = useRef<SdrAudioEngine | null>(null);
  if (!audioEngineRef.current && typeof window !== 'undefined') {
    audioEngineRef.current = new SdrAudioEngine();
  }

  const signalBurstsRef = useRef<WaterfallSignalBurst[]>([]);
  const recordSignalBurst = useCallback((burst: Omit<WaterfallSignalBurst, 'startedAtMs' | 'expiresAtMs'> & { durationMs: number }) => {
    const now = Date.now();
    const active = signalBurstsRef.current.filter((b) => b.expiresAtMs > now && b.id !== burst.id);
    active.push({
      ...burst,
      startedAtMs: now,
      expiresAtMs: now + Math.max(200, burst.durationMs),
    });
    signalBurstsRef.current = active.slice(-48);
  }, []);

  const currentFreqHz = activeVfo === 'A' ? vfoAFreqHz : vfoBFreqHz;
  const rttyFineRxOffsetHz =
    mode === 'RTTY' || activeModuleTab === 'rtty' ? rttyConfig.fineOffsetHz : 0;
  const effectiveRxFreqHz = currentFreqHz + ritHz + clarifierHz + rttyFineRxOffsetHz;
  const activeBandRef = useRef(activeBand);
  activeBandRef.current = activeBand;
  const effectiveRxFreqRef = useRef(effectiveRxFreqHz);
  effectiveRxFreqRef.current = effectiveRxFreqHz;
  const qthRef = useRef(qth);
  qthRef.current = qth;
  const propagationRef = useRef(propagation);
  propagationRef.current = propagation;
  const filterWidthKhzRef = useRef(filterWidthKhz);
  filterWidthKhzRef.current = filterWidthKhz;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const antennaIdRef = useRef(antennaId);
  antennaIdRef.current = antennaId;
  const rotorHeadingDegRef = useRef(rotorHeadingDeg);
  rotorHeadingDegRef.current = rotorHeadingDeg;
  const rfGainPctRef = useRef(rfGainPct);
  rfGainPctRef.current = rfGainPct;

  // Evaluate strictly REAL connected users (zero simulated beacons)
  const evaluatedStations = useMemo(() => {
    const realStations: RemoteStation[] = remotePeers.filter((p) => p.id !== clientId && !p.isBeacon);
    return realStations.map((station) => ({
      station,
      evalResult: evaluateRemoteSignal({
        station,
        rxQth: qth,
        rxBand: activeBand,
        rxFrequencyHz: effectiveRxFreqHz,
        rxMode: mode,
        rxFilterWidthKhz: filterWidthKhz,
        rxAntennaId: antennaId,
        rxRotorHeadingDeg: rotorHeadingDeg,
        rxRfGainPct: rfGainPct,
        conditions: propagation,
      }),
    }));
  }, [
    remotePeers,
    clientId,
    qth,
    activeBand,
    effectiveRxFreqHz,
    mode,
    filterWidthKhz,
    antennaId,
    rotorHeadingDeg,
    rfGainPct,
    propagation,
  ]);

  const evaluatedStationsRef = useRef(evaluatedStations);
  evaluatedStationsRef.current = evaluatedStations;

  // Evaluate single ARRL NEWS beacon (map/rotor/S-meter when tuned to 14.290 MHz; never injected onto waterfall or QSO log)
  const arrlNewsBeaconEval = useMemo(
    () => ({
      station: ARRL_NEWS_BEACON,
      evalResult: evaluateRemoteSignal({
        station: ARRL_NEWS_BEACON,
        rxQth: qth,
        rxBand: activeBand,
        rxFrequencyHz: effectiveRxFreqHz,
        rxMode: mode,
        rxFilterWidthKhz: filterWidthKhz,
        rxAntennaId: antennaId,
        rxRotorHeadingDeg: rotorHeadingDeg,
        rxRfGainPct: rfGainPct,
        conditions: propagation,
      }),
    }),
    [
      qth,
      activeBand,
      effectiveRxFreqHz,
      mode,
      filterWidthKhz,
      antennaId,
      rotorHeadingDeg,
      rfGainPct,
      propagation,
    ]
  );

  const mapAndBeaconStations = useMemo(
    () => [...evaluatedStations, arrlNewsBeaconEval],
    [evaluatedStations, arrlNewsBeaconEval]
  );

  const bandCondition = useMemo(
    () => evaluateBandCondition(activeBand, propagation, qth),
    [activeBand, propagation, qth]
  );

  // Strongest live incoming station in passband for S-Meter (falls back to ARRL NEWS beacon only when tuned onto 14.290 MHz)
  const bestInPassband = useMemo(() => {
    const candidates = evaluatedStations.filter(
      (s) => s.station.isTransmitting && s.evalResult.inPassband
    );
    if (candidates.length > 0) {
      return candidates.reduce((best, cur) =>
        cur.evalResult.rxPowerDbm > best.evalResult.rxPowerDbm ? cur : best
      );
    }
    return arrlNewsBeaconEval.evalResult.inPassband ? arrlNewsBeaconEval : null;
  }, [evaluatedStations, arrlNewsBeaconEval]);

  const sMeterDbm = bestInPassband
    ? bestInPassband.evalResult.rxPowerDbm
    : bandCondition.noiseDbm + (rfGainPct - 50) * 0.15;
  const sMeterText = dbmToSMeterText(sMeterDbm);
  const sMeterNormalized = dbmToNormalizedMeter(sMeterDbm);

  const currentSwr = useMemo(
    () => computeSwr(antennaId, activeBand, atuMatchFactor, currentFreqHz),
    [antennaId, activeBand, atuMatchFactor, currentFreqHz]
  );

  const paResult = useMemo(
    () =>
      computePowerAmpOutput({
        exciterPowerW: txPowerW,
        swr: currentSwr,
        paEnabled: paEnabled && isPoweredOn,
        gainDb: paGainDb,
      }),
    [txPowerW, currentSwr, paEnabled, paGainDb, isPoweredOn]
  );

  const deliveredPowerW = paResult.outputPowerW;

  // Refs for smooth 30Hz TX S-Meter ballistics without resetting timers on prop ticks
  const txMeterParamsRef = useRef({
    mode,
    deliveredPowerW,
    paActive: paResult.paActive,
    micEnabled,
    compressionPct,
    isTuningAtu,
    rxNorm: sMeterNormalized,
  });
  txMeterParamsRef.current = {
    mode,
    deliveredPowerW,
    paActive: paResult.paActive,
    micEnabled,
    compressionPct,
    isTuningAtu,
    rxNorm: sMeterNormalized,
  };

  useEffect(() => {
    if (!isPoweredOn || !isTransmitting) {
      setTxSMeterState(null);
      return;
    }

    let currentNorm = txMeterParamsRef.current.rxNorm;
    let lastTickMs = performance.now();

    const sampleMeter = () => {
      const nowMs = performance.now();
      const dtSec = Math.max(0.01, (nowMs - lastTickMs) / 1000);
      lastTickMs = nowMs;

      const p = txMeterParamsRef.current;
      const toneTel = audioEngineRef.current?.getToneTelemetry();
      const hasTone = toneTel && toneTel.mode !== 'IDLE';
      const target = computeTxSMeterReading({
        mode: p.mode,
        deliveredPowerW: p.deliveredPowerW,
        maxPowerW: p.paActive ? MAX_PA_POWER_W : MAX_TX_POWER_W,
        micRms: micRmsRef.current,
        micEnabled: p.micEnabled,
        compressionPct: p.compressionPct,
        keyDown: hasTone ? toneTel.markActive : undefined,
        toneFreqHz: hasTone ? toneTel.freqHz : undefined,
        isTuningAtu: p.isTuningAtu,
        timeSec: nowMs / 1000,
      });

      currentNorm = stepMeterNeedleNormalized(currentNorm, target.normalized, dtSec);
      setTxSMeterState({
        text: target.text,
        normalized: currentNorm,
      });
    };

    sampleMeter();
    const timer = window.setInterval(sampleMeter, 34);
    return () => window.clearInterval(timer);
  }, [isPoweredOn, isTransmitting]);

  const displayedSMeterText =
    isPoweredOn && isTransmitting && txSMeterState ? txSMeterState.text : sMeterText;
  const displayedSMeterNormalized =
    isPoweredOn && isTransmitting && txSMeterState ? txSMeterState.normalized : sMeterNormalized;

  // Sync Web Audio DSP parameters
  useEffect(() => {
    audioEngineRef.current?.updateParams({
      afGainPct,
      rfGainPct,
      noiseReductionPct,
      notchPct,
      noiseBlankerPct,
      filterWidthKhz,
      mode,
      isTransmitting: isTransmitting && isPoweredOn,
      audioEnabled: audioEnabled && isPoweredOn,
      noiseFloorDbm: bandCondition.noiseDbm,
      bestSignalSnrDb: bestInPassband?.evalResult.snrDb ?? 0,
      bestSignalInPassband: Boolean(bestInPassband),
      auroraFlutter: bestInPassband?.evalResult.auroraFlutter ?? (propagation.auroraActive ? 0.5 : 0),
      compressionPct,
      isPoweredOn,
    });
  }, [
    afGainPct,
    rfGainPct,
    noiseReductionPct,
    notchPct,
    noiseBlankerPct,
    filterWidthKhz,
    mode,
    isTransmitting,
    audioEnabled,
    isPoweredOn,
    bandCondition.noiseDbm,
    bestInPassband,
    propagation.auroraActive,
    compressionPct,
  ]);

  // Keep PTT section LED VU bar & ALC responsive during CW, RTTY, JTTY, SSTV, and FT8 TX
  useEffect(() => {
    if (!isPoweredOn || !isTransmitting) return;
    if (mode !== 'CW' && mode !== 'RTTY' && mode !== 'SSTV' && mode !== 'FT8') return;

    const sampleDigitalLevel = () => {
      const tel = audioEngineRef.current?.getToneTelemetry();
      const nowSec = performance.now() / 1000;
      const liveMicDb = micEnabled && micRmsRef.current > 0.004
        ? Math.max(-55, Math.min(-1, 20 * Math.log10(micRmsRef.current)))
        : -55;

      let digitalDb = -10.5;
      if (mode === 'CW') {
        const keyDown = tel && tel.mode === 'CW' ? tel.markActive : true;
        digitalDb = keyDown ? -7.5 + 1.2 * Math.sin(nowSec * 12) : -38.0;
      } else if (mode === 'RTTY') {
        const mark =
          tel && (tel.mode === 'RTTY' || tel.mode === 'JTTY')
            ? tel.markActive
            : Math.sin(nowSec * 18) > 0;
        digitalDb = (mark ? -8.0 : -10.5) + 0.9 * Math.sin(nowSec * 23);
      } else if (mode === 'FT8') {
        const ripple = tel?.freqHz ? ((tel.freqHz % 50) / 50) * 2.2 : 0;
        digitalDb = -9.2 + ripple + 0.8 * Math.sin(nowSec * 16);
      } else if (mode === 'SSTV') {
        digitalDb = -8.5 + 2.4 * Math.sin(nowSec * 11) + 0.8 * Math.cos(nowSec * 27);
      }

      const combinedDb = Number(Math.max(digitalDb, liveMicDb).toFixed(1));
      const alcVal = Math.max(12, Math.min(92, Math.round(58 + (combinedDb + 12) * 3.2)));
      setMicLevelDb(combinedDb);
      setAlcPct(alcVal);
    };

    sampleDigitalLevel();
    const timer = window.setInterval(sampleDigitalLevel, 65);
    return () => window.clearInterval(timer);
  }, [isPoweredOn, isTransmitting, mode, micEnabled]);

  // Smooth Rotor Slewing (only for rotatable antennas)
  useEffect(() => {
    if (!getAntennaSpec(antennaId).isRotatable || rotorHeadingDeg === rotorTargetDeg) return;
    const timer = window.setInterval(() => {
      setRotorHeadingDeg((cur) => stepRotorToward(cur, rotorTargetDeg, 3));
    }, 55);
    return () => window.clearInterval(timer);
  }, [antennaId, rotorHeadingDeg, rotorTargetDeg]);

  // Update CW Decoder when tuned onto a live CW station
  useEffect(() => {
    if (!cwDecodeEnabled || isSendingCwRef.current || !bestInPassband?.station.cwText) return;
    setCwDecodedText(bestInPassband.station.cwText);
  }, [bestInPassband, cwDecodeEnabled]);

  // Load initial QSO log, DX Cluster spots, and hourly propagation sync
  useEffect(() => {
    fetch('/api/qsos')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load QSOs'))))
      .then((data: { qsos?: QsoEntry[] }) => {
        if (Array.isArray(data.qsos)) setQsos(data.qsos);
      })
      .catch(() => {});

    fetch('/api/cluster')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { spots?: DxClusterSpot[] } | null) => {
        if (data?.spots && Array.isArray(data.spots)) setClusterSpots(data.spots);
      })
      .catch(() => {});

    fetch('/api/callsigns')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { records?: CallsignRecord[] } | null) => {
        if (data?.records && Array.isArray(data.records)) setCallsignDirectory(data.records);
      })
      .catch(() => {});

    let lastSyncedUtcHourBucket = Math.floor(Date.now() / 3_600_000);

    const syncHourlyPropagation = () => {
      lastSyncedUtcHourBucket = Math.floor(Date.now() / 3_600_000);
      fetch('/api/propagation')
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { conditions?: PropagationConditions } | null) => {
          if (data?.conditions) setPropagation(data.conditions);
          else setPropagation(computeHourlyPropagationSnapshot(Date.now()));
        })
        .catch(() => {
          setPropagation(computeHourlyPropagationSnapshot(Date.now()));
        });
    };

    syncHourlyPropagation();

    // Check every 20s so even if a browser tab sleeps past :00Z, it updates immediately on wake/hour boundary
    const rolloverTimer = window.setInterval(() => {
      const currentBucket = Math.floor(Date.now() / 3_600_000);
      if (currentBucket !== lastSyncedUtcHourBucket) {
        syncHourlyPropagation();
      }
    }, 20_000);

    // Restore permanently assigned callsign bound to this radioId if registered on server
    fetch(`/api/callsigns/assigned?radioId=${encodeURIComponent(radioId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: {
        assigned?: boolean | { callsign?: string; grid?: string };
        record?: { callsign?: string; grid?: string };
        defaultQth?: QthLocation;
      } | null) => {
        const assignedCall =
          data?.record?.callsign ??
          (typeof data?.assigned === 'object' && data.assigned ? data.assigned.callsign : undefined);
        if (data?.assigned && assignedCall) {
          setCallsign(assignedCall);
          setCallsignPermanent(true);
          if (data.defaultQth) {
            setQth(data.defaultQth);
          }
          saveStationProfile({
            callsign: assignedCall,
            callsignPermanent: true,
            qth: data.defaultQth,
            qthExplicit: Boolean(data.defaultQth),
          });
        }
      })
      .catch(() => {});

    return () => {
      window.clearInterval(rolloverTimer);
    };
  }, [radioId]);

  // Auto-center maps & rotor on user's QTH
  useEffect(() => {
    if (initialSaved?.qthExplicit && initialSaved?.qth) return;
    let cancelled = false;

    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const tzEstimate = tz ? estimateQthFromTimeZone(tz) : null;
    if (tzEstimate) setQth(tzEstimate);

    fetch('/api/geolocate')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { qth?: QthLocation | null } | null) => {
        if (!cancelled && data?.qth) setQth(data.qth);
      })
      .catch(() => {});

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lon = Number(pos.coords.longitude.toFixed(4));
          setQth({ lat, lon, grid: maidenheadFromLatLon(lat, lon) });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [initialSaved]);

  const animateRxSstvSweep = useCallback(
    (
      frame: SstvFramePayload,
      stats?: { visDetected: boolean; syncLocks: number; sourceLabel: string } | null
    ) => {
      if (sstvRxSweepRef.current !== null) {
        window.clearInterval(sstvRxSweepRef.current);
        sstvRxSweepRef.current = null;
      }
      setSstvRxFrame(frame);
      setSstvRxStats(stats ?? null);
      setSstvGallery((prev) => [frame, ...prev.filter((f) => f.id !== frame.id)].slice(0, 12));
      setSstvRxProgress(0.06);
      const start = Date.now();
      const modeSpec = SSTV_MODE_SPECS[frame.sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];
      const totalMs = modeSpec.txSweepMs;
      sstvRxSweepRef.current = window.setInterval(() => {
        const pct = Math.min(1, (Date.now() - start) / totalMs);
        setSstvRxProgress(pct);
        if (pct >= 1 && sstvRxSweepRef.current !== null) {
          window.clearInterval(sstvRxSweepRef.current);
          sstvRxSweepRef.current = null;
        }
      }, 65);
    },
    []
  );

  // WebSocket VOIP, Digital Modes, Cluster & Admin Sync
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | null = null;
    let removedByAdmin = false;

    const connect = () => {
      if (removedByAdmin) return;
      setWsStatus('connecting');
      const ws = new WebSocket(buildWebSocketUrl(window.location, '/ws'));
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        if (msg.type === 'welcome') {
          if (typeof msg.clientId === 'string') setClientId(msg.clientId);
          if (msg.propagation) setPropagation(msg.propagation as PropagationConditions);
        } else if (msg.type === 'station:list' && Array.isArray(msg.stations)) {
          setRemotePeers(msg.stations as RemoteStation[]);
          if (Array.isArray(msg.globalStations)) {
            setAllGlobalStations(msg.globalStations as RemoteStation[]);
          }
        } else if (msg.type === 'propagation:state' && msg.conditions) {
          setPropagation(msg.conditions as PropagationConditions);
        } else if (msg.type === 'cluster:spot' && msg.spot) {
          const spot = msg.spot as DxClusterSpot;
          setClusterSpots((prev) => [spot, ...prev.filter((s) => s.id !== spot.id)].slice(0, 100));
        } else if (msg.type === 'admin:assist') {
          if (typeof msg.newCallsign === 'string' && msg.newCallsign) {
            setCallsign(msg.newCallsign);
          }
          if (typeof msg.newGroupId === 'string' && msg.newGroupId) {
            setGroupId(msg.newGroupId);
          }
          if (typeof msg.newFrequencyHz === 'number') {
            setVfoAFreqHz(msg.newFrequencyHz);
          }
          setAdminNotice({
            id: `adm-${Date.now()}`,
            fromAdmin: String(msg.fromAdmin ?? 'ZS1ROM'),
            message: String(msg.message ?? 'Net Control ZS1ROM updated your station.'),
            timestampUtc: String(msg.timestampUtc ?? nowUtcStamp()),
          });
        } else if (msg.type === 'admin:removed') {
          removedByAdmin = true;
          setRemovedBanner(String(msg.reason ?? 'Disconnected from program by ZS1ROM Net Control.'));
        } else if (msg.type === 'rf:activity') {
          if (!isPoweredOnRef.current || msg.band !== activeBandRef.current) return;
          const fromId = String(msg.fromId ?? 'peer');
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          const activityMode = (msg.mode as RadioMode) ?? 'USB';
          const activityFreqHz = Number(msg.frequencyHz ?? effectiveRxFreqRef.current);
          let rxDbm = match?.evalResult.rxPowerDbm;
          if (rxDbm === undefined && msg.qth && typeof msg.qth === 'object') {
            const transientStation: RemoteStation = {
              id: fromId,
              callsign: 'RX',
              serverId: 'global',
              groupId: 'open-hf',
              band: activeBandRef.current,
              frequencyHz: activityFreqHz,
              mode: activityMode,
              powerW: typeof msg.powerW === 'number' ? msg.powerW : 25,
              antennaId: 'dipole',
              rotorHeadingDeg: 0,
              qth: msg.qth as QthLocation,
              isTransmitting: true,
              lastActiveAt: Date.now(),
            };
            rxDbm = evaluateRemoteSignal({
              station: transientStation,
              rxQth: qthRef.current,
              rxBand: activeBandRef.current,
              rxFrequencyHz: effectiveRxFreqRef.current,
              rxMode: modeRef.current,
              rxFilterWidthKhz: filterWidthKhzRef.current,
              rxAntennaId: antennaIdRef.current,
              rxRotorHeadingDeg: rotorHeadingDegRef.current,
              rxRfGainPct: rfGainPctRef.current,
              conditions: propagationRef.current,
            }).rxPowerDbm;
          }
          const isVoiceMode =
            activityMode === 'USB' ||
            activityMode === 'LSB' ||
            activityMode === 'AM' ||
            activityMode === 'FM';
          recordSignalBurst({
            id: `rf-${fromId}`,
            band: activeBandRef.current,
            frequencyHz: activityFreqHz,
            audioOffsetHz: typeof msg.audioOffsetHz === 'number' ? msg.audioOffsetHz : undefined,
            rttyShiftHz: typeof msg.rttyShiftHz === 'number' ? msg.rttyShiftHz : undefined,
            mode: activityMode,
            powerDbm: Math.max(-108, rxDbm ?? -82),
            durationMs:
              typeof msg.durationMs === 'number'
                ? Math.min(8000, Math.max(300, msg.durationMs))
                : 900,
            isVoice: isVoiceMode,
          });
        } else if (msg.type === 'voip:audio') {
          if (!isPoweredOnRef.current || typeof msg.pcm16 !== 'string') return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          if (match) {
            if (match.station.band === activeBandRef.current) {
              recordSignalBurst({
                id: `voip-${fromId}`,
                band: match.station.band,
                frequencyHz: match.station.frequencyHz,
                mode: match.station.mode,
                powerDbm: Math.max(-108, match.evalResult.rxPowerDbm),
                durationMs: 420,
                isVoice: true,
              });
            }
            if (match.evalResult.inPassband && match.evalResult.propagationOpen) {
              audioEngineRef.current?.playIncomingVoipPcm({
                pcm16Base64: msg.pcm16,
                sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
                snrDb: match.evalResult.snrDb,
                auroraFlutter: match.evalResult.auroraFlutter,
                freqOffsetHz: match.evalResult.freqOffsetHz,
                inPassband: true,
              });
            }
          } else if (msg.qth && typeof msg.qth === 'object') {
            const gate = isSameFrequencyAndPropagationOpen({
              rxQth: qthRef.current,
              txQth: msg.qth as QthLocation,
              rxBand: activeBandRef.current,
              txBand: msg.band as BandId,
              rxFrequencyHz: effectiveRxFreqRef.current,
              txFrequencyHz: Number(msg.frequencyHz ?? 0),
              rxFilterWidthKhz: filterWidthKhzRef.current,
              conditions: propagationRef.current,
            });
            if (msg.band === activeBandRef.current) {
              recordSignalBurst({
                id: `voip-${fromId}`,
                band: msg.band as BandId,
                frequencyHz: Number(msg.frequencyHz ?? effectiveRxFreqRef.current),
                mode: (msg.mode as RadioMode) ?? 'USB',
                powerDbm: -74,
                durationMs: 420,
                isVoice: true,
              });
            }
            if (gate.allowed) {
              audioEngineRef.current?.playIncomingVoipPcm({
                pcm16Base64: msg.pcm16,
                sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
                snrDb: 12,
                auroraFlutter: gate.voacap.auroraFlutter,
                freqOffsetHz: Number(msg.frequencyHz ?? 0) - effectiveRxFreqRef.current,
                inPassband: true,
              });
            }
          }
        } else if (msg.type === 'cw:tx' && typeof msg.text === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          const canDecode = match
            ? match.evalResult.inPassband && match.evalResult.propagationOpen
            : Boolean(
                msg.qth &&
                  isSameFrequencyAndPropagationOpen({
                    rxQth: qthRef.current,
                    txQth: msg.qth as QthLocation,
                    rxBand: activeBandRef.current,
                    txBand: msg.band as BandId,
                    rxFrequencyHz: effectiveRxFreqRef.current,
                    txFrequencyHz: Number(msg.frequencyHz ?? 0),
                    rxFilterWidthKhz: filterWidthKhzRef.current,
                    conditions: propagationRef.current,
                  }).allowed
              );
          if ((match?.station.band ?? msg.band) === activeBandRef.current) {
            recordSignalBurst({
              id: `cw-${fromId}`,
              band: (match?.station.band ?? msg.band ?? activeBandRef.current) as BandId,
              frequencyHz: Number(msg.frequencyHz ?? match?.station.frequencyHz ?? effectiveRxFreqRef.current),
              mode: 'CW',
              powerDbm: Math.max(-108, match ? match.evalResult.rxPowerDbm : -74),
              durationMs: Math.max(900, morseDurationMs(msg.text, typeof msg.wpm === 'number' ? msg.wpm : 15)),
            });
          }
          if (canDecode) {
            const sender = String(msg.callsign ?? 'RX');
            setCwDecodedText(`${sender}: ${msg.text}`);
            setCwFeed((prev) => [
              {
                id: `cw-${Date.now()}-${Math.random()}`,
                timestampUtc: nowUtcStamp(),
                direction: 'RX',
                mode: 'CW',
                callsign: sender,
                frequencyHz: Number(msg.frequencyHz ?? effectiveRxFreqRef.current),
                snrDb: match ? Math.round(match.evalResult.snrDb) : undefined,
                text: msg.text as string,
              },
              ...prev.slice(0, 49),
            ]);
            if (audioEnabledRef.current) {
              audioEngineRef.current?.playMorseSequence(
                msg.text,
                typeof msg.wpm === 'number' ? msg.wpm : 15,
                720,
                0.24,
                false
              );
            }
          }
        } else if (msg.type === 'rtty:tx' && typeof msg.text === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          const peerCfg =
            msg.rttyConfig && typeof msg.rttyConfig === 'object'
              ? (msg.rttyConfig as Partial<RttyConfig>)
              : rttyConfigRef.current;
          if ((match?.station.band ?? msg.band) === activeBandRef.current) {
            recordSignalBurst({
              id: `rtty-${fromId}`,
              band: (match?.station.band ?? msg.band ?? activeBandRef.current) as BandId,
              frequencyHz: Number(msg.frequencyHz ?? match?.station.frequencyHz ?? effectiveRxFreqRef.current),
              mode: 'RTTY',
              powerDbm: Math.max(-108, match ? match.evalResult.rxPowerDbm : -72),
              rttyShiftHz: peerCfg.shiftHz ?? 170,
              durationMs: Math.max(1000, Math.min(7000, rttyDurationMs(msg.text, peerCfg))),
            });
          }
          const canDecode = match
            ? match.evalResult.inPassband && match.evalResult.propagationOpen
            : Boolean(
                msg.qth &&
                  isSameFrequencyAndPropagationOpen({
                    rxQth: qthRef.current,
                    txQth: msg.qth as QthLocation,
                    rxBand: activeBandRef.current,
                    txBand: msg.band as BandId,
                    rxFrequencyHz: effectiveRxFreqRef.current,
                    txFrequencyHz: Number(msg.frequencyHz ?? 0),
                    rxFilterWidthKhz: filterWidthKhzRef.current,
                    conditions: propagationRef.current,
                  }).allowed
              );
          if (canDecode) {
            const sender = String(msg.callsign ?? 'RX');
            const rxRfDeltaHz = Math.max(
              -450,
              Math.min(450, Number(msg.frequencyHz ?? effectiveRxFreqRef.current) - effectiveRxFreqRef.current)
            );
            const rxAlignedCfg: Partial<RttyConfig> = {
              ...peerCfg,
              fineOffsetHz: (peerCfg.fineOffsetHz ?? 0) + rxRfDeltaHz,
            };
            setRttyFeed((prev) => [
              {
                id: `rtty-${Date.now()}-${Math.random()}`,
                timestampUtc: String(msg.timestampUtc ?? nowUtcStamp()),
                direction: 'RX',
                mode: 'RTTY',
                callsign: sender,
                frequencyHz: Number(msg.frequencyHz ?? effectiveRxFreqRef.current),
                snrDb: match ? Math.round(match.evalResult.snrDb) : undefined,
                text: msg.text as string,
              },
              ...prev.slice(0, 49),
            ]);
            if (audioEnabledRef.current) {
              audioEngineRef.current?.playRttySequence(msg.text, 0.16, false, rxAlignedCfg);
            }
          }
        } else if (msg.type === 'jtty:tx' && typeof msg.text === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          const peerCfg =
            msg.jttyConfig && typeof msg.jttyConfig === 'object'
              ? (msg.jttyConfig as Partial<JttyConfig>)
              : jttyConfigRef.current;
          if ((match?.station.band ?? msg.band) === activeBandRef.current) {
            recordSignalBurst({
              id: `jtty-${fromId}`,
              band: (match?.station.band ?? msg.band ?? activeBandRef.current) as BandId,
              frequencyHz: Number(msg.frequencyHz ?? match?.station.frequencyHz ?? effectiveRxFreqRef.current),
              mode: 'RTTY',
              powerDbm: Math.max(-108, match ? match.evalResult.rxPowerDbm : -72),
              rttyShiftHz: peerCfg.shiftHz ?? 170,
              durationMs: Math.max(1000, Math.min(7000, jttyDurationMs(msg.text, peerCfg))),
            });
          }
          const canDecode = match
            ? match.evalResult.inPassband && match.evalResult.propagationOpen
            : Boolean(
                msg.qth &&
                  isSameFrequencyAndPropagationOpen({
                    rxQth: qthRef.current,
                    txQth: msg.qth as QthLocation,
                    rxBand: activeBandRef.current,
                    txBand: msg.band as BandId,
                    rxFrequencyHz: effectiveRxFreqRef.current,
                    txFrequencyHz: Number(msg.frequencyHz ?? 0),
                    rxFilterWidthKhz: filterWidthKhzRef.current,
                    conditions: propagationRef.current,
                  }).allowed
              );
          if (canDecode) {
            const sender = String(msg.callsign ?? 'RX');
            setJttyFeed((prev) => [
              {
                id: `jtty-${Date.now()}-${Math.random()}`,
                timestampUtc: String(msg.timestampUtc ?? nowUtcStamp()),
                direction: 'RX',
                mode: 'JTTY',
                callsign: sender,
                frequencyHz: Number(msg.frequencyHz ?? effectiveRxFreqRef.current),
                snrDb: match ? Math.round(match.evalResult.snrDb) : undefined,
                text: msg.text as string,
              },
              ...prev.slice(0, 49),
            ]);
            if (audioEnabledRef.current) {
              audioEngineRef.current?.playJttySequence(msg.text, 0.16, false, peerCfg);
            }
          }
        } else if (msg.type === 'ft8:tx' && typeof msg.message === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          if ((match?.station.band ?? msg.band) === activeBandRef.current) {
            recordSignalBurst({
              id: `ft8-${fromId}-${Number(msg.audioFreqHz ?? 1250)}`,
              band: (match?.station.band ?? msg.band ?? activeBandRef.current) as BandId,
              frequencyHz: Number(msg.frequencyHz ?? match?.station.frequencyHz ?? effectiveRxFreqRef.current),
              audioOffsetHz: Number(msg.audioFreqHz ?? 1250),
              mode: 'FT8',
              powerDbm: Math.max(-108, match ? match.evalResult.rxPowerDbm : -76),
              durationMs: 4400,
            });
          }
          const canDecode = match
            ? match.station.band === activeBandRef.current &&
              Math.abs(match.evalResult.freqOffsetHz) <= 3000 &&
              (match.evalResult.propagationOpen || match.evalResult.snrDb + 18 >= -24)
            : Boolean(
                msg.qth &&
                  isSameFrequencyAndPropagationOpen({
                    rxQth: qthRef.current,
                    txQth: msg.qth as QthLocation,
                    rxBand: activeBandRef.current,
                    txBand: msg.band as BandId,
                    rxFrequencyHz: effectiveRxFreqRef.current,
                    txFrequencyHz: Number(msg.frequencyHz ?? 0),
                    maxFreqDeltaHz: 3000,
                    weakSignalDigital: true,
                    conditions: propagationRef.current,
                  }).allowed
              );
          if (!canDecode) return;

          const parsed = parseFt8Message(msg.message);
          const line: Ft8DecodedLine = {
            id: `ft8-${Date.now()}-${Math.random()}`,
            utcTime: nowUtcTimeShort(),
            snrDb: match ? Math.round(match.evalResult.snrDb) : -4,
            dtSec: 0.1,
            audioFreqHz: Number(msg.audioFreqHz ?? 1250),
            rfFreqHz: Number(msg.frequencyHz ?? effectiveRxFreqRef.current),
            band: msg.band as BandId,
            callsign: parsed.fromCall || String(msg.callsign ?? ''),
            message: msg.message,
            isCq: parsed.isCq,
            direction: 'RX',
          };
          setFt8Log((prev) => [line, ...prev.slice(0, 59)]);
          if (audioEnabledRef.current) {
            const tones = encodeFt8Tones(msg.message);
            audioEngineRef.current?.playFt8Sequence(tones, line.audioFreqHz, 0.16, false);
          }
        } else if (msg.type === 'sstv:tx' && typeof msg.pixelsBase64 === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          const sstvMode = (msg.sstvMode as SstvModeId) || 'Robot 36';
          if ((match?.station.band ?? msg.band) === activeBandRef.current) {
            recordSignalBurst({
              id: `sstv-${fromId}`,
              band: (match?.station.band ?? msg.band ?? activeBandRef.current) as BandId,
              frequencyHz: Number(msg.frequencyHz ?? match?.station.frequencyHz ?? effectiveRxFreqRef.current),
              mode: 'SSTV',
              powerDbm: Math.max(-108, match ? match.evalResult.rxPowerDbm : -72),
              durationMs: (SSTV_MODE_SPECS[sstvMode] ?? SSTV_MODE_SPECS['Robot 36']).txSweepMs,
            });
          }
          const canDecode = match
            ? match.evalResult.inPassband && match.evalResult.propagationOpen
            : Boolean(
                msg.qth &&
                  isSameFrequencyAndPropagationOpen({
                    rxQth: qthRef.current,
                    txQth: msg.qth as QthLocation,
                    rxBand: activeBandRef.current,
                    txBand: msg.band as BandId,
                    rxFrequencyHz: effectiveRxFreqRef.current,
                    txFrequencyHz: Number(msg.frequencyHz ?? 0),
                    maxFreqDeltaHz: 2200,
                    conditions: propagationRef.current,
                  }).allowed
              );
          if (!canDecode) return;

          const width = Number(msg.width ?? SSTV_WIDTH);
          const height = Number(msg.height ?? SSTV_HEIGHT);
          const frame: SstvFramePayload = {
            id: `sstv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            callsign: String(msg.callsign ?? 'RX'),
            sstvMode,
            width,
            height,
            pixelsBase64: msg.pixelsBase64,
            caption: String(msg.caption ?? ''),
            timestampUtc: String(msg.timestampUtc ?? nowUtcStamp()),
          };
          animateRxSstvSweep(frame, {
            visDetected: true,
            syncLocks: height,
            sourceLabel: `On-Air ${frame.callsign}`,
          });
          if (audioEnabledRef.current) {
            const rgb = decodeBase64ToRgb(msg.pixelsBase64, width * height * 3);
            const durMs = (SSTV_MODE_SPECS[sstvMode] ?? SSTV_MODE_SPECS['Robot 36']).txSweepMs;
            audioEngineRef.current?.playSstvSequenceFromRgb(
              rgb,
              width,
              height,
              sstvMode,
              durMs,
              0.16,
              false
            );
          }
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!closedByUnmount && !removedByAdmin) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [animateRxSstvSweep]);

  // Push local station telemetry over WebSocket whenever it updates
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: 'station:update',
        callsign,
        serverId,
        groupId,
        band: activeBand,
        frequencyHz: currentFreqHz + xitHz,
        mode,
        powerW: isPoweredOn ? deliveredPowerW : 0,
        antennaId,
        rotorHeadingDeg,
        qth,
        isTransmitting: isTransmitting && isPoweredOn,
      })
    );
  }, [
    wsStatus,
    callsign,
    serverId,
    groupId,
    activeBand,
    currentFreqHz,
    xitHz,
    mode,
    deliveredPowerW,
    antennaId,
    rotorHeadingDeg,
    qth,
    isTransmitting,
    isPoweredOn,
  ]);

  // Ensure the transceiver turns ON on startup and initialize/unlock Web Audio immediately (Windows/Mac/iOS/Android)
  useEffect(() => {
    setIsPoweredOn(STARTUP_TRANSCEIVER_STATE.isPoweredOn);
    setAudioEnabled(STARTUP_TRANSCEIVER_STATE.audioEnabled);
    pttMicRef.current = setPowerState(pttMicRef.current, STARTUP_TRANSCEIVER_STATE.isPoweredOn);
  }, []);

  useEffect(() => {
    if (!isPoweredOn || !audioEnabled) return;
    const engine = audioEngineRef.current;
    if (!engine) return;

    void engine.resumeIfNeeded();

    const unlock = () => {
      void engine.resumeIfNeeded();
    };
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('mousedown', unlock, opts);
    window.addEventListener('click', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('touchend', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('mousedown', unlock, opts);
      window.removeEventListener('click', unlock, opts);
      window.removeEventListener('touchstart', unlock, opts);
      window.removeEventListener('touchend', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
    };
  }, [isPoweredOn, audioEnabled]);

  const clearCwTimers = useCallback(() => {
    if (cwEndTimerRef.current !== null) {
      window.clearTimeout(cwEndTimerRef.current);
      cwEndTimerRef.current = null;
    }
    if (cwProgressTimerRef.current !== null) {
      window.clearInterval(cwProgressTimerRef.current);
      cwProgressTimerRef.current = null;
    }
  }, []);

  const clearDigitalTimers = useCallback(() => {
    if (digitalTimerRef.current !== null) {
      window.clearTimeout(digitalTimerRef.current);
      digitalTimerRef.current = null;
    }
    if (digitalProgressRef.current !== null) {
      window.clearInterval(digitalProgressRef.current);
      digitalProgressRef.current = null;
    }
  }, []);

  const handleStopPtt = useCallback(
    (reason: PttStopReason = 'pointerup') => {
      const next = endPttHold(pttMicRef.current, reason);
      pttMicRef.current = next;
      setPttHeld(next.pttHeld);
      setPttLatched(next.pttLatched);
      if (next.isTransmitting) {
        return;
      }
      clearCwTimers();
      clearDigitalTimers();
      audioEngineRef.current?.stopMorseSequence();
      audioEngineRef.current?.stopMicrophone();
      audioEngineRef.current?.setTransmitting(false);
      isSendingCwRef.current = false;
      isTransmittingRef.current = false;
      setMicEnabled(false);
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingRtty(false);
      setIsSendingJtty(false);
      setIsSendingSstv(false);
      setIsSendingFt8(false);
      setSstvTxProgress(0);
      setIsTransmitting(false);
      setMicRms(0);
      setMicLevelDb(-55.0);
      setAlcPct(12);
    },
    [clearCwTimers, clearDigitalTimers]
  );

  const handleStopCwTx = useCallback(() => {
    clearCwTimers();
    audioEngineRef.current?.stopMorseSequence();
    audioEngineRef.current?.stopMicrophone();
    audioEngineRef.current?.setTransmitting(false);
    pttMicRef.current = endAutomatedTx(pttMicRef.current);
    isSendingCwRef.current = false;
    isTransmittingRef.current = pttMicRef.current.isTransmitting;
    setIsSendingCw(false);
    setCwTxProgress(0);
    if (!pttMicRef.current.isTransmitting) {
      setIsTransmitting(false);
      setMicEnabled(false);
      setMicRms(0);
      setMicLevelDb(-55.0);
      setAlcPct(12);
    }
  }, [clearCwTimers]);

  const handleStopDigitalTx = useCallback(() => {
    clearDigitalTimers();
    audioEngineRef.current?.stopMorseSequence();
    audioEngineRef.current?.stopMicrophone();
    audioEngineRef.current?.setTransmitting(false);
    pttMicRef.current = endAutomatedTx(pttMicRef.current);
    isTransmittingRef.current = pttMicRef.current.isTransmitting;
    setIsSendingRtty(false);
    setIsSendingJtty(false);
    setIsSendingSstv(false);
    setIsSendingFt8(false);
    setSstvTxProgress(0);
    if (!pttMicRef.current.isTransmitting) {
      setIsTransmitting(false);
      setMicEnabled(false);
      setMicRms(0);
      setMicLevelDb(-55.0);
      setAlcPct(12);
    }
  }, [clearDigitalTimers]);

  useEffect(() => {
    return () => {
      clearCwTimers();
      clearDigitalTimers();
      audioEngineRef.current?.dispose();
    };
  }, [clearCwTimers, clearDigitalTimers]);

  const handleTogglePower = useCallback(() => {
    setIsPoweredOn((prev) => {
      const next = !prev;
      pttMicRef.current = setPowerState(pttMicRef.current, next);
      if (!next) {
        clearCwTimers();
        clearDigitalTimers();
        audioEngineRef.current?.stopMorseSequence();
        audioEngineRef.current?.stopMicrophone();
        audioEngineRef.current?.setTransmitting(false);
        isSendingCwRef.current = false;
        isTransmittingRef.current = false;
        setPttHeld(false);
        setPttLatched(false);
        setIsSendingCw(false);
        setIsSendingRtty(false);
        setIsSendingJtty(false);
        setIsSendingSstv(false);
        setIsSendingFt8(false);
        setCwTxProgress(0);
        setSstvTxProgress(0);
        setIsTransmitting(false);
        setMicEnabled(false);
        setMicRms(0);
        setMicLevelDb(-55.0);
        setAlcPct(12);
      } else {
        audioEngineRef.current?.ensureContext();
      }
      return next;
    });
  }, [clearCwTimers, clearDigitalTimers]);

  const handleEnableAudio = useCallback(() => {
    if (!isPoweredOn) return;
    audioEngineRef.current?.ensureContext();
    setAudioEnabled((prev) => !prev);
  }, [isPoweredOn]);

  // Hard invariant: never allow microphone capture while in RX or powered off
  useEffect(() => {
    if (!isPoweredOn || !isTransmitting) {
      audioEngineRef.current?.stopMicrophone();
      setMicEnabled(false);
      setMicRms(0);
      if (!isTransmitting) {
        setMicLevelDb(-55.0);
        setAlcPct(12);
      }
    }
  }, [isPoweredOn, isTransmitting]);

  const startMicCaptureForPtt = useCallback(
    async (requestSessionId: number): Promise<boolean> => {
      const canProceed = () => {
        const cur = pttMicRef.current;
        return (
          cur.isPoweredOn &&
          cur.isTransmitting &&
          (cur.pttHeld || cur.pttLatched) &&
          cur.sessionId === requestSessionId
        );
      };

      if (!canProceed()) {
        audioEngineRef.current?.stopMicrophone();
        return false;
      }

      const engine = audioEngineRef.current;
      if (!engine) return false;

      const res = await engine.startMicrophone(
        (db, alc) => {
          if (!canCaptureAudio(pttMicRef.current)) return;
          setMicLevelDb(db);
          setAlcPct(alc);
        },
        (pcm16, sampleRate, rms) => {
          if (!canCaptureAudio(pttMicRef.current)) {
            setMicRms(0);
            return;
          }
          setMicRms(rms);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'voip:audio',
                pcm16,
                sampleRate,
                rms,
              })
            );
          }
        },
        {
          shouldContinue: canProceed,
          onInterrupted: () => {
            handleStopPtt('mic_ended');
          },
        }
      );

      const resolution = resolvePttMicStart(pttMicRef.current, requestSessionId, res.ok);
      pttMicRef.current = resolution.nextState;

      if (resolution.shouldStopStreamImmediately || !resolution.nextState.micCapturing) {
        engine.stopMicrophone();
        setMicEnabled(false);
        setMicRms(0);
        return false;
      }

      setMicEnabled(true);
      return true;
    },
    [handleStopPtt]
  );

  const handleStartPtt = useCallback(() => {
    if (!isPoweredOnRef.current) return;
    if ((pttMicRef.current.pttHeld || pttMicRef.current.pttLatched) && pttMicRef.current.isTransmitting) return;

    const nextState = beginPttHold({
      ...pttMicRef.current,
      isPoweredOn: isPoweredOnRef.current,
    });
    pttMicRef.current = nextState;

    audioEngineRef.current?.ensureContext();
    audioEngineRef.current?.setTransmitting(true);
    isTransmittingRef.current = true;
    setPttHeld(true);
    setPttLatched(nextState.pttLatched);
    setIsTransmitting(true);
    setChecklist((c) => ({ ...c, transmittedOrCw: true }));

    if (mode === 'CW' || mode === 'RTTY' || mode === 'SSTV' || mode === 'FT8') {
      audioEngineRef.current?.startContinuousModeTxTone(mode, rttyConfigRef.current, callsign);
      setMicLevelDb(-9.5);
      setAlcPct(62);
    }

    void startMicCaptureForPtt(nextState.sessionId);
  }, [mode, callsign, startMicCaptureForPtt]);

  const handleTogglePttLatch = useCallback(() => {
    if (!isPoweredOnRef.current) return;
    const nextState = togglePttLatch({
      ...pttMicRef.current,
      isPoweredOn: isPoweredOnRef.current,
    });
    pttMicRef.current = nextState;
    setPttHeld(nextState.pttHeld);
    setPttLatched(nextState.pttLatched);

    if (nextState.pttLatched && nextState.isTransmitting) {
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      if (mode === 'CW' || mode === 'RTTY' || mode === 'SSTV' || mode === 'FT8') {
        audioEngineRef.current?.startContinuousModeTxTone(mode, rttyConfigRef.current, callsign);
        setMicLevelDb(-9.5);
        setAlcPct(62);
      }

      void startMicCaptureForPtt(nextState.sessionId);
    } else {
      clearCwTimers();
      clearDigitalTimers();
      audioEngineRef.current?.stopMorseSequence();
      audioEngineRef.current?.stopMicrophone();
      audioEngineRef.current?.setTransmitting(false);
      isSendingCwRef.current = false;
      isTransmittingRef.current = false;
      setMicEnabled(false);
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingRtty(false);
      setIsSendingJtty(false);
      setIsSendingSstv(false);
      setIsSendingFt8(false);
      setSstvTxProgress(0);
      setIsTransmitting(false);
      setMicRms(0);
      setMicLevelDb(-55.0);
      setAlcPct(12);
    }
  }, [mode, callsign, startMicCaptureForPtt, clearCwTimers, clearDigitalTimers]);

  // Global keyboard Hold-to-Talk + safety release on window pointerup/cancel/blur/visibilitychange/pagehide
  useEffect(() => {
    const shouldReleaseHold = () => pttMicRef.current.pttHeld && !pttMicRef.current.pttLatched;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPoweredOnRef.current || e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      if (!e.repeat) {
        if (pttMicRef.current.pttLatched) handleTogglePttLatch();
        else handleStartPtt();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (shouldReleaseHold()) {
        e.preventDefault();
        handleStopPtt('keyup');
      }
    };
    const onWindowPointerUp = () => {
      if (shouldReleaseHold()) {
        handleStopPtt('pointerup');
      }
    };
    const onWindowPointerCancel = () => {
      if (shouldReleaseHold()) {
        handleStopPtt('pointercancel');
      }
    };
    const onWindowBlur = () => {
      if (shouldReleaseHold()) {
        handleStopPtt('window_blur');
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden && shouldReleaseHold()) {
        handleStopPtt('visibility_hidden');
      }
    };
    const onPageHide = () => {
      if (shouldReleaseHold()) {
        handleStopPtt('pagehide');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handleStartPtt, handleStopPtt, handleTogglePttLatch]);

  const setActiveFrequency = useCallback(
    (nextHz: number, targetBand?: BandId) => {
      const bandToUse = targetBand ?? activeBand;
      const clamped = clampFrequencyToBand(nextHz, bandToUse);
      if (activeVfo === 'A') setVfoAFreqHz(clamped);
      else setVfoBFreqHz(clamped);
    },
    [activeBand, activeVfo]
  );

  const handleChangeAntenna = useCallback((nextId: AntennaId) => {
    setAntennaId(nextId);
    setAtuMatchFactor(0);
  }, []);

  const handleSelectBand = useCallback(
    (bandId: BandId) => {
      const spec = getBandSpec(bandId);
      setActiveBand(bandId);
      setActiveFrequency(spec.defaultHz, bandId);
      setAtuMatchFactor(0);
      if (mode === 'USB' || mode === 'LSB') {
        setMode(spec.centerMhz < 10 ? 'LSB' : 'USB');
      }
      setChecklist((c) => ({ ...c, tunedBand: true }));
    },
    [mode, setActiveFrequency]
  );

  const handleTuneDelta = useCallback(
    (deltaHz: number) => {
      setActiveFrequency(currentFreqHz + deltaHz);
    },
    [currentFreqHz, setActiveFrequency]
  );

  const handleSelectMode = useCallback((nextMode: RadioMode) => {
    setMode(nextMode);
    if (nextMode === 'CW') {
      setFilterWidthKhz(0.5);
      setActiveModuleTab('cw');
    } else if (nextMode === 'RTTY') {
      setFilterWidthKhz(1.0);
      if (activeModuleTabRef.current !== 'jtty') {
        setActiveModuleTab('rtty');
      }
    } else if (nextMode === 'SSTV') {
      setFilterWidthKhz(2.4);
      setActiveModuleTab('sstv');
    } else if (nextMode === 'FT8' || nextMode === 'DIGITAL') {
      setFilterWidthKhz(2.4);
      setActiveModuleTab('ft8');
    } else if (nextMode === 'FM') {
      setFilterWidthKhz(6.0);
    } else if (nextMode === 'AM') {
      setFilterWidthKhz(4.0);
    } else {
      setFilterWidthKhz(2.4);
    }

    if (isTransmittingRef.current && isPoweredOnRef.current) {
      if (nextMode === 'CW' || nextMode === 'RTTY' || nextMode === 'SSTV' || nextMode === 'FT8') {
        audioEngineRef.current?.startContinuousModeTxTone(nextMode, rttyConfigRef.current, callsign);
      } else {
        audioEngineRef.current?.stopMorseSequence();
      }
    }
  }, [callsign]);

  const handleTuneToFrequency = useCallback(
    (hz: number, nextMode?: RadioMode) => {
      const matchedBand = findBandForFrequency(hz);
      setActiveBand(matchedBand.id);
      setActiveFrequency(hz, matchedBand.id);
      if (nextMode) {
        handleSelectMode(nextMode);
      }
      setChecklist((c) => ({ ...c, tunedBand: true }));
    },
    [setActiveFrequency, handleSelectMode]
  );

  const handleSwapVfo = useCallback(() => {
    const a = vfoAFreqHz;
    const b = vfoBFreqHz;
    setVfoAFreqHz(b);
    setVfoBFreqHz(a);
    const nextFreq = activeVfo === 'A' ? b : a;
    setActiveBand(findBandForFrequency(nextFreq).id);
  }, [vfoAFreqHz, vfoBFreqHz, activeVfo]);

  const handleSetRotorTarget = useCallback(
    (deg: number) => {
      if (!getAntennaSpec(antennaId).isRotatable) return;
      const wrapped = ((deg % 360) + 360) % 360;
      setRotorTargetDeg(Math.round(wrapped));
      setChecklist((c) => ({ ...c, rotatedAntenna: true }));
    },
    [antennaId]
  );

  const handleTuneArrlBeacon = useCallback(() => {
    handleTuneToFrequency(ARRL_NEWS_BEACON.frequencyHz, ARRL_NEWS_BEACON.mode);
    handleSetRotorTarget(arrlNewsBeaconEval.evalResult.bearingToTxDeg);
    if (isPoweredOn && audioEnabledRef.current) {
      void audioEngineRef.current?.resumeIfNeeded().then(() => {
        audioEngineRef.current?.playMorseSequence('QST DE W1AW ARRL NEWS K', 16, 720, 0.2, false);
      });
    }
  }, [
    handleTuneToFrequency,
    handleSetRotorTarget,
    arrlNewsBeaconEval.evalResult.bearingToTxDeg,
    isPoweredOn,
  ]);

  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setShowSettingsModal(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const nextQth: QthLocation = { lat, lon, grid: maidenheadFromLatLon(lat, lon) };
        setQth(nextQth);
        saveStationProfile({
          callsign,
          callsignPermanent,
          qth: nextQth,
          qthExplicit: true,
          txPowerW,
          powerVersion: 2,
          compressionPct,
        });
      },
      () => {
        setShowSettingsModal(true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, [callsign, callsignPermanent, txPowerW, compressionPct]);

  const handleRunAtuTune = useCallback(() => {
    if (isTuningAtu) return;
    setIsTuningAtu(true);
    pttMicRef.current = beginAutomatedTx(pttMicRef.current);
    audioEngineRef.current?.setTransmitting(true);
    isTransmittingRef.current = true;
    setIsTransmitting(true);
    audioEngineRef.current?.playTuneTone(850);
    window.setTimeout(() => {
      setAtuMatchFactor(0.92);
      setIsTuningAtu(false);
      pttMicRef.current = endAutomatedTx(pttMicRef.current);
      if (!pttMicRef.current.isTransmitting) {
        audioEngineRef.current?.setTransmitting(false);
        isTransmittingRef.current = false;
        setIsTransmitting(false);
      }
    }, 850);
  }, [isTuningAtu]);

  const handleSendCwText = useCallback(
    (rawText: string) => {
      if (!isPoweredOnRef.current) return;
      const msg = sanitizeCwText(rawText).trim();
      if (!msg || !hasSendableMorse(msg)) return;

      clearCwTimers();
      clearDigitalTimers();
      setIsSendingRtty(false);
      setIsSendingJtty(false);
      setIsSendingSstv(false);
      setIsSendingFt8(false);
      setSstvTxProgress(0);
      pttMicRef.current = beginAutomatedTx(pttMicRef.current);
      isSendingCwRef.current = true;
      setMode('CW');
      setFilterWidthKhz(0.5);
      setCwDecodedText(`TX: ${msg}`);
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setIsSendingCw(true);
      setCwTxProgress(0.05);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      setCwFeed((prev) => [
        {
          id: `cw-tx-${Date.now()}`,
          timestampUtc: nowUtcStamp(),
          direction: 'TX',
          mode: 'CW',
          callsign,
          frequencyHz: currentFreqHz,
          text: msg,
        },
        ...prev.slice(0, 49),
      ]);

      // Always play audible Morse sidetone on TX
      audioEngineRef.current?.playMorseSequence(msg, cwWpm, 720, 0.3, true);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'cw:tx',
            wpm: cwWpm,
            text: msg,
          })
        );
      }

      const durationMs = Math.max(450, morseDurationMs(msg, cwWpm));
      const startedAt = Date.now();
      cwProgressTimerRef.current = window.setInterval(() => {
        const pct = Math.min(1, (Date.now() - startedAt) / durationMs);
        setCwTxProgress(pct);
      }, 60);

      cwEndTimerRef.current = window.setTimeout(() => {
        clearCwTimers();
        audioEngineRef.current?.stopMorseSequence();
        pttMicRef.current = endAutomatedTx(pttMicRef.current);
        isSendingCwRef.current = false;
        setIsSendingCw(false);
        setCwTxProgress(0);
        if (!pttMicRef.current.isTransmitting) {
          audioEngineRef.current?.setTransmitting(false);
          isTransmittingRef.current = false;
          setIsTransmitting(false);
        }
      }, durationMs);
    },
    [cwWpm, callsign, currentFreqHz, clearCwTimers, clearDigitalTimers]
  );

  const handleSendCwCq = useCallback(() => {
    const msg = `CQ CQ CQ DE ${callsign} ${callsign} K`;
    setCwTextInput(msg);
    handleSendCwText(msg);
  }, [callsign, handleSendCwText]);

  const handleSendRtty = useCallback(
    (rawText: string) => {
      if (!isPoweredOnRef.current) return;
      const clean = sanitizeRttyText(rawText).trim();
      if (!clean) return;

      clearCwTimers();
      clearDigitalTimers();
      isSendingCwRef.current = false;
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingJtty(false);
      setIsSendingSstv(false);
      setIsSendingFt8(false);
      setSstvTxProgress(0);
      pttMicRef.current = beginAutomatedTx(pttMicRef.current);
      setMode('RTTY');
      setFilterWidthKhz(1.0);
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setIsSendingRtty(true);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      setRttyFeed((prev) => [
        {
          id: `rtty-tx-${Date.now()}`,
          timestampUtc: nowUtcStamp(),
          direction: 'TX',
          mode: 'RTTY',
          callsign,
          frequencyHz: currentFreqHz,
          text: clean,
        },
        ...prev.slice(0, 49),
      ]);

      const cfg = rttyConfigRef.current;
      audioEngineRef.current?.playRttySequence(clean, 0.26, true, cfg);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'rtty:tx', text: clean, rttyConfig: cfg }));
      }

      const dur = Math.max(700, Math.min(8000, rttyDurationMs(clean, cfg)));
      digitalTimerRef.current = window.setTimeout(() => {
        audioEngineRef.current?.stopMorseSequence();
        pttMicRef.current = endAutomatedTx(pttMicRef.current);
        setIsSendingRtty(false);
        if (!pttMicRef.current.isTransmitting) {
          audioEngineRef.current?.setTransmitting(false);
          isTransmittingRef.current = false;
          setIsTransmitting(false);
        }
      }, dur);
    },
    [callsign, currentFreqHz, clearCwTimers, clearDigitalTimers]
  );

  const handleLoopbackRtty = useCallback(
    (decodedText: string, snrRatio: number) => {
      setRttyFeed((prev) => [
        {
          id: `rtty-loop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestampUtc: nowUtcStamp(),
          direction: 'SYS',
          mode: 'RTTY',
          callsign: 'DSP-LOOP',
          frequencyHz: currentFreqHz,
          text: `${decodedText} [GOERTZEL ${snrRatio}:1]`,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [currentFreqHz]
  );

  const handleSendJtty = useCallback(
    (rawText: string) => {
      if (!isPoweredOnRef.current) return;
      const clean = sanitizeJttyText(rawText).trim();
      if (!clean) return;

      clearCwTimers();
      clearDigitalTimers();
      isSendingCwRef.current = false;
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingRtty(false);
      setIsSendingSstv(false);
      setIsSendingFt8(false);
      setSstvTxProgress(0);
      pttMicRef.current = beginAutomatedTx(pttMicRef.current);
      setMode('RTTY');
      setFilterWidthKhz(1.0);
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setIsSendingJtty(true);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      setJttyFeed((prev) => [
        {
          id: `jtty-tx-${Date.now()}`,
          timestampUtc: nowUtcStamp(),
          direction: 'TX',
          mode: 'JTTY',
          callsign,
          frequencyHz: currentFreqHz,
          text: clean,
        },
        ...prev.slice(0, 49),
      ]);

      const cfg = jttyConfigRef.current;
      audioEngineRef.current?.playJttySequence(clean, 0.26, true, cfg);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'jtty:tx', text: clean, jttyConfig: cfg }));
      }

      const dur = Math.max(700, Math.min(8000, jttyDurationMs(clean, cfg)));
      digitalTimerRef.current = window.setTimeout(() => {
        audioEngineRef.current?.stopMorseSequence();
        pttMicRef.current = endAutomatedTx(pttMicRef.current);
        setIsSendingJtty(false);
        if (!pttMicRef.current.isTransmitting) {
          audioEngineRef.current?.setTransmitting(false);
          isTransmittingRef.current = false;
          setIsTransmitting(false);
        }
      }, dur);
    },
    [callsign, currentFreqHz, clearCwTimers, clearDigitalTimers]
  );

  const handleLoopbackJtty = useCallback(
    (decodedText: string, snrRatio: number) => {
      setJttyFeed((prev) => [
        {
          id: `jtty-loop-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestampUtc: nowUtcStamp(),
          direction: 'SYS',
          mode: 'JTTY',
          callsign: 'DSP-LOOP',
          frequencyHz: currentFreqHz,
          text: `${decodedText} [JIS-6 ${snrRatio}:1]`,
        },
        ...prev.slice(0, 49),
      ]);
    },
    [currentFreqHz]
  );

  const handleSendSstv = useCallback(
    (payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>) => {
      if (!isPoweredOnRef.current) return;
      clearCwTimers();
      clearDigitalTimers();
      isSendingCwRef.current = false;
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingRtty(false);
      setIsSendingJtty(false);
      setIsSendingFt8(false);
      pttMicRef.current = beginAutomatedTx(pttMicRef.current);
      setMode('SSTV');
      setFilterWidthKhz(2.4);
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setIsSendingSstv(true);
      setSstvTxProgress(0.05);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      const spec = SSTV_MODE_SPECS[payload.sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];
      const durationMs = spec.txSweepMs;
      const rgb = decodeBase64ToRgb(payload.pixelsBase64, payload.width * payload.height * 3);
      audioEngineRef.current?.playSstvSequenceFromRgb(
        rgb,
        payload.width,
        payload.height,
        payload.sstvMode,
        durationMs,
        0.24,
        true
      );

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'sstv:tx',
            sstvMode: payload.sstvMode,
            width: payload.width,
            height: payload.height,
            pixelsBase64: payload.pixelsBase64,
            caption: payload.caption,
          })
        );
      }

      const start = Date.now();
      digitalProgressRef.current = window.setInterval(() => {
        setSstvTxProgress(Math.min(1, (Date.now() - start) / durationMs));
      }, 75);

      digitalTimerRef.current = window.setTimeout(() => {
        clearDigitalTimers();
        audioEngineRef.current?.stopMorseSequence();
        pttMicRef.current = endAutomatedTx(pttMicRef.current);
        setIsSendingSstv(false);
        setSstvTxProgress(0);
        if (!pttMicRef.current.isTransmitting) {
          audioEngineRef.current?.setTransmitting(false);
          isTransmittingRef.current = false;
          setIsTransmitting(false);
        }
      }, durationMs);
    },
    [clearCwTimers, clearDigitalTimers]
  );

  const handleLoopbackSstv = useCallback(
    (
      payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>,
      stats: { visDetected: boolean; syncLocks: number; sourceLabel: string }
    ) => {
      if (!isPoweredOnRef.current) return;
      const spec = SSTV_MODE_SPECS[payload.sstvMode] ?? SSTV_MODE_SPECS['Robot 36'];
      const frame: SstvFramePayload = {
        id: `sstv-loop-${Date.now()}`,
        timestampUtc: nowUtcStamp(),
        ...payload,
      };
      const rgb = decodeBase64ToRgb(payload.pixelsBase64, payload.width * payload.height * 3);
      audioEngineRef.current?.playSstvSequenceFromRgb(
        rgb,
        payload.width,
        payload.height,
        payload.sstvMode,
        spec.txSweepMs,
        0.16,
        true
      );
      animateRxSstvSweep(frame, stats);
    },
    [animateRxSstvSweep]
  );

  const handleSelectRxGalleryItem = useCallback((frame: SstvFramePayload) => {
    if (sstvRxSweepRef.current !== null) {
      window.clearInterval(sstvRxSweepRef.current);
      sstvRxSweepRef.current = null;
    }
    setSstvRxFrame(frame);
    setSstvRxProgress(1);
    setSstvRxStats({
      visDetected: true,
      syncLocks: frame.height,
      sourceLabel: `Saved · ${frame.callsign}`,
    });
  }, []);

  const handleSendFt8 = useCallback(
    (rawMsg: string, audioFreqHz: number) => {
      if (!isPoweredOnRef.current) return;
      const clean = sanitizeFt8Message(rawMsg);
      if (!clean) return;

      clearCwTimers();
      clearDigitalTimers();
      isSendingCwRef.current = false;
      setIsSendingCw(false);
      setCwTxProgress(0);
      setIsSendingRtty(false);
      setIsSendingJtty(false);
      setIsSendingSstv(false);
      setSstvTxProgress(0);
      pttMicRef.current = beginAutomatedTx(pttMicRef.current);
      setMode('FT8');
      setFilterWidthKhz(2.4);
      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.setTransmitting(true);
      isTransmittingRef.current = true;
      setIsTransmitting(true);
      setIsSendingFt8(true);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      const parsed = parseFt8Message(clean);
      const txLine: Ft8DecodedLine = {
        id: `ft8-tx-${Date.now()}`,
        utcTime: nowUtcTimeShort(),
        snrDb: 0,
        dtSec: 0,
        audioFreqHz,
        rfFreqHz: currentFreqHz,
        band: activeBand,
        callsign,
        message: clean,
        isCq: parsed.isCq,
        direction: 'TX',
      };
      setFt8Log((prev) => [txLine, ...prev.slice(0, 59)]);

      const tones = encodeFt8Tones(clean);
      audioEngineRef.current?.playFt8Sequence(tones, audioFreqHz, 0.26, true);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ft8:tx',
            message: clean,
            audioFreqHz,
            mode: 'FT8',
          })
        );
      }

      digitalTimerRef.current = window.setTimeout(() => {
        audioEngineRef.current?.stopMorseSequence();
        pttMicRef.current = endAutomatedTx(pttMicRef.current);
        setIsSendingFt8(false);
        if (!pttMicRef.current.isTransmitting) {
          audioEngineRef.current?.setTransmitting(false);
          isTransmittingRef.current = false;
          setIsTransmitting(false);
        }
      }, 4400);
    },
    [activeBand, callsign, currentFreqHz, clearCwTimers, clearDigitalTimers]
  );

  const handleJoinAndTuneStation = useCallback(
    (station: RemoteStation) => {
      setServerId(station.serverId);
      setGroupId(station.groupId);
      setActiveBand(station.band);
      setActiveFrequency(station.frequencyHz, station.band);
      handleSelectMode(station.mode);
      const bearing = calculateBearingDeg(qth, station.qth);
      if (getAntennaSpec(antennaId).isRotatable) {
        setRotorTargetDeg(bearing);
      }
      setActiveModuleTab('waterfall');
      setChecklist((c) => ({ ...c, tunedBand: true, rotatedAntenna: true }));
    },
    [qth, antennaId, setActiveFrequency, handleSelectMode]
  );

  const handlePostClusterSpot = useCallback(
    async (spot: {
      dxCall: string;
      frequencyHz: number;
      band: BandId;
      mode: RadioMode;
      comment: string;
    }) => {
      await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotter: callsign,
          dxCall: spot.dxCall,
          frequencyHz: spot.frequencyHz,
          band: spot.band,
          mode: spot.mode,
          comment: spot.comment,
          grid: qth.grid,
          serverId,
          groupId,
        }),
      });
    },
    [callsign, qth.grid, serverId, groupId]
  );

  const handleUpdatePropagation = useCallback((next: PropagationConditions) => {
    setPropagation(next);
    setChecklist((c) => ({ ...c, checkedPropagation: true }));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'propagation:update',
          conditions: next,
        })
      );
    }
  }, []);

  const handleRefreshHourlyPropagation = useCallback(async () => {
    setIsRefreshingHourlyProp(true);
    try {
      const res = await fetch('/api/propagation/refresh', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { conditions?: PropagationConditions };
        if (data?.conditions) {
          setPropagation(data.conditions);
          return;
        }
      }
      setPropagation(computeHourlyPropagationSnapshot(Date.now()));
    } catch {
      setPropagation(computeHourlyPropagationSnapshot(Date.now()));
    } finally {
      setIsRefreshingHourlyProp(false);
    }
  }, []);

  const handleAddQso = useCallback(async (entry: Omit<QsoEntry, 'id' | 'timestampUtc'>) => {
    const res = await fetch('/api/qsos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = (await res.json()) as { qso: QsoEntry };
      setQsos((prev) => [data.qso, ...prev]);
      setChecklist((c) => ({ ...c, loggedQso: true }));
    }
  }, []);

  const handleDeleteQso = useCallback(async (id: string) => {
    const res = await fetch(`/api/qsos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setQsos((prev) => prev.filter((q) => q.id !== id));
    }
  }, []);

  const chassisRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') return { w: 1280, h: 800 };
    return {
      w: window.visualViewport?.width ?? window.innerWidth,
      h: window.visualViewport?.height ?? window.innerHeight,
    };
  });
  const [chassisNatural, setChassisNatural] = useState<{ w: number; h: number }>({ w: 1160, h: 660 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      setViewportSize({
        w: Math.round(window.visualViewport?.width ?? window.innerWidth),
        h: Math.round(window.visualViewport?.height ?? window.innerHeight),
      });
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, []);

  useEffect(() => {
    const el = chassisRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w > 0 && h > 0) {
        setChassisNatural((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isLandscapeViewport = viewportSize.w > viewportSize.h;
  const landscapeScale =
    isLandscapeViewport && chassisNatural.w > 0 && chassisNatural.h > 0
      ? Math.min(
          1,
          Math.max(0.25, (viewportSize.w - 8) / chassisNatural.w),
          Math.max(0.25, (viewportSize.h - 8) / chassisNatural.h)
        )
      : 1;

  return (
    <div
      data-testid="radio-viewport-shell"
      className={
        isLandscapeViewport
          ? 'h-dvh w-screen overflow-hidden bg-[#04070c] flex items-center justify-center p-1 text-slate-100'
          : 'min-h-dvh bg-[#04070c] flex items-center justify-center p-1 sm:p-1.5 pb-[max(0.25rem,env(safe-area-inset-bottom))] text-slate-100'
      }
    >
      <div
        style={
          isLandscapeViewport
            ? {
                width: Math.floor(chassisNatural.w * landscapeScale),
                height: Math.floor(chassisNatural.h * landscapeScale),
              }
            : undefined
        }
        className={isLandscapeViewport ? 'relative shrink-0' : 'w-full max-w-[1160px]'}
      >
        <div
          ref={chassisRef}
          style={
            isLandscapeViewport && landscapeScale < 0.999
              ? {
                  transform: `scale(${landscapeScale})`,
                  transformOrigin: 'top left',
                }
              : undefined
          }
          className={`${
            isLandscapeViewport ? 'w-[1160px]' : 'w-full max-w-[1160px]'
          } sdr-chassis rounded-xl border border-[#1f3147] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col`}
        >
        <HeaderBar
          wsStatus={wsStatus}
          serverId={serverId}
          groupId={groupId}
          callsign={callsign}
          peerCount={Math.max(1, remotePeers.length)}
          propagation={propagation}
          audioEnabled={audioEnabled}
          isPoweredOn={isPoweredOn}
          onTogglePower={handleTogglePower}
          onToggleAudio={handleEnableAudio}
          onChangeServer={setServerId}
          onChangeGroup={setGroupId}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenCallsignRegistry={() => setShowCallsignModal(true)}
          onOpenAdmin={() => setShowAdminModal(true)}
          onOpenPropagation={() => {
            setShowPropModal(true);
            setChecklist((c) => ({ ...c, checkedPropagation: true }));
          }}
          onOpenLearn={() => setShowLearnModal(true)}
        />

        {/* Admin Assistance / Removal Notice Banners */}
        {adminNotice && (
          <div className="px-3 py-1 bg-sky-500/15 border-b border-sky-400/50 flex items-center justify-between text-xs text-sky-200 font-mono-tabular">
            <span>
              <strong>Admin ({adminNotice.fromAdmin}):</strong> {adminNotice.message}
            </span>
            <button
              type="button"
              onClick={() => setAdminNotice(null)}
              className="text-sky-300 hover:text-white underline cursor-pointer ml-3"
            >
              Dismiss
            </button>
          </div>
        )}
        {removedBanner && (
          <div className="px-3 py-1.5 bg-rose-600/25 border-b border-rose-400 text-xs text-rose-200 font-mono-tabular">
            {removedBanner}
          </div>
        )}

        {/* Main Console Body */}
        <main
          aria-disabled={!isPoweredOn}
          className={`p-1.5 flex flex-col gap-1.5 w-full transition-opacity duration-200 ${
            isPoweredOn ? 'opacity-100' : 'opacity-45 pointer-events-none select-none'
          }`}
        >
          <div className="flex flex-col landscape:flex-row lg:flex-row gap-1.5">
            {/* Left Column: Antenna, Rotor, Band, Propagation Conditions */}
            <LeftControlColumn
              antennaId={antennaId}
              onChangeAntenna={handleChangeAntenna}
              rotorHeadingDeg={rotorHeadingDeg}
              rotorTargetDeg={rotorTargetDeg}
              onSetRotorTarget={handleSetRotorTarget}
              activeBand={activeBand}
              onSelectBand={handleSelectBand}
              propagation={propagation}
              onUpdatePropagation={handleUpdatePropagation}
              onOpenPropagation={() => {
                setShowPropModal(true);
                setChecklist((c) => ({ ...c, checkedPropagation: true }));
              }}
              qth={qth}
              stations={mapAndBeaconStations}
              currentSwr={currentSwr}
              onLocateMe={handleLocateMe}
              onOpenSettings={() => setShowSettingsModal(true)}
            />

            {/* Center Column: 5 Old-School S-Meters, VFO Deck, Group Switcher */}
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {/* 5 Old-School Analog Meters (with small monitor speaker directly under ALC) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 landscape:grid-cols-5 xl:grid-cols-5 gap-1.5 items-start">
                <AnalogMeter
                  testId="s-meter"
                  label="S-Meter"
                  dialLegend="S-UNITS"
                  valueText={isPoweredOn ? displayedSMeterText : '--'}
                  normalized={isPoweredOn ? displayedSMeterNormalized : 0}
                  ticks={['1', '3', '5', '7', '9', '+20', '+60']}
                  accent={isTransmitting ? 'emerald' : 'cyan'}
                  isPoweredOn={isPoweredOn}
                  dangerFrom={0.6}
                  subtitle={
                    isTransmitting
                      ? 'TX RF modulation & keying monitor in S-units'
                      : 'Received signal strength in S-units'
                  }
                />
                <AnalogMeter
                  testId="swr-meter"
                  label="SWR"
                  dialLegend="VSWR"
                  valueText={isPoweredOn ? currentSwr.toFixed(1) : '--'}
                  normalized={isPoweredOn ? Math.min(1, (currentSwr - 1) / 4.5) : 0}
                  ticks={['1', '1.5', '2', '3', '5', '10']}
                  accent={isSwrHigh(currentSwr) ? 'red' : 'cyan'}
                  alertRed={isSwrHigh(currentSwr)}
                  isPoweredOn={isPoweredOn}
                  dangerFrom={0.5}
                  subtitle="Voltage Standing Wave Ratio (turns red above 1.6; click Tune to match antenna)"
                />
                <div className="flex flex-col gap-1">
                  <AnalogMeter
                    label="ALC"
                    dialLegend="ALC %"
                    valueText={isPoweredOn ? `${isTransmitting ? alcPct : 12}%` : '--'}
                    normalized={isPoweredOn ? (isTransmitting ? alcPct : 12) / 100 : 0}
                    ticks={['0', '25', '50', '75', '100']}
                    accent={alcPct > 80 && isTransmitting ? 'amber' : 'cyan'}
                    isPoweredOn={isPoweredOn}
                    dangerFrom={0.75}
                    subtitle="Automatic Level Control during modulation"
                  />
                  <SpeakerGrille />
                </div>
                <AnalogMeter
                  label="Compression"
                  shortLabel="Comp"
                  dialLegend="COMP"
                  valueText={isPoweredOn ? `${compressionPct}%` : '--'}
                  normalized={isPoweredOn ? compressionPct / 100 : 0}
                  ticks={['0', '25', '50', '75', '100']}
                  accent="cyan"
                  isPoweredOn={isPoweredOn}
                  dangerFrom={0.8}
                  subtitle="Speech processor compression level"
                />
                <AnalogMeter
                  testId="rf-power-meter"
                  label={paResult.paActive ? 'RF Power (500W PA)' : 'RF Power (100W)'}
                  shortLabel="RF Pwr"
                  dialLegend={paResult.paActive ? 'WATTS 500W' : 'WATTS 100W'}
                  valueText={
                    isPoweredOn
                      ? `${(isTransmitting ? deliveredPowerW : paResult.paActive ? deliveredPowerW : Math.min(txPowerW, deliveredPowerW)).toFixed(1)}W`
                      : '0.0W'
                  }
                  normalized={
                    isPoweredOn
                      ? (isTransmitting
                          ? deliveredPowerW
                          : paResult.paActive
                          ? deliveredPowerW
                          : Math.min(txPowerW, deliveredPowerW)) /
                        (paResult.paActive ? MAX_PA_POWER_W : MAX_TX_POWER_W)
                      : 0
                  }
                  ticks={paResult.paActive ? ['0', '100', '200', '300', '400', '500'] : ['0', '20', '40', '60', '80', '100']}
                  accent={isTransmitting ? 'emerald' : paResult.paActive ? 'amber' : 'cyan'}
                  isPoweredOn={isPoweredOn}
                  dangerFrom={0.8}
                  subtitle={
                    paResult.paActive
                      ? 'Forward RF output power with Linear PA active (up to 500W)'
                      : 'Forward RF output power up to 100W'
                  }
                />
              </div>

              {/* VFO & Mode Deck */}
              <VfoDeck
                activeVfo={activeVfo}
                onSelectVfo={setActiveVfo}
                onSwapVfo={handleSwapVfo}
                frequencyHz={currentFreqHz}
                onTuneDelta={handleTuneDelta}
                mode={mode}
                onSelectMode={handleSelectMode}
                isTransmitting={isTransmitting}
                ritHz={ritHz}
                xitHz={xitHz}
                clarifierHz={clarifierHz}
                onChangeRit={setRitHz}
                onChangeXit={setXitHz}
                onChangeClarifier={setClarifierHz}
                stepHz={stepHz}
                onChangeStepHz={setStepHz}
                tuneSpeed={tuneSpeed}
                onChangeTuneSpeed={setTuneSpeed}
                isPoweredOn={isPoweredOn}
              />

              {/* PTT & Microphone Section (Positioned on upper-middle control deck) */}
              <PttMicPanel
                mode={mode}
                isPoweredOn={isPoweredOn}
                micEnabled={micEnabled && isTransmitting && isPoweredOn}
                micLevelDb={isPoweredOn ? micLevelDb : -55}
                isTransmitting={isTransmitting && isPoweredOn}
                pttHeld={pttHeld && isPoweredOn}
                pttLatched={pttLatched && isPoweredOn}
                onStartPtt={handleStartPtt}
                onStopPtt={() => handleStopPtt('pointerup')}
                onTogglePttLatch={handleTogglePttLatch}
              />

              {/* Group Switcher: Waterfall, CW, RTTY, JTTY, SSTV, FT8, Live Cluster, Prop Map */}
              <CenterModeSwitcher
                activeTab={activeModuleTab}
                onChangeTab={setActiveModuleTab}
                isPoweredOn={isPoweredOn}
                callsign={callsign}
                qth={qth}
                serverId={serverId}
                groupId={groupId}
                band={activeBand}
                onSelectBand={handleSelectBand}
                frequencyHz={effectiveRxFreqHz}
                onTuneToFrequency={handleTuneToFrequency}
                onTuneDelta={handleTuneDelta}
                stepHz={stepHz}
                filterWidthKhz={filterWidthKhz}
                rfGainPct={rfGainPct}
                noiseFloorDbm={bandCondition.noiseDbm}
                noiseReductionPct={noiseReductionPct}
                noiseBlankerPct={noiseBlankerPct}
                notchPct={notchPct}
                ritHz={ritHz}
                isTransmitting={isTransmitting}
                micRms={micRms}
                mode={mode}
                stations={evaluatedStations}
                signalBurstsRef={signalBurstsRef}
                allGlobalStations={allGlobalStations}
                spanKhz={spanKhz}
                onChangeSpanKhz={setSpanKhz}
                zoom={zoom}
                onChangeZoom={setZoom}
                cwWpm={cwWpm}
                onChangeCwWpm={setCwWpm}
                cwDecodeEnabled={cwDecodeEnabled}
                onToggleCwDecode={() => setCwDecodeEnabled((p) => !p)}
                cwDecodedText={isPoweredOn ? cwDecodedText : 'STANDBY'}
                cwTextInput={cwTextInput}
                onChangeCwTextInput={setCwTextInput}
                onSendCwText={handleSendCwText}
                onSendCwCq={handleSendCwCq}
                onStopCwTx={handleStopCwTx}
                isSendingCw={isSendingCw && isPoweredOn}
                cwTxProgress={cwTxProgress}
                cwFeed={cwFeed}
                rttyFeed={rttyFeed}
                isSendingRtty={isSendingRtty && isPoweredOn}
                rttyConfig={rttyConfig}
                onChangeRttyConfig={setRttyConfig}
                onSendRtty={handleSendRtty}
                onLoopbackDecodeRtty={handleLoopbackRtty}
                onStopDigitalTx={handleStopDigitalTx}
                onLogQso={(dxCall, qsoMode) => {
                  const dxGrid =
                    resolveGridForCallsign(dxCall, remotePeers, callsignDirectory) || qth.grid;
                  void handleAddQso({
                    callsign: dxCall,
                    band: activeBand,
                    frequencyHz: currentFreqHz,
                    mode: qsoMode,
                    rstSent: '599',
                    rstRcvd: '599',
                    powerW: deliveredPowerW,
                    grid: dxGrid,
                    notes: `${qsoMode} contact via Aurora 100W SDR`,
                  });
                  setShowQsoModal(true);
                }}
                audioEngine={audioEngineRef.current}
                jttyFeed={jttyFeed}
                isSendingJtty={isSendingJtty && isPoweredOn}
                jttyConfig={jttyConfig}
                onChangeJttyConfig={setJttyConfig}
                onSendJtty={handleSendJtty}
                onLoopbackDecodeJtty={handleLoopbackJtty}
                sstvRxFrame={sstvRxFrame}
                sstvRxProgress={sstvRxProgress}
                sstvRxStats={sstvRxStats}
                sstvGallery={sstvGallery}
                isSendingSstv={isSendingSstv && isPoweredOn}
                sstvTxProgress={sstvTxProgress}
                onSendSstv={handleSendSstv}
                onLoopbackDecodeSstv={handleLoopbackSstv}
                onSelectRxGalleryItem={handleSelectRxGalleryItem}
                ft8Log={ft8Log}
                isSendingFt8={isSendingFt8 && isPoweredOn}
                onSendFt8={handleSendFt8}
                clusterSpots={clusterSpots}
                onJoinAndTuneStation={handleJoinAndTuneStation}
                onPostClusterSpot={handlePostClusterSpot}
                propagation={propagation}
                onOpenPropagation={() => {
                  setShowPropModal(true);
                  setChecklist((c) => ({ ...c, checkedPropagation: true }));
                }}
                onRefreshHourly={() => void handleRefreshHourlyPropagation()}
                isRefreshingHourly={isRefreshingHourlyProp}
              />
            </div>

            {/* Right Column: World Map + DSP Buttons + ATU + QSO Log */}
            <aside className="flex flex-col gap-1 w-full landscape:w-[222px] lg:w-[222px] shrink-0">
              <WorldMapPanel
                qth={qth}
                rotorHeadingDeg={rotorHeadingDeg}
                band={activeBand}
                propagation={propagation}
                stations={mapAndBeaconStations}
                onSelectBand={handleSelectBand}
                onSetRotorTarget={handleSetRotorTarget}
                onTuneArrlBeacon={handleTuneArrlBeacon}
                isRotatable={getAntennaSpec(antennaId).isRotatable}
                onLocateMe={handleLocateMe}
                onOpenSettings={() => setShowSettingsModal(true)}
                onOpenPropagation={() => {
                  setShowPropModal(true);
                  setChecklist((c) => ({ ...c, checkedPropagation: true }));
                }}
              />

              <DspControlPanel
                filterWidthKhz={filterWidthKhz}
                onChangeFilterWidth={setFilterWidthKhz}
                rfGainPct={rfGainPct}
                onChangeRfGain={setRfGainPct}
                afGainPct={afGainPct}
                onChangeAfGain={setAfGainPct}
                noiseReductionPct={noiseReductionPct}
                onChangeNoiseReduction={setNoiseReductionPct}
                notchPct={notchPct}
                onChangeNotch={setNotchPct}
                noiseBlankerPct={noiseBlankerPct}
                onChangeNoiseBlanker={setNoiseBlankerPct}
                txPowerW={txPowerW}
                deliveredPowerW={deliveredPowerW}
                onChangeTxPower={(w) => setTxPowerW(Math.min(MAX_TX_POWER_W, Math.max(MIN_TX_POWER_W, w)))}
                currentSwr={currentSwr}
                isTuningAtu={isTuningAtu}
                onRunAtuTune={handleRunAtuTune}
                paEnabled={paEnabled}
                paGainDb={paGainDb}
                paTripped={paResult.paTripped}
                paOutputW={deliveredPowerW}
                isTransmitting={isTransmitting && isPoweredOn}
                onTogglePa={() => setPaEnabled((prev) => !prev)}
                onChangePaGain={setPaGainDb}
                isPoweredOn={isPoweredOn}
                onOpenQsoLog={() => setShowQsoModal(true)}
                qsoCount={qsos.length}
              />
            </aside>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-3 py-1 border-t border-[#182536] bg-[#070b11] flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-slate-200 tracking-wider">AURORA 100W SDR</span>
            <span className="font-mono-tabular text-slate-500">Live HF Mesh</span>
          </div>

          <div className="hidden sm:block text-slate-400">
            Amateur Radio <span className="mx-1">·</span> HR Club <span className="mx-1">·</span> Exploration
          </div>

          <div className="flex items-center gap-2 font-mono-tabular">
            {isPoweredOn ? (
              <>
                <span className="text-sky-300">Band {activeBand}: {bandCondition.rating}</span>
                <span className="text-slate-600">|</span>
                <span>MUF {bandCondition.mufMhz} MHz</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-200">{deliveredPowerW.toFixed(1)}W</span>
              </>
            ) : (
              <span className="text-rose-400">POWER OFF · STANDBY</span>
            )}
          </div>
        </footer>
        </div>
      </div>

      {/* Modals */}
      <PropagationModal
        open={showPropModal}
        conditions={propagation}
        qth={qth}
        onChange={handleUpdatePropagation}
        onRefreshHourly={() => void handleRefreshHourlyPropagation()}
        isRefreshingHourly={isRefreshingHourlyProp}
        onClose={() => setShowPropModal(false)}
      />

      <QsoLogModal
        open={showQsoModal}
        qsos={qsos}
        currentBand={activeBand}
        currentFrequencyHz={currentFreqHz}
        currentMode={mode}
        currentPowerW={deliveredPowerW}
        suggestedCallsign={
          bestInPassband && !bestInPassband.station.isBeacon
            ? bestInPassband.station.callsign.replace('/B', '')
            : ''
        }
        suggestedGrid={
          bestInPassband && !bestInPassband.station.isBeacon
            ? bestInPassband.station.qth.grid ??
              resolveGridForCallsign(
                bestInPassband.station.callsign.replace('/B', ''),
                remotePeers,
                callsignDirectory
              )
            : ''
        }
        knownStations={remotePeers}
        callsignRecords={callsignDirectory}
        onAddQso={handleAddQso}
        onDeleteQso={handleDeleteQso}
        onClose={() => setShowQsoModal(false)}
      />

      <StationSettingsModal
        open={showSettingsModal}
        callsign={callsign}
        isCallsignPermanent={callsignPermanent}
        qth={qth}
        txPowerW={txPowerW}
        compressionPct={compressionPct}
        onSave={(next) => {
          const finalCall = callsignPermanent ? callsign : next.callsign;
          const clampedPower = Math.min(MAX_TX_POWER_W, Math.max(MIN_TX_POWER_W, next.txPowerW));
          setCallsign(finalCall);
          setQth(next.qth);
          setTxPowerW(clampedPower);
          setCompressionPct(next.compressionPct);
          saveStationProfile({
            callsign: finalCall,
            callsignPermanent,
            qth: next.qth,
            qthExplicit: true,
            txPowerW: clampedPower,
            powerVersion: 2,
            compressionPct: next.compressionPct,
          });
        }}
        onOpenCallsignRegistry={() => setShowCallsignModal(true)}
        onClose={() => setShowSettingsModal(false)}
      />

      <CallsignRegistryModal
        open={showCallsignModal}
        radioId={radioId}
        currentCallsign={callsign}
        currentGrid={qth.grid}
        isCallsignPermanent={callsignPermanent}
        onApplyIdentity={(newCall, newQth, permanent) => {
          setCallsign(newCall);
          const locked = Boolean(permanent);
          setCallsignPermanent(locked);
          const nextQth = newQth ?? qth;
          if (newQth) setQth(newQth);
          saveStationProfile({
            callsign: newCall,
            callsignPermanent: locked,
            qth: nextQth,
            qthExplicit: Boolean(newQth),
            txPowerW,
            powerVersion: 2,
            compressionPct,
          });
          fetch('/api/callsigns')
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { records?: CallsignRecord[] } | null) => {
              if (data?.records && Array.isArray(data.records)) setCallsignDirectory(data.records);
            })
            .catch(() => {});
        }}
        onClose={() => setShowCallsignModal(false)}
      />

      <AdminPanelModal
        open={showAdminModal}
        adminToken={adminToken}
        onSetAdminToken={setAdminToken}
        onClose={() => setShowAdminModal(false)}
      />

      <BeginnerGuideModal
        open={showLearnModal}
        checklist={checklist}
        onClose={() => setShowLearnModal(false)}
      />
    </div>
  );
}
