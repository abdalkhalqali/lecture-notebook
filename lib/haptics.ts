import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function selectionAsync() {
  if (Platform.OS === 'web') return Promise.resolve();
  return Haptics.selectionAsync();
}

export function notificationAsync(type: Haptics.NotificationFeedbackType) {
  if (Platform.OS === 'web') return Promise.resolve();
  return Haptics.notificationAsync(type);
}

export { NotificationFeedbackType } from 'expo-haptics';
