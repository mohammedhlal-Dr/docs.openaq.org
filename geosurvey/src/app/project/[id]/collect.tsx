import { router, Stack, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polygon, Polyline, type MapPressEvent, type MapType } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultAttributes, validateAttributes } from '../../../core/form';
import {
  allPositions,
  buildGeometry,
  distance,
  formatArea,
  formatLength,
  geometryVertices,
  MIN_VERTICES,
  pathLength,
  ringArea,
  validateGeometry,
} from '../../../core/geometry';
import { uuid } from '../../../core/id';
import { GEOMETRY_LABELS, type AttributeValue, type Attributes, type Feature, type Position, type Project } from '../../../core/types';
import { DEFAULT_REGION, FeatureLayer, MapFab, MapTypeButton, regionFor, toLatLng } from '../../../components/FeatureMap';
import { FormField } from '../../../components/FormField';
import { GpsStatus } from '../../../components/GpsStatus';
import { colors, radius, spacing } from '../../../components/theme';
import { Button, Card, Segmented, styles as ui } from '../../../components/ui';
import { averageFixes, useLocation, type GpsFix } from '../../../hooks/useLocation';
import { deleteFeature, getFeature, getProject, listFeatures, saveFeature } from '../../../storage/db';
import { deletePhoto } from '../../../storage/files';

/** Distance minimale (m) entre deux sommets en enregistrement continu. */
const STREAM_MIN_DISTANCE = 3;
/** Précision maximale (m) acceptée en enregistrement continu. */
const STREAM_MAX_ACCURACY = 25;

const fixToPosition = (f: GpsFix): Position =>
  f.altitude != null ? [f.longitude, f.latitude, Math.round(f.altitude * 100) / 100] : [f.longitude, f.latitude];

