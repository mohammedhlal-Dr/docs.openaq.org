import { closeRing } from '../core/geometry';
import type { Feature, Geometry, Project } from '../core/types';
import { photoArchivePath } from './table';
import { escapeXml } from './xlsx';

function normalizedGeometry(g: Geometry): Geometry {
  return g.type === 'Polygon' ? { type: 'Polygon', coordinates: g.coordinates.map(closeRing) } : g;
}

function exportedAttributes(project: Project, f: Feature) {
  const props: Record<string, unknown> = {};
  for (const field of project.fields) {
    const v = f.attributes[field.name] ?? null;
    props[field.name] = field.type === 'photo' && typeof v === 'string' && v ? photoArchivePath(v) : v;
  }
  return props;
}

/** GeoJSON (RFC 7946, toujours en WGS 84). */
export function toGeoJSON(project: Project, features: Feature[]): string {
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      name: project.name,
      features: features.map((f) => ({
        type: 'Feature',
        id: f.id,
        geometry: normalizedGeometry(f.geometry),
        properties: {
          ...exportedAttributes(project, f),
          gps_acc: f.accuracy,
          created: f.createdAt,
          updated: f.updatedAt,
        },
      })),
    },
    null,
    2,
  );
}

/** KML (Google Earth), WGS 84. */
export function toKml(project: Project, features: Feature[]): string {
  const coord = (p: number[]) => `${p[0]},${p[1]}${p.length > 2 ? `,${p[2]}` : ''}`;
  const geom = (g: Geometry) => {
    switch (g.type) {
      case 'Point':
        return `<Point><coordinates>${coord(g.coordinates)}</coordinates></Point>`;
      case 'LineString':
        return `<LineString><tessellate>1</tessellate><coordinates>${g.coordinates.map(coord).join(' ')}</coordinates></LineString>`;
      case 'Polygon': {
        const [outer, ...holes] = g.coordinates.map(closeRing);
        const ring = (r: number[][]) => `<LinearRing><coordinates>${r.map(coord).join(' ')}</coordinates></LinearRing>`;
        return (
          `<Polygon><tessellate>1</tessellate><outerBoundaryIs>${ring(outer)}</outerBoundaryIs>` +
          holes.map((h) => `<innerBoundaryIs>${ring(h)}</innerBoundaryIs>`).join('') +
          '</Polygon>'
        );
      }
    }
  };
  const labelField = project.fields.find((f) => f.type === 'text' || f.type === 'choice');
  const placemarks = features
    .map((f, i) => {
      const attrs = exportedAttributes(project, f);
      const name = labelField && attrs[labelField.name] != null ? String(attrs[labelField.name]) : `${project.name} ${i + 1}`;
      const data = Object.entries({ ...attrs, gps_acc: f.accuracy, created: f.createdAt })
        .map(([k, v]) => `<Data name="${escapeXml(k)}"><value>${escapeXml(v == null ? '' : String(v))}</value></Data>`)
        .join('');
      return `<Placemark id="${escapeXml(f.id)}"><name>${escapeXml(name)}</name><ExtendedData>${data}</ExtendedData>${geom(f.geometry)}</Placemark>`;
    })
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
    `<name>${escapeXml(project.name)}</name>\n${placemarks}\n</Document></kml>\n`
  );
}
