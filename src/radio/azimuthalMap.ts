import { BandId, QthLocation, RemoteStation, SignalEvaluation } from '../types/radio';
import { angularDiffDeg, maidenheadFromLatLon } from './physics';

export type LonLat = [number, number];

// Simplified continent polygons in [lon, lat] degrees (split so no polygon spans a full hemisphere)
export const WORLD_CONTINENT_POLYGONS: LonLat[][] = [
  // North America
  [
    [-166, 65], [-145, 70], [-115, 71], [-82, 68], [-62, 54],
    [-68, 44], [-78, 34], [-82, 25], [-96, 20], [-88, 14],
    [-82, 9], [-92, 14], [-108, 22], [-118, 32], [-125, 44],
    [-136, 56], [-156, 58],
  ],
  // Greenland
  [
    [-52, 60], [-42, 61], [-22, 71], [-26, 81], [-58, 80], [-64, 72],
  ],
  // South America
  [
    [-78, 10], [-64, 10], [-48, 0], [-35, -6], [-39, -18],
    [-48, -28], [-58, -38], [-66, -50], [-70, -55], [-74, -44],
    [-72, -26], [-80, -6], [-79, 4],
  ],
  // Europe
  [
    [-9, 37], [-9, 43], [-2, 48], [6, 53], [10, 58],
    [16, 68], [28, 70], [42, 66], [48, 52], [40, 44],
    [28, 41], [18, 40], [12, 44], [4, 43], [-4, 37],
  ],
  // Africa
  [
    [-16, 15], [-6, 35], [10, 36], [24, 32], [33, 30],
    [42, 13], [51, 11], [44, 0], [40, -14], [34, -26],
    [26, -34], [18, -34], [14, -20], [10, -4], [4, 5],
    [-8, 5], [-16, 12],
  ],
  // Madagascar
  [
    [49, -12], [50, -20], [46, -25], [44, -22], [46, -15],
  ],
  // Asia
  [
    [36, 40], [52, 55], [70, 68], [105, 74], [145, 68],
    [172, 64], [160, 56], [140, 48], [130, 38], [122, 30],
    [110, 20], [104, 2], [96, 16], [86, 20], [78, 8],
    [70, 22], [56, 26], [44, 28], [36, 34],
  ],
  // Japan
  [
    [131, 32], [136, 35], [141, 41], [145, 44], [140, 38], [134, 33],
  ],
  // Australia
  [
    [114, -22], [128, -14], [136, -12], [143, -11], [153, -26],
    [150, -37], [139, -36], [129, -32], [116, -34], [113, -27],
  ],
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Azimuthal equidistant projection centered on `center` QTH.
 * Maps bearing directly to compass angle (0°=N up, 90°=E right) inside a circle of radius `maxRadius`.
 */
export function projectAzimuthalPoint(
  lon: number,
  lat: number,
  center: QthLocation,
  cx = 50,
  cy = 50,
  maxRadius = 42
): { x: number; y: number; angularDistRad: number } {
  const lat1 = center.lat * DEG_TO_RAD;
  const lon1 = center.lon * DEG_TO_RAD;
  const lat2 = lat * DEG_TO_RAD;
  const lon2 = lon * DEG_TO_RAD;
  const dLon = lon2 - lon1;

  const cosC = Math.max(
    -1,
    Math.min(1, Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon))
  );
  const c = Math.acos(cosC);

  if (c < 1e-6) {
    return { x: cx, y: cy, angularDistRad: 0 };
  }

  const yAz = Math.sin(dLon) * Math.cos(lat2);
  const xAz = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const az = Math.atan2(yAz, xAz);

  const r = (c / Math.PI) * maxRadius;
  return {
    x: cx + r * Math.sin(az),
    y: cy - r * Math.cos(az),
    angularDistRad: c,
  };
}

function subdividePolygon(poly: LonLat[], maxStepDeg = 10): LonLat[] {
  const result: LonLat[] = [];
  for (let i = 0; i < poly.length; i++) {
    const [lon1, lat1] = poly[i];
    const [lon2, lat2] = poly[(i + 1) % poly.length];
    const dLon = lon2 - lon1;
    const dLat = lat2 - lat1;
    const dist = Math.hypot(dLon, dLat);
    const steps = Math.max(1, Math.ceil(dist / maxStepDeg));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      result.push([lon1 + dLon * t, lat1 + dLat * t]);
    }
  }
  return result;
}

export const CONTINENT_LABELS: Array<{ code: string; name: string; lon: number; lat: number }> = [
  { code: 'NA', name: 'North America', lon: -102, lat: 46 },
  { code: 'SA', name: 'South America', lon: -60, lat: -15 },
  { code: 'EU', name: 'Europe', lon: 14, lat: 50 },
  { code: 'AF', name: 'Africa', lon: 20, lat: 6 },
  { code: 'AS', name: 'Asia', lon: 96, lat: 46 },
  { code: 'OC', name: 'Oceania', lon: 135, lat: -25 },
];

