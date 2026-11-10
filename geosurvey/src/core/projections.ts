/**
 * Systèmes de coordonnées disponibles à l'export.
 *
 * Les données sont toujours stockées en WGS 84 (EPSG:4326, comme le GPS).
 * À l'export on peut les reprojeter. Les formules sont implémentées en pur
 * TypeScript (pas de dépendance native) et vérifiées contre PROJ dans les tests :
 *  - Transverse Mercator / UTM : séries de Krüger d'ordre 4 (Karney 2011), précision < 1 mm ;
 *  - Lambert conique conforme 1SP (EPSG 9801) pour les Lambert Maroc ;
 *  - changement de datum WGS 84 -> Merchich par translation géocentrique (EPSG:1131).
 */
import type { Position } from './types';

export type CrsId = 'EPSG:4326' | 'UTM' | 'EPSG:26191' | 'EPSG:26192' | 'EPSG:3857';

export interface CrsOption {
  id: CrsId;
  label: string;
  description: string;
}

export const CRS_OPTIONS: CrsOption[] = [
  { id: 'EPSG:4326', label: 'WGS 84 (lat/lon)', description: 'EPSG:4326 – coordonnées GPS, degrés décimaux' },
  { id: 'UTM', label: 'UTM WGS 84 (zone auto)', description: 'Zone UTM déterminée à partir des données, mètres' },
  { id: 'EPSG:26191', label: 'Lambert Nord Maroc', description: 'EPSG:26191 – Merchich / Nord Maroc, mètres' },
  { id: 'EPSG:26192', label: 'Lambert Sud Maroc', description: 'EPSG:26192 – Merchich / Sud Maroc, mètres' },
  { id: 'EPSG:3857', label: 'Web Mercator', description: 'EPSG:3857 – Pseudo-Mercator, mètres' },
];

export interface ResolvedCrs {
  /** Code EPSG effectif (ex. 32630 pour UTM 30N). */
  epsg: number;
  name: string;
  /** Contenu du fichier .prj (WKT ESRI). */
  prj: string;
  geographic: boolean;
  /** Convertit [lon, lat] WGS 84 vers [x, y] dans ce système. */
  forward: (lon: number, lat: number) => [number, number];
}

const toRad = (d: number) => (d * Math.PI) / 180;

const WGS84 = { a: 6378137, f: 1 / 298.257223563 };
const CLARKE_1880_IGN = { a: 6378249.2, f: 1 / 293.466021293627 };
/** Translation géocentrique Merchich -> WGS 84 (EPSG:1131). */
const MERCHICH_TO_WGS84: [number, number, number] = [31, 146, 47];

const GEOGCS_WGS84 =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const GEOGCS_MERCHICH =
  'GEOGCS["GCS_Merchich",DATUM["D_Merchich",SPHEROID["Clarke_1880_IGN",6378249.2,293.466021293627]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

// ---------------------------------------------------------------------------
// Conversions géodésiques
// ---------------------------------------------------------------------------

function geodeticToEcef(lon: number, lat: number, h: number, ell: { a: number; f: number }) {
  const e2 = ell.f * (2 - ell.f);
  const phi = toRad(lat);
  const lam = toRad(lon);
  const sinPhi = Math.sin(phi);
  const N = ell.a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  return [
    (N + h) * Math.cos(phi) * Math.cos(lam),
    (N + h) * Math.cos(phi) * Math.sin(lam),
    (N * (1 - e2) + h) * sinPhi,
  ] as const;
}

/** ECEF -> [lon, lat] en degrés (itération de Newton sur la latitude). */
function ecefToGeodetic(x: number, y: number, z: number, ell: { a: number; f: number }): [number, number] {
  const e2 = ell.f * (2 - ell.f);
  const p = Math.hypot(x, y);
  const lam = Math.atan2(y, x);
  let phi = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 10; i++) {
    const sinPhi = Math.sin(phi);
    const N = ell.a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
    const h = p / Math.cos(phi) - N;
    const next = Math.atan2(z, p * (1 - (e2 * N) / (N + h)));
    if (Math.abs(next - phi) < 1e-14) {
      phi = next;
      break;
    }
    phi = next;
  }
  return [(lam * 180) / Math.PI, (phi * 180) / Math.PI];
}

/** WGS 84 -> Merchich (Clarke 1880 IGN), hauteur ellipsoïdale supposée nulle. */
export function wgs84ToMerchich(lon: number, lat: number): [number, number] {
  const [x, y, z] = geodeticToEcef(lon, lat, 0, WGS84);
  const [dx, dy, dz] = MERCHICH_TO_WGS84;
  return ecefToGeodetic(x - dx, y - dy, z - dz, CLARKE_1880_IGN);
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

/** Transverse Mercator (séries de Krüger, Karney 2011). */
export function transverseMercator(
  lon: number,
  lat: number,
  p: { lon0: number; k0: number; x0: number; y0: number; ell?: { a: number; f: number } },
): [number, number] {
  const { a, f } = p.ell ?? WGS84;
  const n = f / (2 - f);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
    (61 * n3) / 240 - (103 * n4) / 140,
    (49561 * n4) / 161280,
  ];
  const e = (2 * Math.sqrt(n)) / (1 + n);
  const phi = toRad(lat);
  const lam = toRad(lon - p.lon0);
  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - e * Math.atanh(e * sinPhi));
  const xiP = Math.atan2(t, Math.cos(lam));
  const etaP = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xi = xiP;
  let eta = etaP;
  for (let j = 1; j <= 4; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xiP) * Math.cosh(2 * j * etaP);
    eta += alpha[j - 1] * Math.cos(2 * j * xiP) * Math.sinh(2 * j * etaP);
  }
  return [p.x0 + p.k0 * A * eta, p.y0 + p.k0 * A * xi];
}

