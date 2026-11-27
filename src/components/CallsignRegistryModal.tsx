import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe2, IdCard, Radio, X } from 'lucide-react';
import {
  detectCountryFromTimeZone,
  getHrCountrySpec,
  HR_COUNTRY_LIST,
  isValidHamCallsign,
  resolvePrefixCountryInfo,
} from '../radio/digitalModes';
import { CallsignRecord, QthLocation } from '../types/radio';

interface CallsignRegistryModalProps {
  open: boolean;
  radioId: string;
  currentCallsign: string;
  currentGrid: string;
  isCallsignPermanent?: boolean;
  onApplyIdentity: (callsign: string, qth?: QthLocation, permanent?: boolean) => void;
  onClose: () => void;
}

export const CallsignRegistryModal: React.FC<CallsignRegistryModalProps> = ({
  open,
  radioId,
  currentCallsign,
  currentGrid,
  isCallsignPermanent = false,
  onApplyIdentity,
  onClose,
}) => {
  const [tab, setTab] = useState<'hr' | 'ham'>('hr');
  const [countryCode, setCountryCode] = useState(() => {
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    return detectCountryFromTimeZone(tz || '');
  });
  const [operatorName, setOperatorName] = useState('');
  const [hamCallInput, setHamCallInput] = useState('');
  const [gridInput, setGridInput] = useState(currentGrid);
  const [hamGridManual, setHamGridManual] = useState(false);
  const [records, setRecords] = useState<CallsignRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadDirectory = async () => {
    try {
      const res = await fetch('/api/callsigns');
      if (res.ok) {
        const data = (await res.json()) as { records?: CallsignRecord[] };
        if (Array.isArray(data.records)) setRecords(data.records);
      }
    } catch {
      // Ignore transient fetch errors
    }
  };

  useEffect(() => {
    if (!open) return;
    setGridInput(currentGrid);
  }, [open, currentGrid]);

  useEffect(() => {
    if (!open) return;
    setStatusMsg(null);
    void loadDirectory();
  }, [open]);

  if (!open) return null;

  const selectedCountry = getHrCountrySpec(countryCode);

  const handleGenerateHrCallsign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/callsigns/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radioId,
          countryCode,
          operatorName,
          grid: selectedCountry.defaultQth.grid,
        }),
      });
      const data = (await res.json()) as {
        record?: CallsignRecord;
        defaultQth?: QthLocation;
        permanentlyAssigned?: boolean;
        alreadyAssigned?: boolean;
        error?: string;
      };
      if (!res.ok || !data.record) {
        setStatusMsg({ kind: 'err', text: data.error || 'Could not issue HR call sign.' });
        return;
      }
      onApplyIdentity(data.record.callsign, data.defaultQth, data.permanentlyAssigned ?? true);
      setStatusMsg({
        kind: 'ok',
        text: data.alreadyAssigned
          ? `Call sign ${data.record.callsign} is already permanently assigned to this radio.`
          : `Permanently assigned HR Call Sign: ${data.record.callsign} (${data.record.countryName})`,
      });
      void loadDirectory();
    } catch {
      setStatusMsg({ kind: 'err', text: 'Network error contacting callsign registry.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterHamCallsign = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = hamCallInput.trim().toUpperCase();
    if (!isValidHamCallsign(cleaned)) {
      setStatusMsg({
        kind: 'err',
        text: 'Enter a valid licensed call sign (e.g. ZS1ROM, M0ABC, K2XYZ). Non-hams should use the HR Call Sign tab.',
      });
      return;
    }
    setSubmitting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/callsigns/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          radioId,
          callsign: cleaned,
          countryCode,
          operatorName,
          grid: gridInput,
        }),
      });
      const data = (await res.json()) as {
        record?: CallsignRecord;
        defaultQth?: QthLocation;
        permanentlyAssigned?: boolean;
        alreadyAssigned?: boolean;
        error?: string;
      };
      if (!res.ok || !data.record) {
        setStatusMsg({ kind: 'err', text: data.error || 'Registration failed.' });
        return;
      }
      onApplyIdentity(data.record.callsign, data.defaultQth, data.permanentlyAssigned ?? true);
      setStatusMsg({
        kind: 'ok',
        text: data.alreadyAssigned
          ? `Call sign ${data.record.callsign} is already permanently assigned to this radio.`
          : `Permanently assigned licensed call sign: ${data.record.callsign}`,
      });
      void loadDirectory();
    } catch {
      setStatusMsg({ kind: 'err', text: 'Network error contacting callsign registry.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="callsign-registry-title"
      data-testid="callsign-registry-modal"
    >
      <div className="sdr-panel rounded-lg max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <IdCard className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <div>
              <h2 id="callsign-registry-title" className="font-display text-lg font-bold text-white">
                HR Call Sign &amp; Licensed Ham Registration
              </h2>
              <p className="text-xs text-slate-400">
                Active station: <span className="font-mono-tabular text-sky-300">{currentCallsign}</span>
                {isCallsignPermanent && (
                  <span
                    data-testid="callsign-permanent-badge"
                    className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/45 text-[10px] font-mono-tabular text-emerald-300"
                  >
                    Permanently Assigned
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close Call Sign Registry"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isCallsignPermanent && (
          <div
            data-testid="callsign-locked-banner"
            className="flex items-center gap-2 px-3 py-2 rounded border border-emerald-400/50 bg-emerald-500/10 text-xs font-mono-tabular text-emerald-200"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300" />
            <span>
              Permanently assigned to this radio: <strong>{currentCallsign}</strong>
            </span>
          </div>
        )}

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setTab('hr');
              setStatusMsg(null);
            }}
            data-testid="tab-hr-callsign"
            className={`py-2 px-3 rounded border text-xs font-display font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              tab === 'hr'
                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                : 'bg-[#0a1019] border-[#213248] text-slate-300 hover:border-sky-400/50'
            }`}
          >
            Non-Ham: Get HR Call Sign
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('ham');
              setStatusMsg(null);
            }}
            data-testid="tab-ham-callsign"
            className={`py-2 px-3 rounded border text-xs font-display font-bold uppercase tracking-wider cursor-pointer transition-colors ${
              tab === 'ham'
                ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                : 'bg-[#0a1019] border-[#213248] text-slate-300 hover:border-sky-400/50'
            }`}
          >
            Licensed Ham: Register Call Sign
          </button>
        </div>

        {statusMsg && (
          <div
            data-testid="callsign-status-banner"
            className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-mono-tabular ${
              statusMsg.kind === 'ok'
                ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-200'
                : 'bg-rose-500/15 border-rose-400/60 text-rose-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        {tab === 'hr' ? (
          <form onSubmit={handleGenerateHrCallsign} className="sdr-bezel rounded-md p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-amber-300">
                  Issue Country-Assigned HR Call Sign
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Select your country to permanently assign an HR hobby radio call sign starting at{' '}
                  <span className="font-mono-tabular text-amber-200">001</span> (e.g.{' '}
                  <span className="font-mono-tabular text-amber-200">26HR001</span> for United Kingdom,{' '}
                  <span className="font-mono-tabular text-amber-200">44HR001</span> for South Africa).
                </p>
              </div>
              <div className="px-2.5 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-center shrink-0">
                <div className="text-[9px] text-amber-300 uppercase">Prefix Format</div>
                <div className="font-mono-tabular text-sm font-bold text-amber-200">
                  {selectedCountry.division}HR001+
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="hr-country-select" className="block text-xs text-slate-300 mb-1">
                  Country / Location
                </label>
                <select
                  id="hr-country-select"
                  data-testid="hr-country-select"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] text-xs text-slate-100 cursor-pointer"
                >
                  {HR_COUNTRY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} (Prefix {c.division}HR)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="hr-operator-name" className="block text-xs text-slate-300 mb-1">
                  Operator Name / Handle (Optional)
                </label>
                <input
                  id="hr-operator-name"
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  placeholder="e.g. Alex from Bristol"
                  className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] text-xs text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono-tabular text-slate-400 flex items-center gap-1">
                <Globe2 className="w-3.5 h-3.5 text-sky-400" />
                QTH Grid {selectedCountry.defaultQth.grid} ({selectedCountry.name})
              </span>
              <button
                type="submit"
                disabled={submitting || isCallsignPermanent}
                data-testid="generate-hr-callsign-button"
                className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCallsignPermanent ? 'Assigned' : submitting ? 'Generating...' : 'Get HR Call Sign'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterHamCallsign} className="sdr-bezel rounded-md p-4 flex flex-col gap-3">
            <div>
              <h3 className="text-xs font-display font-semibold uppercase tracking-wider text-sky-300">
                Register Licensed Amateur Radio Call Sign
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Enter your official ITU amateur radio call sign to register in the network directory and set it active on your rig.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="ham-call-input" className="block text-xs text-slate-300 mb-1">
                  Licensed Call Sign
                </label>
                <input
                  id="ham-call-input"
                  data-testid="ham-callsign-input"
                  type="text"
                  value={hamCallInput}
                  onChange={(e) => {
                    const nextCall = e.target.value.toUpperCase();
                    setHamCallInput(nextCall);
                    const info = resolvePrefixCountryInfo(nextCall);
                    if (info) {
                      setCountryCode(info.countryCode);
                      if (!hamGridManual || !gridInput.trim()) {
                        setGridInput(info.qth.grid);
                      }
                    }
                  }}
                  placeholder="e.g. ZS1ROM"
                  className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-sky-300 uppercase"
                />
              </div>

              <div>
                <label htmlFor="ham-country-select" className="block text-xs text-slate-300 mb-1">
                  Country
                </label>
                <select
                  id="ham-country-select"
                  value={countryCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setCountryCode(code);
                    if (!hamGridManual) {
                      setGridInput(getHrCountrySpec(code).defaultQth.grid);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] text-xs text-slate-100 cursor-pointer"
                >
                  {HR_COUNTRY_LIST.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ham-grid-input" className="block text-xs text-slate-300 mb-1">
                  Grid Square
                </label>
                <input
                  id="ham-grid-input"
                  type="text"
                  value={gridInput}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setGridInput(val);
                    setHamGridManual(Boolean(val.trim()));
                  }}
                  className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white uppercase"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={submitting || isCallsignPermanent}
                data-testid="register-ham-callsign-button"
                className="px-4 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCallsignPermanent ? 'Assigned' : submitting ? 'Registering...' : 'Register Call Sign'}
              </button>
            </div>
          </form>
        )}

        {/* Station Directory */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-sky-400" />
              Registered Station Directory ({records.length})
            </span>
          </div>
          <div className="max-h-44 overflow-y-auto rounded border border-[#1c2c40] bg-[#060b12] divide-y divide-[#131e2e]">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs font-mono-tabular"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                      rec.type === 'HR'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        : 'bg-sky-500/20 text-sky-300 border border-sky-400/40'
                    }`}
                  >
                    {rec.type}
                  </span>
                  <span className="font-bold text-white">{rec.callsign}</span>
                  <span className="text-slate-400 truncate">{rec.countryName}</span>
                </div>
                <span className="text-slate-400 shrink-0">{rec.grid}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
