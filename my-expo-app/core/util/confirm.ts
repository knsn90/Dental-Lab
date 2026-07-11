/**
 * Cross-platform onay diyaloğu.
 *
 * Alert.alert react-native-web'de NO-OP (buton callback'leri hiç çalışmaz),
 * window.confirm ise native'de yok. Bu helper iki platformda da çalışır:
 *   web    → window.confirm (senkron, tarayıcı diyaloğu)
 *   native → Alert.alert (iki butonlu, Promise'e sarılı)
 *
 *   if (await confirmAsync('Çek Sil', 'Bu kaydı silmek istediğinize emin misiniz?')) { ... }
 */
import { Alert, Platform } from 'react-native';

export function confirmAsync(
  title: string,
  message?: string,
  opts: { confirmText?: string; cancelText?: string; destructive?: boolean } = {},
): Promise<boolean> {
  const { confirmText = 'Onayla', cancelText = 'Vazgeç', destructive = false } = opts;
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
