export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  // Share intent deep links arrive as synapse://dataUrl=synapseShareKey#type
  // Intercept them before Expo Router tries to resolve them as routes.
  // useShareIntent still picks up the URL via expo-linking and processes it,
  // then ShareIntentHandler in _layout.tsx navigates to /capture.
  if (path.includes('dataUrl=')) {
    return '/';
  }
  return path;
}
