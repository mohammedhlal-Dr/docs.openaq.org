import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Complète app.json avec la clé Google Maps (nécessaire pour la carte dans les
 * builds Android ; facultative sur iOS qui utilise Apple Plans par défaut).
 * Définir GOOGLE_MAPS_API_KEY dans l'environnement ou les secrets EAS.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    name: config.name ?? 'GéoSurvey',
    slug: config.slug ?? 'geosurvey',
    plugins: [
      ...(config.plugins ?? []),
      ...(key ? [['react-native-maps', { androidGoogleMapsApiKey: key }] as [string, object]] : []),
    ],
  };
};
