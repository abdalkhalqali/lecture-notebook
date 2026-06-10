import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold } from '@expo-google-fonts/tajawal';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();
const queryClient = new QueryClient();

function AppShell() {
  const { colors } = useTheme();
  return (
    <>
      <StatusBar style={colors.statusBar} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lecture/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="lecture/canvas/[id]" options={{ animation: 'fade' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AppProvider>
                <AppShell />
              </AppProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
