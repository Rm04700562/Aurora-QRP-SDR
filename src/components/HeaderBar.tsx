import React from 'react';
import { BookOpen, Power, Radio, Settings, Users, Waves } from 'lucide-react';
import { GroupOption, PropagationConditions, ServerOption } from '../types/radio';

export const SERVER_OPTIONS: ServerOption[] = [
  { id: 'eu', label: 'EU Server (Europe)', region: 'Frankfurt' },
  { id: 'us', label: 'US East (North America)', region: 'New York' },
  { id: 'ap', label: 'APAC Server (Asia-Pacific)', region: 'Tokyo' },
  { id: 'global', label: 'Global QRP Mesh', region: 'Anycast' },
];

export const GROUP_OPTIONS: GroupOption[] = [
  { id: 'south-africa', label: 'Group: South Africa' },
  { id: 'beginners-net', label: 'Group: Beginners Learning Net' },
  { id: 'europe-dx', label: 'Group: Europe DX' },
  { id: 'north-america', label: 'Group: North America' },
  { id: 'cw-club', label: 'Group: QRP CW Club' },
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
      ? 'Connected'
      : wsStatus === 'connecting'
      ? 'Connecting'
      : 'Offline';

  return (
    <header className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-1.5 px-2.5 py-1 border-b border-[#1c2b3d] bg-[#090e16]/95">
      {/* Left Brand + Power Switch */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onTogglePower}
          data-testid="power-button"
          aria-pressed={isPoweredOn}
          aria-label={isPoweredOn ? 'Power Radio Off' : 'Power Radio On'}
          title={isPoweredOn ? 'Power Off Transceiver' : 'Power On Transceiver'}
          className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-display font-bold tracking-wider uppercase transition-all cursor-pointer shrink-0 ${
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
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
              isPoweredOn
                ? 'bg-gradient-to-br from-sky-400/20 to-cyan-500/10 border-sky-400/40 text-sky-400'
                : 'bg-[#0b1018] border-[#1f2c3d] text-slate-600'
            }`}
          >
            <Radio className="w-3 h-3" />
          </div>
          <h1 className="font-display text-sm sm:text-base font-bold tracking-wider uppercase whitespace-nowrap">
            <span className={isPoweredOn ? 'text-slate-100' : 'text-slate-500'}>AURORA </span>
            <span className={isPoweredOn ? 'text-sky-400' : 'text-slate-600'}>QRP SDR</span>
          </h1>
        </div>
      </div>

      {/* Right Network, Audio, Propagation & Learning Controls */}
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-1">
        <button
          type="button"
          onClick={onToggleAudio}
          disabled={!isPoweredOn}
          className={`px-1.5 py-0.5 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
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
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#223247] bg-[#0b121c] text-[11px] text-slate-200 whitespace-nowrap"
          title={`${peerCount} operator(s) in current group`}
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
          className="px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0e1623] text-[11px] text-slate-200 focus:outline-none focus:border-sky-400 cursor-pointer max-w-[122px]"
          aria-label="Select VOIP Server"
        >
          {SERVER_OPTIONS.map((srv) => (
            <option key={srv.id} value={srv.id}>
              {srv.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0e1623]">
          <Users className="w-3 h-3 text-sky-400 shrink-0" aria-hidden="true" />
          <label className="sr-only" htmlFor="header-group-select">
            VOIP Group
          </label>
          <select
            id="header-group-select"
            value={groupId}
            onChange={(e) => onChangeGroup(e.target.value)}
            className="bg-transparent text-[11px] text-slate-200 focus:outline-none cursor-pointer max-w-[126px]"
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
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#23344a] bg-[#0e1623] hover:border-sky-400/60 text-[11px] text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Adjust virtual solar & ionospheric propagation conditions"
        >
          <Waves className="w-3 h-3 text-sky-400" aria-hidden="true" />
          <span className="font-mono-tabular">
            SFI {propagation.sfi} · K{propagation.kIndex}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenLearn}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-[11px] font-medium text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Beginner Amateur Radio Guide & Practice Checklist"
        >
          <BookOpen className="w-3 h-3" aria-hidden="true" />
          <span>Learn</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="px-1.5 py-0.5 rounded border border-[#2a3f59] bg-[#121d2d] hover:border-sky-400/60 font-mono-tabular text-[11px] font-semibold text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Edit Station Callsign & QTH"
        >
          {callsign}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1 rounded border border-[#23344a] bg-[#0e1623] hover:border-sky-400/60 text-slate-300 hover:text-white transition-colors cursor-pointer"
          aria-label="Open Station Settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>
    </header>
  );
};
