/**
 * Modèle de données de GéoSurvey.
 *
 * Un *projet* correspond à une couche (comme une couche QField) : il a un type
 * de géométrie unique et un formulaire (comme un formulaire Survey123) qui
 * décrit les attributs à saisir pour chaque entité.
 */

export type GeometryType = 'Point' | 'LineString' | 'Polygon';

/** Position au format GeoJSON : [longitude, latitude] ou [longitude, latitude, altitude]. */
export type Position = [number, number] | [number, number, number];

export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  /** Un seul anneau extérieur, fermé ou non (il est fermé à l'export). */
  | { type: 'Polygon'; coordinates: Position[][] };

export type FieldType =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'choice'
  | 'boolean'
  | 'photo';

export interface FieldDef {
  /** Nom technique, unique dans le projet (utilisé comme nom de colonne). */
  name: string;
  /** Libellé affiché dans le formulaire. */
  label: string;
  type: FieldType;
  required: boolean;
  /** Valeurs possibles pour le type `choice`. */
  choices?: string[];
  /** Texte d'aide affiché sous le champ. */
  hint?: string;
}

export type AttributeValue = string | number | boolean | null;
export type Attributes = Record<string, AttributeValue>;

export interface Project {
  id: string;
  name: string;
  description: string;
  geometryType: GeometryType;
  fields: FieldDef[];
  createdAt: string;
  updatedAt: string;
}

export interface Feature {
  id: string;
  projectId: string;
  geometry: Geometry;
  attributes: Attributes;
  /** Précision horizontale GPS (m) au moment de la saisie, si connue. */
  accuracy: number | null;
  createdAt: string;
  updatedAt: string;
}

export const GEOMETRY_LABELS: Record<GeometryType, string> = {
  Point: 'Point',
  LineString: 'Ligne',
  Polygon: 'Polygone',
};

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Texte',
  integer: 'Nombre entier',
  decimal: 'Nombre décimal',
  date: 'Date',
  choice: 'Liste de choix',
  boolean: 'Oui / Non',
  photo: 'Photo',
};
