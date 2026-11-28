import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import type {
  AntennaId,
  BandId,
  CallsignRecord,
  DxClusterSpot,
  PropagationConditions,
  QsoEntry,
  RadioMode,
  RemoteStation,
} from './src/types/radio';
import {
  computeHourlyPropagationSnapshot,
  DEFAULT_TX_POWER_W,
  evaluateVoacapPath,
  getMsUntilNextUtcHour,
  getNextTopOfHourUtcLabel,
  maidenheadFromLatLon,
  MAX_TX_POWER_W,
} from './src/radio/physics';
import {
  formatHrCallsign,
  getHrCountrySpec,
  isValidHamCallsign,
  resolveGridForCallsign,
  resolvePrefixCountryInfo,
  sanitizeFt8Message,
  sanitizeJttyText,
  sanitizeRttyText,
} from './src/radio/digitalModes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_OPERATOR_CALLSIGN = 'ZS1ROM';
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CALLSIGN_STORE_PATH = path.resolve(__dirname, '.aurora-callsigns.json');

interface ClientConnection {
  ws: WebSocket;
  station: RemoteStation;
  lastRfActivityAt?: number;
}

interface AssignedRadioIdentity {
  radioId: string;
  callsign: string;
  type: 'HR' | 'HAM';
  countryCode: string;
  countryName: string;
  grid: string;
  assignedAt: string;
}

const clients = new Map<string, ClientConnection>();
const bannedCallsigns = new Set<string>();
const adminTokens = new Map<string, { operator: string; expiresAt: number }>();
let claimedAdminCred: { salt: string; hash: string } | null = null;

let sharedPropagation: PropagationConditions = computeHourlyPropagationSnapshot(Date.now());

const divisionCounters = new Map<string, number>();
const assignedRadios = new Map<string, AssignedRadioIdentity>();

const callsignRegistry: CallsignRecord[] = [
  {
    id: 'reg-zs1rom',
    callsign: 'ZS1ROM',
    type: 'HAM',
    countryCode: 'ZA',
    countryName: 'South Africa',
    operatorName: 'ZS1ROM Net Control (Cape Town)',
    grid: 'JF96',
    createdAt: '2026-11-24 08:00 UTC',
  },
];

