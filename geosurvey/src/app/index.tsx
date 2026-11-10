import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TEMPLATES } from '../core/templates';
import { GEOMETRY_LABELS } from '../core/types';
import { GEOMETRY_ICONS } from '../components/icons';
import { colors, radius, spacing } from '../components/theme';
import { Button, Card, EmptyState } from '../components/ui';
import { deleteProject, listProjects, type ProjectSummary } from '../storage/db';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => Alert.alert('Erreur', String(e)));
  }, []);
  useFocusEffect(load);

  const openMenu = (p: ProjectSummary) => {
    const actions = [
      { label: 'Ouvrir', run: () => router.push(`/project/${p.id}`) },
      { label: 'Modifier le formulaire', run: () => router.push({ pathname: '/project/edit', params: { id: p.id } }) },
      { label: 'Exporter', run: () => router.push(`/project/${p.id}/export`) },
      {
        label: 'Supprimer',
        destructive: true,
        run: () =>
          Alert.alert('Supprimer le projet ?', `« ${p.name} » et ses ${p.featureCount} entités seront définitivement supprimés.`, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => deleteProject(p.id).then(load) },
          ]),
      },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: p.name, options: [...actions.map((a) => a.label), 'Annuler'], cancelButtonIndex: actions.length, destructiveButtonIndex: 3 },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(p.name, undefined, [
        ...actions.map((a) => ({ text: a.label, style: a.destructive ? ('destructive' as const) : ('default' as const), onPress: a.run })),
        { text: 'Annuler', style: 'cancel' as const },
      ]);
    }
  };

  const templates = (
    <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>Démarrer depuis un modèle</Text>
      {TEMPLATES.map((t) => (
        <Pressable
          key={t.key}
          style={({ pressed }) => [styles.template, pressed && { opacity: 0.7 }]}
          onPress={() => router.push({ pathname: '/project/edit', params: { template: t.key } })}
        >
          <MaterialCommunityIcons name={GEOMETRY_ICONS[t.geometryType]} size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.templateTitle}>{t.name}</Text>
            <Text style={styles.meta}>{t.description}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={projects ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 + insets.bottom, gap: spacing.md }}
        ListEmptyComponent={
          projects ? (
            <View>
              <EmptyState
                icon="map-search-outline"
                title="Bienvenue dans GéoSurvey"
                message="Créez un projet, concevez son formulaire, puis collectez points, lignes et polygones sur le terrain – même sans réseau. Exportez ensuite en Shapefile, Excel ou CSV."
              />
              {templates}
            </View>
          ) : undefined
        }
        ListFooterComponent={projects && projects.length > 0 ? templates : undefined}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/project/${item.id}`)} onLongPress={() => openMenu(item)}>
            {({ pressed }) => (
              <Card style={[styles.projectCard, pressed && { opacity: 0.8 }]}>
                <View style={styles.iconBubble}>
                  <MaterialCommunityIcons name={GEOMETRY_ICONS[item.geometryType]} size={26} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.projectTitle} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {GEOMETRY_LABELS[item.geometryType]} · {item.fields.length} champ{item.fields.length > 1 ? 's' : ''} · {formatDate(item.updatedAt)}
                  </Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countText}>{item.featureCount}</Text>
                </View>
                <Pressable hitSlop={12} onPress={() => openMenu(item)} accessibilityLabel={`Options de ${item.name}`}>
                  <MaterialCommunityIcons name="dots-vertical" size={24} color={colors.muted} />
                </Pressable>
              </Card>
            )}
          </Pressable>
        )}
      />
      <View style={[styles.bottom, { paddingBottom: spacing.lg + insets.bottom }]}>
        <Button title="Nouveau projet" icon="plus" onPress={() => router.push('/project/edit')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  projectCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBubble: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  projectTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  count: { minWidth: 36, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center' },
  countText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  template: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  templateTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.background },
});
