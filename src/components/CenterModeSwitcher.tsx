import React, { useEffect, useState } from 'react';
import {
  Activity,
  Camera,
  Globe,
  Globe2,
  KeyRound,
  Radio,
  Send,
  Square,
  Terminal,
} from 'lucide-react';
import { SdrAudioEngine } from '../audio/sdrAudioEngine';
import {
  buildFt8AutoReplyPayload,
  canAutoReplyFt8Row,
  findNearestRttySignalOffsetHz,
  formatFt8Cq,
  formatFt8Reply,
  getFt8SlotInfo,
  getStandardFt8Frequency,
  parseFt8Message,
  resolveFt8ReportTarget,
  sanitizeFt8Message,
} from '../radio/digitalModes';
import {
  hasSendableMorse,
  morseDurationMs,
  sanitizeCwText,
  textToMorse,
} from '../radio/physics';
import {
  BandId,
  DigitalFeedLine,
  DxClusterSpot,
  Ft8DecodedLine,
  PropagationConditions,
  QthLocation,
  RadioMode,
  RemoteStation,
  RttyConfig,
  SignalEvaluation,
  SstvFramePayload,
  WorkspaceModuleTab,
} from '../types/radio';
import { WaterfallSignalBurst } from '../radio/waterfall';
import { PropagationWorldMap } from './PropagationWorldMap';
import { RttyModule } from './RttyModule';
import { SpectrumWaterfall } from './SpectrumWaterfall';
import { SstvModule } from './SstvModule';

interface CenterModeSwitcherProps {
  activeTab: WorkspaceModuleTab;
  onChangeTab: (tab: WorkspaceModuleTab) => void;
  isPoweredOn: boolean;
  callsign: string;
  qth: QthLocation;
  serverId: string;
  groupId: string;

  // Waterfall props
  band: BandId;
  onSelectBand: (b: BandId) => void;
  frequencyHz: number;
  onTuneToFrequency: (hz: number, mode?: RadioMode) => void;
  onTuneDelta?: (deltaHz: number) => void;
  stepHz?: number;
  filterWidthKhz: number;
  rfGainPct: number;
  noiseFloorDbm: number;
  noiseReductionPct?: number;
  noiseBlankerPct?: number;
  notchPct?: number;
  ritHz?: number;
  isTransmitting: boolean;
  micRms: number;
  mode: RadioMode;
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  beaconStations?: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>;
  signalBurstsRef?: React.RefObject<WaterfallSignalBurst[]>;
  allGlobalStations: RemoteStation[];
  spanKhz: number;
  onChangeSpanKhz: (khz: number) => void;
  zoom: number;
  onChangeZoom: (z: number) => void;

  // CW module props
  cwWpm: number;
  onChangeCwWpm: (wpm: number) => void;
  cwDecodeEnabled: boolean;
  onToggleCwDecode: () => void;
  cwDecodedText: string;
  cwTextInput: string;
  onChangeCwTextInput: (t: string) => void;
  onSendCwText: (t: string) => void;
  onSendCwCq: () => void;
  onStopCwTx: () => void;
  isSendingCw: boolean;
  cwTxProgress: number;
  cwFeed: DigitalFeedLine[];

  // RTTY module props
  rttyFeed: DigitalFeedLine[];
  isSendingRtty: boolean;
  rttyConfig: RttyConfig;
  onChangeRttyConfig: (next: RttyConfig) => void;
  onSendRtty: (text: string) => void;
  onLoopbackDecodeRtty: (decodedText: string, snrRatio: number) => void;
  onStopDigitalTx: () => void;
  onLogQso?: (dxCall: string, mode: RadioMode) => void;
  audioEngine: SdrAudioEngine | null;

  // SSTV module props
  sstvRxFrame: SstvFramePayload | null;
  sstvRxProgress: number;
  sstvRxStats: { visDetected: boolean; syncLocks: number; sourceLabel: string } | null;
  sstvGallery: SstvFramePayload[];
  isSendingSstv: boolean;
  sstvTxProgress: number;
  onSendSstv: (payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>) => void;
  onLoopbackDecodeSstv: (
    payload: Omit<SstvFramePayload, 'id' | 'timestampUtc'>,
    stats: { visDetected: boolean; syncLocks: number; sourceLabel: string }
  ) => void;
  onSelectRxGalleryItem: (frame: SstvFramePayload) => void;

