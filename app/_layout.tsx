import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useShareIntentContext, ShareIntentProvider } from 'expo-share-intent';
import { router } from 'expo-router';
import { getDatabase } from '@/src/db/schema';
import { retryFailedEntries } from '@/src/services/processing';
import { colors } from '@/src/constants/theme';

function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && shareIntent?.text) {
      const url = shareIntent.text;
      resetShareIntent();
      router.push({ pathname: '/capture', params: { url } });
    }
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // Initialize database and retry any pending entries on app launch
    getDatabase().then(() => {
      retryFailedEntries();
    });
  }, []);

  return (
    <ShareIntentProvider>
      <ShareIntentHandler />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Synapse', headerLargeTitle: true }}
        />
        <Stack.Screen
          name="capture"
          options={{
            title: 'Capture',
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="entry/[id]"
          options={{ title: '' }}
        />
      </Stack>
    </ShareIntentProvider>
  );
}
