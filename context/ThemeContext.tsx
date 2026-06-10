import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, ThemeId, ColorScheme } from '@/constants/colors';

const THEME_KEY = 'nb:theme';

interface ThemeContextValue {
  themeId: ThemeId;
  colors: ColorScheme;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'darkNavy',
  colors: THEMES.darkNavy,
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('darkNavy');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(stored => {
      if (stored && THEMES[stored as ThemeId]) {
        setThemeId(stored as ThemeId);
      }
    });
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    AsyncStorage.setItem(THEME_KEY, id);
  }, []);

  return (
    <ThemeContext.Provider value={{ themeId, colors: THEMES[themeId], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