  // FT8 module props
  ft8Log: Ft8DecodedLine[];
  isSendingFt8: boolean;
  onSendFt8: (message: string, audioFreqHz: number) => void;

  // Live Cluster props
  clusterSpots: DxClusterSpot[];
  onJoinAndTuneStation: (station: RemoteStation) => void;
  onPostClusterSpot: (spot: {
    dxCall: string;
    frequencyHz: number;
    band: BandId;
    mode: RadioMode;
    comment: string;
  }) => Promise<void>;

  // Global Propagation Map props
  propagation: PropagationConditions;
  onOpenPropagation: () => void;
  onRefreshHourly?: () => void;
  isRefreshingHourly?: boolean;
}

const TABS: Array<{ id: WorkspaceModuleTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'waterfall', label: 'Waterfall', icon: Activity },
  { id: 'cw', label: 'CW', icon: KeyRound },
  { id: 'rtty', label: 'RTTY', icon: Terminal },
  { id: 'sstv', label: 'SSTV', icon: Camera },
  { id: 'ft8', label: 'FT8', icon: Radio },
  { id: 'cluster', label: 'Live Cluster', icon: Globe },
  { id: 'propmap', label: 'Prop Map', icon: Globe2 },
];

export const CenterModeSwitcher: React.FC<CenterModeSwitcherProps> = ({
  activeTab,
  onChangeTab,
  isPoweredOn,
  callsign,
  qth,
  band,
  onSelectBand,
  frequencyHz,
  onTuneToFrequency,
  onTuneDelta,
  stepHz,
  filterWidthKhz,
  rfGainPct,
  noiseFloorDbm,
  noiseReductionPct,
  noiseBlankerPct,
  notchPct,
  ritHz,
  isTransmitting,
  micRms,
  mode,
  stations,
  beaconStations,
  signalBurstsRef,
  allGlobalStations,
  spanKhz,
  onChangeSpanKhz,
  zoom,
  onChangeZoom,
  cwWpm,
  onChangeCwWpm,
  cwDecodeEnabled,
  onToggleCwDecode,
  cwDecodedText,
  cwTextInput,
  onChangeCwTextInput,
  onSendCwText,
  onSendCwCq,
  onStopCwTx,
  isSendingCw,
  cwTxProgress,
  cwFeed,
  rttyFeed,
  isSendingRtty,
  rttyConfig,
  onChangeRttyConfig,
  onSendRtty,
  onLoopbackDecodeRtty,
  onStopDigitalTx,
  onLogQso,
  audioEngine,
  sstvRxFrame,
  sstvRxProgress,
  sstvRxStats,
  sstvGallery,
  isSendingSstv,
  sstvTxProgress,
  onSendSstv,
  onLoopbackDecodeSstv,
  onSelectRxGalleryItem,
  ft8Log,
  isSendingFt8,
  onSendFt8,
  clusterSpots,
  onJoinAndTuneStation,
  onPostClusterSpot,
  propagation,
  onOpenPropagation,
  onRefreshHourly,
  isRefreshingHourly,
}) => {
  // FT8 local compose & 15s clock state
  const [ft8DxCall, setFt8DxCall] = useState('');
  const [ft8AudioFreq, setFt8AudioFreq] = useState(1250);
  const [ft8Message, setFt8Message] = useState(formatFt8Cq(callsign, qth.grid));
  const [ft8Slot, setFt8Slot] = useState(() => getFt8SlotInfo());

  // Cluster spot compose state
  const [spotDxCall, setSpotDxCall] = useState('');
  const [spotComment, setSpotComment] = useState('QRV loud & clear');
  const [postingSpot, setPostingSpot] = useState(false);

  // Update default FT8 callsign string when operator callsign changes
  useEffect(() => {
    setFt8Message((prev) => (prev.startsWith('CQ ') ? formatFt8Cq(callsign, qth.grid) : prev));
  }, [callsign, qth.grid]);

  // Auto-track incoming DX callsign from RX FT8 messages addressed to us or active decode log
  useEffect(() => {
    const latestAddressed = ft8Log.find(
      (row) =>
        row.direction === 'RX' &&
        row.callsign &&
        row.callsign.toUpperCase() !== callsign.toUpperCase() &&
        parseFt8Message(row.message).toCall.toUpperCase() === callsign.toUpperCase()
    );
    if (latestAddressed?.callsign) {
      setFt8DxCall(latestAddressed.callsign.toUpperCase());
    }
  }, [ft8Log, callsign]);

  // FT8 15-second UTC clock ticker
  useEffect(() => {
    if (activeTab !== 'ft8') return;
    const id = window.setInterval(() => setFt8Slot(getFt8SlotInfo()), 400);
    return () => window.clearInterval(id);
  }, [activeTab]);

  const canSendCw = isPoweredOn && hasSendableMorse(cwTextInput);
  const activeFt8Stations = [
    ...stations.map((s) => ({
      callsign: s.station.callsign,
      snrDb: s.evalResult.snrDb,
      inPassband: s.evalResult.inPassband,
      propagationOpen: s.evalResult.propagationOpen,
    })),
    ...allGlobalStations.map((st) => ({
      callsign: st.callsign,
      snrDb: -7,
      inPassband: false,
      propagationOpen: true,
    })),
  ];
  const resolvedFt8Target = resolveFt8ReportTarget({
    ft8DxCall,
    ft8Message,
    ft8Log,
    myCallsign: callsign,
    fallbackAudioFreqHz: ft8AudioFreq,
    activeStations: activeFt8Stations,
  });

  return (
    <section
      className="sdr-panel rounded-md p-1.5 flex flex-col gap-1 flex-1 min-h-[186px]"
      data-testid="center-module-switcher"
    >
      {/* Group Switcher Tab Header */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-[#1c2c40] pb-1">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Operating Modules">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`module-tab-${t.id}`}
                onClick={() => onChangeTab(t.id)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] font-display font-semibold tracking-wider uppercase border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-500 border-sky-400 text-slate-950 shadow-[0_0_8px_rgba(34,184,255,0.3)]'
                    : 'bg-[#0b121c] border-[#213248] text-slate-300 hover:border-sky-400/50 hover:text-white'
                }`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                <span>{t.label}</span>
                {t.id === 'cluster' && allGlobalStations.length > 0 && (
                  <span
                    className={`px-1 rounded text-[9px] font-mono-tabular ${
                      active ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {allGlobalStations.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <span className="text-[10px] font-mono-tabular text-slate-400 whitespace-nowrap">
          {(frequencyHz / 1_000_000).toFixed(3)} MHz · {mode}
        </span>
      </div>

      {/* TAB 1: WATERFALL (kept mounted so waterfall history persists across tab switches) */}
      <div className={activeTab === 'waterfall' ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
        <SpectrumWaterfall
          band={band}
          onSelectBand={onSelectBand}
          frequencyHz={frequencyHz}
          onTuneToFrequency={onTuneToFrequency}
          onTuneDelta={onTuneDelta}
          stepHz={stepHz}
          filterWidthKhz={filterWidthKhz}
          rfGainPct={rfGainPct}
          noiseFloorDbm={noiseFloorDbm}
          noiseReductionPct={noiseReductionPct}
          noiseBlankerPct={noiseBlankerPct}
          notchPct={notchPct}
          ritHz={ritHz}
          rttyShiftHz={rttyConfig.shiftHz}
          isTransmitting={isTransmitting}
          micRms={micRms}
          mode={mode}
          stations={stations}
          beaconStations={beaconStations}
          signalBurstsRef={signalBurstsRef}
          audioEngine={audioEngine}
          spanKhz={spanKhz}
          onChangeSpanKhz={onChangeSpanKhz}
          zoom={zoom}
          onChangeZoom={onChangeZoom}
          isPoweredOn={isPoweredOn}
          isActive={activeTab === 'waterfall'}
        />
      </div>

      {/* TAB 2: CW MODULE */}
      {activeTab === 'cw' && (
        <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-cw">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`px-1.5 py-0.5 rounded border font-mono-tabular shrink-0 ${
                  isSendingCw
                    ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                    : 'bg-sky-500/15 border-sky-400/50 text-sky-300'
                }`}
              >
                {isSendingCw ? 'KEYING TX' : 'CW MONITOR'}
              </span>
              <button
                type="button"
                onClick={onToggleCwDecode}
                aria-pressed={cwDecodeEnabled}
                className={`px-1.5 py-0.5 rounded text-[10px] font-display font-semibold uppercase border cursor-pointer shrink-0 ${
                  cwDecodeEnabled
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-[#0a1019] border-[#223348] text-slate-400'
                }`}
              >
                Decode
              </button>
              <span
                data-testid="cw-decoded-readout"
                className="text-slate-300 font-mono-tabular truncate text-[10px]"
                title={cwDecodedText}
              >
                {cwDecodeEnabled ? cwDecodedText : 'Decoder Paused'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-slate-400 font-mono-tabular hidden sm:inline">720 Hz</span>
              <select
                id="cw-module-wpm"
                aria-label="CW Keyer Speed"
                value={cwWpm}
                onChange={(e) => onChangeCwWpm(Number(e.target.value))}
                className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-slate-200 cursor-pointer"
              >
                {[10, 12, 15, 18, 20, 25, 30].map((w) => (
                  <option key={w} value={w}>
                    {w} WPM
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!isPoweredOn || isSendingCw}
                onClick={onSendCwCq}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[#273c56] bg-[#0e1725] hover:border-sky-400 text-[10px] font-display font-semibold text-sky-300 cursor-pointer whitespace-nowrap disabled:opacity-40"
                title="Transmit an automated Morse CQ call on current frequency"
              >
                <Send className="w-2.5 h-2.5" />
                <span>Auto CQ</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[76px] max-h-[104px] overflow-y-auto rounded border border-[#1c2c40] bg-[#050a11] p-1.5 font-mono-tabular text-[11px] space-y-1">
            {cwFeed.length === 0 ? (
              <div className="text-slate-500">
                Listening on {(frequencyHz / 1_000_000).toFixed(3)} MHz CW — transmitted &amp; received Morse code appears here.
              </div>
            ) : (
              cwFeed.map((line) => (
                <div key={line.id} className="flex items-baseline gap-2">
                  <span className="text-slate-500 text-[10px] shrink-0">{line.timestampUtc.slice(11, 16)}</span>
                  <span
                    className={`text-[10px] font-bold shrink-0 ${
                      line.direction === 'TX' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {line.direction}
                  </span>
                  <span className="text-sky-300 shrink-0">{line.callsign}:</span>
                  <span className="text-slate-100 break-all">{line.text}</span>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSendCw && !isSendingCw) onSendCwText(cwTextInput);
            }}
            className="flex flex-wrap sm:flex-nowrap items-center gap-1.5"
          >
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => onChangeCwTextInput(sanitizeCwText(`CQ CQ DE ${callsign} K`))}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 cursor-pointer disabled:opacity-40"
            >
              CQ
            </button>
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => {
                const base = cwTextInput.trim();
                onChangeCwTextInput(sanitizeCwText(base ? `${base} UR RST 599` : 'UR RST 599'));
              }}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 cursor-pointer disabled:opacity-40"
            >
              599
            </button>
            <button
              type="button"
              disabled={!isPoweredOn || isSendingCw}
              onClick={() => {
                const base = cwTextInput.trim();
                onChangeCwTextInput(sanitizeCwText(base ? `${base} 73 TU SK` : '73 TU SK'));
              }}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 cursor-pointer disabled:opacity-40"
            >
              73
            </button>
            <input
              type="text"
              data-testid="cw-text-input"
              value={cwTextInput}
              onChange={(e) => onChangeCwTextInput(sanitizeCwText(e.target.value))}
              placeholder={`Enter Morse text (e.g. CQ CQ DE ${callsign} K)`}
              className="flex-1 min-w-[160px] px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-xs text-sky-200 uppercase focus:outline-none focus:border-sky-400"
            />
            {isSendingCw ? (
              <button
                key="cw-stop-btn"
                type="button"
                data-testid="cw-stop-button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStopCwTx();
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                key="cw-send-btn"
                type="submit"
                disabled={!canSendCw}
                data-testid="cw-send-button"
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/70 hover:bg-sky-500 hover:text-slate-950 text-sky-200 font-display font-bold text-[11px] uppercase cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
              >
                <Send className="w-3 h-3" />
                <span>Send CW</span>
              </button>
            )}
          </form>

          <div className="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-amber-300/90">
            <span className="truncate">{cwTextInput ? textToMorse(cwTextInput) : 'Macros: CQ · 599 · 73'}</span>
            <span className="text-slate-400 shrink-0">
              {cwTextInput && canSendCw
                ? `${(morseDurationMs(cwTextInput, cwWpm) / 1000).toFixed(1)}s`
                : isSendingCw
                ? `${Math.round(cwTxProgress * 100)}%`
                : 'Ready'}
            </span>
          </div>
        </div>
      )}

      {/* TAB 3: RTTY MODULE */}
      {activeTab === 'rtty' && (
        <RttyModule
          isPoweredOn={isPoweredOn}
          callsign={callsign}
          qth={qth}
          band={band}
          frequencyHz={frequencyHz}
          rttyFeed={rttyFeed}
          isSendingRtty={isSendingRtty}
          rttyConfig={rttyConfig}
          onChangeRttyConfig={onChangeRttyConfig}
          onSendRtty={onSendRtty}
          onLoopbackDecodeRtty={onLoopbackDecodeRtty}
          onStopDigitalTx={onStopDigitalTx}
          onTuneToFrequency={onTuneToFrequency}
          onLogQso={onLogQso}
          signalOffsetHz={findNearestRttySignalOffsetHz(
            stations.map((s) => ({
              band: s.station.band,
              isTransmitting: s.station.isTransmitting,
              mode: s.station.mode,
              freqOffsetHz: s.evalResult.freqOffsetHz,
              propagationOpen: s.evalResult.propagationOpen,
            })),
            band
          )}
          audioEngine={audioEngine}
        />
      )}

      {/* TAB 4: SSTV MODULE */}
      {activeTab === 'sstv' && (
        <SstvModule
          isPoweredOn={isPoweredOn}
          callsign={callsign}
          qth={qth}
          band={band}
          sstvRxFrame={sstvRxFrame}
          sstvRxProgress={sstvRxProgress}
          sstvRxStats={sstvRxStats}
          sstvGallery={sstvGallery}
          isSendingSstv={isSendingSstv}
          sstvTxProgress={sstvTxProgress}
          onSendSstv={onSendSstv}
          onLoopbackDecodeSstv={onLoopbackDecodeSstv}
          onSelectRxGalleryItem={onSelectRxGalleryItem}
          onStopDigitalTx={onStopDigitalTx}
          onTuneToFrequency={onTuneToFrequency}
        />
      )}

      {/* TAB 5: FT8 / DIGITAL */}
      {activeTab === 'ft8' && (
        <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-ft8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono-tabular">
            <div className="flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 rounded border font-semibold ${
                  ft8Slot.isEvenSlot
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-sky-500/20 border-sky-400 text-sky-200'
                }`}
              >
                {ft8Slot.isEvenSlot ? 'EVEN 00/30s' : 'ODD 15/45s'}
              </span>
              <span className="text-slate-300">Slot {ft8Slot.elapsedSec.toFixed(1)}s / 15.0s</span>
              <div className="w-20 h-1.5 rounded-full bg-[#131e2c] overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-[width] duration-200"
                  style={{ width: `${Math.min(100, (ft8Slot.elapsedSec / 15) * 100)}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTuneToFrequency(getStandardFt8Frequency(band), 'FT8')}
              className="px-1.5 py-0.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-sky-300 cursor-pointer"
            >
              QSY {band} FT8 ({(getStandardFt8Frequency(band) / 1_000_000).toFixed(3)})
            </button>
          </div>

          {/* Decoded FT8 Messages Table */}
          <div
            className="flex-1 min-h-[76px] max-h-[104px] overflow-y-auto rounded border border-[#1c2c40] bg-[#04090f] font-mono-tabular text-[10.5px]"
            data-testid="ft8-decode-table"
          >
            <div className="grid grid-cols-12 px-2 py-0.5 border-b border-[#182436] text-[9.5px] text-slate-400 sticky top-0 bg-[#070d16] z-10">
              <span className="col-span-2">UTC</span>
              <span className="col-span-1 sm:col-span-2">dB</span>
              <span className="col-span-2">Freq</span>
              <span className="col-span-7 sm:col-span-6">Message (click or Reply)</span>
            </div>
            {ft8Log.length === 0 ? (
              <div className="p-2 text-slate-500">
                FT8 8-FSK decoder active. Transmit CQ or tune to an active FT8 user to decode frames.
              </div>
            ) : (
              ft8Log.map((row) => {
                const showReplyBtn = canAutoReplyFt8Row(row, callsign);
                return (
                  <div
                    key={row.id}
                    data-testid="ft8-decode-row"
                    className={`w-full grid grid-cols-12 items-center px-2 py-0.5 hover:bg-sky-500/10 ${
                      row.direction === 'TX'
                        ? 'text-rose-300'
                        : row.isCq
                        ? 'text-emerald-300'
                        : 'text-slate-200'
                    }`}
                  >
                    <span className="col-span-2">{row.utcTime}</span>
                    <span className="col-span-1 sm:col-span-2">
                      {row.snrDb >= 0 ? `+${row.snrDb}` : row.snrDb}
                    </span>
                    <span className="col-span-2">{row.audioFreqHz}</span>
                    <div className="col-span-7 sm:col-span-6 flex items-center justify-between gap-1.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (row.callsign && row.callsign !== callsign) {
                            const draft = buildFt8AutoReplyPayload(
                              row,
                              callsign,
                              qth.grid,
                              ft8AudioFreq
                            );
                            setFt8DxCall(draft.dxCall);
                            setFt8Message(draft.message);
                            setFt8AudioFreq(draft.audioFreqHz);
                          }
                        }}
                        className="flex-1 min-w-0 text-left truncate cursor-pointer hover:underline"
                        title={
                          row.callsign && row.callsign !== callsign
                            ? `Draft FT8 reply to ${row.callsign}`
                            : row.message
                        }
                      >
                        {row.message}
                      </button>
                      {showReplyBtn && (
                        <button
                          type="button"
                          data-testid="ft8-reply-button"
                          disabled={!isPoweredOn || isSendingFt8}
                          aria-label={`Reply to ${row.callsign}`}
                          onClick={() => {
                            if (!isPoweredOn || isSendingFt8) return;
                            const reply = buildFt8AutoReplyPayload(
                              row,
                              callsign,
                              qth.grid,
                              ft8AudioFreq
                            );
                            setFt8DxCall(reply.dxCall);
                            setFt8Message(reply.message);
                            setFt8AudioFreq(reply.audioFreqHz);
                            onSendFt8(reply.message, reply.audioFreqHz);
                          }}
                          className="px-2 py-0.5 rounded border border-emerald-300 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-[9.5px] uppercase tracking-wider shrink-0 cursor-pointer transition-colors shadow-[0_0_8px_rgba(16,185,129,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Reply
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = sanitizeFt8Message(ft8Message);
              if (clean && isPoweredOn && !isSendingFt8) {
                onSendFt8(clean, ft8AudioFreq);
              }
            }}
            className="flex flex-wrap landscape:flex-nowrap sm:flex-nowrap items-center gap-1"
          >
            <button
              type="button"
              onClick={() => setFt8Message(formatFt8Cq(callsign, qth.grid))}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] text-[10px] font-mono-tabular text-emerald-300 cursor-pointer"
            >
              CQ
            </button>
            <button
              type="button"
              data-testid="ft8-rpt-button"
              disabled={!isPoweredOn}
              onClick={() => {
                if (!isPoweredOn) return;
                const target = resolvedFt8Target ?? {
                  dxCall: 'DX',
                  report: '-07',
                  message: formatFt8Reply('DX', callsign, '-07'),
                  audioFreqHz: ft8AudioFreq,
                };
                setFt8DxCall(target.dxCall);
                setFt8AudioFreq(target.audioFreqHz);
                setFt8Message(target.message);
                onSendFt8(target.message, target.audioFreqHz);
              }}
              title={
                resolvedFt8Target
                  ? `Send signal report ${resolvedFt8Target.report} to ${resolvedFt8Target.dxCall}`
                  : 'Send signal report (-07) on current FT8 frequency'
              }
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-sky-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              RPT
            </button>
            <button
              type="button"
              data-testid="ft8-rr73-button"
              disabled={!isPoweredOn}
              onClick={() => {
                if (!isPoweredOn) return;
                const dxCall = resolvedFt8Target?.dxCall ?? 'DX';
                const audioFreqHz = resolvedFt8Target?.audioFreqHz ?? ft8AudioFreq;
                const rr73Message = formatFt8Reply(dxCall, callsign, 'RR73');
                setFt8DxCall(dxCall);
                setFt8AudioFreq(audioFreqHz);
                setFt8Message(rr73Message);
                onSendFt8(rr73Message, audioFreqHz);
              }}
              title={
                resolvedFt8Target
                  ? `Send RR73 QSO confirmation to ${resolvedFt8Target.dxCall}`
                  : 'Send RR73 confirmation on current FT8 frequency'
              }
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-[10px] font-mono-tabular text-slate-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              RR73
            </button>

            <input
              type="text"
              data-testid="ft8-message-input"
              value={ft8Message}
              onChange={(e) => setFt8Message(sanitizeFt8Message(e.target.value))}
              className="flex-1 min-w-[140px] px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-xs text-sky-200 uppercase focus:outline-none focus:border-sky-400"
            />

            <select
              aria-label="FT8 Audio Tone"
              value={ft8AudioFreq}
              onChange={(e) => setFt8AudioFreq(Number(e.target.value))}
              className="px-1.5 py-1 rounded border border-[#24364d] bg-[#0a1019] font-mono-tabular text-[10px] text-slate-300"
            >
              {Array.from(new Set([800, 1000, 1250, 1500, 1850, 2200, ft8AudioFreq]))
                .sort((a, b) => a - b)
                .map((hz) => (
                  <option key={hz} value={hz}>
                    {hz} Hz
                  </option>
                ))}
            </select>

            <button
              type="submit"
              disabled={!isPoweredOn || isSendingFt8 || !ft8Message.trim()}
              data-testid="ft8-send-button"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/70 hover:bg-sky-500 hover:text-slate-950 text-sky-200 font-display font-bold text-[10.5px] uppercase cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40"
            >
              <Send className="w-3 h-3" />
              <span>{isSendingFt8 ? 'TX...' : 'TX FT8'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 6: LIVE CLUSTER */}
      {activeTab === 'cluster' && (
        <div className="flex flex-col gap-1.5 flex-1 min-h-0" data-testid="module-panel-cluster">
          <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-1.5 flex-1 min-h-0">
            {/* Live Online Stations Across All Rooms */}
            <div className="rounded border border-[#1c2c40] bg-[#050a11] p-1.5 flex flex-col gap-1 min-h-[100px]">
              <div className="flex items-center justify-between text-[10px] font-display font-semibold uppercase tracking-wider text-emerald-300">
                <span>Live On-Air Operators ({allGlobalStations.length})</span>
                <span className="font-mono-tabular text-slate-400">Click to Tune &amp; Talk</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 max-h-[96px]">
                {allGlobalStations.map((st) => {
                  const isMe = st.callsign === callsign && Math.abs(st.frequencyHz - frequencyHz) < 5;
                  return (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-1 px-1.5 py-1 rounded border border-[#1a283b] bg-[#09101a] text-[10.5px] font-mono-tabular"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            st.isTransmitting ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'
                          }`}
                        />
                        <span className="text-sky-300 font-bold truncate">{st.callsign}</span>
                        <span className="text-slate-400">
                          {st.band} {(st.frequencyHz / 1_000_000).toFixed(3)} {st.mode}
                        </span>
                      </div>
                      {!isMe ? (
                        <button
                          type="button"
                          onClick={() => onJoinAndTuneStation(st)}
                          className="px-1.5 py-0.5 rounded border border-sky-400/50 bg-sky-500/15 hover:bg-sky-500 hover:text-slate-950 text-[9.5px] text-sky-200 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Tune QSY
                        </button>
                      ) : (
                        <span className="text-[9.5px] text-slate-500">You</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live DX Cluster Spot Feed */}
            <div className="rounded border border-[#1c2c40] bg-[#050a11] p-1.5 flex flex-col gap-1 min-h-[100px]">
              <div className="flex items-center justify-between text-[10px] font-display font-semibold uppercase tracking-wider text-sky-300">
                <span>Live DX Cluster Spots ({clusterSpots.length})</span>
                <span className="font-mono-tabular text-slate-400">Real-Time Mesh</span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1 max-h-[96px]" data-testid="cluster-spots-feed">
                {clusterSpots.length === 0 ? (
                  <div className="text-[10.5px] text-slate-500 p-1">
                    No DX spots posted yet. Spot yourself or another live station below!
                  </div>
                ) : (
                  clusterSpots.map((spot) => (
                    <button
                      key={spot.id}
                      type="button"
                      onClick={() => onTuneToFrequency(spot.frequencyHz, spot.mode)}
                      className="w-full flex items-center justify-between gap-1.5 px-1.5 py-1 rounded border border-[#1a283b] bg-[#09101a] hover:border-sky-400/60 text-left text-[10px] font-mono-tabular cursor-pointer"
                    >
                      <span className="text-amber-300 font-bold">{spot.dxCall}</span>
                      <span className="text-sky-300">{(spot.frequencyHz / 1_000_000).toFixed(3)}</span>
                      <span className="text-slate-300">{spot.mode}</span>
                      <span className="text-slate-400 truncate flex-1">{spot.comment}</span>
                      <span className="text-slate-500 shrink-0">de {spot.spotter}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Post Live Spot Form */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const target = (spotDxCall.trim() || callsign).toUpperCase();
              setPostingSpot(true);
              try {
                await onPostClusterSpot({
                  dxCall: target,
                  frequencyHz,
                  band,
                  mode,
                  comment: spotComment.trim() || `QRV ${band} ${mode}`,
                });
                setSpotDxCall('');
              } finally {
                setPostingSpot(false);
              }
            }}
            className="flex flex-wrap landscape:flex-nowrap sm:flex-nowrap items-center gap-1.5"
          >
            <input
              type="text"
              data-testid="cluster-dxcall-input"
              value={spotDxCall}
              onChange={(e) => setSpotDxCall(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))}
              placeholder={`DX Call (default ${callsign})`}
              className="w-36 px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-[11px] text-amber-200 uppercase"
            />
            <input
              type="text"
              value={spotComment}
              onChange={(e) => setSpotComment(e.target.value.slice(0, 60))}
              placeholder="Spot comment (e.g. Calling CQ 20m)"
              className="flex-1 min-w-[140px] px-2 py-1 rounded border border-[#24364d] bg-[#060b12] text-[11px] text-slate-200"
            />
            <button
              type="submit"
              disabled={postingSpot}
              data-testid="cluster-post-spot-button"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/70 hover:bg-emerald-500 hover:text-slate-950 text-emerald-200 font-display font-bold text-[10.5px] uppercase cursor-pointer whitespace-nowrap shrink-0"
            >
              <Send className="w-3 h-3" />
              <span>{postingSpot ? 'Posting...' : 'Post Spot'}</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 7: COLOR-CODED GLOBAL PROPAGATION MAP */}
      {activeTab === 'propmap' && (
        <PropagationWorldMap
          band={band}
          propagation={propagation}
          qth={qth}
          variant="expanded"
          onOpenPropagation={onOpenPropagation}
          onRefreshHourly={onRefreshHourly}
          isRefreshingHourly={isRefreshingHourly}
        />
      )}
    </section>
  );
};
