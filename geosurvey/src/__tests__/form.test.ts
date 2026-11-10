import { slugifyFieldName, uuid } from '../core/id';
import { isValidIsoDate, parseInput, uniqueFieldName, validateAttributes, validateFormDefinition } from '../core/form';
import { pointProject } from './fixtures';

describe('formulaires', () => {
  const field = (type: 'integer' | 'decimal' | 'date') => ({ name: 'x', label: 'X', type, required: false });

  it('convertit les saisies', () => {
    expect(parseInput(field('integer'), '42')).toBe(42);
    expect(parseInput(field('integer'), '4.2')).toBeUndefined();
    expect(parseInput(field('decimal'), '12,5')).toBe(12.5);
    expect(parseInput(field('decimal'), '-0.25')).toBe(-0.25);
    expect(parseInput(field('decimal'), 'abc')).toBeUndefined();
    expect(parseInput(field('decimal'), '  ')).toBeNull();
    expect(parseInput(field('date'), '2026-02-30')).toBeUndefined();
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it('valide les attributs', () => {
    const errors = validateAttributes(pointProject.fields, {
      nom: '',
      date_visite: '2026-11-10',
      etat: 'Inconnu',
      nb_usagers: 3.5,
    });
    expect(errors).toEqual({ nom: 'Champ obligatoire', etat: 'Choix invalide', nb_usagers: 'Nombre entier attendu' });
  });

  it('valide la définition du formulaire', () => {
    expect(validateFormDefinition(pointProject.fields)).toEqual([]);
    const problems = validateFormDefinition([
      { name: 'a', label: 'A', type: 'text', required: false },
      { name: 'a', label: 'A bis', type: 'choice', required: false, choices: ['x'] },
      { name: 'uuid', label: 'Id', type: 'text', required: false },
    ]);
    expect(problems.join('\n')).toMatch(/déjà utilisé/);
    expect(problems.join('\n')).toMatch(/au moins 2 choix/);
    expect(problems.join('\n')).toMatch(/réservé/);
  });

  it('génère des noms techniques', () => {
    expect(slugifyFieldName('Profondeur (m)')).toBe('profondeur_m');
    expect(slugifyFieldName('État général')).toBe('etat_general');
    expect(slugifyFieldName('2e passage')).toBe('f_2e_passage');
    expect(uniqueFieldName('Nom', ['nom'])).toBe('nom_2');
    expect(uniqueFieldName('UUID', [])).toBe('uuid_1');
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
