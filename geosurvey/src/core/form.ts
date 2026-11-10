import { slugifyFieldName } from './id';
import type { AttributeValue, Attributes, FieldDef } from './types';

/** Convertit une saisie texte en valeur typée selon le champ ; `undefined` si invalide. */
export function parseInput(field: FieldDef, raw: string): AttributeValue | undefined {
  const s = raw.trim();
  if (s === '') return null;
  switch (field.type) {
    case 'integer': {
      if (!/^[+-]?\d+$/.test(s)) return undefined;
      const n = Number(s);
      return Number.isSafeInteger(n) ? n : undefined;
    }
    case 'decimal': {
      const normalized = s.replace(/\s/g, '').replace(',', '.');
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return undefined;
      const n = Number(normalized);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date':
      return isValidIsoDate(s) ? s : undefined;
    default:
      return raw;
  }
}

export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isEmpty(v: AttributeValue | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** Valide les attributs saisis ; retourne une erreur par nom de champ. */
export function validateAttributes(fields: FieldDef[], attrs: Attributes): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = attrs[f.name];
    if (isEmpty(v)) {
      if (f.required) errors[f.name] = 'Champ obligatoire';
      continue;
    }
    switch (f.type) {
      case 'integer':
        if (typeof v !== 'number' || !Number.isInteger(v)) errors[f.name] = 'Nombre entier attendu';
        break;
      case 'decimal':
        if (typeof v !== 'number' || !Number.isFinite(v)) errors[f.name] = 'Nombre attendu';
        break;
      case 'date':
        if (typeof v !== 'string' || !isValidIsoDate(v)) errors[f.name] = 'Date attendue (AAAA-MM-JJ)';
        break;
      case 'choice':
        if (typeof v !== 'string' || !(f.choices ?? []).includes(v)) errors[f.name] = 'Choix invalide';
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors[f.name] = 'Oui ou Non attendu';
        break;
      default:
        if (typeof v !== 'string') errors[f.name] = 'Texte attendu';
    }
  }
  return errors;
}

/** Noms réservés aux colonnes système ajoutées à l'export. */
export const RESERVED_NAMES = ['fid', 'uuid', 'created', 'updated', 'gps_acc', 'latitude', 'longitude', 'altitude', 'x', 'y', 'wkt', 'length_m', 'area_m2'];

/** Vérifie la définition d'un formulaire (noms uniques, choix renseignés…). */
export function validateFormDefinition(fields: FieldDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const where = `Champ ${i + 1}${f.label ? ` (« ${f.label} »)` : ''}`;
    if (!f.label.trim()) problems.push(`${where} : libellé manquant.`);
    if (!/^[a-z][a-z0-9_]*$/.test(f.name)) problems.push(`${where} : nom technique invalide.`);
    if (RESERVED_NAMES.includes(f.name)) problems.push(`${where} : le nom « ${f.name} » est réservé.`);
    if (seen.has(f.name)) problems.push(`${where} : nom « ${f.name} » déjà utilisé.`);
    seen.add(f.name);
    if (f.type === 'choice') {
      const choices = (f.choices ?? []).map((c) => c.trim()).filter(Boolean);
      if (choices.length < 2) problems.push(`${where} : au moins 2 choix sont nécessaires.`);
      if (new Set(choices).size !== choices.length) problems.push(`${where} : choix en double.`);
    }
  });
  return problems;
}

/** Propose un nom technique unique pour un nouveau champ. */
export function uniqueFieldName(label: string, existing: string[]): string {
  const base = slugifyFieldName(label);
  let name = RESERVED_NAMES.includes(base) ? `${base}_1` : base;
  let i = 2;
  while (existing.includes(name)) name = `${base}_${i++}`;
  return name;
}

/** Valeurs par défaut d'un nouveau formulaire. */
export function defaultAttributes(fields: FieldDef[]): Attributes {
  const attrs: Attributes = {};
  for (const f of fields) attrs[f.name] = f.type === 'date' ? todayIso() : null;
  return attrs;
}
