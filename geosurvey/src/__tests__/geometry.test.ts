import {
  buildGeometry,
  closeRing,
  distance,
  formatArea,
  geometryArea,
  geometryLength,
  isClockwise,
  representativePoint,
  validateGeometry,
} from '../core/geometry';
import { polygonFeatures } from './fixtures';

describe('géométrie', () => {
  it('calcule les distances (haversine)', () => {
    // 1° de latitude ≈ 111,2 km
    expect(distance([0, 0], [0, 1])).toBeCloseTo(111195, -1);
    expect(distance([-1.9, 34.68], [-1.9, 34.68])).toBe(0);
  });

  it('calcule l’aire et le périmètre d’un polygone', () => {
    const g = polygonFeatures[0].geometry;
    const area = geometryArea(g);
    // 0,0011° de longitude à 34,68° ≈ 100,7 m ; 0,0009° de latitude ≈ 100,1 m
    expect(area).toBeGreaterThan(10000);
    expect(area).toBeLessThan(10150);
    expect(geometryLength(g)).toBeCloseTo(401.6, 0);
    expect(formatArea(area)).toMatch(/ha$/);
  });

  it('ferme les anneaux et détecte le sens', () => {
    const ring = closeRing([[0, 0], [1, 0], [1, 1]]);
    expect(ring).toHaveLength(4);
    expect(ring[3]).toEqual([0, 0]);
    expect(isClockwise([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(false);
    expect(isClockwise([[0, 0], [0, 1], [1, 1], [1, 0]])).toBe(true);
  });

  it('calcule le centroïde', () => {
    const c = representativePoint({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] });
    expect(c![0]).toBeCloseTo(1);
    expect(c![1]).toBeCloseTo(1);
  });

  it('construit et valide les géométries', () => {
    expect(buildGeometry('LineString', [[0, 0]])).toBeNull();
    expect(validateGeometry(null, 'Point')).toBe('Aucune position saisie.');
    const poly = buildGeometry('Polygon', [[0, 0], [1, 0], [1, 1]]);
    expect(poly).not.toBeNull();
    expect(validateGeometry(poly, 'Polygon')).toBeNull();
    expect(validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [0, 0], [1, 1]]] }, 'Polygon')).toMatch(/3 sommets/);
    expect(validateGeometry({ type: 'Point', coordinates: [200, 0] }, 'Point')).toMatch(/hors limites/);
  });
});
