import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SdrAudioEngine } from './audio/sdrAudioEngine';
import { AnalogMeter } from './components/AnalogMeter';
import { BeginnerGuideModal } from './components/BeginnerGuideModal';
import { BottomControlStrip } from './components/BottomControlStrip';
import { DspControlPanel } from './components/DspControlPanel';
import { HeaderBar } from './components/HeaderBar';
import { LeftControlColumn } from './components/LeftControlColumn';
import { PropagationModal } from './components/PropagationModal';
import { QsoLogModal } from './components/QsoLogModal';
import { SpectrumWaterfall } from './components/SpectrumWaterfall';
import { StationSettingsModal } from './components/StationSettingsModal';
import { VfoDeck } from './components/VfoDeck';
import { WorldMapPanel } from './components/WorldMapPanel';
import { estimateQthFromTimeZone } from './radio/azimuthalMap';
import { PROPAGATION_BEACONS } from './radio/beacons';
import {
  clampFrequencyToBand,
  computeSwr,
  computeTxFoldbackPower,
  dbmToNormalizedMeter,
  dbmToSMeterText,
  DEFAULT_PROPAGATION,
  evaluateBandCondition,
  evaluateRemoteSignal,
  findBandForFrequency,
  getBandSpec,
  hasSendableMorse,
  maidenheadFromLatLon,
  morseDurationMs,
  sanitizeCwText,
  stepRotorToward,
} from './radio/physics';
import {
  AntennaId,
  BandId,
  PropagationConditions,
  QsoEntry,
  QthLocation,
  RadioMode,
  RemoteStation,
  StepSizeHz,
  TuneSpeed,
} from './types/radio';

const STATION_STORAGE_KEY = 'aurora_qrp_station_v1';
const DEFAULT_QTH: QthLocation = { lat: -29.8587, lon: 31.0218, grid: 'KG43' };

interface SavedStationProfile {
  callsign?: string;
  qth?: QthLocation;
  txPowerW?: number;
  compressionPct?: number;
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

export default function App() {
  const initialSaved = useMemo(() => loadSavedStationProfile(), []);

  // Station identity & network
  const [callsign, setCallsign] = useState(initialSaved?.callsign || 'ZS1ROM');
  const [qth, setQth] = useState<QthLocation>(initialSaved?.qth ?? DEFAULT_QTH);
  const [serverId, setServerId] = useState('eu');
  const [groupId, setGroupId] = useState('south-africa');
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [clientId, setClientId] = useState<string>('');
  const [remotePeers, setRemotePeers] = useState<RemoteStation[]>([]);

  // VFO & Radio State
  const [activeVfo, setActiveVfo] = useState<'A' | 'B'>('A');
  const [vfoAFreqHz, setVfoAFreqHz] = useState(14_250_000);
  const [vfoBFreqHz, setVfoBFreqHz] = useState(7_090_000);
  const [activeBand, setActiveBand] = useState<BandId>('20m');
  const [mode, setMode] = useState<RadioMode>('USB');
  const [ritHz, setRitHz] = useState(0);
  const [xitHz, setXitHz] = useState(0);
  const [clarifierHz, setClarifierHz] = useState(0);
  const [stepHz, setStepHz] = useState<StepSizeHz>(10);
  const [tuneSpeed, setTuneSpeed] = useState<TuneSpeed>('Fine');

  // Antenna, Rotor & ATU
  const [antennaId, setAntennaId] = useState<AntennaId>('yagi5');
  const [rotorHeadingDeg, setRotorHeadingDeg] = useState(142);
  const [rotorTargetDeg, setRotorTargetDeg] = useState(142);
  const [atuMatchFactor, setAtuMatchFactor] = useState(0.76);
  const [isTuningAtu, setIsTuningAtu] = useState(false);

  // DSP & Audio
  const [filterWidthKhz, setFilterWidthKhz] = useState(2.4);
  const [rfGainPct, setRfGainPct] = useState(52);
  const [afGainPct, setAfGainPct] = useState(68);
  const [noiseReductionPct, setNoiseReductionPct] = useState(48);
  const [notchPct, setNotchPct] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const isPoweredOnRef = useRef(isPoweredOn);
  isPoweredOnRef.current = isPoweredOn;

  // Scope Controls
  const [spanKhz, setSpanKhz] = useState(50);
  const [zoom, setZoom] = useState(1);

  // TX / PTT / Mic / Keyer
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [pttLatchMode, setPttLatchMode] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micLevelDb, setMicLevelDb] = useState(-10.0);
  const [micRms, setMicRms] = useState(0);
  const [alcPct, setAlcPct] = useState(12);
  const [compressionPct, setCompressionPct] = useState(initialSaved?.compressionPct ?? 5);
  const [txPowerW, setTxPowerW] = useState(initialSaved?.txPowerW ?? 5.0);
  const [cwWpm, setCwWpm] = useState(15);
  const [cwDecodeEnabled, setCwDecodeEnabled] = useState(true);
  const [cwDecodedText, setCwDecodedText] = useState('CQ CQ CQ de ZS1ROM ZS1ROM');
  const [cwTextInput, setCwTextInput] = useState('');
  const [isSendingCw, setIsSendingCw] = useState(false);
  const isSendingCwRef = useRef(isSendingCw);
  isSendingCwRef.current = isSendingCw;
  const [cwTxProgress, setCwTxProgress] = useState(0);
  const cwEndTimerRef = useRef<number | null>(null);
  const cwProgressTimerRef = useRef<number | null>(null);

