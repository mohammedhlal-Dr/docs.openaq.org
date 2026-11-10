import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { isClockwise } from '../core/geometry';
import { resolveCrs } from '../core/projections';
import { toCsv } from '../export/csv';
import { exportProject, safeBaseName } from '../export/index';
import { buildShapefile, dbfFieldNames, writeDbf, writeShp } from '../export/shapefile';
import { buildTable } from '../export/table';
import { columnLetter, excelDateSerial } from '../export/xlsx';
import { lineFeatures, lineProject, pointFeatures, pointProject, polygonFeatures, polygonProject } from './fixtures';

const wgs84 = resolveCrs('EPSG:4326');
const readFile = async (uri: string) => new TextEncoder().encode(`photo:${uri}`);

describe('Shapefile', () => {
  it('écrit un .shp/.shx de points conforme', () => {
    const { shp, shx } = writeShp('Point', pointFeatures.map((f) => f.geometry));
    const v = new DataView(shp.buffer);
    expect(v.getInt32(0, false)).toBe(9994);
    expect(v.getInt32(24, false) * 2).toBe(shp.length);
    expect(v.getInt32(28, true)).toBe(1000);
    expect(v.getInt32(32, true)).toBe(1);
    expect(shp.length).toBe(100 + 2 * 28);
    expect(v.getFloat64(36, true)).toBeCloseTo(-1.9086); // xmin
    expect(v.getFloat64(52, true)).toBeCloseTo(-1.9); // xmax
    // premier enregistrement
    expect(v.getInt32(100, false)).toBe(1);
    expect(v.getInt32(104, false)).toBe(10);
    expect(v.getFloat64(112, true)).toBeCloseTo(-1.9086);
    expect(v.getFloat64(120, true)).toBeCloseTo(34.6814);
    const x = new DataView(shx.buffer);
    expect(shx.length).toBe(116);
    expect(x.getInt32(100, false)).toBe(50);
    expect(x.getInt32(108, false)).toBe(64);
  });

  it('ferme les polygones et oriente l’anneau extérieur dans le sens horaire', () => {
    const { shp } = writeShp('Polygon', polygonFeatures.map((f) => f.geometry));
    const v = new DataView(shp.buffer);
    expect(v.getInt32(108, true)).toBe(5);
    const nParts = v.getInt32(144, true);
    const nPoints = v.getInt32(148, true);
    expect(nParts).toBe(1);
    expect(nPoints).toBe(5);
    const pts: [number, number][] = [];
    for (let i = 0; i < nPoints; i++) pts.push([v.getFloat64(156 + i * 16, true), v.getFloat64(164 + i * 16, true)]);
    expect(pts[0]).toEqual(pts[4]);
    expect(isClockwise(pts.slice(0, 4))).toBe(true);
  });

  it('écrit un .dbf lisible (UTF-8, types N/C/D/L)', () => {
    const table = buildTable(pointProject, pointFeatures, { crs: wgs84, includeWkt: false });
    const dbf = writeDbf(table.columns, table.rows, new Date(2026, 10, 10));
    const v = new DataView(dbf.buffer);
    expect(dbf[0]).toBe(3);
    expect(v.getUint32(4, true)).toBe(2);
    const headerLength = v.getUint16(8, true);
    const recordLength = v.getUint16(10, true);
    expect(dbf.length).toBe(headerLength + 2 * recordLength + 1);
    expect(dbf[dbf.length - 1]).toBe(0x1a);
    const text = new TextDecoder().decode(dbf);
    expect(text).toContain('Puits « Sidi Yahya », n°1');
    expect(text).toContain('20261109');
    expect(text).toContain('photos/1b2c.jpg');
    expect(text).toContain('Dégradé');
  });

  it('raccourcit les noms de champs DBF sans doublon', () => {
    expect(dbfFieldNames(['profondeur_maximale', 'profondeur_minimale', 'état'])).toEqual(['profondeur', 'profonde_1', 'etat']);
  });

  it('produit les 5 fichiers avec le .prj du système choisi', () => {
    const files = buildShapefile(pointProject, pointFeatures, resolveCrs('EPSG:26191'), 'puits');
    expect(Object.keys(files).sort()).toEqual(['puits.cpg', 'puits.dbf', 'puits.prj', 'puits.shp', 'puits.shx']);
    expect(files['puits.prj']).toContain('Nord_Maroc');
    const v = new DataView((files['puits.shp'] as Uint8Array).buffer);
    expect(v.getFloat64(112, true)).toBeCloseTo(819721.89, 1);
  });
});

