import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type MapType } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { featureMeasure as measure, featureTitle } from '../../../core/display';
import { allPositions, representativePoint } from '../../../core/geometry';
import type { Feature, Project } from '../../../core/types';
import { DEFAULT_REGION, FeatureLayer, MapFab, MapTypeButton, regionFor, toLatLng } from '../../../components/FeatureMap';
import { GEOMETRY_ICONS } from '../../../components/icons';
import { colors, spacing } from '../../../components/theme';
import { Button, Card, EmptyState, IconButton, Segmented } from '../../../components/ui';
import { getProject, listFeatures } from '../../../storage/db';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [mapType, setMapType] = useState<MapType>('standard');
  const [selected, setSelected] = useState<Feature | null>(null);
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getProject(id), listFeatures(id)])
        .then(([p, fs]) => {
          if (!active) return;
          setProject(p);
          setFeatures(fs);
          setSelected((s) => (s ? fs.find((f) => f.id === s.id) ?? null : null));
        })
        .catch((e) => Alert.alert('Erreur', String(e)));
      return () => {
        active = false;
      };
    }, [id]),
  );

  const positions = useMemo(() => features.flatMap((f) => allPositions(f.geometry)), [features]);
  // Utilisée uniquement au montage de la carte (après chargement des données).
  const initialRegion = regionFor(positions) ?? DEFAULT_REGION;

  const zoomToAll = () => {
    if (positions.length === 0) return;
    mapRef.current?.fitToCoordinates(positions.map(toLatLng), {
      edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
      animated: true,
    });
  };

  if (!project) return null;
  const titleIndex = (f: Feature) => features.findIndex((x) => x.id === f.id);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: project.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <IconButton icon="export-variant" label="Exporter" color="#fff" onPress={() => router.push(`/project/${id}/export`)} />
              <IconButton icon="form-select" label="Modifier le formulaire" color="#fff" onPress={() => router.push({ pathname: '/project/edit', params: { id } })} />
            </View>
          ),
        }}
      />
      <View style={styles.tabs}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'map', label: 'Carte', icon: 'map' },
            { value: 'list', label: `Liste (${features.length})`, icon: 'format-list-bulleted' },
          ]}
        />
      </View>

      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            mapType={mapType}
            showsUserLocation
            showsMyLocationButton
            showsScale
            showsCompass
            toolbarEnabled={false}
            onPress={() => setSelected(null)}
          >
            <FeatureLayer features={features} selectedId={selected?.id} onPress={setSelected} />
          </MapView>
          <View style={styles.mapControls}>
            <MapTypeButton value={mapType} onChange={setMapType} />
            {positions.length > 0 && <MapFab icon="fit-to-screen-outline" label="Afficher toutes les entités" onPress={zoomToAll} />}
          </View>
          {selected && (
            <Card style={[styles.selection, { bottom: 96 + insets.bottom }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <MaterialCommunityIcons name={GEOMETRY_ICONS[project.geometryType]} size={22} color={colors.featureSelected} />
                <Text style={styles.itemTitle} numberOfLines={1}>{featureTitle(project, selected, titleIndex(selected))}</Text>
                <IconButton icon="close" label="Fermer" color={colors.muted} onPress={() => setSelected(null)} />
              </View>
              <Text style={styles.meta}>{measure(selected)}</Text>
              <Button compact variant="secondary" icon="pencil" title="Ouvrir / modifier" onPress={() => router.push({ pathname: '/project/[id]/collect', params: { id, featureId: selected.id } })} />
            </Card>
          )}
        </View>
      ) : (
        <FlatList
          data={features}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 + insets.bottom }}
          ListEmptyComponent={
            <EmptyState icon="map-marker-plus-outline" title="Aucune donnée" message="Appuyez sur « Collecter » pour saisir votre première entité sur le terrain." />
          }
          renderItem={({ item, index }) => (
            <Pressable onPress={() => router.push({ pathname: '/project/[id]/collect', params: { id, featureId: item.id } })}>
              {({ pressed }) => (
                <Card style={[styles.item, pressed && { opacity: 0.75 }]}>
                  <Text style={styles.itemIndex}>{index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{featureTitle(project, item, index)}</Text>
                    <Text style={styles.meta}>{measure(item)}</Text>
                    <Text style={styles.meta}>
                      {new Date(item.updatedAt).toLocaleString('fr-FR')}
                      {item.accuracy != null ? ` · ± ${item.accuracy.toFixed(1)} m` : ''}
                    </Text>
                  </View>
                  <IconButton
                    icon="crosshairs-gps"
                    label="Voir sur la carte"
                    onPress={() => {
                      setSelected(item);
                      setView('map');
                      const c = representativePoint(item.geometry);
                      if (c) setTimeout(() => mapRef.current?.animateToRegion({ ...toLatLng(c), latitudeDelta: 0.005, longitudeDelta: 0.005 }), 300);
                    }}
                  />
                </Card>
              )}
            </Pressable>
          )}
        />
      )}

      <View style={[styles.bottom, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Button
          title="Collecter"
          icon="plus-circle"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/project/[id]/collect', params: { id } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { padding: spacing.md, backgroundColor: colors.background },
  mapControls: { position: 'absolute', top: spacing.md, left: spacing.md, gap: spacing.sm, alignItems: 'flex-start' },
  selection: { position: 'absolute', left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  itemIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primaryLight,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 32,
    fontWeight: '700',
    color: colors.primary,
    overflow: 'hidden',
  },
  itemTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