  // Propagation & Logbook & Modals
  const [propagation, setPropagation] = useState<PropagationConditions>(DEFAULT_PROPAGATION);
  const [qsos, setQsos] = useState<QsoEntry[]>([]);
  const [showPropModal, setShowPropModal] = useState(false);
  const [showQsoModal, setShowQsoModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLearnModal, setShowLearnModal] = useState(false);

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

  const currentFreqHz = activeVfo === 'A' ? vfoAFreqHz : vfoBFreqHz;
  const effectiveRxFreqHz = currentFreqHz + ritHz + clarifierHz;

  // Evaluate all active stations (real VOIP peers + global propagation beacons)
  const evaluatedStations = useMemo(() => {
    const allStations: RemoteStation[] = [
      ...remotePeers.filter((p) => p.id !== clientId),
      ...PROPAGATION_BEACONS,
    ];
    return allStations.map((station) => ({
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

  const bandCondition = useMemo(
    () => evaluateBandCondition(activeBand, propagation),
    [activeBand, propagation]
  );

  // Determine strongest signal in passband for S-Meter & CW decoder
  const bestInPassband = useMemo(() => {
    const candidates = evaluatedStations.filter(
      (s) => s.station.isTransmitting && s.evalResult.inPassband
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, cur) =>
      cur.evalResult.rxPowerDbm > best.evalResult.rxPowerDbm ? cur : best
    );
  }, [evaluatedStations]);

  const sMeterDbm = bestInPassband ? bestInPassband.evalResult.rxPowerDbm : bandCondition.noiseDbm + (rfGainPct - 50) * 0.15;
  const sMeterText = dbmToSMeterText(sMeterDbm);
  const sMeterNormalized = dbmToNormalizedMeter(sMeterDbm);

  const currentSwr = useMemo(
    () => computeSwr(antennaId, activeBand, atuMatchFactor),
    [antennaId, activeBand, atuMatchFactor]
  );

  const deliveredPowerW = useMemo(
    () => computeTxFoldbackPower(txPowerW, currentSwr),
    [txPowerW, currentSwr]
  );

  // Sync Web Audio DSP parameters
  useEffect(() => {
    audioEngineRef.current?.updateParams({
      afGainPct,
      rfGainPct,
      noiseReductionPct,
      notchPct,
      filterWidthKhz,
      mode,
      isTransmitting: isTransmitting && isPoweredOn,
      audioEnabled: audioEnabled && isPoweredOn,
      noiseFloorDbm: bandCondition.noiseDbm,
      bestSignalSnrDb: bestInPassband?.evalResult.snrDb ?? 0,
      bestSignalInPassband: Boolean(bestInPassband),
      auroraFlutter: bestInPassband?.evalResult.auroraFlutter ?? (propagation.auroraActive ? 0.5 : 0),
    });
  }, [
    afGainPct,
    rfGainPct,
    noiseReductionPct,
    notchPct,
    filterWidthKhz,
    mode,
    isTransmitting,
    audioEnabled,
    isPoweredOn,
    bandCondition.noiseDbm,
    bestInPassband,
    propagation.auroraActive,
  ]);

  // Smooth Rotor Slewing
  useEffect(() => {
    if (rotorHeadingDeg === rotorTargetDeg) return;
    const timer = window.setInterval(() => {
      setRotorHeadingDeg((cur) => stepRotorToward(cur, rotorTargetDeg, 3));
    }, 55);
    return () => window.clearInterval(timer);
  }, [rotorHeadingDeg, rotorTargetDeg]);

  // Update CW Decoder when tuned onto a beacon (preserve active CW TX readout)
  useEffect(() => {
    if (!cwDecodeEnabled || isSendingCwRef.current || !bestInPassband?.station.cwText) return;
    setCwDecodedText(bestInPassband.station.cwText);
  }, [bestInPassband, cwDecodeEnabled]);

  // Load initial QSO log from API
  useEffect(() => {
    fetch('/api/qsos')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load QSOs'))))
      .then((data: { qsos?: QsoEntry[] }) => {
        if (Array.isArray(data.qsos)) setQsos(data.qsos);
      })
      .catch(() => {
        // Silent initial fallback if API temporarily unavailable
      });
  }, []);

  // Auto-center maps & rotor on the user's location if no manual QTH was saved yet:
  // 1) Try browser GPS geolocation directly, 2) fall back to /api/geolocate proxy headers, 3) fall back to browser timezone estimate
  useEffect(() => {
    if (initialSaved?.qth) return;
    let cancelled = false;

    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const tzEstimate = tz ? estimateQthFromTimeZone(tz) : null;
    if (tzEstimate) {
      setQth(tzEstimate);
    }

    fetch('/api/geolocate')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { qth?: QthLocation | null } | null) => {
        if (!cancelled && data?.qth) {
          setQth(data.qth);
        }
      })
      .catch(() => {
        // Ignore geolocate header unavailability
      });

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          const lat = Number(pos.coords.latitude.toFixed(4));
          const lon = Number(pos.coords.longitude.toFixed(4));
          const nextQth: QthLocation = { lat, lon, grid: maidenheadFromLatLon(lat, lon) };
          setQth(nextQth);
        },
        () => {
          // Keep proxy/timezone/default QTH if geolocation is denied or unavailable
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 }
      );
    }

    return () => {
      cancelled = true;
    };
  }, [initialSaved]);

  // WebSocket VOIP & Station Sync
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      setWsStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
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
        } else if (msg.type === 'propagation:state' && msg.conditions) {
          setPropagation(msg.conditions as PropagationConditions);
        } else if (msg.type === 'voip:audio') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          if (match && typeof msg.pcm16 === 'string') {
            audioEngineRef.current?.playIncomingVoipPcm({
              pcm16Base64: msg.pcm16,
              sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
              snrDb: match.evalResult.snrDb,
              auroraFlutter: match.evalResult.auroraFlutter,
              freqOffsetHz: match.evalResult.freqOffsetHz,
              inPassband: match.evalResult.inPassband,
            });
          }
        } else if (msg.type === 'cw:tx' && typeof msg.text === 'string') {
          if (!isPoweredOnRef.current) return;
          const fromId = msg.fromId as string;
          const match = evaluatedStationsRef.current.find((s) => s.station.id === fromId);
          if (match && match.evalResult.inPassband) {
            setCwDecodedText(`${String(msg.callsign ?? '')}: ${msg.text}`);
            if (audioEnabledRef.current) {
              audioEngineRef.current?.playMorseSequence(
                msg.text,
                typeof msg.wpm === 'number' ? msg.wpm : 15,
                720,
                0.22
              );
            }
          }
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        if (!closedByUnmount) {
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
  }, []);

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

  // Unlock Web Audio white noise & DSP automatically on first user gesture
  useEffect(() => {
    if (!isPoweredOn || !audioEnabled) return;
    const unlock = () => {
      audioEngineRef.current?.ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
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

  const handleStopCwTx = useCallback(() => {
    clearCwTimers();
    audioEngineRef.current?.stopMorseSequence();
    setIsSendingCw(false);
    setCwTxProgress(0);
    setIsTransmitting(false);
  }, [clearCwTimers]);

  // Cleanup audio and CW timers on unmount
  useEffect(() => {
    return () => {
      clearCwTimers();
      audioEngineRef.current?.dispose();
    };
  }, [clearCwTimers]);

  const handleTogglePower = useCallback(() => {
    setIsPoweredOn((prev) => {
      const next = !prev;
      if (!next) {
        clearCwTimers();
        audioEngineRef.current?.stopMorseSequence();
        setIsSendingCw(false);
        setCwTxProgress(0);
        setIsTransmitting(false);
        setMicRms(0);
        if (micEnabled) {
          audioEngineRef.current?.stopMicrophone();
          setMicEnabled(false);
          setMicLevelDb(-55);
        }
      } else {
        audioEngineRef.current?.ensureContext();
      }
      return next;
    });
  }, [micEnabled, clearCwTimers]);

  const handleEnableAudio = useCallback(() => {
    if (!isPoweredOn) return;
    audioEngineRef.current?.ensureContext();
    setAudioEnabled((prev) => !prev);
  }, [isPoweredOn]);

  const handleEnableMic = useCallback(async () => {
    if (!isPoweredOn) return;
    const engine = audioEngineRef.current;
    if (!engine) return;
    if (micEnabled) {
      engine.stopMicrophone();
      setMicEnabled(false);
      setMicLevelDb(-55);
      return;
    }
    const res = await engine.startMicrophone(
      (db, alc) => {
        setMicLevelDb(db);
        setAlcPct(alc);
      },
      (pcm16, sampleRate, rms) => {
        setMicRms(rms);
        if (wsRef.current?.readyState === WebSocket.OPEN && isPoweredOnRef.current) {
          wsRef.current.send(
            JSON.stringify({
              type: 'voip:audio',
              pcm16,
              sampleRate,
              rms,
            })
          );
        }
      }
    );
    if (res.ok) {
      setMicEnabled(true);
    } else {
      // Graceful fallback when microphone is unavailable (headless/denied)
      setMicEnabled(false);
      setMicLevelDb(-14.0);
    }
  }, [micEnabled, isPoweredOn]);

  const handleStartPtt = useCallback(() => {
    if (!isPoweredOn) return;
    audioEngineRef.current?.ensureContext();
    setIsTransmitting(true);
    setChecklist((c) => ({ ...c, transmittedOrCw: true }));
    if (!micEnabled) {
      // Simulate clean voice modulation level when operating PTT without mic permission
      setMicLevelDb(-10.0);
      setMicRms(0.24);
      setAlcPct(18);
    }
  }, [micEnabled, isPoweredOn]);

  const handleStopPtt = useCallback(() => {
    setIsTransmitting(false);
    setMicRms(0);
    if (!micEnabled) {
      setAlcPct(12);
    }
  }, [micEnabled]);

  // Global Spacebar PTT hotkey
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPoweredOnRef.current || e.code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      if (!e.repeat) {
        if (pttLatchMode) {
          if (isTransmitting) handleStopPtt();
          else handleStartPtt();
        } else {
          handleStartPtt();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || pttLatchMode) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      handleStopPtt();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pttLatchMode, isTransmitting, handleStartPtt, handleStopPtt]);

  const setActiveFrequency = useCallback(
    (nextHz: number, targetBand?: BandId) => {
      const bandToUse = targetBand ?? activeBand;
      const clamped = clampFrequencyToBand(nextHz, bandToUse);
      if (activeVfo === 'A') setVfoAFreqHz(clamped);
      else setVfoBFreqHz(clamped);
    },
    [activeBand, activeVfo]
  );

  const handleSelectBand = useCallback(
    (bandId: BandId) => {
      const spec = getBandSpec(bandId);
      setActiveBand(bandId);
      setActiveFrequency(spec.defaultHz, bandId);
      setAtuMatchFactor(0.55);
      // Conventional amateur radio HF sideband rule
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

  const handleTuneToFrequency = useCallback(
    (hz: number, nextMode?: RadioMode) => {
      const matchedBand = findBandForFrequency(hz);
      setActiveBand(matchedBand.id);
      setActiveFrequency(hz, matchedBand.id);
      if (nextMode) {
        setMode(nextMode);
        if (nextMode === 'CW') setFilterWidthKhz(0.5);
        else if (nextMode === 'USB' || nextMode === 'LSB') setFilterWidthKhz(2.4);
      }
      setChecklist((c) => ({ ...c, tunedBand: true }));
    },
    [setActiveFrequency]
  );

  const handleSwapVfo = useCallback(() => {
    const a = vfoAFreqHz;
    const b = vfoBFreqHz;
    setVfoAFreqHz(b);
    setVfoBFreqHz(a);
    const nextFreq = activeVfo === 'A' ? b : a;
    setActiveBand(findBandForFrequency(nextFreq).id);
  }, [vfoAFreqHz, vfoBFreqHz, activeVfo]);

  const handleSelectMode = useCallback((nextMode: RadioMode) => {
    setMode(nextMode);
    if (nextMode === 'CW') setFilterWidthKhz(0.5);
    else if (nextMode === 'FM') setFilterWidthKhz(6.0);
    else if (nextMode === 'AM') setFilterWidthKhz(4.0);
    else setFilterWidthKhz(2.4);
  }, []);

  const handleSetRotorTarget = useCallback((deg: number) => {
    const wrapped = ((deg % 360) + 360) % 360;
    setRotorTargetDeg(Math.round(wrapped));
    setChecklist((c) => ({ ...c, rotatedAntenna: true }));
  }, []);

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
        saveStationProfile({ callsign, qth: nextQth, txPowerW, compressionPct });
      },
      () => {
        // Fallback: open Station Settings so operator can pick preset or enter coordinates
        setShowSettingsModal(true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, [callsign, txPowerW, compressionPct]);

  const handleRunAtuTune = useCallback(() => {
    if (isTuningAtu) return;
    setIsTuningAtu(true);
    setIsTransmitting(true);
    audioEngineRef.current?.playTuneTone(850);
    window.setTimeout(() => {
      setAtuMatchFactor(0.9);
      setIsTuningAtu(false);
      setIsTransmitting(false);
    }, 850);
  }, [isTuningAtu]);

  const handleSendCwText = useCallback(
    (rawText: string) => {
      if (!isPoweredOnRef.current) return;
      const msg = sanitizeCwText(rawText).trim();
      if (!msg || !hasSendableMorse(msg)) return;

      clearCwTimers();
      isSendingCwRef.current = true;
      setMode('CW');
      setFilterWidthKhz(0.5);
      setCwDecodedText(`TX: ${msg}`);
      setIsTransmitting(true);
      setIsSendingCw(true);
      setCwTxProgress(0.05);
      setChecklist((c) => ({ ...c, transmittedOrCw: true }));

      audioEngineRef.current?.ensureContext();
      audioEngineRef.current?.playMorseSequence(msg, cwWpm, 720, 0.2);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'cw:tx',
            wpm: cwWpm,
            text: msg,
          })
        );
      }

      const durationMs = Math.max(400, morseDurationMs(msg, cwWpm));
      const startedAt = Date.now();
      cwProgressTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const pct = Math.min(1, elapsed / durationMs);
        setCwTxProgress(pct);
      }, 60);

      cwEndTimerRef.current = window.setTimeout(() => {
        clearCwTimers();
        setIsSendingCw(false);
        setCwTxProgress(0);
        setIsTransmitting(false);
      }, durationMs);
    },
    [cwWpm, clearCwTimers]
  );

  const handleSendCwCq = useCallback(() => {
    const msg = `CQ CQ CQ DE ${callsign} ${callsign} K`;
    setCwTextInput(msg);
    handleSendCwText(msg);
  }, [callsign, handleSendCwText]);

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

  return (
    <div className="min-h-screen bg-[#04070c] flex items-center justify-center p-2 sm:p-3 text-slate-100">
      <div className="w-full max-w-[1080px] sdr-chassis rounded-xl border border-[#1f3147] shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
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
          onOpenPropagation={() => {
            setShowPropModal(true);
            setChecklist((c) => ({ ...c, checkedPropagation: true }));
          }}
          onOpenLearn={() => setShowLearnModal(true)}
        />

        {/* Main Console Body */}
        <main
          aria-disabled={!isPoweredOn}
          className={`p-1.5 flex flex-col gap-1.5 w-full transition-opacity duration-200 ${
            isPoweredOn ? 'opacity-100' : 'opacity-45 pointer-events-none select-none'
          }`}
        >
          <div className="flex flex-col lg:flex-row gap-1.5">
            {/* Left Column: Antenna, Rotor, Band, Propagation Conditions */}
            <LeftControlColumn
              antennaId={antennaId}
              onChangeAntenna={setAntennaId}
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
              stations={evaluatedStations}
              onLocateMe={handleLocateMe}
              onOpenSettings={() => setShowSettingsModal(true)}
            />

            {/* Center Column: 5 Meters, VFO Deck, Spectrum + Waterfall */}
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              {/* 5 Analog Meters */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-1.5">
                <AnalogMeter
                  label="S-Meter"
                  valueText={isPoweredOn ? sMeterText : '--'}
                  normalized={isPoweredOn ? sMeterNormalized : 0}
                  ticks={['1', '3', '5', '7', '9', '+20', '+60']}
                  accent="cyan"
                  subtitle="Received signal strength in S-units"
                />
                <AnalogMeter
                  label="SWR"
                  valueText={isPoweredOn ? currentSwr.toFixed(1) : '--'}
                  normalized={isPoweredOn ? Math.min(1, (currentSwr - 1) / 4.5) : 0}
                  ticks={['1', '1.5', '2', '3', '5', '10']}
                  accent={currentSwr > 2.5 ? 'rose' : currentSwr > 1.8 ? 'amber' : 'cyan'}
                  subtitle="Voltage Standing Wave Ratio (click Tune to match antenna)"
                />
                <AnalogMeter
                  label="ALC"
                  valueText={isPoweredOn ? `${isTransmitting ? alcPct : 12}%` : '--'}
                  normalized={isPoweredOn ? (isTransmitting ? alcPct : 12) / 100 : 0}
                  ticks={['0', '25', '50', '75', '100']}
                  accent={alcPct > 80 && isTransmitting ? 'amber' : 'cyan'}
                  subtitle="Automatic Level Control during voice TX"
                />
                <AnalogMeter
                  label="Compression"
                  valueText={isPoweredOn ? `${compressionPct}%` : '--'}
                  normalized={isPoweredOn ? compressionPct / 100 : 0}
                  ticks={['0', '25', '50', '75', '100']}
                  accent="cyan"
                  subtitle="Speech processor compression level"
                />
                <AnalogMeter
                  label="QRP Power (5W)"
                  valueText={
                    isPoweredOn
                      ? `${(isTransmitting ? deliveredPowerW : Math.min(txPowerW, deliveredPowerW)).toFixed(1)} W`
                      : '0.0 W'
                  }
                  normalized={
                    isPoweredOn
                      ? (isTransmitting ? deliveredPowerW : Math.min(txPowerW, deliveredPowerW)) / 5
                      : 0
                  }
                  ticks={['0', '1', '2', '3', '4', '5']}
                  accent={isTransmitting ? 'emerald' : 'cyan'}
                  subtitle="Forward QRP RF output power in Watts"
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
                tuneSpeed={tuneSpeed}
                isPoweredOn={isPoweredOn}
              />

              {/* Spectrum Scope & Waterfall */}
              <SpectrumWaterfall
                band={activeBand}
                onSelectBand={handleSelectBand}
                frequencyHz={effectiveRxFreqHz}
                onTuneToFrequency={handleTuneToFrequency}
                filterWidthKhz={filterWidthKhz}
                rfGainPct={rfGainPct}
                noiseFloorDbm={bandCondition.noiseDbm}
                isTransmitting={isTransmitting}
                micRms={micRms}
                mode={mode}
                stations={evaluatedStations}
                spanKhz={spanKhz}
                onChangeSpanKhz={setSpanKhz}
                zoom={zoom}
                onChangeZoom={setZoom}
                isPoweredOn={isPoweredOn}
              />
            </div>

            {/* Right Column: World Map + DSP Buttons + Main VFO Dial */}
            <aside className="flex flex-col gap-1.5 w-full lg:w-[222px] shrink-0">
              <WorldMapPanel
                qth={qth}
                rotorHeadingDeg={rotorHeadingDeg}
                band={activeBand}
                propagation={propagation}
                stations={evaluatedStations}
                onSelectBand={handleSelectBand}
                onSetRotorTarget={handleSetRotorTarget}
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
                stepHz={stepHz}
                onChangeStepHz={setStepHz}
                tuneSpeed={tuneSpeed}
                onChangeTuneSpeed={setTuneSpeed}
                onOpenQsoLog={() => setShowQsoModal(true)}
                qsoCount={qsos.length}
              />
            </aside>
          </div>

          {/* Bottom Control Strip */}
          <BottomControlStrip
            callsign={callsign}
            serverId={serverId}
            groupId={groupId}
            onChangeServer={setServerId}
            onChangeGroup={setGroupId}
            micEnabled={micEnabled}
            micLevelDb={isPoweredOn ? micLevelDb : -55}
            isTransmitting={isTransmitting && isPoweredOn}
            pttLatchMode={pttLatchMode}
            onTogglePttLatchMode={() => setPttLatchMode((p) => !p)}
            onStartPtt={handleStartPtt}
            onStopPtt={handleStopPtt}
            onToggleMic={() => void handleEnableMic()}
            cwWpm={cwWpm}
            onChangeCwWpm={setCwWpm}
            cwDecodeEnabled={cwDecodeEnabled}
            onToggleCwDecode={() => setCwDecodeEnabled((p) => !p)}
            cwDecodedText={isPoweredOn ? cwDecodedText : 'STANDBY'}
            cwTextInput={cwTextInput}
            onChangeCwTextInput={setCwTextInput}
            onSendCwText={handleSendCwText}
            onStopCwTx={handleStopCwTx}
            isSendingCw={isSendingCw && isPoweredOn}
            cwTxProgress={cwTxProgress}
            isTuningAtu={isTuningAtu}
            onRunAtuTune={handleRunAtuTune}
            onSendCwCq={handleSendCwCq}
            isPoweredOn={isPoweredOn}
          />
        </main>

        {/* Footer */}
        <footer className="px-3 py-1 border-t border-[#182536] bg-[#070b11] flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-slate-200 tracking-wider">AURORA QRP SDR</span>
            <span className="font-mono-tabular text-slate-500">VOIP HF Mesh</span>
          </div>

          <div className="hidden sm:block text-slate-400">
            Amateur Radio <span className="mx-1">·</span> Community <span className="mx-1">·</span> Exploration
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

      {/* Modals */}
      <PropagationModal
        open={showPropModal}
        conditions={propagation}
        onChange={handleUpdatePropagation}
        onClose={() => setShowPropModal(false)}
      />

      <QsoLogModal
        open={showQsoModal}
        qsos={qsos}
        currentBand={activeBand}
        currentFrequencyHz={currentFreqHz}
        currentMode={mode}
        currentPowerW={deliveredPowerW}
        suggestedCallsign={bestInPassband?.station.callsign.replace('/B', '') ?? ''}
        suggestedGrid={bestInPassband?.station.qth.grid ?? ''}
        onAddQso={handleAddQso}
        onDeleteQso={handleDeleteQso}
        onClose={() => setShowQsoModal(false)}
      />

      <StationSettingsModal
        open={showSettingsModal}
        callsign={callsign}
        qth={qth}
        txPowerW={txPowerW}
        compressionPct={compressionPct}
        onSave={(next) => {
          setCallsign(next.callsign);
          setQth(next.qth);
          setTxPowerW(next.txPowerW);
          setCompressionPct(next.compressionPct);
          saveStationProfile(next);
        }}
        onClose={() => setShowSettingsModal(false)}
      />

      <BeginnerGuideModal
        open={showLearnModal}
        checklist={checklist}
        onClose={() => setShowLearnModal(false)}
      />
    </div>
  );
}
