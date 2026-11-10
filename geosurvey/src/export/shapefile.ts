/**
 * Écriture ESRI Shapefile en pur TypeScript (spécification ESRI, juillet 1998).
 *
 * Produit les fichiers .shp (géométries), .shx (index), .dbf (attributs
 * dBase III, texte en UTF-8), .cpg (encodage) et .prj (système de coordonnées).
 */
import { closeRing, isClockwise } from '../core/geometry';
import type { ResolvedCrs } from '../core/projections';
import type { AttributeValue, Feature, Geometry, GeometryType, Project } from '../core/types';
import { utf8Encode, utf8Truncate } from './bytes';
import { buildTable, projectGeometry, type Column } from './table';

const SHAPE_TYPE: Record<GeometryType, number> = { Point: 1, LineString: 3, Polygon: 5 };

type XY = [number, number];

/** Parties (anneaux / tronçons) d'une géométrie projetée, en 2D. */
function partsOf(g: Geometry): XY[][] {
  const xy = (p: number[]): XY => [p[0], p[1]];
  switch (g.type) {
    case 'Point':
      return [[xy(g.coordinates)]];
    case 'LineString':
      return [g.coordinates.map(xy)];
    case 'Polygon':
      return g.coordinates.map((ring, i) => {
        const closed = closeRing(ring).map(xy);
        // Shapefile : anneau extérieur dans le sens horaire, trous dans le sens anti-horaire.
        const wantClockwise = i === 0;
        return isClockwise(closed) === wantClockwise ? closed : closed.reverse();
      });
  }
}

function writeHeader(view: DataView, shapeType: number, fileLengthBytes: number, box: number[]) {
  view.setInt32(0, 9994, false);
  view.setInt32(24, fileLengthBytes / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, shapeType, true);
  for (let i = 0; i < 4; i++) view.setFloat64(36 + i * 8, box[i], true);
  // Zmin, Zmax, Mmin, Mmax restent à 0.
}

export interface ShpResult {
  shp: Uint8Array;
  shx: Uint8Array;
}

/** Écrit les fichiers .shp et .shx à partir de géométries déjà projetées. */
export function writeShp(geometryType: GeometryType, geometries: Geometry[]): ShpResult {
  const shapeType = SHAPE_TYPE[geometryType];
  const records = geometries.map((g) => {
    if (g.type !== geometryType) throw new Error(`Géométrie ${g.type} dans une couche ${geometryType}`);
    const parts = partsOf(g);
    const nPoints = parts.reduce((s, p) => s + p.length, 0);
    const contentLength = geometryType === 'Point' ? 20 : 44 + 4 * parts.length + 16 * nPoints;
    return { parts, nPoints, contentLength };
  });

  const shpLength = 100 + records.reduce((s, r) => s + 8 + r.contentLength, 0);
  const shxLength = 100 + 8 * records.length;
  const shp = new Uint8Array(shpLength);
  const shx = new Uint8Array(shxLength);
  const sv = new DataView(shp.buffer);
  const xv = new DataView(shx.buffer);

  let box = [Infinity, Infinity, -Infinity, -Infinity];
  const extend = (b: number[], [x, y]: XY) => {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  };

  let offset = 100;
  records.forEach((r, i) => {
    xv.setInt32(100 + i * 8, offset / 2, false);
    xv.setInt32(104 + i * 8, r.contentLength / 2, false);
    sv.setInt32(offset, i + 1, false);
    sv.setInt32(offset + 4, r.contentLength / 2, false);
    let o = offset + 8;
    sv.setInt32(o, shapeType, true);
    o += 4;
    if (geometryType === 'Point') {
      const [x, y] = r.parts[0][0];
      sv.setFloat64(o, x, true);
      sv.setFloat64(o + 8, y, true);
      extend(box, [x, y]);
    } else {
      const rbox = [Infinity, Infinity, -Infinity, -Infinity];
      r.parts.forEach((part) => part.forEach((p) => extend(rbox, p)));
      for (let k = 0; k < 4; k++) sv.setFloat64(o + k * 8, rbox[k], true);
      o += 32;
      sv.setInt32(o, r.parts.length, true);
      sv.setInt32(o + 4, r.nPoints, true);
      o += 8;
      let start = 0;
      for (const part of r.parts) {
        sv.setInt32(o, start, true);
        o += 4;
        start += part.length;
      }
      for (const part of r.parts) {
        for (const [x, y] of part) {
          sv.setFloat64(o, x, true);
          sv.setFloat64(o + 8, y, true);
          o += 16;
        }
      }
      extend(box, [rbox[0], rbox[1]]);
      extend(box, [rbox[2], rbox[3]]);
    }
    offset += 8 + r.contentLength;
  });

  if (records.length === 0) box = [0, 0, 0, 0];
  writeHeader(sv, shapeType, shpLength, box);
  writeHeader(xv, shapeType, shxLength, box);
  return { shp, shx };
}