function photoValues(project: Project, attrs: Attributes): string[] {
  return project.fields
    .filter((f) => f.type === 'photo')
    .map((f) => attrs[f.name])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

export default function CollectScreen() {
  const { id, featureId } = useLocalSearchParams<{ id: string; featureId?: string }>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [original, setOriginal] = useState<Feature | null>(null);
  const [others, setOthers] = useState<Feature[]>([]);
  const [step, setStep] = useState<'geometry' | 'form'>('geometry');
  const [vertices, setVertices] = useState<Position[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [attrs, setAttrs] = useState<Attributes>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [mapType, setMapType] = useState<MapType>('standard');
  const [streaming, setStreaming] = useState(false);
  const [averaging, setAveraging] = useState<GpsFix[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const centeredRef = useRef(false);

  // Chargement du projet et de l'entité éventuelle
  useEffect(() => {
    (async () => {
      const p = await getProject(id);
      if (!p) return;
      const all = await listFeatures(id);
      setOthers(all);
      if (featureId) {
        const f = await getFeature(featureId);
        if (f) {
          setOriginal(f);
          setVertices(geometryVertices(f.geometry));
          setAccuracy(f.accuracy);
          setAttrs({ ...defaultAttributes(p.fields), ...f.attributes });
          setStep('form');
          centeredRef.current = true;
        }
      } else {
        setAttrs(defaultAttributes(p.fields));
      }
      setProject(p);
    })().catch((e) => Alert.alert('Erreur', String(e)));
  }, [id, featureId]);

  // GPS : enregistrement continu et moyenne de positions
  const { fix, permission, error: gpsError } = useLocation(step === 'geometry', (f) => {
    if (!centeredRef.current) {
      centeredRef.current = true;
      mapRef.current?.animateToRegion({ ...toLatLng([f.longitude, f.latitude]), latitudeDelta: 0.004, longitudeDelta: 0.004 }, 600);
    }
    if (streaming && (f.accuracy == null || f.accuracy <= STREAM_MAX_ACCURACY)) {
      setVertices((prev) => {
        const p = fixToPosition(f);
        if (prev.length > 0 && distance(prev[prev.length - 1], p) < STREAM_MIN_DISTANCE) return prev;
        return [...prev, p];
      });
      setAccuracy(f.accuracy);
      setDirty(true);
    }
    setAveraging((prev) => (prev ? [...prev, f] : prev));
  });

  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Abandonner la saisie ?', 'Les modifications non enregistrées seront perdues.', [
      { text: 'Continuer la saisie', style: 'cancel' },
      {
        text: 'Abandonner',
        style: 'destructive',
        onPress: () => {
          // Supprime les photos prises pendant cette saisie et non enregistrées.
          if (project) {
            const kept = new Set(original ? photoValues(project, original.attributes) : []);
            photoValues(project, attrs).filter((u) => !kept.has(u)).forEach(deletePhoto);
          }
          setDirty(false);
          repeat();
        },
      },
    ]);
  });

  const geometryType = project?.geometryType ?? 'Point';
  const geometry = useMemo(() => buildGeometry(geometryType, vertices), [geometryType, vertices]);

  const initialRegion = useMemo(() => {
    if (original) return regionFor(allPositions(original.geometry));
    return regionFor(others.flatMap((f) => allPositions(f.geometry)));
  }, [original, others]);

  if (!project) return null;

  const isPoint = geometryType === 'Point';

  const addVertex = (p: Position, acc: number | null) => {
    setVertices((prev) => (isPoint ? [p] : [...prev, p]));
    setAccuracy(acc);
    setDirty(true);
  };

  const addGpsVertex = () => {
    if (!fix) {
      Alert.alert('GPS', 'Aucune position disponible pour le moment.');
      return;
    }
    addVertex(fixToPosition(fix), fix.accuracy);
  };

  const toggleAveraging = () => {
    if (averaging === null) {
      setAveraging(fix ? [fix] : []);
      return;
    }
    const avg = averageFixes(averaging);
    setAveraging(null);
    if (avg) addVertex(fixToPosition(avg), avg.accuracy);
  };

  const onMapPress = (e: MapPressEvent) => {
    if (streaming || averaging) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    addVertex([longitude, latitude], null);
  };

  const moveVertex = (index: number, latitude: number, longitude: number) => {
    setVertices((prev) => prev.map((p, i) => (i === index ? [longitude, latitude] : p)));
    setAccuracy(null);
    setDirty(true);
  };

  const setAttr = (name: string, v: AttributeValue) => {
    setAttrs((prev) => ({ ...prev, [name]: v }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const { [name]: _, ...rest } = prev;
      return rest;
    });
    setDirty(true);
  };

  const save = async (andNew: boolean) => {
    const geomError = validateGeometry(geometry, geometryType);
    if (geomError || !geometry) {
      setStep('geometry');
      Alert.alert('Géométrie incomplète', geomError ?? 'Géométrie manquante.');
      return;
    }
    const attrErrors = validateAttributes(project.fields, attrs);
    setErrors(attrErrors);
    if (Object.keys(attrErrors).length > 0) {
      setStep('form');
      Alert.alert('Formulaire incomplet', `${Object.keys(attrErrors).length} champ(s) à corriger.`);
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const feature: Feature = {
        id: original?.id ?? uuid(),
        projectId: project.id,
        geometry,
        attributes: Object.fromEntries(project.fields.map((f) => [f.name, attrs[f.name] ?? null])),
        accuracy: accuracy != null ? Math.round(accuracy * 100) / 100 : null,
        createdAt: original?.createdAt ?? now,
        updatedAt: now,
      };
      await saveFeature(feature);
      if (original) {
        const kept = new Set(photoValues(project, feature.attributes));
        photoValues(project, original.attributes).filter((u) => !kept.has(u)).forEach(deletePhoto);
      }
      setDirty(false);
      disablePrevention();
      if (andNew) {
        setOthers((prev) => [...prev, feature]);
        setVertices([]);
        setAccuracy(null);
        setAttrs(defaultAttributes(project.fields));
        setErrors({});
        setStreaming(false);
        setStep('geometry');
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!original) return;
    Alert.alert('Supprimer cette entité ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteFeature(project, original);
          setDirty(false);
          disablePrevention();
          router.back();
        },
      },
    ]);
  };

  const missing = Math.max(0, MIN_VERTICES[geometryType] - vertices.length);
  const measure =
    geometryType === 'LineString'
      ? `Longueur : ${formatLength(pathLength(vertices))}`
      : geometryType === 'Polygon'
        ? `Surface : ${formatArea(ringArea(vertices))} · Périmètre : ${formatLength(pathLength(vertices.length > 2 ? [...vertices, vertices[0]] : vertices))}`
        : vertices[0]
          ? `${vertices[0][1].toFixed(6)}, ${vertices[0][0].toFixed(6)}${accuracy != null ? ` (± ${accuracy.toFixed(1)} m)` : ' (placé sur la carte)'}`
          : '';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: original ? 'Modifier' : `Nouveau · ${GEOMETRY_LABELS[geometryType]}` }} />
      <View style={styles.tabs}>
        <Segmented
          value={step}
          onChange={setStep}
          options={[
            { value: 'geometry', label: `1. Localisation${geometry ? ' ✓' : ''}`, icon: 'crosshairs-gps' },
            { value: 'form', label: '2. Attributs', icon: 'form-select' },
          ]}
        />
      </View>

      {step === 'geometry' ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion ?? DEFAULT_REGION}
            mapType={mapType}
            showsUserLocation
            showsMyLocationButton={false}
            showsScale
            toolbarEnabled={false}
            onPress={onMapPress}
          >
            <FeatureLayer features={others} excludeId={original?.id} />
            {geometryType === 'LineString' && vertices.length > 1 && (
              <Polyline coordinates={vertices.map(toLatLng)} strokeColor={colors.featureSelected} strokeWidth={4} />
            )}
            {geometryType === 'Polygon' && vertices.length > 2 && (
              <Polygon coordinates={vertices.map(toLatLng)} strokeColor={colors.featureSelected} strokeWidth={3} fillColor="rgba(30,99,214,0.25)" />
            )}
            {geometryType === 'Polygon' && vertices.length === 2 && (
              <Polyline coordinates={vertices.map(toLatLng)} strokeColor={colors.featureSelected} strokeWidth={3} />
            )}
            {vertices.map((v, i) => {
              const onDragEnd = (e: { nativeEvent: { coordinate: { latitude: number; longitude: number } } }) =>
                moveVertex(i, e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
              const key = `${i}-${v[0]}-${v[1]}`;
              return isPoint ? (
                <Marker key={key} coordinate={toLatLng(v)} draggable onDragEnd={onDragEnd} pinColor={colors.featureSelected} />
              ) : (
                <Marker key={key} coordinate={toLatLng(v)} draggable onDragEnd={onDragEnd} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={[styles.vertex, i === vertices.length - 1 && styles.vertexLast]} />
                </Marker>
              );
            })}
          </MapView>

          <View style={styles.topOverlay}>
            <GpsStatus fix={fix} permission={permission} error={gpsError} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <MapTypeButton value={mapType} onChange={setMapType} />
              <MapFab
                icon="crosshairs-gps"
                label="Centrer sur ma position"
                onPress={() =>
                  fix && mapRef.current?.animateToRegion({ ...toLatLng([fix.longitude, fix.latitude]), latitudeDelta: 0.003, longitudeDelta: 0.003 }, 400)
                }
              />
            </View>
          </View>

          <Card style={[styles.panel, { paddingBottom: spacing.md + insets.bottom }]}>
            <Text style={styles.measure}>
              {measure || (isPoint ? 'Utilisez le GPS ou touchez la carte pour placer le point.' : 'Ajoutez des sommets au GPS ou en touchant la carte.')}
            </Text>
            {!isPoint && (
              <Text style={ui.hint}>
                {vertices.length} sommet(s){missing > 0 ? ` – encore ${missing} au minimum` : ''}
                {streaming ? ` – enregistrement continu (tous les ${STREAM_MIN_DISTANCE} m)` : ''}
              </Text>
            )}
            {averaging && <Text style={ui.hint}>Moyenne en cours : {averaging.length} position(s) collectée(s)…</Text>}

            {isPoint ? (
              <View style={styles.row}>
                <Button style={{ flex: 1 }} icon="crosshairs-gps" title="Position GPS" onPress={addGpsVertex} disabled={!fix || !!averaging} />
                <Button
                  style={{ flex: 1 }}
                  variant={averaging ? 'danger' : 'secondary'}
                  icon={averaging ? 'stop' : 'sigma'}
                  title={averaging ? `Terminer (${averaging.length})` : 'Moyenne GPS'}
                  onPress={toggleAveraging}
                  disabled={!fix && !averaging}
                />
              </View>
            ) : (
              <>
                <View style={styles.row}>
                  <Button style={{ flex: 1 }} icon="map-marker-plus" title="Sommet GPS" onPress={addGpsVertex} disabled={!fix || streaming} />
                  <Button
                    style={{ flex: 1 }}
                    variant={streaming ? 'danger' : 'secondary'}
                    icon={streaming ? 'stop' : 'record-rec'}
                    title={streaming ? 'Arrêter' : 'Continu'}
                    onPress={() => setStreaming((s) => !s)}
                    disabled={!fix && !streaming}
                  />
                </View>
                <View style={styles.row}>
                  <Button
                    style={{ flex: 1 }}
                    compact
                    variant="ghost"
                    icon="undo"
                    title="Annuler dernier"
                    disabled={vertices.length === 0}
                    onPress={() => {
                      setVertices((v) => v.slice(0, -1));
                      setDirty(true);
                    }}
                  />
                  <Button
                    style={{ flex: 1 }}
                    compact
                    variant="ghost"
                    icon="eraser"
                    title="Tout effacer"
                    disabled={vertices.length === 0}
                    onPress={() =>
                      Alert.alert('Effacer tous les sommets ?', undefined, [
                        { text: 'Annuler', style: 'cancel' },
                        { text: 'Effacer', style: 'destructive', onPress: () => { setVertices([]); setStreaming(false); setDirty(true); } },
                      ])
                    }
                  />
                </View>
              </>
            )}
            <Button
              icon="arrow-right"
              title="Suivant : attributs"
              variant={geometry ? 'primary' : 'secondary'}
              disabled={!geometry}
              onPress={() => {
                setStreaming(false);
                setStep('form');
              }}
            />
          </Card>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={140}>
          <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 40 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            {!geometry && (
              <Card style={styles.warning}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Localisation non saisie – revenez à l’étape 1.</Text>
              </Card>
            )}
            {project.fields.length === 0 && <Text style={ui.hint}>Ce projet n’a pas de champ attributaire.</Text>}
            {project.fields.map((f) => (
              <FormField key={f.name} field={f} value={attrs[f.name] ?? null} error={errors[f.name]} onChange={(v) => setAttr(f.name, v)} />
            ))}
            <Button title="Enregistrer" icon="content-save" onPress={() => save(false)} loading={saving} />
            {!original && <Button title="Enregistrer et nouvelle saisie" icon="content-save-move" variant="secondary" onPress={() => save(true)} disabled={saving} />}
            {original && <Button title="Supprimer l'entité" icon="delete" variant="danger" onPress={remove} />}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { padding: spacing.md, backgroundColor: colors.background },
  topOverlay: { position: 'absolute', top: spacing.sm, left: spacing.md, right: spacing.md, gap: spacing.sm },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.sm,
    padding: spacing.md,
  },
  measure: { fontSize: 15, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  vertex: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 3, borderColor: colors.featureSelected },
  vertexLast: { backgroundColor: colors.featureSelected },
  form: { padding: spacing.lg, gap: spacing.sm },
  warning: { borderColor: colors.danger, borderWidth: 1, borderRadius: radius.md, marginBottom: spacing.md },
});