export function buildAzimuthalContinentPaths(
  center: QthLocation,
  cx = 50,
  cy = 50,
  maxRadius = 42
): string[] {
  return WORLD_CONTINENT_POLYGONS.map((poly) => {
    const dense = subdividePolygon(poly, 5);
    const rawPts = dense.map(([lon, lat]) => projectAzimuthalPoint(lon, lat, center, cx, cy, maxRadius));

    // Prevent polygons straddling the user's antipode from slicing across the globe center
    const safePts: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < rawPts.length; i++) {
      const cur = rawPts[i];
      const next = rawPts[(i + 1) % rawPts.length];
      safePts.push({ x: cur.x, y: cur.y });

      const r1 = Math.hypot(cur.x - cx, cur.y - cy);
      const r2 = Math.hypot(next.x - cx, next.y - cy);
      const segLen = Math.hypot(next.x - cur.x, next.y - cur.y);
      if (r1 > maxRadius * 0.68 && r2 > maxRadius * 0.68 && segLen > maxRadius * 0.55) {
        const a1 = Math.atan2(cur.y - cy, cur.x - cx);
        let a2 = Math.atan2(next.y - cy, next.x - cx);
        let da = a2 - a1;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        a2 = a1 + da;
        const rimSteps = 4;
        const rimR = maxRadius * 0.96;
        for (let s = 1; s < rimSteps; s++) {
          const a = a1 + (da * s) / rimSteps;
          safePts.push({
            x: cx + rimR * Math.cos(a),
            y: cy + rimR * Math.sin(a),
          });
        }
      }
    }

    return (
      safePts
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' ') + ' Z'
    );
  });
}

export function buildAzimuthalContinentLabels(
  center: QthLocation,
  cx = 50,
  cy = 50,
  maxRadius = 42
): Array<{ code: string; name: string; x: number; y: number }> {
  return CONTINENT_LABELS.map((item) => {
    const pt = projectAzimuthalPoint(item.lon, item.lat, center, cx, cy, maxRadius);
    return {
      code: item.code,
      name: item.name,
      x: pt.x,
      y: pt.y,
    };
  });
}

const TIMEZONE_COORDS: Record<string, [number, number]> = {
  'Africa/Johannesburg': [-26.2041, 28.0473],
  'Africa/Cape_Town': [-33.9249, 18.4241],
  'Africa/Cairo': [30.0444, 31.2357],
  'Africa/Nairobi': [-1.2921, 36.8219],
  'Africa/Lagos': [6.5244, 3.3792],
  'Europe/London': [51.5074, -0.1278],
  'Europe/Dublin': [53.3498, -6.2603],
  'Europe/Paris': [48.8566, 2.3522],
  'Europe/Berlin': [52.52, 13.405],
  'Europe/Madrid': [40.4168, -3.7038],
  'Europe/Rome': [41.9028, 12.4964],
  'Europe/Amsterdam': [52.3676, 4.9041],
  'Europe/Zurich': [47.3769, 8.5417],
  'Europe/Stockholm': [59.3293, 18.0686],
  'Europe/Athens': [37.9838, 23.7275],
  'Europe/Warsaw': [52.2297, 21.0122],
  'Europe/Helsinki': [60.1699, 24.9384],
  'Europe/Moscow': [55.7558, 37.6173],
  'America/New_York': [40.7128, -74.006],
  'America/Chicago': [41.8781, -87.6298],
  'America/Denver': [39.7392, -104.9903],
  'America/Los_Angeles': [34.0522, -118.2437],
  'America/Toronto': [43.6532, -79.3832],
  'America/Vancouver': [49.2827, -123.1207],
  'America/Mexico_City': [19.4326, -99.1332],
  'America/Sao_Paulo': [-23.5505, -46.6333],
  'America/Argentina/Buenos_Aires': [-34.6037, -58.3816],
  'Asia/Tokyo': [35.6762, 139.6503],
  'Asia/Seoul': [37.5665, 126.978],
  'Asia/Shanghai': [31.2304, 121.4737],
  'Asia/Hong_Kong': [22.3193, 114.1694],
  'Asia/Singapore': [1.3521, 103.8198],
  'Asia/Kolkata': [28.6139, 77.209],
  'Asia/Dubai': [25.2048, 55.2708],
  'Australia/Sydney': [-33.8688, 151.2093],
  'Australia/Melbourne': [-37.8136, 144.9631],
  'Australia/Perth': [-31.9505, 115.8605],
  'Pacific/Auckland': [-36.8485, 174.7633],
};

