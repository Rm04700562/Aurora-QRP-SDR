import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import type {
  AntennaId,
  BandId,
  PropagationConditions,
  QsoEntry,
  RadioMode,
  RemoteStation,
} from './src/types/radio';
import { DEFAULT_PROPAGATION, maidenheadFromLatLon } from './src/radio/physics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

interface ClientConnection {
  ws: WebSocket;
  station: RemoteStation;
}

const clients = new Map<string, ClientConnection>();
let sharedPropagation: PropagationConditions = { ...DEFAULT_PROPAGATION };

const qsoLog: QsoEntry[] = [
  {
    id: 'seed-1',
    timestampUtc: '2026-11-24 09:42 UTC',
    callsign: 'DL2QRP',
    band: '20m',
    frequencyHz: 14_250_000,
    mode: 'USB',
    rstSent: '59',
    rstRcvd: '57',
    powerW: 5.0,
    grid: 'JO40',
    notes: 'Clear greyline path into Central Europe on 5W QRP',
  },
  {
    id: 'seed-2',
    timestampUtc: '2026-11-24 08:15 UTC',
    callsign: 'W1AW',
    band: '20m',
    frequencyHz: 14_246_200,
    mode: 'CW',
    rstSent: '599',
    rstRcvd: '579',
    powerW: 5.0,
    grid: 'FN31',
    notes: '15 WPM CW practice QSO',
  },
];

function sanitizeCallsign(raw: unknown): string {
  if (typeof raw !== 'string') return 'ZS1ROM';
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 12);
  return cleaned || 'ZS1ROM';
}

function broadcastRoomStations(serverId: string, groupId: string) {
  const roomStations: RemoteStation[] = [];
  for (const conn of clients.values()) {
    if (conn.station.serverId === serverId && conn.station.groupId === groupId) {
      roomStations.push(conn.station);
    }
  }
  const payload = JSON.stringify({
    type: 'station:list',
    stations: roomStations,
  });

  for (const conn of clients.values()) {
    if (
      conn.station.serverId === serverId &&
      conn.station.groupId === groupId &&
      conn.ws.readyState === WebSocket.OPEN
    ) {
      conn.ws.send(payload);
    }
  }
}

