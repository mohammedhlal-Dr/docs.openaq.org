import type { FieldDef, GeometryType } from './types';

export interface ProjectTemplate {
  key: string;
  name: string;
  description: string;
  geometryType: GeometryType;
  fields: FieldDef[];
}

/** Modèles prêts à l'emploi, modifiables après création. */
export const TEMPLATES: ProjectTemplate[] = [
  {
    key: 'poi',
    name: "Points d'intérêt",
    description: 'Inventaire ponctuel : puits, sources, bornes, arbres remarquables…',
    geometryType: 'Point',
    fields: [
      { name: 'nom', label: 'Nom', type: 'text', required: true },
      { name: 'categorie', label: 'Catégorie', type: 'choice', required: true, choices: ['Puits', 'Source', 'Borne', 'Arbre', 'Autre'] },
      { name: 'etat', label: 'État', type: 'choice', required: false, choices: ['Bon', 'Moyen', 'Mauvais'] },
      { name: 'date_releve', label: 'Date du relevé', type: 'date', required: true },
      { name: 'photo', label: 'Photo', type: 'photo', required: false },
      { name: 'remarques', label: 'Remarques', type: 'text', required: false },
    ],
  },
  {
    key: 'parcelles',
    name: 'Parcelles agricoles',
    description: 'Délimitation de parcelles avec culture et irrigation.',
    geometryType: 'Polygon',
    fields: [
      { name: 'proprietaire', label: 'Exploitant', type: 'text', required: false },
      { name: 'culture', label: 'Culture', type: 'choice', required: true, choices: ['Céréales', 'Olivier', 'Maraîchage', 'Arboriculture', 'Jachère'] },
      { name: 'irriguee', label: 'Irriguée', type: 'boolean', required: false },
      { name: 'nb_arbres', label: "Nombre d'arbres", type: 'integer', required: false },
      { name: 'date_releve', label: 'Date du relevé', type: 'date', required: true },
      { name: 'photo', label: 'Photo', type: 'photo', required: false },
    ],
  },
  {
    key: 'pistes',
    name: 'Réseau de pistes',
    description: 'Levé de tracés linéaires : pistes, canaux, clôtures.',
    geometryType: 'LineString',
    fields: [
      { name: 'type', label: 'Type', type: 'choice', required: true, choices: ['Piste', 'Route', 'Canal', 'Clôture'] },
      { name: 'revetement', label: 'Revêtement', type: 'choice', required: false, choices: ['Terre', 'Gravier', 'Goudron'] },
      { name: 'largeur_m', label: 'Largeur (m)', type: 'decimal', required: false },
      { name: 'praticable', label: 'Praticable', type: 'boolean', required: false },
      { name: 'date_releve', label: 'Date du relevé', type: 'date', required: true },
    ],
  },
];