export function estimateQthFromTimeZone(timeZone: string): QthLocation | null {
  const coords = TIMEZONE_COORDS[timeZone];
  if (!coords) return null;
  const [lat, lon] = coords;
  return {
    lat,
    lon,
    grid: maidenheadFromLatLon(lat, lon),
  };
}

export function buildAzimuthalGraticulePaths(
  center: QthLocation,
  cx = 50,
  cy = 50,
  maxRadius = 42
): string[] {
  const paths: string[] = [];
  // Latitude parallels (-60, -30, 0, 30, 60)
  for (const lat of [-60, -30, 0, 30, 60]) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let lon = -180; lon <= 180; lon += 15) {
      pts.push(projectAzimuthalPoint(lon, lat, center, cx, cy, maxRadius));
    }
    paths.push(
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    );
  }
  // Longitude meridians every 60°
  for (const lon of [-120, -60, 0, 60, 120, 180]) {
    const pts: Array<{ x: number; y: number }> = [];
    for (let lat = -80; lat <= 80; lat += 10) {
      pts.push(projectAzimuthalPoint(lon, lat, center, cx, cy, maxRadius));
    }
    paths.push(
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    );
  }
  return paths;
}

export function destinationLatLon(
  from: QthLocation,
  bearingDeg: number,
  angularDistDeg: number
): { lat: number; lon: number } {
  const lat1 = from.lat * DEG_TO_RAD;
  const lon1 = from.lon * DEG_TO_RAD;
  const brng = bearingDeg * DEG_TO_RAD;
  const d = angularDistDeg * DEG_TO_RAD;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  const normLon = ((((lon2 * RAD_TO_DEG) + 540) % 360) - 180);
  return { lat: lat2 * RAD_TO_DEG, lon: normLon };
}

/**
 * Traces the spherical great-circle path from `from` along `bearingDeg`
 * in 0..360 x 0..180 equirectangular SVG coordinates, splitting on antimeridian wrap.
 */
export function buildWorldMapBeamPaths(
  from: QthLocation,
  bearingDeg: number,
  maxAngularDeg = 105
): string[] {
  const segments: Array<Array<{ x: number; y: number }>> = [[]];
  let prevX: number | null = null;

  for (let d = 0; d <= maxAngularDeg; d += 7) {
    const pt = destinationLatLon(from, bearingDeg, d);
    const x = ((pt.lon + 180) / 360) * 360;
    const y = ((90 - pt.lat) / 180) * 180;
    if (prevX !== null && Math.abs(x - prevX) > 180) {
      segments.push([]);
    }
    segments[segments.length - 1].push({ x, y });
    prevX = x;
  }

  return segments
    .filter((seg) => seg.length >= 2)
    .map((seg) =>
      seg.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    );
}

export function describeBeamTarget(
  qth: QthLocation,
  headingDeg: number,
  stations: Array<{ station: RemoteStation; evalResult: SignalEvaluation }>,
  activeBand: BandId
): string {
  // Prefer aligned active-band station/beacon or any live connected user within ±18°
  let bestStation: { callsign: string; score: number } | null = null;
  for (const item of stations) {
    const isLiveUser = !item.station.isBeacon;
    if (!isLiveUser && item.station.band !== activeBand) continue;
    const diff = angularDiffDeg(headingDeg, item.evalResult.bearingToTxDeg);
    if (diff <= 18) {
      // Slightly prefer live operators and same-band stations
      const score = diff - (isLiveUser ? 4 : 0) - (item.station.band === activeBand ? 3 : 0);
      if (!bestStation || score < bestStation.score) {
        bestStation = { callsign: item.station.callsign, score };
      }
    }
  }
  if (bestStation) {
    return bestStation.callsign;
  }

  // Otherwise classify the mid-range DX region (~65° great-circle arc)
  const pt = destinationLatLon(qth, headingDeg, 65);
  if (pt.lat < -62) return 'Antarctica';
  if (pt.lat >= 35 && pt.lon >= -12 && pt.lon <= 45) return 'Europe';
  if (pt.lat >= -35 && pt.lat < 35 && pt.lon >= -18 && pt.lon <= 52) return 'Africa';
  if (pt.lat >= 5 && pt.lon > 45 && pt.lon <= 155) return 'Asia';
  if (pt.lat >= -45 && pt.lat < 5 && pt.lon >= 105 && pt.lon <= 178) return 'Oceania';
  if (pt.lat >= 15 && pt.lon >= -168 && pt.lon < -50) return 'N. America';
  if (pt.lat >= -56 && pt.lat < 15 && pt.lon >= -85 && pt.lon < -32) return 'S. America';
  if (pt.lon >= -50 && pt.lon < -12) return 'Atlantic';
  if (pt.lon >= 45 && pt.lon < 105 && pt.lat < 5) return 'Indian Oc.';
  return 'Pacific';
}
