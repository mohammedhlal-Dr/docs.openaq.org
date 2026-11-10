import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { uniqueFieldName, validateFormDefinition } from '../../core/form';
import { uuid } from '../../core/id';
import { TEMPLATES } from '../../core/templates';
import { FIELD_TYPE_LABELS, GEOMETRY_LABELS, type FieldDef, type FieldType, type GeometryType, type Project } from '../../core/types';
import { FIELD_ICONS, GEOMETRY_ICONS } from '../../components/icons';
import { colors, radius, spacing } from '../../components/theme';
import { Button, Card, Chip, IconButton, Label, Segmented, styles as ui } from '../../components/ui';
import { countFeatures, getProject, saveProject } from '../../storage/db';

interface DraftField extends FieldDef {
  key: string;
  /** Champ ajouté dans cette session : son nom technique suit le libellé. */
  isNew: boolean;
  choicesText: string;
}

const toDraft = (f: FieldDef, isNew: boolean): DraftField => ({
  ...f,
  key: uuid(),
  isNew,
  choicesText: (f.choices ?? []).join('\n'),
});

const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[];

export default function EditProjectScreen() {
  const { id, template } = useLocalSearchParams<{ id?: string; template?: string }>();
  const tpl = id ? undefined : TEMPLATES.find((x) => x.key === template);
  const [loaded, setLoaded] = useState(!id);
  const [original, setOriginal] = useState<Project | null>(null);
  const [featureCount, setFeatureCount] = useState(0);
  const [name, setName] = useState(tpl?.name ?? '');
  const [description, setDescription] = useState(tpl?.description ?? '');
  const [geometryType, setGeometryType] = useState<GeometryType>(tpl?.geometryType ?? 'Point');
  const [fields, setFields] = useState<DraftField[]>(() =>
    id ? [] : (tpl?.fields ?? [{ name: 'nom', label: 'Nom', type: 'text' as const, required: false }]).map((f) => toDraft(f, true)),
  );
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getProject(id), countFeatures(id)])
      .then(([p, n]) => {
        if (!p) return;
        setOriginal(p);
        setFeatureCount(n);
        setName(p.name);
        setDescription(p.description);
        setGeometryType(p.geometryType);
        setFields(p.fields.map((f) => toDraft(f, false)));
        setLoaded(true);
      })
      .catch((e) => Alert.alert('Erreur', String(e)));
  }, [id]);

  const locked = featureCount > 0;

  const update = (key: string, patch: Partial<DraftField>) =>
    setFields((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        const next = { ...f, ...patch };
        if (patch.label !== undefined && f.isNew) {
          next.name = uniqueFieldName(patch.label || 'champ', prev.filter((o) => o.key !== key).map((o) => o.name));
        }
        return next;
      }),
    );

  const move = (index: number, delta: number) =>
    setFields((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (f: DraftField) => {
    const doRemove = () => setFields((prev) => prev.filter((o) => o.key !== f.key));
    if (!f.isNew && locked) {
      Alert.alert('Supprimer le champ ?', `Les valeurs de « ${f.label} » déjà saisies ne seront plus exportées.`, [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doRemove },
      ]);
    } else doRemove();
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      toDraft({ name: uniqueFieldName(`champ ${prev.length + 1}`, prev.map((f) => f.name)), label: '', type: 'text', required: false }, true),
    ]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const save = async () => {
    const finalFields: FieldDef[] = fields.map(({ key: _k, isNew: _n, choicesText, ...f }) => {
      const out: FieldDef = { name: f.name, label: f.label.trim(), type: f.type, required: f.required };
      if (f.hint?.trim()) out.hint = f.hint.trim();
      if (f.type === 'choice') out.choices = choicesText.split('\n').map((c) => c.trim()).filter(Boolean);
      return out;
    });
    const problems = [...(name.trim() ? [] : ['Le nom du projet est obligatoire.']), ...validateFormDefinition(finalFields)];
    if (problems.length) {
      Alert.alert('Formulaire incomplet', problems.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const project: Project = {
        id: original?.id ?? uuid(),
        name: name.trim(),
        description: description.trim(),
        geometryType,
        fields: finalFields,
        createdAt: original?.createdAt ?? now,
        updatedAt: now,
      };
      await saveProject(project);
      if (original) router.back();
      else router.replace(`/project/${project.id}`);
    } catch (e) {
      Alert.alert('Erreur', String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: original ? 'Modifier le projet' : 'Nouveau projet' }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: spacing.md }}>
          <View>
            <Label required>Nom du projet</Label>
            <TextInput style={ui.input} value={name} onChangeText={setName} placeholder="ex. Inventaire des puits" placeholderTextColor={colors.muted} />
          </View>
          <View>
            <Label>Description</Label>
            <TextInput style={[ui.input, { minHeight: 60 }]} value={description} onChangeText={setDescription} multiline placeholder="Objectif, zone, équipe…" placeholderTextColor={colors.muted} />
          </View>
          <View>
            <Label>Type de géométrie</Label>
            <Segmented
              value={geometryType}
              onChange={setGeometryType}
              disabled={locked}
              options={(['Point', 'LineString', 'Polygon'] as GeometryType[]).map((g) => ({ value: g, label: GEOMETRY_LABELS[g], icon: GEOMETRY_ICONS[g] }))}
            />
            {locked && <Text style={ui.hint}>Non modifiable : le projet contient déjà {featureCount} entité(s).</Text>}
          </View>
        </Card>

        <Text style={styles.section}>Formulaire ({fields.length} champ{fields.length > 1 ? 's' : ''})</Text>

        {fields.map((f, i) => {
          const typeLocked = locked && !f.isNew;
          return (
            <Card key={f.key} style={{ gap: spacing.md }}>
              <View style={styles.fieldHeader}>
                <MaterialCommunityIcons name={FIELD_ICONS[f.type]} size={20} color={colors.primary} />
                <Text style={styles.fieldIndex}>Champ {i + 1}</Text>
                <View style={{ flex: 1 }} />
                <IconButton icon="arrow-up" label="Monter" onPress={() => move(i, -1)} color={i === 0 ? colors.border : colors.primary} />
                <IconButton icon="arrow-down" label="Descendre" onPress={() => move(i, 1)} color={i === fields.length - 1 ? colors.border : colors.primary} />
                <IconButton icon="delete-outline" label="Supprimer le champ" onPress={() => remove(f)} color={colors.danger} />
              </View>
              <View>
                <Label required>Libellé (question)</Label>
                <TextInput style={ui.input} value={f.label} onChangeText={(label) => update(f.key, { label })} placeholder="ex. Profondeur (m)" placeholderTextColor={colors.muted} />
                <Text style={ui.hint}>Colonne : {f.name}</Text>
              </View>
              <View>
                <Label>Type de réponse</Label>
                <View style={styles.wrap}>
                  {FIELD_TYPES.map((t) => (
                    <Chip key={t} label={FIELD_TYPE_LABELS[t]} icon={FIELD_ICONS[t]} selected={f.type === t} disabled={typeLocked && f.type !== t} onPress={() => update(f.key, { type: t })} />
                  ))}
                </View>
                {typeLocked && <Text style={ui.hint}>Type verrouillé car des données existent.</Text>}
              </View>
              {f.type === 'choice' && (
                <View>
                  <Label required>Choix (un par ligne)</Label>
                  <TextInput
                    style={[ui.input, { minHeight: 90, textAlignVertical: 'top' }]}
                    multiline
                    value={f.choicesText}
                    onChangeText={(choicesText) => update(f.key, { choicesText })}
                    placeholder={'Bon\nMoyen\nMauvais'}
                    placeholderTextColor={colors.muted}
                  />
                </View>
              )}
              <View>
                <Label>Aide (facultatif)</Label>
                <TextInput style={ui.input} value={f.hint ?? ''} onChangeText={(hint) => update(f.key, { hint })} placeholder="Consigne pour l'enquêteur" placeholderTextColor={colors.muted} />
              </View>
              <View style={styles.switchRow}>
                <Text style={{ fontSize: 15, color: colors.text }}>Réponse obligatoire</Text>
                <Switch value={f.required} onValueChange={(required) => update(f.key, { required })} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
            </Card>
          );
        })}

        <Button title="Ajouter un champ" icon="plus" variant="secondary" onPress={addField} />
        <Button title={original ? 'Enregistrer' : 'Créer le projet'} icon="content-save" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  section: { fontSize: 15, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm, borderRadius: radius.sm },
  fieldIndex: { fontWeight: '700', color: colors.primary, fontSize: 15 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