function broadcastPropagation() {
  const payload = JSON.stringify({
    type: 'propagation:state',
    conditions: sharedPropagation,
  });
  for (const conn of clients.values()) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(payload);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      connectedStations: clients.size,
      propagation: sharedPropagation,
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
          : new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
      callsign,
      band: (body.band as BandId) || '20m',
      frequencyHz: Number(body.frequencyHz) || 14_250_000,
      mode: (body.mode as RadioMode) || 'USB',
      rstSent: typeof body.rstSent === 'string' ? body.rstSent.slice(0, 6) : '59',
      rstRcvd: typeof body.rstRcvd === 'string' ? body.rstRcvd.slice(0, 6) : '59',
      powerW: Math.max(0.1, Math.min(5, Number(body.powerW) || 5.0)),
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
      callsign: 'ZS1ROM',
      serverId: 'eu',
      groupId: 'south-africa',
      band: '20m',
      frequencyHz: 14_250_000,
      mode: 'USB',
      powerW: 5.0,
      antennaId: 'yagi5',
      rotorHeadingDeg: 142,
      qth: { lat: -29.8587, lon: 31.0218, grid: 'KG43' },
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
    broadcastRoomStations(initialStation.serverId, initialStation.groupId);

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
        const prevServer = conn.station.serverId;
        const prevGroup = conn.station.groupId;
        const next: RemoteStation = {
          ...conn.station,
          callsign: msg.callsign !== undefined ? sanitizeCallsign(msg.callsign) : conn.station.callsign,
          serverId: typeof msg.serverId === 'string' ? msg.serverId : conn.station.serverId,
          groupId: typeof msg.groupId === 'string' ? msg.groupId : conn.station.groupId,
          band: (msg.band as BandId) ?? conn.station.band,
          frequencyHz: typeof msg.frequencyHz === 'number' ? msg.frequencyHz : conn.station.frequencyHz,
          mode: (msg.mode as RadioMode) ?? conn.station.mode,
          powerW: typeof msg.powerW === 'number' ? Math.max(0.1, Math.min(5, msg.powerW)) : conn.station.powerW,
          antennaId: (msg.antennaId as AntennaId) ?? conn.station.antennaId,
          rotorHeadingDeg:
            typeof msg.rotorHeadingDeg === 'number'
              ? ((msg.rotorHeadingDeg % 360) + 360) % 360
              : conn.station.rotorHeadingDeg,
          qth:
            msg.qth && typeof msg.qth === 'object'
              ? {
                  lat: Number((msg.qth as { lat?: number }).lat ?? conn.station.qth.lat),
                  lon: Number((msg.qth as { lon?: number }).lon ?? conn.station.qth.lon),
                  grid: String((msg.qth as { grid?: string }).grid ?? conn.station.qth.grid).slice(0, 8),
                }
              : conn.station.qth,
          isTransmitting:
            typeof msg.isTransmitting === 'boolean' ? msg.isTransmitting : conn.station.isTransmitting,
          cwText: typeof msg.cwText === 'string' ? msg.cwText.slice(0, 80) : conn.station.cwText,
          lastActiveAt: Date.now(),
        };
        conn.station = next;

        if (prevServer !== next.serverId || prevGroup !== next.groupId) {
          broadcastRoomStations(prevServer, prevGroup);
        }
        broadcastRoomStations(next.serverId, next.groupId);
      } else if (msgType === 'voip:audio') {
        // Relay real Int16 PCM base64 audio frame to peers in the same server & group
        if (typeof msg.pcm16 !== 'string' || msg.pcm16.length > 32_768) return;
        const relay = JSON.stringify({
          type: 'voip:audio',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          mode: conn.station.mode,
          sampleRate: typeof msg.sampleRate === 'number' ? msg.sampleRate : 16000,
          pcm16: msg.pcm16,
          rms: typeof msg.rms === 'number' ? msg.rms : 0.1,
        });

        for (const [peerId, peer] of clients.entries()) {
          if (
            peerId !== clientId &&
            peer.station.serverId === conn.station.serverId &&
            peer.station.groupId === conn.station.groupId &&
            peer.ws.readyState === WebSocket.OPEN
          ) {
            peer.ws.send(relay);
          }
        }
      } else if (msgType === 'cw:tx') {
        if (typeof msg.text !== 'string') return;
        const relay = JSON.stringify({
          type: 'cw:tx',
          fromId: clientId,
          callsign: conn.station.callsign,
          band: conn.station.band,
          frequencyHz: conn.station.frequencyHz,
          wpm: typeof msg.wpm === 'number' ? msg.wpm : 15,
          text: msg.text.slice(0, 80),
        });
        for (const [peerId, peer] of clients.entries()) {
          if (
            peerId !== clientId &&
            peer.station.serverId === conn.station.serverId &&
            peer.station.groupId === conn.station.groupId &&
            peer.ws.readyState === WebSocket.OPEN
          ) {
            peer.ws.send(relay);
          }
        }
      } else if (msgType === 'propagation:update') {
        if (msg.conditions && typeof msg.conditions === 'object') {
          const c = msg.conditions as Partial<PropagationConditions>;
          sharedPropagation = {
            sfi: typeof c.sfi === 'number' ? Math.max(65, Math.min(250, c.sfi)) : sharedPropagation.sfi,
            kIndex: typeof c.kIndex === 'number' ? Math.max(0, Math.min(9, c.kIndex)) : sharedPropagation.kIndex,
            aIndex: typeof c.aIndex === 'number' ? Math.max(0, Math.min(400, c.aIndex)) : sharedPropagation.aIndex,
            auroraActive: typeof c.auroraActive === 'boolean' ? c.auroraActive : sharedPropagation.auroraActive,
            sporadicE: typeof c.sporadicE === 'boolean' ? c.sporadicE : sharedPropagation.sporadicE,
            greylineBoost: typeof c.greylineBoost === 'boolean' ? c.greylineBoost : sharedPropagation.greylineBoost,
            utcHour: typeof c.utcHour === 'number' ? Math.max(0, Math.min(23.9, c.utcHour)) : sharedPropagation.utcHour,
            presetName: typeof c.presetName === 'string' ? c.presetName.slice(0, 32) : 'Custom',
          };
          broadcastPropagation();
        }
      }
    });

    ws.on('close', () => {
      const conn = clients.get(clientId);
      clients.delete(clientId);
      if (conn) {
        broadcastRoomStations(conn.station.serverId, conn.station.groupId);
      }
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Aurora QRP SDR server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aurora QRP SDR server:', err);
  process.exit(1);
});
