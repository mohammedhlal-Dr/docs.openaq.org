import type { Geometry, GeometryType, Position } from './types';

const EARTH_RADIUS = 6371008.8; // rayon moyen (m)
const toRad = (d: number) => (d * Math.PI) / 180;

/** Distance géodésique (haversine) entre deux positions, en mètres. */
export function distance(a: Position, b: Position): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur cumulée d'une suite de positions, en mètres. */
export function pathLength(coords: Position[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += distance(coords[i - 1], coords[i]);
  return total;
}

function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Retourne l'anneau fermé (dernier point = premier point). */
export function closeRing(ring: Position[]): Position[] {
  if (ring.length === 0) return ring;
  return samePosition(ring[0], ring[ring.length - 1]) ? ring.slice() : [...ring, ring[0]];
}

/** Retire la fermeture éventuelle d'un anneau (utile pour l'édition). */
export function openRing(ring: Position[]): Position[] {
  if (ring.length > 1 && samePosition(ring[0], ring[ring.length - 1])) return ring.slice(0, -1);
  return ring.slice();
}

/**
 * Aire sphérique d'un anneau (m²), formule de Chamberlain & Duquette
 * (« Some Algorithms for Polygons on a Sphere », JPL 2007).
 */
export function ringArea(ring: Position[]): number {
  const r = closeRing(ring);
  const n = r.length;
  if (n < 4) return 0;
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = r[i];
    const p2 = r[i + 1];
    total += toRad(p2[0] - p1[0]) * (2 + Math.sin(toRad(p1[1])) + Math.sin(toRad(p2[1])));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

/** Aire signée planaire (shoelace). Négative => sens horaire. */
export function signedPlanarArea(ring: ([number, number] | Position)[]): number {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function isClockwise(ring: ([number, number] | Position)[]): boolean {
  return signedPlanarArea(ring) < 0;
}

/** Toutes les positions d'une géométrie, à plat. */
export function allPositions(g: Geometry): Position[] {
  switch (g.type) {
    case 'Point':
      return [g.coordinates];
    case 'LineString':
      return g.coordinates;
    case 'Polygon':
      return g.coordinates.flat();
  }
}

export type BBox = [minX: number, minY: number, maxX: number, maxY: number];

export function bbox(positions: ([number, number] | Position)[]): BBox | null {
  if (positions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of positions) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Point représentatif : le point lui-même, le milieu des sommets ou le centroïde du polygone. */
export function representativePoint(g: Geometry): Position | null {
  if (g.type === 'Point') return g.coordinates;
  if (g.type === 'LineString') {
    if (g.coordinates.length === 0) return null;
    const lon = g.coordinates.reduce((s, p) => s + p[0], 0) / g.coordinates.length;
    const lat = g.coordinates.reduce((s, p) => s + p[1], 0) / g.coordinates.length;
    return [lon, lat];
  }
  const ring = openRing(g.coordinates[0] ?? []);
  if (ring.length === 0) return null;
  const a = signedPlanarArea(ring);
  if (Math.abs(a) < 1e-15) {
    return [
      ring.reduce((s, p) => s + p[0], 0) / ring.length,
      ring.reduce((s, p) => s + p[1], 0) / ring.length,
    ];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Longueur (lignes) ou périmètre (polygones) en mètres. */
export function geometryLength(g: Geometry): number {
  if (g.type === 'LineString') return pathLength(g.coordinates);
  if (g.type === 'Polygon') return pathLength(closeRing(g.coordinates[0] ?? []));
  return 0;
}

export function geometryArea(g: Geometry): number {
  return g.type === 'Polygon' ? ringArea(g.coordinates[0] ?? []) : 0;
}

/** Nombre minimal de sommets selon le type de géométrie. */
export const MIN_VERTICES: Record<GeometryType, number> = { Point: 1, LineString: 2, Polygon: 3 };

/** Construit une géométrie à partir d'une liste de sommets saisis. */
export function buildGeometry(type: GeometryType, vertices: Position[]): Geometry | null {
  if (vertices.length < MIN_VERTICES[type]) return null;
  if (type === 'Point') return { type, coordinates: vertices[vertices.length - 1] };
  if (type === 'LineString') return { type, coordinates: vertices.slice() };
  return { type, coordinates: [closeRing(vertices)] };
}

/** Sommets éditables d'une géométrie (anneau ouvert pour les polygones). */
export function geometryVertices(g: Geometry): Position[] {
  if (g.type === 'Point') return [g.coordinates];
  if (g.type === 'LineString') return g.coordinates.slice();
  return openRing(g.coordinates[0] ?? []);
}

/** Retourne un message d'erreur si la géométrie est invalide, sinon `null`. */
export function validateGeometry(g: Geometry | null, expected: GeometryType): string | null {
  if (!g) {
    return expected === 'Point'
      ? 'Aucune position saisie.'
      : `Il faut au moins ${MIN_VERTICES[expected]} sommets.`;
  }
  if (g.type !== expected) return `Géométrie attendue : ${expected}.`;
  for (const p of allPositions(g)) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return 'Coordonnées invalides.';
    if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) return 'Coordonnées hors limites.';
  }
  if (g.type === 'LineString' && g.coordinates.length < 2) return 'Une ligne doit avoir au moins 2 sommets.';
  if (g.type === 'Polygon') {
    const distinct = new Set(openRing(g.coordinates[0] ?? []).map((p) => `${p[0]},${p[1]}`));
    if (distinct.size < 3) return 'Un polygone doit avoir au moins 3 sommets distincts.';
  }
  return null;
}

const fmt = (n: number, digits: number) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function formatLength(m: number): string {
  return m >= 1000 ? `${fmt(m / 1000, 3)} km` : `${fmt(m, 1)} m`;
}

export function formatArea(m2: number): string {
  if (m2 >= 1_000_000) return `${fmt(m2 / 1_000_000, 3)} km²`;
  if (m2 >= 10_000) return `${fmt(m2 / 10_000, 2)} ha`;
  return `${fmt(m2, 1)} m²`;
}

export function formatCoordinate(p: Position, digits = 6): string {
  return `${p[1].toFixed(digits)}, ${p[0].toFixed(digits)}`;
}
