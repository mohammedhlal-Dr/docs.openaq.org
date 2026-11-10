/**
 * Point d'entrée des exports. Les fonctions sont pures (aucun accès disque) :
 * la lecture des photos est injectée, ce qui les rend testables hors mobile.
 */
import JSZip from 'jszip';
import { allPositions } from '../core/geometry';
import { resolveCrs, type CrsId } from '../core/projections';
import type { Feature, Project } from '../core/types';
import { utf8Encode } from './bytes';
import { toCsv, type CsvSeparator } from './csv';
import { toGeoJSON, toKml } from './geojson';
import { buildShapefile } from './shapefile';
import { buildTable, photoArchivePath } from './table';
import { toXlsx } from './xlsx';

export type ExportFormat = 'shapefile' | 'csv' | 'xlsx' | 'geojson' | 'kml';

export interface FormatInfo {
  id: ExportFormat;
  label: string;
  description: string;
  /** Le format accepte un système de coordonnées projeté. */
  supportsCrs: boolean;
}

export const EXPORT_FORMATS: FormatInfo[] = [
  { id: 'shapefile', label: 'Shapefile (.zip)', description: 'QGIS, ArcGIS – .shp .shx .dbf .prj .cpg', supportsCrs: true },
  { id: 'xlsx', label: 'Excel (.xlsx)', description: 'Tableur avec coordonnées et WKT', supportsCrs: true },
  { id: 'csv', label: 'CSV (.csv)', description: 'Texte tabulé, UTF-8, avec coordonnées et WKT', supportsCrs: true },
  { id: 'geojson', label: 'GeoJSON (.geojson)', description: 'Web SIG, WGS 84', supportsCrs: false },
  { id: 'kml', label: 'KML (.kml)', description: 'Google Earth, WGS 84', supportsCrs: false },
];

export interface ExportOptions {
  format: ExportFormat;
  crs: CrsId;
  csvSeparator?: CsvSeparator;
  /** Joint les photos dans une archive ZIP (dossier `photos/`). */
  includePhotos?: boolean;
  /** Lit le contenu d'une photo à partir de son URI locale. */
  readFile?: (uri: string) => Promise<Uint8Array>;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  /** Uniform Type Identifier iOS. */
  uti: string;
  data: Uint8Array;
}

/** Nom de fichier sûr (ASCII, sans espaces). */
export function safeBaseName(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return s || 'geosurvey';
}

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** URI de toutes les photos référencées par les entités. */
export function photoUris(project: Project, features: Feature[]): string[] {
  const photoFields = project.fields.filter((f) => f.type === 'photo').map((f) => f.name);
  const uris = new Set<string>();
  for (const feat of features) {
    for (const name of photoFields) {
      const v = feat.attributes[name];
      if (typeof v === 'string' && v) uris.add(v);
    }
  }
  return [...uris];
}

export async function exportProject(project: Project, features: Feature[], opts: ExportOptions): Promise<ExportResult> {
  const base = `${safeBaseName(project.name)}_${timestamp()}`;
  const crs = resolveCrs(opts.crs, features.flatMap((f) => allPositions(f.geometry)));

  let files: Record<string, Uint8Array | string>;
  let single: { name: string; mime: string; uti: string } | null = null;

  switch (opts.format) {
    case 'shapefile':
      files = buildShapefile(project, features, crs, safeBaseName(project.name));
      break;
    case 'csv': {
      const table = buildTable(project, features, { crs, includeWkt: true });
      files = { [`${base}.csv`]: toCsv(table, opts.csvSeparator ?? ',') };
      single = { name: `${base}.csv`, mime: 'text/csv', uti: 'public.comma-separated-values-text' };
      break;
    }
    case 'xlsx': {
      const table = buildTable(project, features, { crs, includeWkt: true });
      const xlsx = await toXlsx([
        { name: project.name, columns: table.columns, rows: table.rows },
        {
          name: 'Formulaire',
          columns: [
            { name: 'colonne', type: 'string' },
            { name: 'libelle', type: 'string' },
            { name: 'type', type: 'string' },
          ],
          rows: table.columns.map((c) => [c.name, c.label, c.type]),
        },
      ]);
      files = { [`${base}.xlsx`]: xlsx };
      single = {
        name: `${base}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uti: 'org.openxmlformats.spreadsheetml.sheet',
      };
      break;
    }
    case 'geojson':
      files = { [`${base}.geojson`]: toGeoJSON(project, features) };
      single = { name: `${base}.geojson`, mime: 'application/geo+json', uti: 'public.json' };
      break;
    case 'kml':
      files = { [`${base}.kml`]: toKml(project, features) };
      single = { name: `${base}.kml`, mime: 'application/vnd.google-earth.kml+xml', uti: 'com.google.earth.kml' };
      break;
  }

  const photos = opts.includePhotos && opts.readFile ? photoUris(project, features) : [];

  if (single && photos.length === 0) {
    const content = files[single.name];
    return {
      filename: single.name,
      mimeType: single.mime,
      uti: single.uti,
      data: typeof content === 'string' ? utf8Encode(content) : content,
    };
  }

  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  for (const uri of photos) {
    try {
      zip.file(photoArchivePath(uri), await opts.readFile!(uri));
    } catch {
      // Photo supprimée ou illisible : on exporte quand même les données.
    }
  }
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { filename: `${base}.zip`, mimeType: 'application/zip', uti: 'public.zip-archive', data };
}
