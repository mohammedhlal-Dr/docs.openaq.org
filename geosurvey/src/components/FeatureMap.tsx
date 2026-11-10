import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Marker, Polygon, Polyline, type LatLng, type MapType, type Region } from 'react-native-maps';
import { openRing } from '../core/geometry';
import type { Feature, Position } from '../core/types';
import { colors, radius } from './theme';

export const toLatLng = (p: Position): LatLng => ({ latitude: p[1], longitude: p[0] });

/** Région englobant les positions (avec marge), ou `null` si aucune. */
export function regionFor(positions: Position[]): Region | null {
  if (positions.length === 0) return null;
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const [lon, lat] of positions) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.005, (maxLon - minLon) * 1.4),
  };
}

/** Vue par défaut : le Maroc. */
export const DEFAULT_REGION: Region = { latitude: 31.8, longitude: -7.1, latitudeDelta: 10, longitudeDelta: 10 };

/** Entités d'un projet dessinées sur la carte (à placer dans un <MapView>). */
export function FeatureLayer({ features, selectedId, onPress, excludeId }: {
  features: Feature[];
  selectedId?: string | null;
  onPress?: (f: Feature) => void;
  excludeId?: string;
}) {
  return (
    <>
      {features
        .filter((f) => f.id !== excludeId)
        .map((f) => {
          const selected = f.id === selectedId;
          const color = selected ? colors.featureSelected : colors.feature;
          const g = f.geometry;
          if (g.type === 'Point') {
            return (
              <Marker
                key={f.id}
                coordinate={toLatLng(g.coordinates)}
                pinColor={color}
                tracksViewChanges={false}
                onPress={() => onPress?.(f)}
              />
            );
          }
          if (g.type === 'LineString') {
            return (
              <Polyline
                key={f.id}
                coordinates={g.coordinates.map(toLatLng)}
                strokeColor={color}
                strokeWidth={selected ? 5 : 3}
                tappable
                onPress={() => onPress?.(f)}
              />
            );
          }
          return (
            <Polygon
              key={f.id}
              coordinates={openRing(g.coordinates[0] ?? []).map(toLatLng)}
              strokeColor={color}
              fillColor={selected ? 'rgba(30,99,214,0.25)' : 'rgba(232,131,58,0.25)'}
              strokeWidth={selected ? 3 : 2}
              tappable
              onPress={() => onPress?.(f)}
            />
          );
        })}
    </>
  );
}

const MAP_TYPES: { type: MapType; label: string }[] = [
  { type: 'standard', label: 'Plan' },
  { type: 'satellite', label: 'Satellite' },
  { type: 'hybrid', label: 'Hybride' },
];

/** Bouton flottant pour changer le fond de carte. */
export function MapTypeButton({ value, onChange }: { value: MapType; onChange: (t: MapType) => void }) {
  const i = Math.max(0, MAP_TYPES.findIndex((m) => m.type === value));
  const next = MAP_TYPES[(i + 1) % MAP_TYPES.length];
  return (
    <Pressable style={styles.fab} onPress={() => onChange(next.type)} accessibilityRole="button" accessibilityLabel={`Fond de carte : ${next.label}`}>
      <MaterialCommunityIcons name="layers" size={20} color={colors.primary} />
      <Text style={styles.fabText}>{MAP_TYPES[i].label}</Text>
    </Pressable>
  );
}

export function MapFab({ icon, label, onPress }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.fab} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  fabText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
});
