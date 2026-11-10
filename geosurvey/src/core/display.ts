import { formatArea, formatCoordinate, formatLength, geometryArea, geometryLength } from './geometry';
import type { Feature, Project } from './types';

/** Libellé lisible d'une entité : premier champ texte/choix renseigné. */
export function featureTitle(project: Project, f: Feature, index: number): string {
  for (const field of project.fields) {
    if (field.type !== 'text' && field.type !== 'choice') continue;
    const v = f.attributes[field.name];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return `Entité ${index + 1}`;
}

/** Résumé de mesure : coordonnées, longueur ou surface. */
export function featureMeasure(f: Feature): string {
  const g = f.geometry;
  if (g.type === 'Point') return formatCoordinate(g.coordinates, 5);
  if (g.type === 'LineString') return formatLength(geometryLength(g));
  return `${formatArea(geometryArea(g))} · ${formatLength(geometryLength(g))}`;
}
