import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CRS_OPTIONS, type CrsId } from '../../../core/projections';
import type { Feature, Project } from '../../../core/types';
import type { CsvSeparator } from '../../../export/csv';
import { EXPORT_FORMATS, exportProject, photoUris, type ExportFormat } from '../../../export';
import { colors, radius, spacing } from '../../../components/theme';
import { Button, Card, Chip, Label, styles as ui, type IconName } from '../../../components/ui';
import { getProject, listFeatures } from '../../../storage/db';
import { readFileBytes, writeAndShareExport } from '../../../storage/files';

const FORMAT_ICONS: Record<ExportFormat, IconName> = {
  shapefile: 'layers-triple',
  xlsx: 'microsoft-excel',
  csv: 'file-delimited',
  geojson: 'code-json',
  kml: 'earth',
};

const SEPARATORS: { value: CsvSeparator; label: string }[] = [
  { value: ',', label: 'Virgule ( , )' },
  { value: ';', label: 'Point-virgule ( ; ) – Excel FR' },
  { value: '\t', label: 'Tabulation' },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState<Project | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [format, setFormat] = useState<ExportFormat>('shapefile');
  const [crs, setCrs] = useState<CrsId>('EPSG:4326');
  const [separator, setSeparator] = useState<CsvSeparator>(';');
  const [includePhotos, setIncludePhotos] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getProject(id), listFeatures(id)])
      .then(([p, fs]) => {
        setProject(p);
        setFeatures(fs);
      })
      .catch((e) => Alert.alert('Erreur', String(e)));
  }, [id]);

  if (!project) return null;
  const info = EXPORT_FORMATS.find((f) => f.id === format)!;
  const photoCount = photoUris(project, features).length;

  const run = async () => {
    if (features.length === 0) {
      Alert.alert('Rien à exporter', 'Ce projet ne contient encore aucune entité.');
      return;
    }
    setBusy(true);
    try {
      const result = await exportProject(project, features, {
        format,
        crs: info.supportsCrs ? crs : 'EPSG:4326',
        csvSeparator: separator,
        includePhotos: includePhotos && photoCount > 0,
        readFile: readFileBytes,
      });
      await writeAndShareExport(result);
      setLast(`${result.filename} · ${formatSize(result.data.length)}`);
    } catch (e) {
      Alert.alert("Échec de l'export", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
      <Text style={styles.summary}>
        {project.name} · {features.length} entité{features.length > 1 ? 's' : ''}
        {photoCount ? ` · ${photoCount} photo${photoCount > 1 ? 's' : ''}` : ''}
      </Text>

      <Label>Format</Label>
      <View style={{ gap: spacing.sm }}>
        {EXPORT_FORMATS.map((f) => {
          const selected = f.id === format;
          return (
            <Pressable key={f.id} onPress={() => setFormat(f.id)} accessibilityRole="radio" accessibilityState={{ selected }}>
              <Card style={[styles.option, selected && styles.optionSelected]}>
                <MaterialCommunityIcons name={FORMAT_ICONS[f.id]} size={28} color={selected ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{f.label}</Text>
                  <Text style={styles.optionDesc}>{f.description}</Text>
                </View>
                <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? colors.primary : colors.border} />
              </Card>
            </Pressable>
          );
        })}
      </View>

      {info.supportsCrs ? (
        <View>
          <Label>Système de coordonnées</Label>
          <View style={styles.wrap}>
            {CRS_OPTIONS.map((c) => (
              <Chip key={c.id} label={c.label} selected={crs === c.id} onPress={() => setCrs(c.id)} />
            ))}
          </View>
          <Text style={ui.hint}>{CRS_OPTIONS.find((c) => c.id === crs)?.description}</Text>
        </View>
      ) : (
        <Text style={ui.hint}>Ce format est toujours exporté en WGS 84 (EPSG:4326).</Text>
      )}

      {format === 'csv' && (
        <View>
          <Label>Séparateur</Label>
          <View style={styles.wrap}>
            {SEPARATORS.map((s) => (
              <Chip key={s.label} label={s.label} selected={separator === s.value} onPress={() => setSeparator(s.value)} />
            ))}
          </View>
        </View>
      )}

      {photoCount > 0 && (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Joindre les photos</Text>
            <Text style={styles.optionDesc}>Archive ZIP avec un dossier « photos/ » référencé dans les attributs.</Text>
          </View>
          <Switch value={includePhotos} onValueChange={setIncludePhotos} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
      )}

      <Button title="Exporter et partager" icon="share-variant" onPress={run} loading={busy} disabled={features.length === 0} />
      {last && (
        <Card style={styles.done}>
          <MaterialCommunityIcons name="check-circle" size={22} color={colors.good} />
          <Text style={{ flex: 1, color: colors.text }}>{last}</Text>
        </Card>
      )}
      <Button title="Fermer" variant="ghost" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  summary: { fontSize: 15, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  optionSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: '#F4FAF6' },
  optionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  optionDesc: { fontSize: 13, color: colors.muted, marginTop: 2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.md },
  done: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
});
