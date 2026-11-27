import React, { useEffect, useState } from 'react';
import { LocateFixed, Settings, X } from 'lucide-react';
import { maidenheadFromLatLon } from '../radio/physics';
import { QthLocation } from '../types/radio';

const QTH_PRESETS: Array<{ label: string; qth: QthLocation }> = [
  { label: 'Cape Town, South Africa (JF96)', qth: { lat: -33.9249, lon: 18.4241, grid: 'JF96' } },
  { label: 'Johannesburg, South Africa (KG43)', qth: { lat: -26.2041, lon: 28.0473, grid: 'KG43' } },
  { label: 'Durban, South Africa (KG50)', qth: { lat: -29.8587, lon: 31.0218, grid: 'KG50' } },
  { label: 'Frankfurt, Germany (JO40)', qth: { lat: 50.1109, lon: 8.6821, grid: 'JO40' } },
  { label: 'New York, USA (FN30)', qth: { lat: 40.7128, lon: -74.006, grid: 'FN30' } },
  { label: 'Tokyo, Japan (PM95)', qth: { lat: 35.6762, lon: 139.6503, grid: 'PM95' } },
  { label: 'Sydney, Australia (QF56)', qth: { lat: -33.8688, lon: 151.2093, grid: 'QF56' } },
];

interface StationSettingsModalProps {
  open: boolean;
  callsign: string;
  isCallsignPermanent?: boolean;
  qth: QthLocation;
  txPowerW: number;
  compressionPct: number;
  onSave: (next: { callsign: string; qth: QthLocation; txPowerW: number; compressionPct: number }) => void;
  onOpenCallsignRegistry?: () => void;
  onClose: () => void;
}

