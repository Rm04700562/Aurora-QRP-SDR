import React, { useState } from 'react';
import { BookMarked, Download, Plus, Trash2, X } from 'lucide-react';
import { formatFrequencyMhz } from '../radio/physics';
import { BandId, QsoEntry, RadioMode } from '../types/radio';

interface QsoLogModalProps {
  open: boolean;
  qsos: QsoEntry[];
  currentBand: BandId;
  currentFrequencyHz: number;
  currentMode: RadioMode;
  currentPowerW: number;
  suggestedCallsign: string;
  suggestedGrid: string;
  onAddQso: (entry: Omit<QsoEntry, 'id' | 'timestampUtc'>) => Promise<void>;
  onDeleteQso: (id: string) => Promise<void>;
  onClose: () => void;
}

export const QsoLogModal: React.FC<QsoLogModalProps> = ({
  open,
  qsos,
  currentBand,
  currentFrequencyHz,
  currentMode,
  currentPowerW,
  suggestedCallsign,
  suggestedGrid,
  onAddQso,
  onDeleteQso,
  onClose,
}) => {
  const [callsign, setCallsign] = useState(suggestedCallsign || '');
  const [rstSent, setRstSent] = useState(currentMode === 'CW' ? '599' : '59');
  const [rstRcvd, setRstRcvd] = useState(currentMode === 'CW' ? '599' : '59');
  const [grid, setGrid] = useState(suggestedGrid || '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = callsign.trim().toUpperCase();
    if (!cleaned) {
      setError('Enter the contacted station callsign (e.g. DL2QRP).');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onAddQso({
        callsign: cleaned,
        band: currentBand,
        frequencyHz: currentFrequencyHz,
        mode: currentMode,
        rstSent: rstSent.trim() || '59',
        rstRcvd: rstRcvd.trim() || '59',
        powerW: currentPowerW,
        grid: grid.trim().toUpperCase(),
        notes: notes.trim(),
      });
      setCallsign('');
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const header = 'UTC,Callsign,Band,FrequencyHz,Mode,RST_Sent,RST_Rcvd,PowerW,Grid,Notes\n';
    const rows = qsos
      .map((q) =>
        [
          q.timestampUtc,
          q.callsign,
          q.band,
          q.frequencyHz,
          q.mode,
          q.rstSent,
          q.rstRcvd,
          q.powerW,
          q.grid,
          `"${(q.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aurora-qrp-logbook.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qso-modal-title"
    >
      <div className="sdr-panel rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <BookMarked className="w-5 h-5 text-sky-400" aria-hidden="true" />
            <div>
              <h2 id="qso-modal-title" className="font-display text-lg font-bold text-white">
                Station QSO Logbook
              </h2>
              <p className="text-xs text-slate-400">
                Log two-way radio contacts (QSOs) made over VOIP or practice beacons.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#24364d] bg-[#0a1019] hover:border-sky-400 text-xs text-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close QSO Logbook"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Log Form */}
        <form onSubmit={handleSubmit} className="sdr-bezel rounded-md p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300 font-mono-tabular">
            <span>
              VFO: <strong className="text-sky-400">{formatFrequencyMhz(currentFrequencyHz)} MHz</strong> ·{' '}
              {currentBand} · {currentMode} · {currentPowerW.toFixed(1)}W QRP
            </span>
            {suggestedCallsign && (
              <button
                type="button"
                onClick={() => {
                  setCallsign(suggestedCallsign);
                  setGrid(suggestedGrid);
                }}
                className="text-sky-400 hover:underline cursor-pointer"
              >
                Fill tuned station ({suggestedCallsign})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <div className="col-span-2 sm:col-span-2">
              <label htmlFor="qso-callsign" className="block text-[11px] text-slate-400 mb-1">
                Worked Callsign
              </label>
              <input
                id="qso-callsign"
                type="text"
                value={callsign}
                onChange={(e) => setCallsign(e.target.value)}
                placeholder="e.g. DL2QRP"
                className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white uppercase focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label htmlFor="qso-rst-sent" className="block text-[11px] text-slate-400 mb-1">
                RST Sent
              </label>
              <input
                id="qso-rst-sent"
                type="text"
                value={rstSent}
                onChange={(e) => setRstSent(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label htmlFor="qso-rst-rcvd" className="block text-[11px] text-slate-400 mb-1">
                RST Rcvd
              </label>
              <input
                id="qso-rst-rcvd"
                type="text"
                value={rstRcvd}
                onChange={(e) => setRstRcvd(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white focus:outline-none focus:border-sky-400"
              />
            </div>

            <div>
              <label htmlFor="qso-grid" className="block text-[11px] text-slate-400 mb-1">
                Grid Square
              </label>
              <input
                id="qso-grid"
                type="text"
                value={grid}
                onChange={(e) => setGrid(e.target.value)}
                placeholder="JO40"
                className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-xs text-white uppercase focus:outline-none focus:border-sky-400"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Log QSO</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="qso-notes" className="block text-[11px] text-slate-400 mb-1">
              Notes (Antenna, Propagation, Operator Name)
            </label>
            <input
              id="qso-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Strong 5W signal on 5-El Yagi pointed 345°"
              className="w-full px-2.5 py-1.5 rounded border border-[#24364d] bg-[#080d14] text-xs text-white focus:outline-none focus:border-sky-400"
            />
          </div>

          {error && <p className="text-xs text-rose-400">{error}</p>}
        </form>

        {/* Log Table */}
        <div className="overflow-x-auto border border-[#1d2c3f] rounded-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#0b131f] text-slate-400 uppercase font-display text-[11px]">
              <tr>
                <th className="py-2 px-3">UTC</th>
                <th className="py-2 px-3">Callsign</th>
                <th className="py-2 px-3">Band</th>
                <th className="py-2 px-3">Freq</th>
                <th className="py-2 px-3">Mode</th>
                <th className="py-2 px-3">S / R</th>
                <th className="py-2 px-3">Grid</th>
                <th className="py-2 px-3">Notes</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#172536] font-mono-tabular">
              {qsos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400 font-sans">
                    No contacts logged yet. Tune a station or call CQ and log your first QSO above.
                  </td>
                </tr>
              ) : (
                qsos.map((q) => (
                  <tr key={q.id} className="hover:bg-[#0e1726]">
                    <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{q.timestampUtc}</td>
                    <td className="py-2 px-3 font-semibold text-sky-300">{q.callsign}</td>
                    <td className="py-2 px-3 text-slate-200">{q.band}</td>
                    <td className="py-2 px-3 text-slate-200">{formatFrequencyMhz(q.frequencyHz)}</td>
                    <td className="py-2 px-3 text-slate-200">{q.mode}</td>
                    <td className="py-2 px-3 text-emerald-300">
                      {q.rstSent}/{q.rstRcvd}
                    </td>
                    <td className="py-2 px-3 text-slate-300">{q.grid || '—'}</td>
                    <td className="py-2 px-3 text-slate-400 font-sans max-w-[200px] truncate">{q.notes || '—'}</td>
                    <td className="py-2 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => void onDeleteQso(q.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                        aria-label={`Delete QSO with ${q.callsign}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
