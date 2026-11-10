/**
 * Stockage local hors-ligne (SQLite). Toutes les données restent sur
 * l'appareil jusqu'à l'export.
 */
import * as SQLite from 'expo-sqlite';
import type { Attributes, Feature, FieldDef, Geometry, GeometryType, Project } from '../core/types';
import { deletePhoto } from './files';

const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        geometry_type TEXT NOT NULL,
        fields TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        geometry TEXT NOT NULL,
        attributes TEXT NOT NULL,
        accuracy REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_features_project ON features(project_id, created_at);
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('geosurvey.db');
      await migrate(db);
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  geometry_type: string;
  fields: string;
  created_at: string;
  updated_at: string;
  feature_count?: number;
}

interface FeatureRow {
  id: string;
  project_id: string;
  geometry: string;
  attributes: string;
  accuracy: number | null;
  created_at: string;
  updated_at: string;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  geometryType: r.geometry_type as GeometryType,
  fields: JSON.parse(r.fields) as FieldDef[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toFeature = (r: FeatureRow): Feature => ({
  id: r.id,
  projectId: r.project_id,
  geometry: JSON.parse(r.geometry) as Geometry,
  attributes: JSON.parse(r.attributes) as Attributes,
  accuracy: r.accuracy,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type ProjectSummary = Project & { featureCount: number };

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ProjectRow>(
    `SELECT p.*, (SELECT COUNT(*) FROM features f WHERE f.project_id = p.id) AS feature_count
     FROM projects p ORDER BY p.updated_at DESC`,
  );
  return rows.map((r) => ({ ...toProject(r), featureCount: r.feature_count ?? 0 }));
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
  return row ? toProject(row) : null;
}

export async function saveProject(p: Project): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO projects (id, name, description, geometry_type, fields, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
       geometry_type = excluded.geometry_type, fields = excluded.fields, updated_at = excluded.updated_at`,
    p.id,
    p.name,
    p.description,
    p.geometryType,
    JSON.stringify(p.fields),
    p.createdAt,
    p.updatedAt,
  );
}

function photosOf(project: Project, features: Feature[]): string[] {
  const names = project.fields.filter((f) => f.type === 'photo').map((f) => f.name);
  return features.flatMap((feat) =>
    names.map((n) => feat.attributes[n]).filter((v): v is string => typeof v === 'string' && v.length > 0),
  );
}

export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (!project) return;
  const features = await listFeatures(id);
  const db = await getDb();
  await db.runAsync('DELETE FROM projects WHERE id = ?', id);
  photosOf(project, features).forEach(deletePhoto);
}

export async function countFeatures(projectId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM features WHERE project_id = ?', projectId);
  return row?.n ?? 0;
}

export async function listFeatures(projectId: string): Promise<Feature[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<FeatureRow>(
    'SELECT * FROM features WHERE project_id = ? ORDER BY created_at ASC',
    projectId,
  );
  return rows.map(toFeature);
}

export async function getFeature(id: string): Promise<Feature | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<FeatureRow>('SELECT * FROM features WHERE id = ?', id);
  return row ? toFeature(row) : null;
}

export async function saveFeature(f: Feature): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO features (id, project_id, geometry, attributes, accuracy, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET geometry = excluded.geometry, attributes = excluded.attributes,
         accuracy = excluded.accuracy, updated_at = excluded.updated_at`,
      f.id,
      f.projectId,
      JSON.stringify(f.geometry),
      JSON.stringify(f.attributes),
      f.accuracy,
      f.createdAt,
      f.updatedAt,
    );
    await db.runAsync('UPDATE projects SET updated_at = ? WHERE id = ?', f.updatedAt, f.projectId);
  });
}

export async function deleteFeature(project: Project, feature: Feature): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM features WHERE id = ?', feature.id);
  photosOf(project, [feature]).forEach(deletePhoto);
}
