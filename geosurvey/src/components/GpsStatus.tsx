import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { accuracyLevel, type GpsFix, type PermissionState } from '../hooks/useLocation';
import { colors, radius, spacing } from './theme';

/** Bandeau d'état GPS : précision, coordonnées, altitude. */
export function GpsStatus({ fix, permission, error }: { fix: GpsFix | null; permission: PermissionState; error: string | null }) {
  if (permission === 'denied') {
    return (
      <View style={[styles.bar, { backgroundColor: colors.poor }]}>
        <MaterialCommunityIcons name="crosshairs-off" size={18} color="#fff" />
        <Text style={styles.textLight}>Localisation refusée – autorisez-la dans les réglages ou placez les points sur la carte.</Text>
      </View>
    );
  }
  const level = accuracyLevel(fix?.accuracy);
  const color = colors[level];
  return (
    <View style={styles.bar}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {fix ? (
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>
            ± {fix.accuracy != null ? fix.accuracy.toFixed(1) : '?'} m
            {fix.altitude != null ? `   Alt. ${fix.altitude.toFixed(1)} m` : ''}
          </Text>
          <Text style={styles.coords}>
            {fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}
          </Text>
        </View>
      ) : (
        <Text style={[styles.text, { flex: 1 }]}>{error ? `GPS : ${error}` : 'Recherche du signal GPS…'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  text: { fontSize: 15, fontWeight: '700', color: colors.text },
  coords: { fontSize: 13, color: colors.muted, fontVariant: ['tabular-nums'] },
  textLight: { color: '#fff', flex: 1, fontSize: 13 },
});