/** Lambert conique conforme à un parallèle (EPSG 9801). */
export function lambertConformalConic1SP(
  lon: number,
  lat: number,
  p: { lat0: number; lon0: number; k0: number; x0: number; y0: number; ell: { a: number; f: number } },
): [number, number] {
  const { a, f } = p.ell;
  const e = Math.sqrt(f * (2 - f));
  const tFn = (phi: number) => {
    const s = Math.sin(phi);
    return Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2);
  };
  const phi0 = toRad(p.lat0);
  const m0 = Math.cos(phi0) / Math.sqrt(1 - e * e * Math.sin(phi0) ** 2);
  const n = Math.sin(phi0);
  const t0 = tFn(phi0);
  const F = m0 / (n * Math.pow(t0, n));
  const r0 = a * F * Math.pow(t0, n) * p.k0;
  const r = a * F * Math.pow(tFn(toRad(lat)), n) * p.k0;
  const theta = n * toRad(lon - p.lon0);
  return [p.x0 + r * Math.sin(theta), p.y0 + r0 - r * Math.cos(theta)];
}

export function webMercator(lon: number, lat: number): [number, number] {
  const R = 6378137;
  const clamped = Math.max(-85.06, Math.min(85.06, lat));
  return [R * toRad(lon), R * Math.log(Math.tan(Math.PI / 4 + toRad(clamped) / 2))];
}

// ---------------------------------------------------------------------------
// Résolution d'un système d'export
// ---------------------------------------------------------------------------

export function utmZone(lon: number): number {
  return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
}

function utmCrs(zone: number, south: boolean): ResolvedCrs {
  const lon0 = zone * 6 - 183;
  const x0 = 500000;
  const y0 = south ? 10000000 : 0;
  const hemi = south ? 'S' : 'N';
  return {
    epsg: (south ? 32700 : 32600) + zone,
    name: `WGS 84 / UTM zone ${zone}${hemi}`,
    geographic: false,
    prj:
      `PROJCS["WGS_1984_UTM_Zone_${zone}${hemi}",${GEOGCS_WGS84},PROJECTION["Transverse_Mercator"],` +
      `PARAMETER["False_Easting",${x0.toFixed(1)}],PARAMETER["False_Northing",${y0.toFixed(1)}],` +
      `PARAMETER["Central_Meridian",${lon0.toFixed(1)}],PARAMETER["Scale_Factor",0.9996],` +
      `PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`,
    forward: (lon, lat) => transverseMercator(lon, lat, { lon0, k0: 0.9996, x0, y0 }),
  };
}

function moroccoLambert(epsg: 26191 | 26192): ResolvedCrs {
  const nord = epsg === 26191;
  const lat0 = nord ? 33.3 : 29.7;
  const k0 = nord ? 0.999625769 : 0.999615596;
  const name = nord ? 'Nord_Maroc' : 'Sud_Maroc';
  const params = { lat0, lon0: -5.4, k0, x0: 500000, y0: 300000, ell: CLARKE_1880_IGN };
  return {
    epsg,
    name: `Merchich / ${nord ? 'Nord' : 'Sud'} Maroc`,
    geographic: false,
    prj:
      `PROJCS["${name}",${GEOGCS_MERCHICH},PROJECTION["Lambert_Conformal_Conic"],` +
      `PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",300000.0],` +
      `PARAMETER["Central_Meridian",-5.4],PARAMETER["Standard_Parallel_1",${lat0}],` +
      `PARAMETER["Scale_Factor",${k0}],PARAMETER["Latitude_Of_Origin",${lat0}],UNIT["Meter",1.0]]`,
    forward: (lon, lat) => {
      const [mLon, mLat] = wgs84ToMerchich(lon, lat);
      return lambertConformalConic1SP(mLon, mLat, params);
    },
  };
}

/**
 * Résout un identifiant de système en définition concrète. Pour « UTM », la
 * zone est choisie à partir du centre de l'emprise des positions fournies.
 */
export function resolveCrs(id: CrsId, positions: Position[] = []): ResolvedCrs {
  switch (id) {
    case 'EPSG:4326':
      return { epsg: 4326, name: 'WGS 84', geographic: true, prj: GEOGCS_WGS84, forward: (lon, lat) => [lon, lat] };
    case 'EPSG:3857':
      return {
        epsg: 3857,
        name: 'WGS 84 / Pseudo-Mercator',
        geographic: false,
        prj:
          `PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",${GEOGCS_WGS84},PROJECTION["Mercator_Auxiliary_Sphere"],` +
          'PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],' +
          'PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]',
        forward: webMercator,
      };
    case 'EPSG:26191':
    case 'EPSG:26192':
      return moroccoLambert(id === 'EPSG:26191' ? 26191 : 26192);
    case 'UTM': {
      if (positions.length === 0) return utmCrs(31, false);
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const [lon, lat] of positions) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
      return utmCrs(utmZone((minLon + maxLon) / 2), (minLat + maxLat) / 2 < 0);
    }
  }
}