describe('Tableaux CSV / Excel', () => {
  it('ajoute coordonnées projetées et WKT', () => {
    const table = buildTable(pointProject, pointFeatures, { crs: resolveCrs('UTM', [[-1.9, 34.6]]), includeWkt: true });
    const names = table.columns.map((c) => c.name);
    expect(names).toEqual([
      'fid', 'uuid', 'nom', 'profondeur', 'nb_usagers', 'date_visite', 'etat', 'potable', 'photo',
      'latitude', 'longitude', 'altitude', 'x', 'y', 'gps_acc', 'created', 'updated', 'wkt',
    ]);
    const row = table.rows[0];
    expect(row[names.indexOf('x')]).toBeCloseTo(599978.685, 2);
    expect(row[names.indexOf('wkt')]).toMatch(/^POINT \(599978\.685 3838254\.329\)$/);
  });

  it('calcule longueur et surface pour lignes et polygones', () => {
    const poly = buildTable(polygonProject, polygonFeatures, { crs: wgs84, includeWkt: true });
    const names = poly.columns.map((c) => c.name);
    expect(names).toContain('area_m2');
    expect(poly.rows[0][names.indexOf('area_m2')] as number).toBeGreaterThan(10000);
    expect(String(poly.rows[0][names.indexOf('wkt')])).toMatch(/^POLYGON \(\(-1\.9 34\.68, .*, -1\.9 34\.68\)\)$/);
    const line = buildTable(lineProject, lineFeatures, { crs: wgs84, includeWkt: true });
    expect(line.columns.map((c) => c.name)).not.toContain('area_m2');
  });

  it('échappe correctement le CSV', () => {
    const table = buildTable(pointProject, pointFeatures, { crs: wgs84, includeWkt: true });
    const csv = toCsv(table, ',');
    expect(csv.startsWith('﻿fid,uuid,nom,')).toBe(true);
    expect(csv).toContain('"Puits « Sidi Yahya », n°1"');
    expect(csv).toContain(',POINT (-1.9086 34.6814)\r\n');
    const lineCsv = toCsv(buildTable(lineProject, lineFeatures, { crs: wgs84, includeWkt: true }), ',');
    expect(lineCsv).toContain('"LINESTRING (-1.9 34.68, -1.89 34.68, -1.89 34.69)"');
    const csvFr = toCsv(table, ';');
    expect(csvFr).toContain(';12,75;');
  });

  it('utilitaires Excel', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(701)).toBe('ZZ');
    expect(excelDateSerial('2026-11-10')).toBe(46336);
  });
});

describe('exportProject', () => {
  it('produit un ZIP Shapefile avec les photos', async () => {
    const res = await exportProject(pointProject, pointFeatures, { format: 'shapefile', crs: 'EPSG:4326', includePhotos: true, readFile });
    expect(res.filename).toMatch(/^Inventaire_des_puits_Oujda_\d{8}_\d{4}\.zip$/);
    const zip = await JSZip.loadAsync(res.data);
    expect(Object.keys(zip.files).sort()).toEqual([
      'Inventaire_des_puits_Oujda.cpg',
      'Inventaire_des_puits_Oujda.dbf',
      'Inventaire_des_puits_Oujda.prj',
      'Inventaire_des_puits_Oujda.shp',
      'Inventaire_des_puits_Oujda.shx',
      'photos/',
      'photos/1b2c.jpg',
    ]);
  });

  it('produit un fichier unique sans photos', async () => {
    const csv = await exportProject(pointProject, pointFeatures, { format: 'csv', crs: 'EPSG:4326' });
    expect(csv.filename).toMatch(/\.csv$/);
    expect(csv.mimeType).toBe('text/csv');
    const xlsx = await exportProject(pointProject, pointFeatures, { format: 'xlsx', crs: 'EPSG:26191' });
    const zip = await JSZip.loadAsync(xlsx.data);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('Puits « Sidi Yahya », n°1');
    const workbook = await zip.file('xl/workbook.xml')!.async('string');
    expect(workbook).toContain('name="Formulaire"');
    const geojson = await exportProject(polygonProject, polygonFeatures, { format: 'geojson', crs: 'EPSG:4326' });
    const parsed = JSON.parse(new TextDecoder().decode(geojson.data));
    expect(parsed.features[0].geometry.coordinates[0]).toHaveLength(5);
    const kml = await exportProject(lineProject, lineFeatures, { format: 'kml', crs: 'EPSG:4326' });
    expect(new TextDecoder().decode(kml.data)).toContain('<LineString>');
  });

  it('nettoie les noms de fichiers', () => {
    expect(safeBaseName('Relevé n°3 / été')).toBe('Releve_n_3_ete');
    expect(safeBaseName('///')).toBe('geosurvey');
  });

  // Écrit des fichiers d'exemple pour une validation externe (pyshp, openpyxl, QGIS).
  const outDir = process.env.GEOSURVEY_SAMPLE_DIR;
  (outDir ? it : it.skip)('écrit des exemples dans GEOSURVEY_SAMPLE_DIR', async () => {
    fs.mkdirSync(outDir!, { recursive: true });
    const cases = [
      ['points', pointProject, pointFeatures],
      ['polygones', polygonProject, polygonFeatures],
      ['lignes', lineProject, lineFeatures],
    ] as const;
    for (const [name, project, features] of cases) {
      for (const crs of ['EPSG:4326', 'EPSG:26191'] as const) {
        const files = buildShapefile(project, [...features], resolveCrs(crs), `${name}_${crs.replace(':', '')}`);
        for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(outDir!, file), content);
      }
    }
    const xlsx = await exportProject(pointProject, pointFeatures, { format: 'xlsx', crs: 'UTM' });
    fs.writeFileSync(path.join(outDir!, 'points.xlsx'), xlsx.data);
    const csv = await exportProject(pointProject, pointFeatures, { format: 'csv', crs: 'EPSG:4326' });
    fs.writeFileSync(path.join(outDir!, 'points.csv'), csv.data);
  });
});
