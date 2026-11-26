import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Trash2, UserCheck, Users, X } from 'lucide-react';
import { CallsignRecord, RemoteStation } from '../types/radio';
import { GROUP_OPTIONS } from './HeaderBar';

interface AdminPanelModalProps {
  open: boolean;
  adminToken: string | null;
  onSetAdminToken: (token: string | null) => void;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  open,
  adminToken,
  onSetAdminToken,
  onClose,
}) => {
  const [operatorInput, setOperatorInput] = useState('ZS1ROM');
  const [passwordInput, setPasswordInput] = useState('');
  const [requiresSetup, setRequiresSetup] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [activeStations, setActiveStations] = useState<RemoteStation[]>([]);
  const [registry, setRegistry] = useState<CallsignRecord[]>([]);
  const [bannedCallsigns, setBannedCallsigns] = useState<string[]>([]);
  const [assistDrafts, setAssistDrafts] = useState<
    Record<string, { callsign: string; groupId: string; message: string }>
  >({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const fetchStatusAndMembers = async (tokenToUse: string | null) => {
    try {
      const statusRes = await fetch('/api/admin/status');
      if (statusRes.ok) {
        const s = (await statusRes.json()) as { requiresSetup?: boolean };
        setRequiresSetup(Boolean(s.requiresSetup));
      }

      if (tokenToUse) {
        const memRes = await fetch('/api/admin/members', {
          headers: { Authorization: `Bearer ${tokenToUse}` },
        });
        if (memRes.status === 401) {
          onSetAdminToken(null);
          return;
        }
        if (memRes.ok) {
          const data = (await memRes.json()) as {
            activeStations?: RemoteStation[];
            registry?: CallsignRecord[];
            bannedCallsigns?: string[];
          };
          const list = data.activeStations ?? [];
          setActiveStations(list);
          setRegistry(data.registry ?? []);
          setBannedCallsigns(data.bannedCallsigns ?? []);
          setAssistDrafts((prev) => {
            const next = { ...prev };
            for (const st of list) {
              if (!next[st.id]) {
                next[st.id] = { callsign: st.callsign, groupId: st.groupId, message: '' };
              }
            }
            return next;
          });
        }
      }
    } catch {
      // Ignore transient network errors
    }
  };

  useEffect(() => {
    if (!open) return;
    setAuthError(null);
    setActionMsg(null);
    void fetchStatusAndMembers(adminToken);
  }, [open, adminToken]);

  if (!open) return null;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoading(true);
    try {
      const endpoint = requiresSetup ? '/api/admin/setup' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorCallsign: operatorInput.trim().toUpperCase(),
          passcode: passwordInput,
        }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }
      setPasswordInput('');
      setRequiresSetup(false);
      onSetAdminToken(data.token);
      void fetchStatusAndMembers(data.token);
    } catch {
      setAuthError('Unable to reach server.');
    } finally {
      setLoading(false);
    }
  };

  const handleAssistMember = async (stationId: string) => {
    if (!adminToken) return;
    const draft = assistDrafts[stationId];
    if (!draft) return;
    setActionMsg(null);
    const res = await fetch('/api/admin/assist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        stationId,
        newCallsign: draft.callsign,
        newGroupId: draft.groupId,
        message: draft.message || `ZS1ROM updated your station (${draft.callsign}) to assist you.`,
      }),
    });
    if (res.ok) {
      setActionMsg(`Assisted station ${draft.callsign}.`);
      void fetchStatusAndMembers(adminToken);
    }
  };

  const handleRemoveMember = async (station: RemoteStation, banCallsign: boolean) => {
    if (!adminToken) return;
    setActionMsg(null);
    const res = await fetch('/api/admin/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        stationId: station.id,
        callsign: station.callsign,
        banCallsign,
        reason: 'Removed from program by ZS1ROM Net Control',
      }),
    });
    if (res.ok) {
      setActionMsg(
        banCallsign
          ? `Removed and blocked ${station.callsign} from the program.`
          : `Disconnected ${station.callsign}.`
      );
      void fetchStatusAndMembers(adminToken);
    }
  };

  const handleUnban = async (callsign: string) => {
    if (!adminToken) return;
    const res = await fetch('/api/admin/unban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ callsign }),
    });
    if (res.ok) {
      void fetchStatusAndMembers(adminToken);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
      data-testid="admin-panel-modal"
    >
      <div className="sdr-panel rounded-lg max-w-3xl w-full max-h-[90dvh] overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#1d2c3f] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-rose-400" aria-hidden="true" />
            <div>
              <h2 id="admin-modal-title" className="font-display text-lg font-bold text-white">
                ZS1ROM Net Control Admin Console
              </h2>
              <p className="text-xs text-slate-400">
                Restricted strictly to operator <span className="font-mono-tabular text-rose-300">ZS1ROM</span> to assist or remove members.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {adminToken && (
              <button
                type="button"
                onClick={() => onSetAdminToken(null)}
                className="px-2.5 py-1 rounded border border-[#24364d] text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Lock Console
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded border border-[#24364d] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close Admin Panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!adminToken ? (
          <form onSubmit={handleAuthSubmit} className="sdr-bezel rounded-md p-4 flex flex-col gap-3 max-w-md mx-auto w-full">
            <div className="flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wider text-rose-300">
              <Lock className="w-4 h-4" />
              <span>{requiresSetup ? 'Initialize ZS1ROM Admin Password' : 'ZS1ROM Admin Sign In'}</span>
            </div>

            {requiresSetup && (
              <p className="text-[11px] text-amber-200 leading-relaxed">
                First-time setup: claim the server-side admin passcode for <strong>ZS1ROM</strong> (or configure <code>ADMIN_PASSCODE</code> in Secrets).
              </p>
            )}

            {authError && (
              <div className="px-3 py-2 rounded border border-rose-400/60 bg-rose-500/15 text-xs text-rose-200">
                {authError}
              </div>
            )}

            <div>
              <label htmlFor="admin-operator-input" className="block text-xs text-slate-300 mb-1">
                Authorized Operator Callsign
              </label>
              <input
                id="admin-operator-input"
                data-testid="admin-operator-input"
                type="text"
                value={operatorInput}
                onChange={(e) => setOperatorInput(e.target.value.toUpperCase())}
                className="w-full px-3 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-sm text-sky-300 uppercase"
              />
            </div>

            <div>
              <label htmlFor="admin-password-input" className="block text-xs text-slate-300 mb-1">
                Admin Password
              </label>
              <input
                id="admin-password-input"
                data-testid="admin-password-input"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter ZS1ROM password"
                className="w-full px-3 py-1.5 rounded border border-[#24364d] bg-[#080d14] font-mono-tabular text-sm text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !passwordInput}
              data-testid="admin-login-submit"
              className="py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Verifying...' : requiresSetup ? 'Claim & Unlock Admin' : 'Unlock Admin Console'}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {actionMsg && (
              <div className="px-3 py-1.5 rounded border border-emerald-400/50 bg-emerald-500/15 text-xs font-mono-tabular text-emerald-200">
                {actionMsg}
              </div>
            )}

            {/* Connected Members Management */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display font-semibold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  Connected Members ({activeStations.length})
                </span>
                <button
                  type="button"
                  onClick={() => void fetchStatusAndMembers(adminToken)}
                  className="px-2 py-0.5 rounded border border-[#24364d] text-[11px] text-slate-300 hover:text-white cursor-pointer"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {activeStations.map((st) => {
                  const draft = assistDrafts[st.id] ?? {
                    callsign: st.callsign,
                    groupId: st.groupId,
                    message: '',
                  };
                  const isSelfAdmin = st.callsign === 'ZS1ROM';
                  return (
                    <div
                      key={st.id}
                      className="sdr-bezel rounded-md p-2.5 flex flex-col gap-2 border border-[#1f3147]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sky-300">{st.callsign}</span>
                          <span className="text-slate-400">
                            {st.band} {(st.frequencyHz / 1_000_000).toFixed(3)} {st.mode} · {st.qth.grid}
                          </span>
                        </div>
                        {!isSelfAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(st, false)}
                              className="px-2 py-0.5 rounded border border-amber-400/50 bg-amber-500/15 hover:bg-amber-500/30 text-[10.5px] text-amber-200 cursor-pointer"
                            >
                              Disconnect
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(st, true)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded border border-rose-400/60 bg-rose-500/20 hover:bg-rose-600 text-[10.5px] text-rose-200 hover:text-white cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 items-center">
                        <input
                          type="text"
                          value={draft.callsign}
                          onChange={(e) =>
                            setAssistDrafts((p) => ({
                              ...p,
                              [st.id]: { ...draft, callsign: e.target.value.toUpperCase() },
                            }))
                          }
                          aria-label={`Assign callsign for ${st.callsign}`}
                          className="px-2 py-1 rounded border border-[#24364d] bg-[#060b12] font-mono-tabular text-[11px] text-white uppercase"
                        />
                        <select
                          value={draft.groupId}
                          onChange={(e) =>
                            setAssistDrafts((p) => ({
                              ...p,
                              [st.id]: { ...draft, groupId: e.target.value },
                            }))
                          }
                          aria-label={`Move group for ${st.callsign}`}
                          className="px-2 py-1 rounded border border-[#24364d] bg-[#060b12] text-[11px] text-slate-200"
                        >
                          {GROUP_OPTIONS.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={draft.message}
                          onChange={(e) =>
                            setAssistDrafts((p) => ({
                              ...p,
                              [st.id]: { ...draft, message: e.target.value },
                            }))
                          }
                          placeholder="Assist message to member..."
                          className="px-2 py-1 rounded border border-[#24364d] bg-[#060b12] text-[11px] text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => void handleAssistMember(st.id)}
                          className="flex items-center justify-center gap-1 px-2 py-1 rounded border border-emerald-400/60 bg-emerald-500/20 hover:bg-emerald-500 hover:text-slate-950 text-[11px] font-display font-bold uppercase text-emerald-200 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Assist</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Registered Members + Removed/Banned List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sdr-bezel rounded-md p-2.5 flex flex-col gap-1.5">
                <span className="font-display font-semibold uppercase tracking-wider text-slate-300">
                  Registered Call Signs ({registry.length})
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1 font-mono-tabular text-[11px]">
                  {registry.map((r) => (
                    <div key={r.id} className="flex items-center justify-between">
                      <span className="text-sky-300">
                        {r.callsign} ({r.type})
                      </span>
                      <span className="text-slate-400">{r.countryName}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sdr-bezel rounded-md p-2.5 flex flex-col gap-1.5">
                <span className="font-display font-semibold uppercase tracking-wider text-rose-300">
                  Removed / Blocked Call Signs ({bannedCallsigns.length})
                </span>
                <div className="max-h-28 overflow-y-auto space-y-1 font-mono-tabular text-[11px]">
                  {bannedCallsigns.length === 0 ? (
                    <span className="text-slate-500">None</span>
                  ) : (
                    bannedCallsigns.map((b) => (
                      <div key={b} className="flex items-center justify-between">
                        <span className="text-rose-300">{b}</span>
                        <button
                          type="button"
                          onClick={() => void handleUnban(b)}
                          className="text-sky-300 hover:underline cursor-pointer"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