// ---------------------------------------------------------------------------
// DBF
// ---------------------------------------------------------------------------

interface DbfField {
  name: string;
  type: 'C' | 'N' | 'D' | 'L';
  length: number;
  decimals: number;
}

/** Noms de champs DBF : ASCII, 10 caractères max, uniques (insensible à la casse). */
export function dbfFieldNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9_]/g, '_')
        .slice(0, 10) || 'champ';
    let candidate = base;
    let i = 1;
    while (used.has(candidate.toLowerCase())) {
      const suffix = `_${i++}`;
      candidate = base.slice(0, 10 - suffix.length) + suffix;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

const DECIMAL_WIDTH = 24;
const DECIMAL_PLACES = 15;

/** Formate un réel sur `width` caractères en réduisant les décimales si besoin. */
function formatDecimal(v: number, width: number, decimals: number): string {
  for (let d = decimals; d >= 0; d--) {
    const s = v.toFixed(d);
    if (s.length <= width) return s.padStart(width, ' ');
  }
  return '*'.repeat(width);
}

function encodeValue(field: DbfField, v: AttributeValue): Uint8Array {
  const pad = (s: string) => utf8Encode(s.padStart(field.length, ' '));
  if (v === null || v === undefined || v === '') {
    if (field.type === 'L') return utf8Encode('?');
    return new Uint8Array(field.length).fill(0x20);
  }
  switch (field.type) {
    case 'N':
      if (typeof v !== 'number' || !Number.isFinite(v)) return new Uint8Array(field.length).fill(0x20);
      return field.decimals === 0
        ? pad(String(Math.round(v)).slice(0, field.length))
        : utf8Encode(formatDecimal(v, field.length, field.decimals));
    case 'D':
      return utf8Encode(String(v).replace(/-/g, '').slice(0, 8).padEnd(8, ' '));
    case 'L':
      return utf8Encode(v === true ? 'T' : v === false ? 'F' : '?');
    case 'C': {
      const bytes = utf8Truncate(utf8Encode(String(v)), field.length);
      const out = new Uint8Array(field.length).fill(0x20);
      out.set(bytes);
      return out;
    }
  }
}

function dbfFieldFor(col: Column, name: string, values: AttributeValue[]): DbfField {
  switch (col.type) {
    case 'integer':
      return { name, type: 'N', length: 18, decimals: 0 };
    case 'decimal':
      return { name, type: 'N', length: DECIMAL_WIDTH, decimals: DECIMAL_PLACES };
    case 'date':
      return { name, type: 'D', length: 8, decimals: 0 };
    case 'boolean':
      return { name, type: 'L', length: 1, decimals: 0 };
    default: {
      let max = 1;
      for (const v of values) {
        if (v !== null && v !== undefined) max = Math.max(max, utf8Encode(String(v)).length);
      }
      return { name, type: 'C', length: Math.min(254, max), decimals: 0 };
    }
  }
}

/** Écrit une table dBase III (.dbf). Les textes sont encodés en UTF-8 (voir .cpg). */
export function writeDbf(columns: Column[], rows: AttributeValue[][], now = new Date()): Uint8Array {
  const names = dbfFieldNames(columns.map((c) => c.name));
  const fields = columns.map((c, i) => dbfFieldFor(c, names[i], rows.map((r) => r[i])));
  const headerLength = 32 + 32 * fields.length + 1;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const total = headerLength + recordLength * rows.length + 1;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  view.setUint8(0, 0x03);
  view.setUint8(1, now.getFullYear() - 1900);
  view.setUint8(2, now.getMonth() + 1);
  view.setUint8(3, now.getDate());
  view.setUint32(4, rows.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);

  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    buf.set(utf8Encode(f.name), o);
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.length;
    buf[o + 17] = f.decimals;
  });
  buf[headerLength - 1] = 0x0d;

  let o = headerLength;
  for (const row of rows) {
    buf[o++] = 0x20; // enregistrement non supprimé
    fields.forEach((f, i) => {
      buf.set(encodeValue(f, row[i]), o);
      o += f.length;
    });
  }
  buf[o] = 0x1a;
  return buf;
}

export interface ShapefileFiles {
  [filename: string]: Uint8Array | string;
}

/** Produit l'ensemble des fichiers d'un Shapefile pour un projet. */
export function buildShapefile(
  project: Project,
  features: Feature[],
  crs: ResolvedCrs,
  baseName: string,
): ShapefileFiles {
  const projected = features.map((f) => projectGeometry(f.geometry, crs));
  const { shp, shx } = writeShp(project.geometryType, projected);
  const table = buildTable(project, features, { crs, includeWkt: false });
  return {
    [`${baseName}.shp`]: shp,
    [`${baseName}.shx`]: shx,
    [`${baseName}.dbf`]: writeDbf(table.columns, table.rows),
    [`${baseName}.prj`]: crs.prj,
    [`${baseName}.cpg`]: 'UTF-8',
  };
}