export const StationSettingsModal: React.FC<StationSettingsModalProps> = ({
  open,
  callsign,
  isCallsignPermanent = false,
  qth,
  txPowerW,
  compressionPct,
  onSave,
  onOpenCallsignRegistry,
  onClose,
}) => {
  const [draftCall, setDraftCall] = useState(callsign);
  const [draftLat, setDraftLat] = useState(String(qth.lat));
  const [draftLon, setDraftLon] = useState(String(qth.lon));
  const [draftGrid, setDraftGrid] = useState(qth.grid);
  const [draftPower, setDraftPower] = useState(txPowerW);
  const [draftComp, setDraftComp] = useState(compressionPct);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftCall(callsign);
    setDraftLat(String(qth.lat));
    setDraftLon(String(qth.lon));
    setDraftGrid(qth.grid);
    setDraftPower(txPowerW);
    setDraftComp(compressionPct);
    setGpsStatus(null);
  }, [open, callsign, qth.lat, qth.lon, qth.grid, txPowerW, compressionPct]);

  if (!open) return null;

  const handleUseGps = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('Browser geolocation unavailable.');
      return;
    }
    setLocating(true);
    setGpsStatus('Detecting GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const grid = maidenheadFromLatLon(lat, lon);
        setDraftLat(String(lat));
        setDraftLon(String(lon));
        setDraftGrid(grid);
        setLocating(false);
        setGpsStatus(`GPS locked: ${lat.toFixed(2)}, ${lon.toFixed(2)} (${grid})`);
      },
      (err) => {
        setLocating(false);
        setGpsStatus(err.message || 'Location permission denied.');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCall = draftCall.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 12) || 'ZS1ROM';
    const lat = Math.max(-89, Math.min(89, Number(draftLat) || 0));
    const lon = Math.max(-180, Math.min(180, Number(draftLon) || 0));
    const grid = draftGrid.trim().toUpperCase() || maidenheadFromLatLon(lat, lon);
    onSave({
      callsign: cleanedCall,
      qth: { lat, lon, grid },
      txPowerW: draftPower,
      compressionPct: draftComp,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <form onSubmit={handleSave} className="sdr-panel rounded-lg max-w-lg w-full max-h-[90dvh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" aria-hidden="true" />
            <h2 id="settings-modal-title" className="font-display text-lg font-bold text-white">
              Station Identity &amp; Rig Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
            aria-label="Close Station Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <label htmlFor="station-callsign-input" className="block text-xs text-slate-300">
                Amateur Radio Callsign (or HR Callsign)
              </label>
              {isCallsignPermanent && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/45 text-[10px] font-mono-tabular text-emerald-300">
                  Permanently Assigned
                </span>
              )}
            </div>
            {onOpenCallsignRegistry && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCallsignRegistry();
                }}
                className="text-[11px] text-amber-300 hover:underline cursor-pointer"
              >
                Get HR / Register Call →
              </button>
            )}
          </div>
          <input
            id="station-callsign-input"
            type="text"
            readOnly={isCallsignPermanent}
            value={isCallsignPermanent ? callsign : draftCall}
            onChange={(e) => {
              if (!isCallsignPermanent) setDraftCall(e.target.value);
            }}
            className={`w-full px-3 py-2 rounded border font-mono-tabular text-sm uppercase focus:outline-none ${
              isCallsignPermanent
                ? 'border-emerald-500/45 bg-[#061013] text-emerald-300 cursor-not-allowed'
                : 'border-[#24364d] bg-[#080d14] text-sky-300 focus:border-sky-400'
            }`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-xs text-slate-300">Quick QTH Location Preset</span>
            <button
              type="button"
              onClick={handleUseGps}
              disabled={locating}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-sky-400/50 bg-sky-500/15 hover:bg-sky-500/25 text-[11px] font-medium text-sky-300 cursor-pointer disabled:opacity-60"
            >
              <LocateFixed className="w-3 h-3" aria-hidden="true" />
              <span>{locating ? 'Locating...' : 'Use My GPS Location'}</span>
            </button>
          </div>
          {gpsStatus && (
            <p className="text-[11px] text-sky-300 mb-1.5 font-mono-tabular">{gpsStatus}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {QTH_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setDraftLat(String(p.qth.lat));
                  setDraftLon(String(p.qth.lon));
                  setDraftGrid(p.qth.grid);
                  setGpsStatus(null);
                }}
                className="px-2 py-1 rounded border border-[#23344a] bg-[#0b121c] hover:border-sky-400 text-[11px] text-slate-300 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="qth-lat" className="block text-xs text-slate-400 mb-1">
              Latitude
            </label>
            <input
              id="qth-lat"
              type="number"
              step="0.0001"
              value={draftLat}
              onChange={(e) => {
                setDraftLat(e.target.value);
                setDraftGrid(maidenheadFromLatLon(Number(e.target.value) || 0, Number(draftLon) || 0));
              }}
              className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white"
            />
          </div>
          <div>
            <label htmlFor="qth-lon" className="block text-xs text-slate-400 mb-1">
              Longitude
            </label>
            <input
              id="qth-lon"
              type="number"
              step="0.0001"
              value={draftLon}
              onChange={(e) => {
                setDraftLon(e.target.value);
                setDraftGrid(maidenheadFromLatLon(Number(draftLat) || 0, Number(e.target.value) || 0));
              }}
              className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white"
            />
          </div>
          <div>
            <label htmlFor="qth-grid" className="block text-xs text-slate-400 mb-1">
              Grid Square
            </label>
            <input
              id="qth-grid"
              type="text"
              value={draftGrid}
              onChange={(e) => setDraftGrid(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-sky-300 uppercase"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="tx-power-slider" className="text-slate-300">
                RF TX Power (max 100W)
              </label>
              <span className="font-mono-tabular text-sky-400">{draftPower.toFixed(1)} W</span>
            </div>
            <input
              id="tx-power-slider"
              type="range"
              min={1}
              max={100}
              step={1}
              value={draftPower}
              onChange={(e) => setDraftPower(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <label htmlFor="comp-slider" className="text-slate-300">
                Mic Compression
              </label>
              <span className="font-mono-tabular text-sky-400">{draftComp}%</span>
            </div>
            <input
              id="comp-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draftComp}
              onChange={(e) => setDraftComp(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#1d2c3f]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-[#24364d] text-xs text-slate-300 hover:text-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            Save Station
          </button>
        </div>
      </form>
    </div>
  );
};
