import { useTheme } from '@/context/ThemeContext';

export function useColors() {
  return useTheme().colors;
}
