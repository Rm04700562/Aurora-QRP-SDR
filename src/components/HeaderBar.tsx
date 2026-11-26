import React, { useEffect, useState } from 'react';
import { BookOpen, Clock, IdCard, Power, Radio, Settings, ShieldCheck, Users, Waves } from 'lucide-react';
import { GroupOption, PropagationConditions, ServerOption } from '../types/radio';

export const SERVER_OPTIONS: ServerOption[] = [
  { id: 'global', label: 'Global Mesh', region: 'Anycast' },
  { id: 'eu', label: 'EU Frankfurt', region: 'Frankfurt' },
  { id: 'us', label: 'US New York', region: 'New York' },
  { id: 'ap', label: 'APAC Tokyo', region: 'Tokyo' },
];

export const GROUP_OPTIONS: GroupOption[] = [
  { id: 'open-hf', label: 'Open HF Net' },
  { id: 'south-africa', label: 'South Africa' },
  { id: 'beginners-net', label: 'Beginners Net' },
  { id: 'europe-dx', label: 'Europe DX' },
  { id: 'north-america', label: 'North America' },
  { id: 'cw-club', label: 'QRP CW Club' },
];

interface HeaderBarProps {
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  serverId: string;
  groupId: string;
  callsign: string;
  peerCount: number;
  propagation: PropagationConditions;
  audioEnabled: boolean;
  isPoweredOn: boolean;
  onTogglePower: () => void;
  onToggleAudio: () => void;
  onChangeServer: (id: string) => void;
  onChangeGroup: (id: string) => void;
  onOpenSettings: () => void;
  onOpenCallsignRegistry: () => void;
  onOpenAdmin: () => void;
  onOpenPropagation: () => void;
  onOpenLearn: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  wsStatus,
  serverId,
  groupId,
  callsign,
  peerCount,
  propagation,
  audioEnabled,
  isPoweredOn,
  onTogglePower,
  onToggleAudio,
  onChangeServer,
  onChangeGroup,
  onOpenSettings,
  onOpenCallsignRegistry,
  onOpenAdmin,
  onOpenPropagation,
  onOpenLearn,
}) => {
  const statusColor =
    wsStatus === 'connected'
      ? 'bg-emerald-400'
      : wsStatus === 'connecting'
      ? 'bg-amber-400'
      : 'bg-rose-500';
  const statusLabel =
    wsStatus === 'connected'
      ? 'Live'
      : wsStatus === 'connecting'
      ? 'Sync'
      : 'Off';

  const [utcTimeStr, setUtcTimeStr] = useState(() => {
    const d = new Date();
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(
      d.getUTCSeconds()
    ).padStart(2, '0')} UTC`;
  });

  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      setUtcTimeStr(
        `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(
          d.getUTCSeconds()
        ).padStart(2, '0')} UTC`
      );
    };
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="flex flex-wrap xl:flex-nowrap items-center justify-between gap-1.5 px-2 py-1 border-b border-[#1c2b3d] bg-[#090e16]/95">
      {/* Left Brand + Power Switch */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onTogglePower}
          data-testid="power-button"
          aria-pressed={isPoweredOn}
          aria-label={isPoweredOn ? 'Power Radio Off' : 'Power Radio On'}
          title={isPoweredOn ? 'Power Off Transceiver' : 'Power On Transceiver'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10.5px] font-display font-bold tracking-wider uppercase transition-all cursor-pointer shrink-0 whitespace-nowrap ${
            isPoweredOn
              ? 'bg-emerald-500/15 border-emerald-400/70 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.22)] hover:bg-emerald-500/25'
              : 'bg-[#121824] border-rose-500/60 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.18)] hover:border-emerald-400/70 hover:text-emerald-200'
          }`}
        >
          <Power className="w-3 h-3" aria-hidden="true" />
          <span>{isPoweredOn ? 'ON' : 'OFF'}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <div
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
              isPoweredOn
                ? 'bg-gradient-to-br from-sky-400/20 to-cyan-500/10 border-sky-400/40 text-sky-400'
                : 'bg-[#0b1018] border-[#1f2c3d] text-slate-600'
            }`}
          >
            <Radio className="w-3 h-3" />
          </div>
          <h1 className="font-display text-xs sm:text-sm font-bold tracking-wider uppercase whitespace-nowrap">
            <span className={isPoweredOn ? 'text-slate-100' : 'text-slate-500'}>AURORA </span>
            <span className={isPoweredOn ? 'text-sky-400' : 'text-slate-600'}>100W SDR</span>
          </h1>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex flex-wrap xl:flex-nowrap items-center justify-end gap-1 min-w-0">
        <button
          type="button"
          onClick={onToggleAudio}
          disabled={!isPoweredOn}
          className={`px-1.5 py-0.5 rounded text-[10.5px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
            !isPoweredOn
              ? 'bg-[#0b1018] border-[#1b2736] text-slate-600 cursor-not-allowed'
              : audioEnabled
              ? 'bg-sky-500/15 border-sky-400/60 text-sky-300 cursor-pointer'
              : 'bg-[#0f1724] border-[#25374d] text-slate-300 hover:border-sky-400/50 hover:text-white cursor-pointer'
          }`}
          aria-pressed={audioEnabled && isPoweredOn}
          title="Enable or mute SDR receiver & VOIP speaker audio"
        >
          {!isPoweredOn ? 'Audio: Off' : audioEnabled ? 'Audio: On' : 'Audio: Muted'}
        </button>

        <div
          data-testid="utc-clock"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#223247] bg-[#0b121c] font-mono-tabular text-[10.5px] text-sky-300 whitespace-nowrap shrink-0"
          title="Coordinated Universal Time (UTC)"
        >
          <Clock className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
          <span>{utcTimeStr}</span>
        </div>

        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#223247] bg-[#0b121c] text-[10.5px] text-slate-200 whitespace-nowrap shrink-0"
          title={`${peerCount} operator(s) online in room`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} aria-hidden="true" />
          <span>{statusLabel}</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono-tabular text-sky-300">{peerCount}</span>
        </div>

        <label className="sr-only" htmlFor="header-server-select">
          VOIP Server
        </label>
        <select
          id="header-server-select"
          value={serverId}
          onChange={(e) => onChangeServer(e.target.value)}
          className="max-w-[92px] px-1 py-0.5 rounded border border-[#23344a] bg-[#0e1623] text-[10.5px] text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer truncate"
          aria-label="Select VOIP Server"
        >
          {SERVER_OPTIONS.map((srv) => (
            <option key={srv.id} value={srv.id}>
              {srv.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 px-1 py-0.5 rounded border border-[#23344a] bg-[#0e1623] shrink-0">
          <Users className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
          <label className="sr-only" htmlFor="header-group-select">
            VOIP Group
          </label>
          <select
            id="header-group-select"
            value={groupId}
            onChange={(e) => onChangeGroup(e.target.value)}
            className="max-w-[94px] bg-transparent text-[10.5px] text-slate-200 focus:outline-none cursor-pointer truncate"
            aria-label="Select Radio Group"
          >
            {GROUP_OPTIONS.map((grp) => (
              <option key={grp.id} value={grp.id} className="bg-[#0e1623]">
                {grp.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenPropagation}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0e1623] hover:border-sky-400/60 text-[10.5px] text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Adjust ionospheric propagation conditions"
        >
          <Waves className="w-3 h-3 text-sky-400" aria-hidden="true" />
          <span className="font-mono-tabular">
            SFI {propagation.sfi}·K{propagation.kIndex}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenCallsignRegistry}
          data-testid="open-callsign-registry-btn"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/45 bg-amber-500/10 hover:bg-amber-500/20 text-[10.5px] font-medium text-amber-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Get HR Call Sign (Non-Hams) or Register Licensed Amateur Call Sign"
        >
          <IdCard className="w-3 h-3" aria-hidden="true" />
          <span>HR / Call</span>
        </button>

        <button
          type="button"
          onClick={onOpenLearn}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-[10.5px] font-medium text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Beginner Amateur Radio Guide & Checklist"
        >
          <BookOpen className="w-3 h-3" aria-hidden="true" />
          <span>Learn</span>
        </button>

        <button
          type="button"
          onClick={onOpenAdmin}
          data-testid="open-admin-panel-btn"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-[10.5px] font-medium text-rose-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="ZS1ROM Net Control Admin Panel"
        >
          <ShieldCheck className="w-3 h-3" aria-hidden="true" />
          <span>Admin</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          data-testid="header-callsign-btn"
          className="px-1.5 py-0.5 rounded border border-[#2a3f59] bg-[#121d2d] hover:border-sky-400/60 font-mono-tabular text-[10.5px] font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Edit Station Callsign, QTH & 100W Output"
        >
          {callsign}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          data-testid="header-settings-btn"
          className="p-1 rounded border border-[#23344a] bg-[#0e1623] hover:border-sky-400/60 text-slate-300 hover:text-white transition-colors shrink-0 cursor-pointer"
          aria-label="Open Station Settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
