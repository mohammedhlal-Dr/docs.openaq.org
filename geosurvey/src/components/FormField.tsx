import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseInput, todayIso } from '../core/form';
import type { AttributeValue, FieldDef } from '../core/types';
import { savePhoto } from '../storage/files';
import { colors, radius, spacing } from './theme';
import { Button, Chip, Label, styles as ui } from './ui';

interface Props {
  field: FieldDef;
  value: AttributeValue;
  error?: string;
  onChange: (v: AttributeValue) => void;
}

/** Champ de formulaire (à la Survey123) adapté au type déclaré. */
export function FormField({ field, value, error, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Label required={field.required}>{field.label}</Label>
      <FieldInput field={field} value={value} onChange={onChange} hasError={!!error} />
      {field.hint ? <Text style={ui.hint}>{field.hint}</Text> : null}
      {error ? <Text style={ui.errorText}>{error}</Text> : null}
    </View>
  );
}

function FieldInput({ field, value, onChange, hasError }: Omit<Props, 'error'> & { hasError: boolean }) {
  switch (field.type) {
    case 'choice':
      return (
        <View style={styles.wrap}>
          {(field.choices ?? []).map((c) => (
            <Chip key={c} label={c} selected={value === c} onPress={() => onChange(value === c ? null : c)} />
          ))}
        </View>
      );
    case 'boolean':
      return (
        <View style={styles.wrap}>
          <Chip label="Oui" icon="check" selected={value === true} onPress={() => onChange(value === true ? null : true)} />
          <Chip label="Non" icon="close" selected={value === false} onPress={() => onChange(value === false ? null : false)} />
        </View>
      );
    case 'photo':
      return <PhotoInput value={typeof value === 'string' ? value : null} onChange={onChange} />;
    case 'date':
      return <TypedTextInput field={field} value={value} onChange={onChange} hasError={hasError} placeholder="AAAA-MM-JJ" extra={
        <Button compact variant="secondary" title="Aujourd'hui" icon="calendar-today" onPress={() => onChange(todayIso())} />
      } />;
    default:
      return <TypedTextInput field={field} value={value} onChange={onChange} hasError={hasError} />;
  }
}

/**
 * Saisie texte avec conversion typée. Le texte brut est conservé localement pour
 * permettre les saisies intermédiaires (« 12, » avant « 12,5 »).
 */
function TypedTextInput({ field, value, onChange, hasError, placeholder, extra }: {
  field: FieldDef;
  value: AttributeValue;
  onChange: (v: AttributeValue) => void;
  hasError: boolean;
  placeholder?: string;
  extra?: React.ReactNode;
}) {
  // `value` mémorise la dernière valeur connue : si le parent la change (bouton
  // « Aujourd'hui », réinitialisation), le texte affiché est resynchronisé.
  const [state, setState] = useState({ text: value == null ? '' : String(value), value });
  if (value !== state.value) setState({ text: value == null ? '' : String(value), value });
  const invalid = parseInput(field, state.text) === undefined;

  const numeric = field.type === 'integer' || field.type === 'decimal';
  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        style={[ui.input, (hasError || invalid) && ui.inputError, field.type === 'text' && styles.multiline]}
        value={state.text}
        placeholder={placeholder ?? (numeric ? '0' : 'Saisir…')}
        placeholderTextColor={colors.muted}
        multiline={field.type === 'text'}
        keyboardType={field.type === 'integer' ? 'number-pad' : field.type === 'decimal' ? 'decimal-pad' : 'default'}
        onChangeText={(t) => {
          const parsed = parseInput(field, t);
          const next = parsed === undefined ? t : parsed;
          setState({ text: t, value: next });
          onChange(next);
        }}
      />
      {extra}
    </View>
  );
}

function PhotoInput({ value, onChange }: { value: string | null; onChange: (v: AttributeValue) => void }) {
  const pick = async (source: 'camera' | 'library') => {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Autorisation refusée', source === 'camera' ? "L'accès à l'appareil photo est nécessaire." : "L'accès aux photos est nécessaire.");
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false };
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets?.[0]) return;
      // L'ancienne photo est supprimée seulement à l'enregistrement de l'entité.
      onChange(savePhoto(res.assets[0].uri));
    } catch (e) {
      Alert.alert('Photo', e instanceof Error ? e.message : String(e));
    }
  };

  if (value) {
    return (
      <View style={styles.photoRow}>
        <Image source={{ uri: value }} style={styles.photo} resizeMode="cover" />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Button compact variant="secondary" icon="camera-retake" title="Reprendre" onPress={() => pick('camera')} />
          <Button compact variant="danger" icon="delete" title="Retirer" onPress={() => onChange(null)} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.photoPlaceholder} onPress={() => pick('camera')} accessibilityRole="button" accessibilityLabel="Prendre une photo">
        <MaterialCommunityIcons name="camera" size={28} color={colors.primary} />
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Prendre une photo</Text>
      </Pressable>
      <Button compact variant="ghost" icon="image" title="Galerie" onPress={() => pick('library')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  multiline: { minHeight: 46, maxHeight: 140, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  photo: { width: 120, height: 120, borderRadius: radius.md, backgroundColor: colors.border },
  photoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
  },
});
