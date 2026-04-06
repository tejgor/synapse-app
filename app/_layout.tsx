import { useEffect, useRef } from 'react';
import { AppState, Platform, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useShareIntentContext, ShareIntentProvider } from 'expo-share-intent';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { getDatabase } from '@/src/db/schema';
import { retryFailedEntries, handleBackgroundResult } from '@/src/services/processing';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
  const appState = useRef(AppState.currentState);

  // Load SpaceMono for metadata/label typography
  const [fontsLoaded] = useFonts({
    'SpaceMono': require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    getDatabase().then(async () => {
      // Drain any background results that arrived while the app was dead
      if (Platform.OS === 'ios') {
        const BackgroundRequest = require('../modules/background-request').default;
        const pending = BackgroundRequest.getPendingResults() as Array<{
          entryId: string; response?: string; error?: string; statusCode?: number;
        }>;
        for (const result of pending) {
          await handleBackgroundResult(result);
          BackgroundRequest.clearResult(result.entryId);
        }
      }

      retryFailedEntries();
    });

    // Listen for background results that arrive while the app is alive
    let bgSub: { remove(): void } | null = null;
    if (Platform.OS === 'ios') {
      const { emitter } = require('../modules/background-request');
      bgSub = emitter.addListener('onRequestComplete', async (event: {
        entryId: string; response?: string; error?: string; statusCode?: number;
      }) => {
        await handleBackgroundResult(event);
        const BackgroundRequest = require('../modules/background-request').default;
        BackgroundRequest.clearResult(event.entryId);
      });
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        retryFailedEntries();
      }
      appState.current = nextState;
    });

    return () => {
      subscription.remove();
      bgSub?.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ShareIntentProvider>
      <ShareIntentHandler />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'Synapse',
            headerRight: () => (
              <Pressable onPress={() => router.push('/settings' as any)} hitSlop={8}>
                <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen
          name="capture"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="entry/[id]"
          options={{ title: '', headerBackTitle: '' }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: 'Settings', headerBackTitle: '' }}
        />
      </Stack>
    </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}
