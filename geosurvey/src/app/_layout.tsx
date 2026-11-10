import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../components/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'GéoSurvey' }} />
        <Stack.Screen name="project/edit" options={{ title: 'Projet' }} />
        <Stack.Screen name="project/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="project/[id]/collect" options={{ title: 'Saisie' }} />
        <Stack.Screen name="project/[id]/export" options={{ title: 'Exporter', presentation: 'modal' }} />
      </Stack>
    </>
  );
}
