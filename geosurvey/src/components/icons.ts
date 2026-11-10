import type { FieldType, GeometryType } from '../core/types';
import type { IconName } from './ui';

export const GEOMETRY_ICONS: Record<GeometryType, IconName> = {
  Point: 'map-marker',
  LineString: 'vector-polyline',
  Polygon: 'vector-polygon',
};

export const FIELD_ICONS: Record<FieldType, IconName> = {
  text: 'format-text',
  integer: 'numeric',
  decimal: 'decimal',
  date: 'calendar',
  choice: 'format-list-bulleted',
  boolean: 'toggle-switch-outline',
  photo: 'camera',
};
