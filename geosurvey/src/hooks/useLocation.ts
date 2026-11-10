import * as Location from 'expo-location';
import { useEffect, useEffectEvent, useState } from 'react';

export interface GpsFix {
  longitude: number;
  latitude: number;
  altitude: number | null;
  /** Précision horizontale (m). */
  accuracy: number | null;
  timestamp: number;
}

export type PermissionState = 'pending' | 'granted' | 'denied';

/**
 * Suit la position GPS en continu (haute précision) tant que `active` est vrai.
 * `onFix` est appelé à chaque nouvelle position (utile pour l'enregistrement
 * continu de lignes ou la moyenne de positions).
 */
export function useLocation(active: boolean, onFix?: (fix: GpsFix) => void) {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [permission, setPermission] = useState<PermissionState>('pending');
  const [error, setError] = useState<string | null>(null);
  const emitFix = useEffectEvent((f: GpsFix) => onFix?.(f));

  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setPermission('denied');
          return;
        }
        setPermission('granted');
        const s = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
          (loc) => {
            const next: GpsFix = {
              longitude: loc.coords.longitude,
              latitude: loc.coords.latitude,
              altitude: loc.coords.altitude ?? null,
              accuracy: loc.coords.accuracy ?? null,
              timestamp: loc.timestamp,
            };
            setFix(next);
            setError(null);
            emitFix(next);
          },
          (reason) => setError(String(reason)),
        );
        if (cancelled) s.remove();
        else sub = s;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);

  return { fix, permission, error };
}

/** Couleur indicative selon la précision GPS. */
export function accuracyLevel(accuracy: number | null | undefined): 'good' | 'fair' | 'poor' | 'none' {
  if (accuracy == null) return 'none';
  if (accuracy <= 5) return 'good';
  if (accuracy <= 15) return 'fair';
  return 'poor';
}

/** Moyenne de plusieurs positions (point plus précis, comme dans QField/Survey123). */
export function averageFixes(fixes: GpsFix[]): GpsFix | null {
  if (fixes.length === 0) return null;
  const n = fixes.length;
  const alts = fixes.map((f) => f.altitude).filter((a): a is number => a != null);
  const accs = fixes.map((f) => f.accuracy).filter((a): a is number => a != null);
  return {
    longitude: fixes.reduce((s, f) => s + f.longitude, 0) / n,
    latitude: fixes.reduce((s, f) => s + f.latitude, 0) / n,
    altitude: alts.length ? alts.reduce((s, a) => s + a, 0) / alts.length : null,
    accuracy: accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : null,
    timestamp: fixes[n - 1].timestamp,
  };
}