function loadCallsignStore() {
  try {
    if (!fs.existsSync(CALLSIGN_STORE_PATH)) return;
    const raw = fs.readFileSync(CALLSIGN_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as {
      divisionCounters?: Record<string, number>;
      registry?: CallsignRecord[];
      assignedRadios?: Record<string, AssignedRadioIdentity>;
    };
    if (parsed.divisionCounters) {
      for (const [div, count] of Object.entries(parsed.divisionCounters)) {
        if (typeof count === 'number' && Number.isFinite(count) && count >= 1) {
          divisionCounters.set(div, count);
        }
      }
    }
    if (Array.isArray(parsed.registry) && parsed.registry.length > 0) {
      callsignRegistry.splice(
        0,
        callsignRegistry.length,
        ...parsed.registry.map((rec) =>
          rec.callsign === 'ZS1ROM' ? { ...rec, grid: 'JF96' } : rec
        )
      );
    }
    if (parsed.assignedRadios) {
      for (const [rid, ident] of Object.entries(parsed.assignedRadios)) {
        if (ident && typeof ident.callsign === 'string') {
          assignedRadios.set(
            rid,
            ident.callsign === 'ZS1ROM' ? { ...ident, grid: 'JF96' } : ident
          );
        }
      }
    }
  } catch {
    // Ignore malformed store file on boot
  }
}

function saveCallsignStore() {
  try {
    const payload = {
      divisionCounters: Object.fromEntries(divisionCounters.entries()),
      registry: callsignRegistry.slice(0, 300),
      assignedRadios: Object.fromEntries(assignedRadios.entries()),
    };
    fs.writeFileSync(CALLSIGN_STORE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Ignore write failure in read-only sandboxes
  }
}

loadCallsignStore();

const dxClusterSpots: DxClusterSpot[] = [];

// Strictly real user-logged QSOs only (zero simulated seed entries)
const qsoLog: QsoEntry[] = [];

function nowUtcLabel(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function sanitizeCallsign(raw: unknown): string {
  if (typeof raw !== 'string') return 'OPERATOR';
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 12);
  return cleaned || 'OPERATOR';
}

function hashPasscode(passcode: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 32).toString('hex');
  return { salt, hash: derived };
}

function verifyPasscodeAgainst(candidate: string, expectedPlainOrCred: string | { salt: string; hash: string }): boolean {
  if (typeof expectedPlainOrCred === 'string') {
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(expectedPlainOrCred).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const derived = crypto.scryptSync(candidate, expectedPlainOrCred.salt, 32);
  const expectedBuf = Buffer.from(expectedPlainOrCred.hash, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

function isSameRoom(a: RemoteStation, b: RemoteStation): boolean {
  if (a.groupId === 'open-hf' && b.groupId === 'open-hf') {
    return true;
  }
  if (a.serverId === 'global' && b.serverId === 'global') {
    // On Global QRP Mesh, 'open-hf' hears everyone on Global or same group
    if (a.groupId === 'open-hf' || b.groupId === 'open-hf') return true;
    return a.groupId === b.groupId;
  }
  return a.serverId === b.serverId && a.groupId === b.groupId;
}

function broadcastAllStations() {
  const allStations = Array.from(clients.values()).map((c) => c.station);
  for (const conn of clients.values()) {
    if (conn.ws.readyState !== WebSocket.OPEN) continue;
    const roomStations = allStations.filter((s) => isSameRoom(conn.station, s));
    conn.ws.send(
      JSON.stringify({
        type: 'station:list',
        stations: roomStations,
        globalStations: allStations,
      })
    );
  }
}

function broadcastToAll(payloadObj: Record<string, unknown>) {
  const payload = JSON.stringify(payloadObj);
  for (const conn of clients.values()) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }
}

function relayToRoomPeers(
  senderId: string,
  senderStation: RemoteStation,
  payloadObj: Record<string, unknown>,
  options: { requireFreqAndProp?: boolean; maxFreqDeltaHz?: number; weakSignalDigital?: boolean } | boolean = true
) {
  const opts =
    typeof options === 'boolean'
      ? { requireFreqAndProp: options, maxFreqDeltaHz: 2200, weakSignalDigital: false }
      : {
          requireFreqAndProp: options.requireFreqAndProp ?? true,
          maxFreqDeltaHz: options.maxFreqDeltaHz ?? 2200,
          weakSignalDigital: options.weakSignalDigital ?? false,
        };
  const payload = JSON.stringify(payloadObj);
  for (const [peerId, peer] of clients.entries()) {
    if (
      peerId === senderId ||
      !isSameRoom(senderStation, peer.station) ||
      peer.ws.readyState !== WebSocket.OPEN
    ) {
      continue;
    }
    if (opts.requireFreqAndProp) {
      if (senderStation.band !== peer.station.band) continue;
      if (Math.abs(senderStation.frequencyHz - peer.station.frequencyHz) > opts.maxFreqDeltaHz) continue;
      const voacap = evaluateVoacapPath({
        bandId: senderStation.band,
        txQth: senderStation.qth,
        rxQth: peer.station.qth,
        powerW: senderStation.powerW,
        conditions: sharedPropagation,
      });
      const weakDigitalOpen = opts.weakSignalDigital && voacap.reliabilityPct >= 4;
      if (!voacap.circuitOpen && !weakDigitalOpen) continue;
    }
    peer.ws.send(payload);
  }
}

function relayBandRfActivity(
  senderId: string,
  senderStation: RemoteStation,
  activity: {
    mode: RadioMode;
    audioOffsetHz?: number;
    rttyShiftHz?: number;
    durationMs: number;
    rms?: number;
  }
) {
  const payload = JSON.stringify({
    type: 'rf:activity',
    fromId: senderId,
    band: senderStation.band,
    frequencyHz: senderStation.frequencyHz,
    mode: activity.mode,
    powerW: senderStation.powerW,
    qth: senderStation.qth,
    audioOffsetHz: activity.audioOffsetHz,
    rttyShiftHz: activity.rttyShiftHz,
    durationMs: activity.durationMs,
    rms: activity.rms,
  });
  for (const [peerId, peer] of clients.entries()) {
    if (
      peerId === senderId ||
      !isSameRoom(senderStation, peer.station) ||
      peer.station.band !== senderStation.band ||
      peer.ws.readyState !== WebSocket.OPEN
    ) {
      continue;
    }
    peer.ws.send(payload);
  }
}

function broadcastPropagation() {
  broadcastToAll({
    type: 'propagation:state',
    conditions: sharedPropagation,
  });
}

const PROPAGATION_REFRESH_MS = 3_600_000;

async function fetchJsonWithTimeout(url: string, timeoutMs = 4000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function refreshHourlyPropagation(): Promise<PropagationConditions> {
  let sfi: number | undefined;
  let kIndex: number | undefined;
  let aIndex: number | undefined;

  try {
    const [fluxData, kpData] = await Promise.allSettled([
      fetchJsonWithTimeout('https://services.swpc.noaa.gov/json/f107_cm_flux.json'),
      fetchJsonWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'),
    ]);

    if (fluxData.status === 'fulfilled' && Array.isArray(fluxData.value) && fluxData.value.length > 0) {
      const latest = fluxData.value[fluxData.value.length - 1] as { flux?: number | string };
      const parsedFlux = Number(latest?.flux);
      if (Number.isFinite(parsedFlux) && parsedFlux >= 60 && parsedFlux <= 350) {
        sfi = parsedFlux;
      }
    }

    if (kpData.status === 'fulfilled' && Array.isArray(kpData.value) && kpData.value.length > 1) {
      const latestRow = kpData.value[kpData.value.length - 1];
      if (Array.isArray(latestRow)) {
        const parsedKp = Number(latestRow[1]);
        const parsedA = Number(latestRow[2]);
        if (Number.isFinite(parsedKp)) kIndex = Math.round(parsedKp);
        if (Number.isFinite(parsedA)) aIndex = Math.round(parsedA);
      } else if (latestRow && typeof latestRow === 'object') {
        const obj = latestRow as { Kp?: number | string; kp?: number | string; a_running?: number | string };
        const parsedKp = Number(obj.Kp ?? obj.kp);
        const parsedA = Number(obj.a_running);
        if (Number.isFinite(parsedKp)) kIndex = Math.round(parsedKp);
        if (Number.isFinite(parsedA)) aIndex = Math.round(parsedA);
      }
    }
  } catch {
    // Offline/sandboxed environments fall back smoothly to hourly solar model
  }

  sharedPropagation = computeHourlyPropagationSnapshot(
    Date.now(),
    sfi !== undefined || kIndex !== undefined ? { sfi, kIndex, aIndex } : undefined
  );
  broadcastPropagation();
  return sharedPropagation;
}

function issueAdminToken(): { token: string; expiresAt: number } {
  const nonce = crypto.randomBytes(24).toString('hex');
  const sig = crypto
    .createHmac('sha256', ADMIN_SESSION_SECRET)
    .update(`${ADMIN_OPERATOR_CALLSIGN}:${nonce}`)
    .digest('hex');
  const token = `${nonce}.${sig}`;
  const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
  adminTokens.set(token, { operator: ADMIN_OPERATOR_CALLSIGN, expiresAt });
  return { token, expiresAt };
}

function verifyAdminBearer(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length).trim();
  const session = adminTokens.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminTokens.delete(token);
    return false;
  }
  return session.operator === ADMIN_OPERATOR_CALLSIGN;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      connectedStations: clients.size,
      maxPowerW: MAX_TX_POWER_W,
      propagation: sharedPropagation,
    });
  });

  app.get('/api/propagation', (_req, res) => {
    res.json({
      conditions: {
        ...sharedPropagation,
        nextUpdateUtc: sharedPropagation.nextUpdateUtc ?? getNextTopOfHourUtcLabel(Date.now()),
      },
      refreshIntervalMs: PROPAGATION_REFRESH_MS,
      nextUpdateInMs: getMsUntilNextUtcHour(Date.now()),
    });
  });

  app.post('/api/propagation/refresh', async (_req, res) => {
    const conditions = await refreshHourlyPropagation();
    res.json({
      conditions,
      refreshIntervalMs: PROPAGATION_REFRESH_MS,
      nextUpdateInMs: getMsUntilNextUtcHour(Date.now()),
    });
  });

  app.get('/api/stations', (req, res) => {
    const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : undefined;
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : undefined;
    const list = Array.from(clients.values())
      .map((c) => c.station)
      .filter((s) => (!serverId || s.serverId === serverId) && (!groupId || s.groupId === groupId));
    res.json({ stations: list });
  });

  app.get('/api/geolocate', (req, res) => {
    const cityLatLong = req.header('x-appengine-citylatlong');
    let lat: number | null = null;
    let lon: number | null = null;

    if (cityLatLong && cityLatLong.includes(',')) {
      const [rawLat, rawLon] = cityLatLong.split(',').map(Number);
      if (Number.isFinite(rawLat) && Number.isFinite(rawLon)) {
        lat = rawLat;
        lon = rawLon;
      }
    }

    if (lat === null || lon === null) {
      const hdrLat = Number(
        req.header('cf-iplatitude') ??
          req.header('x-geo-latitude') ??
          req.header('x-vercel-ip-latitude')
      );
      const hdrLon = Number(
        req.header('cf-iplongitude') ??
          req.header('x-geo-longitude') ??
          req.header('x-vercel-ip-longitude')
      );
      if (Number.isFinite(hdrLat) && Number.isFinite(hdrLon) && (hdrLat !== 0 || hdrLon !== 0)) {
        lat = hdrLat;
        lon = hdrLon;
      }
    }

    if (lat === null || lon === null) {
      res.json({ qth: null });
      return;
    }

    res.json({
      qth: {
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        grid: maidenheadFromLatLon(lat, lon),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Call Sign & HR Registry API (Permanent Radio Assignment, 001+ per Country)
  // -------------------------------------------------------------------------
  app.get('/api/callsigns', (_req, res) => {
    res.json({ records: callsignRegistry });
  });

  app.get('/api/callsigns/assigned', (req, res) => {
    const radioId = typeof req.query.radioId === 'string' ? req.query.radioId.trim().slice(0, 64) : '';
    if (!radioId) {
      res.json({ assigned: false, record: null });
      return;
    }
    const assigned = assignedRadios.get(radioId);
    if (!assigned) {
      res.json({ assigned: false, record: null });
      return;
    }
    const countrySpec = getHrCountrySpec(assigned.countryCode);
    res.json({
      assigned: true,
      record: assigned,
      defaultQth: countrySpec.defaultQth,
    });
  });

  app.post('/api/callsigns/hr', (req, res) => {
    const body = req.body ?? {};
    const radioId = typeof body.radioId === 'string' ? body.radioId.trim().slice(0, 64) : '';
    if (radioId && assignedRadios.has(radioId)) {
      const existing = assignedRadios.get(radioId)!;
      const existingRecord = callsignRegistry.find((r) => r.callsign === existing.callsign) ?? {
        id: `assigned-${radioId}`,
        callsign: existing.callsign,
        type: existing.type,
        countryCode: existing.countryCode,
        countryName: existing.countryName,
        operatorName: existing.callsign,
        grid: existing.grid,
        createdAt: existing.assignedAt,
      };
      const existingCountry = getHrCountrySpec(existing.countryCode);
      res.status(200).json({
        record: existingRecord,
        defaultQth: existingCountry.defaultQth,
        permanentlyAssigned: true,
        alreadyAssigned: true,
      });
      return;
    }

    const countryCode = typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : 'GB';
    const countrySpec = getHrCountrySpec(countryCode);
    const operatorName =
      typeof body.operatorName === 'string' && body.operatorName.trim()
        ? body.operatorName.trim().slice(0, 40)
        : `${countrySpec.name} Operator`;
    const grid =
      typeof body.grid === 'string' && body.grid.trim()
        ? body.grid.trim().toUpperCase().slice(0, 8)
        : countrySpec.defaultQth.grid;

    const currentCounter = divisionCounters.get(countrySpec.division) ?? 1;
    let candidate = formatHrCallsign(countrySpec.code, currentCounter);
    let nextNum = currentCounter;
    while (callsignRegistry.some((r) => r.callsign === candidate) && nextNum < 9999) {
      nextNum += 1;
      candidate = formatHrCallsign(countrySpec.code, nextNum);
    }
    divisionCounters.set(countrySpec.division, nextNum + 1);

    const createdAt = nowUtcLabel();
    const record: CallsignRecord = {
      id: `hr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callsign: candidate,
      type: 'HR',
      countryCode: countrySpec.code,
      countryName: countrySpec.name,
      divisionPrefix: countrySpec.division,
      operatorName,
      grid,
      createdAt,
    };
    callsignRegistry.unshift(record);
    if (callsignRegistry.length > 300) callsignRegistry.pop();

    if (radioId) {
      assignedRadios.set(radioId, {
        radioId,
        callsign: record.callsign,
        type: 'HR',
        countryCode: countrySpec.code,
        countryName: countrySpec.name,
        grid,
        assignedAt: createdAt,
      });
    }
    saveCallsignStore();

    res.status(201).json({
      record,
      defaultQth: countrySpec.defaultQth,
      permanentlyAssigned: true,
      alreadyAssigned: false,
    });
  });

  app.post('/api/callsigns/register', (req, res) => {
    const body = req.body ?? {};
    const radioId = typeof body.radioId === 'string' ? body.radioId.trim().slice(0, 64) : '';
    if (radioId && assignedRadios.has(radioId)) {
      const existing = assignedRadios.get(radioId)!;
      const existingRecord = callsignRegistry.find((r) => r.callsign === existing.callsign) ?? {
        id: `assigned-${radioId}`,
        callsign: existing.callsign,
        type: existing.type,
        countryCode: existing.countryCode,
        countryName: existing.countryName,
        operatorName: existing.callsign,
        grid: existing.grid,
        createdAt: existing.assignedAt,
      };
      res.status(200).json({
        record: existingRecord,
        permanentlyAssigned: true,
        alreadyAssigned: true,
      });
      return;
    }

    const callsign = sanitizeCallsign(body.callsign);
    if (!isValidHamCallsign(callsign)) {
      res.status(400).json({
        error: 'Enter a valid licensed amateur callsign (e.g. ZS1ROM, M0ABC, K2XYZ). Non-hams can generate an HR callsign.',
      });
      return;
    }
    if (bannedCallsigns.has(callsign)) {
      res.status(403).json({ error: 'This callsign has been removed by net administration.' });
      return;
    }
    const prefixInfo = resolvePrefixCountryInfo(callsign);
    const countryCode =
      typeof body.countryCode === 'string' && body.countryCode.trim()
        ? body.countryCode.trim().toUpperCase()
        : prefixInfo?.countryCode ?? 'ZA';
    const countrySpec = getHrCountrySpec(countryCode);
    const resolvedCountryName =
      prefixInfo && prefixInfo.countryCode === countryCode ? prefixInfo.countryName : countrySpec.name;
    const operatorName =
      typeof body.operatorName === 'string' && body.operatorName.trim()
        ? body.operatorName.trim().slice(0, 40)
        : callsign;
    const fallbackGrid = resolveGridForCallsign(callsign, [], callsignRegistry) || countrySpec.defaultQth.grid;
    const grid =
      typeof body.grid === 'string' && body.grid.trim()
        ? body.grid.trim().toUpperCase().slice(0, 8)
        : fallbackGrid;

    const existingIdx = callsignRegistry.findIndex((r) => r.callsign === callsign);
    const createdAt = nowUtcLabel();
    const record: CallsignRecord = {
      id: existingIdx >= 0 ? callsignRegistry[existingIdx].id : `ham-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callsign,
      type: 'HAM',
      countryCode,
      countryName: resolvedCountryName,
      operatorName,
      grid,
      createdAt,
    };
    if (existingIdx >= 0) callsignRegistry.splice(existingIdx, 1);
    callsignRegistry.unshift(record);

    if (radioId) {
      assignedRadios.set(radioId, {
        radioId,
        callsign: record.callsign,
        type: 'HAM',
        countryCode,
        countryName: resolvedCountryName,
        grid,
        assignedAt: createdAt,
      });
    }
    saveCallsignStore();

    res.status(201).json({
      record,
      defaultQth: prefixInfo?.qth ?? countrySpec.defaultQth,
      permanentlyAssigned: true,
      alreadyAssigned: false,
    });
  });

  // -------------------------------------------------------------------------
  // Live DX Cluster API
  // -------------------------------------------------------------------------
  app.get('/api/cluster', (_req, res) => {
    res.json({ spots: dxClusterSpots });
  });

  app.post('/api/cluster', (req, res) => {
    const body = req.body ?? {};
    const spotter = sanitizeCallsign(body.spotter);
    const dxCall = sanitizeCallsign(body.dxCall);
    const band = (body.band as BandId) || '20m';
    const frequencyHz = Number(body.frequencyHz) || 14_250_000;
    const mode = (body.mode as RadioMode) || 'USB';
    if (!dxCall) {
      res.status(400).json({ error: 'DX Callsign is required' });
      return;
    }
    const spot: DxClusterSpot = {
      id: `spot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      spotter,
      dxCall,
      band,
      frequencyHz,
      mode,
      comment: typeof body.comment === 'string' ? body.comment.trim().slice(0, 64) : 'Live QRV',
      grid: typeof body.grid === 'string' ? body.grid.trim().toUpperCase().slice(0, 8) : '',
      serverId: typeof body.serverId === 'string' ? body.serverId : 'global',
      groupId: typeof body.groupId === 'string' ? body.groupId : 'open-hf',
      timestampUtc: nowUtcLabel(),
      createdAt: Date.now(),
    };
    dxClusterSpots.unshift(spot);
    if (dxClusterSpots.length > 100) dxClusterSpots.pop();
    broadcastToAll({ type: 'cluster:spot', spot });
    res.status(201).json({ spot });
  });

  // -------------------------------------------------------------------------
  // QSO Logbook API
  // -------------------------------------------------------------------------
  app.get('/api/qsos', (_req, res) => {
    res.json({ qsos: qsoLog });
  });

  app.post('/api/qsos', (req, res) => {
    const body = req.body ?? {};
    const callsign = sanitizeCallsign(body.callsign);
    if (!callsign) {
      res.status(400).json({ error: 'Callsign is required' });
      return;
    }
    const entry: QsoEntry = {
      id: `qso-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestampUtc:
        typeof body.timestampUtc === 'string' && body.timestampUtc.trim()
          ? body.timestampUtc.trim().slice(0, 32)
          : nowUtcLabel(),
      callsign,
      band: (body.band as BandId) || '20m',
      frequencyHz: Number(body.frequencyHz) || 14_250_000,
      mode: (body.mode as RadioMode) || 'USB',
      rstSent: typeof body.rstSent === 'string' ? body.rstSent.slice(0, 6) : '59',
      rstRcvd: typeof body.rstRcvd === 'string' ? body.rstRcvd.slice(0, 6) : '59',
      powerW: Math.max(0.1, Math.min(MAX_TX_POWER_W, Number(body.powerW) || DEFAULT_TX_POWER_W)),
      grid: typeof body.grid === 'string' ? body.grid.toUpperCase().slice(0, 8) : '',
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 160) : '',
    };
    qsoLog.unshift(entry);
    if (qsoLog.length > 200) qsoLog.pop();
    res.status(201).json({ qso: entry });
  });

  app.delete('/api/qsos/:id', (req, res) => {
    const idx = qsoLog.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    qsoLog.splice(idx, 1);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // ZS1ROM Admin Panel API (Strict Operator + Server-Side Passcode Security)
  // -------------------------------------------------------------------------
  app.get('/api/admin/status', (_req, res) => {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE?.trim());
    res.json({
      requiredOperator: ADMIN_OPERATOR_CALLSIGN,
      configured: envConfigured || Boolean(claimedAdminCred),
      requiresSetup: !envConfigured && !claimedAdminCred,
    });
  });

  app.post('/api/admin/setup', (req, res) => {
    const envPass = process.env.ADMIN_PASSCODE?.trim();
    if (envPass || claimedAdminCred) {
      res.status(409).json({ error: 'Admin passcode is already configured.' });
      return;
    }
    const body = req.body ?? {};
    const operator = sanitizeCallsign(body.operatorCallsign);
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';
    if (operator !== ADMIN_OPERATOR_CALLSIGN) {
      res.status(403).json({ error: `Admin panel access is restricted solely to ${ADMIN_OPERATOR_CALLSIGN}.` });
      return;
    }
    if (passcode.length < 6 || passcode.length > 64) {
      res.status(400).json({ error: 'Passcode must be between 6 and 64 characters.' });
      return;
    }
    claimedAdminCred = hashPasscode(passcode);
    const session = issueAdminToken();
    res.json({ ok: true, operator: ADMIN_OPERATOR_CALLSIGN, ...session });
  });

  app.post('/api/admin/login', (req, res) => {
    const body = req.body ?? {};
    const operator = sanitizeCallsign(body.operatorCallsign);
    const passcode = typeof body.passcode === 'string' ? body.passcode.trim() : '';

    if (operator !== ADMIN_OPERATOR_CALLSIGN) {
      res.status(403).json({ error: `Only ${ADMIN_OPERATOR_CALLSIGN} is authorized to access the admin console.` });
      return;
    }

    const envPass = process.env.ADMIN_PASSCODE?.trim();
    const expectedCred = envPass || claimedAdminCred;
    if (!expectedCred) {
      res.status(412).json({ error: 'Admin passcode not yet initialized. Complete first-run setup.' });
      return;
    }

    if (!passcode || !verifyPasscodeAgainst(passcode, expectedCred)) {
      res.status(401).json({ error: 'Invalid admin password for ZS1ROM.' });
      return;
    }

    const session = issueAdminToken();
    res.json({ ok: true, operator: ADMIN_OPERATOR_CALLSIGN, ...session });
  });

  app.get('/api/admin/members', (req, res) => {
    if (!verifyAdminBearer(req.header('authorization'))) {
      res.status(401).json({ error: 'ZS1ROM admin authentication required.' });
      return;
    }
    const activeStations = Array.from(clients.values()).map((c) => c.station);
    res.json({
      activeStations,
      registry: callsignRegistry,
      bannedCallsigns: Array.from(bannedCallsigns),
    });
  });

  app.post('/api/admin/assist', (req, res) => {
    if (!verifyAdminBearer(req.header('authorization'))) {
      res.status(401).json({ error: 'ZS1ROM admin authentication required.' });
      return;
    }
    const body = req.body ?? {};
    const targetId = typeof body.stationId === 'string' ? body.stationId : '';
    const conn = clients.get(targetId);
    if (!conn) {
      res.status(404).json({ error: 'Connected station not found.' });
      return;
    }

    const nextCallsign =
      typeof body.newCallsign === 'string' && body.newCallsign.trim()
        ? sanitizeCallsign(body.newCallsign)
        : undefined;
    const nextGroupId =
      typeof body.newGroupId === 'string' && body.newGroupId.trim() ? body.newGroupId.trim() : undefined;
    const nextBand = typeof body.newBand === 'string' && body.newBand.trim() ? (body.newBand as BandId) : undefined;
    const nextFreqHz =
      typeof body.newFrequencyHz === 'number' && Number.isFinite(body.newFrequencyHz)
        ? body.newFrequencyHz
        : undefined;
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim().slice(0, 180)
        : undefined;

    if (nextCallsign) conn.station.callsign = nextCallsign;
    if (nextGroupId) conn.station.groupId = nextGroupId;
    if (nextBand) conn.station.band = nextBand;
    if (nextFreqHz) conn.station.frequencyHz = nextFreqHz;

    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(
        JSON.stringify({
          type: 'admin:assist',
          fromAdmin: ADMIN_OPERATOR_CALLSIGN,
          newCallsign: nextCallsign,
          newGroupId: nextGroupId,
          newBand: nextBand,
          newFrequencyHz: nextFreqHz,
          message: message ?? 'Net Control ZS1ROM updated your station configuration to assist you.',
          timestampUtc: nowUtcLabel(),
        })
      );
    }

    broadcastAllStations();
    res.json({ ok: true, station: conn.station });
  });

  app.post('/api/admin/remove', (req, res) => {
    if (!verifyAdminBearer(req.header('authorization'))) {
      res.status(401).json({ error: 'ZS1ROM admin authentication required.' });
      return;
    }
    const body = req.body ?? {};
    const targetId = typeof body.stationId === 'string' ? body.stationId : '';
    const targetCall = typeof body.callsign === 'string' ? sanitizeCallsign(body.callsign) : '';
    const banCall = Boolean(body.banCallsign);
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 120)
        : 'Removed by ZS1ROM Net Control';

    let removedCount = 0;

    if (targetId && clients.has(targetId)) {
      const conn = clients.get(targetId)!;
      if (conn.station.callsign !== ADMIN_OPERATOR_CALLSIGN) {
        if (banCall) bannedCallsigns.add(conn.station.callsign);
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(JSON.stringify({ type: 'admin:removed', reason }));
          conn.ws.close(4003, reason);
        }
        clients.delete(targetId);
        removedCount += 1;
      }
    }

    if (targetCall && targetCall !== ADMIN_OPERATOR_CALLSIGN) {
      if (banCall) bannedCallsigns.add(targetCall);
      for (const [id, conn] of clients.entries()) {
        if (conn.station.callsign === targetCall) {
          if (conn.ws.readyState === WebSocket.OPEN) {
            conn.ws.send(JSON.stringify({ type: 'admin:removed', reason }));
            conn.ws.close(4003, reason);
          }
          clients.delete(id);
          removedCount += 1;
        }
      }
      const regIdx = callsignRegistry.findIndex((r) => r.callsign === targetCall);
      if (regIdx >= 0) callsignRegistry.splice(regIdx, 1);
    }

    broadcastAllStations();
    res.json({ ok: true, removedCount });
  });

  app.post('/api/admin/unban', (req, res) => {
    if (!verifyAdminBearer(req.header('authorization'))) {
      res.status(401).json({ error: 'ZS1ROM admin authentication required.' });
      return;
    }
    const call = typeof req.body?.callsign === 'string' ? sanitizeCallsign(req.body.callsign) : '';
    if (call) bannedCallsigns.delete(call);
    res.json({ ok: true, bannedCallsigns: Array.from(bannedCallsigns) });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const initialStation: RemoteStation = {
      id: clientId,
      callsign: 'NEW-OP',
      serverId: 'global',
      groupId: 'open-hf',
      band: '20m',
      frequencyHz: 14_250_000,
      mode: 'USB',
      powerW: DEFAULT_TX_POWER_W,
      antennaId: 'yagi5',
      rotorHeadingDeg: 142,
      qth: { lat: -33.9249, lon: 18.4241, grid: 'JF96' },
      isTransmitting: false,
      lastActiveAt: Date.now(),
    };

    clients.set(clientId, { ws, station: initialStation });

    ws.send(
      JSON.stringify({
        type: 'welcome',
        clientId,
        propagation: sharedPropagation,
      })
    );
    broadcastAllStations();

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const conn = clients.get(clientId);
      if (!conn) return;

      const msgType = msg.type;

      if (msgType === 'station:update') {
        const nextCall =
          msg.callsign !== undefined ? sanitizeCallsign(msg.callsign) : conn.station.callsign;
        if (bannedCallsigns.has(nextCall)) {
          ws.send(JSON.stringify({ type: 'admin:removed', reason: 'Callsign removed by ZS1ROM Admin.' }));
          ws.close(4003, 'Callsign banned');
          clients.delete(clientId);
          broadcastAllStations();
          return;
        }

        const next: RemoteStation = {
          ...conn.station,
          callsign: nextCall,
          serverId: typeof msg.serverId === 'string' ? msg.serverId : conn.station.serverId,
          groupId: typeof msg.groupId === 'string' ? msg.groupId : conn.station.groupId,
          band: (msg.band as BandId) ?? conn.station.band,
          frequencyHz: typeof msg.frequencyHz === 'number' ? msg.frequencyHz : conn.station.frequencyHz,
          mode: (msg.mode as RadioMode) ?? conn.station.mode,
          powerW:
            typeof msg.powerW === 'number'
              ? Math.max(0.1, Math.min(MAX_TX_POWER_W, msg.powerW))
              : conn.station.powerW,
          antennaId: (msg.antennaId as AntennaId) ?? conn.station.antennaId,
          rotorHeadingDeg:
            typeof msg.rotorHeadingDeg === 'number'
              ? ((msg.rotorHeadingDeg % 360) + 360) % 360
              : conn.station.rotorHeadingDeg,
          qth: (() => {
            const rawQth =
              msg.qth && typeof msg.qth === 'object'
                ? {
                    lat: Number((msg.qth as { lat?: number }).lat ?? conn.station.qth.lat),
                    lon: Number((msg.qth as { lon?: number }).lon ?? conn.station.qth.lon),
                    grid: String((msg.qth as { grid?: string }).grid ?? conn.station.qth.grid).slice(0, 8),
                  }
                : conn.station.qth;
            if (nextCall === 'ZS1ROM' && rawQth.grid.toUpperCase() === 'KG43') {
              return { lat: -33.9249, lon: 18.4241, grid: 'JF96' };
            }
            return rawQth;
          })(),
          isTransmitting:
            typeof msg.isTransmitting === 'boolean' ? msg.isTransmitting : conn.station.isTransmitting,
          cwText: typeof msg.cwText === 'string' ? msg.cwText.slice(0, 80) : conn.station.cwText,
          operatorType: /^\d+HR\d+$/.test(nextCall) ? 'HR' : 'HAM',
          lastActiveAt: Date.now(),
        };
        conn.station = next;
        broadcastAllStations();
      } else if (msgType === 'voip:audio') {
        if (typeof msg.pcm16 !== 'string' || msg.pcm16.length > 32_768) return;
        const nowMs = Date.now();
        if (!conn.lastRfActivityAt || nowMs - conn.lastRfActivityAt >= 220) {
          conn.lastRfActivityAt = nowMs;
          relayBandRfActivity(clientId, conn.station, {
            mode: conn.station.mode,
            durationMs: 420,
            rms: typeof msg.rms === 'number' ? msg.rms : 0.15,
          });
        }
        relayToRoomPeers(clientId, conn.station, {
          type: 'voip:audio',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          qth: conn.station.qth,
          mode: conn.station.mode,
          sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
          pcm16: msg.pcm16,
          rms: typeof msg.rms === 'number' ? msg.rms : 0.15,
        });
      } else if (msgType === 'cw:tx') {
        if (typeof msg.text !== 'string') return;
        relayBandRfActivity(clientId, conn.station, {
          mode: 'CW',
          durationMs: 2200,
        });
        relayToRoomPeers(clientId, conn.station, {
          type: 'cw:tx',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          qth: conn.station.qth,
          wpm: typeof msg.wpm === 'number' ? msg.wpm : 15,
          text: msg.text.slice(0, 80),
        });
      } else if (msgType === 'rtty:tx') {
        if (typeof msg.text !== 'string') return;
        const clean = sanitizeRttyText(msg.text);
        if (!clean) return;
        const shiftHz =
          msg.rttyConfig && typeof (msg.rttyConfig as { shiftHz?: unknown }).shiftHz === 'number'
            ? Number((msg.rttyConfig as { shiftHz: number }).shiftHz)
            : 170;
        relayBandRfActivity(clientId, conn.station, {
          mode: 'RTTY',
          rttyShiftHz: shiftHz,
          durationMs: 2400,
        });
        relayToRoomPeers(clientId, conn.station, {
          type: 'rtty:tx',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          qth: conn.station.qth,
          text: clean,
          rttyConfig: msg.rttyConfig && typeof msg.rttyConfig === 'object' ? msg.rttyConfig : undefined,
          timestampUtc: nowUtcLabel(),
        });
      } else if (msgType === 'jtty:tx') {
        if (typeof msg.text !== 'string') return;
        const clean = sanitizeJttyText(msg.text);
        if (!clean) return;
        const shiftHz =
          msg.jttyConfig && typeof (msg.jttyConfig as { shiftHz?: unknown }).shiftHz === 'number'
            ? Number((msg.jttyConfig as { shiftHz: number }).shiftHz)
            : 170;
        relayBandRfActivity(clientId, conn.station, {
          mode: 'RTTY',
          rttyShiftHz: shiftHz,
          durationMs: 2400,
        });
        relayToRoomPeers(clientId, conn.station, {
          type: 'jtty:tx',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          qth: conn.station.qth,
          text: clean,
          jttyConfig: msg.jttyConfig && typeof msg.jttyConfig === 'object' ? msg.jttyConfig : undefined,
          timestampUtc: nowUtcLabel(),
        });
      } else if (msgType === 'ft8:tx') {
        if (typeof msg.message !== 'string') return;
        const clean = sanitizeFt8Message(msg.message);
        if (!clean) return;
        const audioFreqHz =
          typeof msg.audioFreqHz === 'number' ? Math.max(200, Math.min(3000, msg.audioFreqHz)) : 1250;
        relayBandRfActivity(clientId, conn.station, {
          mode: 'FT8',
          audioOffsetHz: audioFreqHz,
          durationMs: 4400,
        });
        relayToRoomPeers(
          clientId,
          conn.station,
          {
            type: 'ft8:tx',
            fromId: clientId,
            callsign: conn.station.callsign,
            band: conn.station.band,
            frequencyHz: conn.station.frequencyHz,
            qth: conn.station.qth,
            audioFreqHz,
            message: clean,
            mode: typeof msg.mode === 'string' ? msg.mode : 'FT8',
            timestampUtc: nowUtcLabel(),
          },
          { requireFreqAndProp: true, maxFreqDeltaHz: 3000, weakSignalDigital: true }
        );
      } else if (msgType === 'sstv:tx') {
        if (typeof msg.pixelsBase64 !== 'string' || msg.pixelsBase64.length > 65_536) return;
        const width = typeof msg.width === 'number' ? Math.min(160, Math.max(16, msg.width)) : 128;
        const height = typeof msg.height === 'number' ? Math.min(120, Math.max(16, msg.height)) : 96;
        relayBandRfActivity(clientId, conn.station, {
          mode: 'SSTV',
          durationMs: 3600,
        });
        relayToRoomPeers(clientId, conn.station, {
          type: 'sstv:tx',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          qth: conn.station.qth,
          sstvMode: typeof msg.sstvMode === 'string' ? msg.sstvMode : 'Robot 36',
          width,
          height,
          pixelsBase64: msg.pixelsBase64,
          caption: typeof msg.caption === 'string' ? msg.caption.slice(0, 48) : '',
          timestampUtc: nowUtcLabel(),
        });
      } else if (msgType === 'propagation:update') {
        if (msg.conditions && typeof msg.conditions === 'object') {
          const c = msg.conditions as Partial<PropagationConditions>;
          const nowMs = Date.now();
          sharedPropagation = {
            sfi: typeof c.sfi === 'number' ? Math.max(65, Math.min(250, c.sfi)) : sharedPropagation.sfi,
            kIndex: typeof c.kIndex === 'number' ? Math.max(0, Math.min(9, c.kIndex)) : sharedPropagation.kIndex,
            aIndex: typeof c.aIndex === 'number' ? Math.max(0, Math.min(400, c.aIndex)) : sharedPropagation.aIndex,
            auroraActive: typeof c.auroraActive === 'boolean' ? c.auroraActive : sharedPropagation.auroraActive,
            sporadicE: typeof c.sporadicE === 'boolean' ? c.sporadicE : sharedPropagation.sporadicE,
            greylineBoost: typeof c.greylineBoost === 'boolean' ? c.greylineBoost : sharedPropagation.greylineBoost,
            utcHour: typeof c.utcHour === 'number' ? Math.max(0, Math.min(23.9, c.utcHour)) : sharedPropagation.utcHour,
            presetName: typeof c.presetName === 'string' ? c.presetName.slice(0, 32) : 'Custom',
            lastUpdatedUtc: `${new Date(nowMs).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
            nextUpdateUtc: getNextTopOfHourUtcLabel(nowMs),
            sourceLabel: 'Operator Override',
            timestampMs: nowMs,
          };
          broadcastPropagation();
        }
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      broadcastAllStations();
    });
  });

  // Initial solar/propagation sync + UTC top-of-hour global auto-update scheduler
  void refreshHourlyPropagation();
  const scheduleNextHourlyPropagation = () => {
    const delayMs = getMsUntilNextUtcHour(Date.now()) + 1000;
    const timer = setTimeout(() => {
      void refreshHourlyPropagation().finally(() => {
        scheduleNextHourlyPropagation();
      });
    }, delayMs);
    timer.unref?.();
  };
  scheduleNextHourlyPropagation();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Aurora 100W SDR server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aurora QRP SDR server:', err);
  process.exit(1);
});
