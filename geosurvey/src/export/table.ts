/**
 * Mise à plat des entités d'un projet en tableau typé, partagée par les
 * exports CSV, Excel et la table attributaire (DBF) du Shapefile.
 */
import { closeRing, geometryArea, geometryLength, representativePoint } from '../core/geometry';
import type { ResolvedCrs } from '../core/projections';
import type { AttributeValue, Feature, FieldType, Geometry, Position, Project } from '../core/types';

export type ColumnType = 'string' | 'integer' | 'decimal' | 'date' | 'datetime' | 'boolean';

export interface Column {
  name: string;
  label: string;
  type: ColumnType;
}

export interface Table {
  columns: Column[];
  rows: AttributeValue[][];
}

const FIELD_TO_COLUMN: Record<FieldType, ColumnType> = {
  text: 'string',
  integer: 'integer',
  decimal: 'decimal',
  date: 'date',
  choice: 'string',
  boolean: 'boolean',
  photo: 'string',
};

/** Nom du fichier photo dans l'archive exportée (`photos/<nom>`). */
export function photoArchivePath(uri: string): string {
  const name = uri.split(/[\\/]/).pop() || uri;
  return `photos/${name}`;
}

/** Reprojette toutes les coordonnées d'une géométrie (altitude conservée). */
export function projectGeometry(g: Geometry, crs: ResolvedCrs): Geometry {
  const p = (pos: Position): Position => {
    const [x, y] = crs.forward(pos[0], pos[1]);
    return pos.length === 3 ? [x, y, pos[2]] : [x, y];
  };
  switch (g.type) {
    case 'Point':
      return { type: 'Point', coordinates: p(g.coordinates) };
    case 'LineString':
      return { type: 'LineString', coordinates: g.coordinates.map(p) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: g.coordinates.map((r) => r.map(p)) };
  }
}

function fmtCoord(n: number, geographic: boolean): string {
  // Supprime les zéros superflus : 8 décimales (~1 mm) en degrés, 3 (1 mm) en mètres.
  return String(Number(n.toFixed(geographic ? 8 : 3)));
}

/** Représentation WKT d'une géométrie déjà projetée (2D). */
export function toWkt(g: Geometry, geographic: boolean): string {
  const c = (p: Position) => `${fmtCoord(p[0], geographic)} ${fmtCoord(p[1], geographic)}`;
  switch (g.type) {
    case 'Point':
      return `POINT (${c(g.coordinates)})`;
    case 'LineString':
      return `LINESTRING (${g.coordinates.map(c).join(', ')})`;
    case 'Polygon':
      return `POLYGON (${g.coordinates.map((r) => `(${closeRing(r).map(c).join(', ')})`).join(', ')})`;
  }
}

export interface TableOptions {
  crs: ResolvedCrs;
  /** Ajoute la colonne WKT (CSV/Excel). Inutile dans le DBF d'un Shapefile. */
  includeWkt: boolean;
}

/** Construit la table attributaire d'un projet. */
export function buildTable(project: Project, features: Feature[], opts: TableOptions): Table {
  const { crs } = opts;
  const isPoint = project.geometryType === 'Point';
  const columns: Column[] = [
    { name: 'fid', label: 'N°', type: 'integer' },
    { name: 'uuid', label: 'Identifiant', type: 'string' },
    ...project.fields.map((f) => ({ name: f.name, label: f.label, type: FIELD_TO_COLUMN[f.type] })),
  ];
  if (isPoint) {
    columns.push(
      { name: 'latitude', label: 'Latitude (WGS 84)', type: 'decimal' },
      { name: 'longitude', label: 'Longitude (WGS 84)', type: 'decimal' },
      { name: 'altitude', label: 'Altitude (m)', type: 'decimal' },
    );
    if (!crs.geographic) {
      columns.push(
        { name: 'x', label: `X (EPSG:${crs.epsg})`, type: 'decimal' },
        { name: 'y', label: `Y (EPSG:${crs.epsg})`, type: 'decimal' },
      );
    }
  } else {
    columns.push({ name: 'length_m', label: project.geometryType === 'Polygon' ? 'Périmètre (m)' : 'Longueur (m)', type: 'decimal' });
    if (project.geometryType === 'Polygon') columns.push({ name: 'area_m2', label: 'Surface (m²)', type: 'decimal' });
    columns.push(
      { name: 'latitude', label: 'Latitude centre (WGS 84)', type: 'decimal' },
      { name: 'longitude', label: 'Longitude centre (WGS 84)', type: 'decimal' },
    );
  }
  columns.push(
    { name: 'gps_acc', label: 'Précision GPS (m)', type: 'decimal' },
    { name: 'created', label: 'Créé le', type: 'datetime' },
    { name: 'updated', label: 'Modifié le', type: 'datetime' },
  );
  if (opts.includeWkt) columns.push({ name: 'wkt', label: `Géométrie WKT (EPSG:${crs.epsg})`, type: 'string' });

  const rows = features.map((feat, i) => {
    const row: AttributeValue[] = [i + 1, feat.id];
    for (const f of project.fields) {
      const v = feat.attributes[f.name];
      if (v === undefined || v === null || v === '') row.push(null);
      else if (f.type === 'photo' && typeof v === 'string') row.push(photoArchivePath(v));
      else row.push(v);
    }
    const g = feat.geometry;
    if (isPoint && g.type === 'Point') {
      const [lon, lat, alt] = g.coordinates;
      row.push(lat, lon, alt ?? null);
      if (!crs.geographic) {
        const [x, y] = crs.forward(lon, lat);
        row.push(round(x, 3), round(y, 3));
      }
    } else {
      row.push(round(geometryLength(g), 2));
      if (project.geometryType === 'Polygon') row.push(round(geometryArea(g), 2));
      const c = representativePoint(g);
      row.push(c ? round(c[1], 8) : null, c ? round(c[0], 8) : null);
    }
    row.push(feat.accuracy ?? null, feat.createdAt, feat.updatedAt);
    if (opts.includeWkt) row.push(toWkt(projectGeometry(g, crs), crs.geographic));
    return row;
  });

  return { columns, rows };
}

export function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
