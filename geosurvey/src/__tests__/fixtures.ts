import type { Feature, Project } from '../core/types';

const now = '2026-11-10T09:30:00.000Z';

export const pointProject: Project = {
  id: 'p1',
  name: 'Inventaire des puits – Oujda',
  description: '',
  geometryType: 'Point',
  createdAt: now,
  updatedAt: now,
  fields: [
    { name: 'nom', label: 'Nom', type: 'text', required: true },
    { name: 'profondeur', label: 'Profondeur (m)', type: 'decimal', required: false },
    { name: 'nb_usagers', label: 'Nombre d’usagers', type: 'integer', required: false },
    { name: 'date_visite', label: 'Date de visite', type: 'date', required: true },
    { name: 'etat', label: 'État', type: 'choice', required: true, choices: ['Bon', 'Moyen', 'Dégradé'] },
    { name: 'potable', label: 'Eau potable', type: 'boolean', required: false },
    { name: 'photo', label: 'Photo', type: 'photo', required: false },
  ],
};

export const pointFeatures: Feature[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    projectId: 'p1',
    geometry: { type: 'Point', coordinates: [-1.9086, 34.6814, 612.5] },
    attributes: {
      nom: 'Puits « Sidi Yahya », n°1',
      profondeur: 12.75,
      nb_usagers: 40,
      date_visite: '2026-11-09',
      etat: 'Dégradé',
      potable: true,
      photo: 'file:///data/photos/1b2c.jpg',
    },
    accuracy: 3.2,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    projectId: 'p1',
    geometry: { type: 'Point', coordinates: [-1.9, 34.69] },
    attributes: { nom: 'Puits 2', profondeur: null, nb_usagers: null, date_visite: '2026-11-10', etat: 'Bon', potable: null, photo: null },
    accuracy: null,
    createdAt: now,
    updatedAt: now,
  },
];

export const polygonProject: Project = {
  id: 'p2',
  name: 'Parcelles',
  description: '',
  geometryType: 'Polygon',
  createdAt: now,
  updatedAt: now,
  fields: [{ name: 'culture', label: 'Culture', type: 'text', required: false }],
};

/** Carré d'environ 100 m x 100 m saisi dans le sens anti-horaire (non fermé). */
export const polygonFeatures: Feature[] = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    projectId: 'p2',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-1.9, 34.68], [-1.8989, 34.68], [-1.8989, 34.6809], [-1.9, 34.6809]]],
    },
    attributes: { culture: 'Olivier' },
    accuracy: 4,
    createdAt: now,
    updatedAt: now,
  },
];

export const lineProject: Project = { ...polygonProject, id: 'p3', name: 'Pistes', geometryType: 'LineString' };
export const lineFeatures: Feature[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    projectId: 'p3',
    geometry: { type: 'LineString', coordinates: [[-1.9, 34.68], [-1.89, 34.68], [-1.89, 34.69]] },
    attributes: { culture: null },
    accuracy: null,
    createdAt: now,
    updatedAt: now,
  },
];
