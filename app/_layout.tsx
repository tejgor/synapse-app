import { useEffect, useRef } from 'react';
import { AppState, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useShareIntentContext, ShareIntentProvider } from 'expo-share-intent';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getDatabase } from '@/src/db/schema';
import { retryFailedEntries } from '@/src/services/processing';
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

  useEffect(() => {
    // Initialize database and retry any pending entries on app launch
    getDatabase().then(() => {
      retryFailedEntries();
    });

    // Retry on foreground return — catches entries that didn't finish in the background
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        retryFailedEntries();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
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
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Synapse' }}
        />
        <Stack.Screen
          name="capture"
          options={{
            title: 'Add',
            presentation: 'modal',
            animation: 'slide_from_bottom',
            headerLeft: () => (
              <Pressable onPress={() => router.back()}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen
          name="entry/[id]"
          options={{ title: '' }}
        />
      </Stack>
    </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}
