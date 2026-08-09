/**
 * useAnimatedKeyboardHeight — klavye yüksekliğini ANİMASYONLU döner.
 *
 * Neden KeyboardAvoidingView değil:
 *   • KAV yalnız kendi kapsayıcısı içinde iterek çalışır. Alta yaslanmış
 *     (justifyContent:'flex-end') veya sabit yükseklikli sheet/modal'larda
 *     itecek boşluk kalmadığı için hiçbir şey yapmaz — klavye içeriği örter.
 *   • KAV geçişi anlık sıçrar; klavyenin kendi easing eğrisiyle senkron değil.
 *
 * Bu hook iOS'un keyboardWillShow/Hide olaylarından SÜREYİ alır ve aynı süreyle
 * animasyon yapar → kart klavyeyle BİRLİKTE akar. Dönen değer bir
 * Animated.Value'dur; paddingBottom / height gibi layout alanlarında kullanılır
 * (bu yüzden useNativeDriver: false).
 *
 * Kullanım:
 *   const kb = useAnimatedKeyboardHeight();
 *   <Animated.View style={{ flex: 1, paddingBottom: kb }}>…</Animated.View>
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';

export function useAnimatedKeyboardHeight() {
  const height = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS'ta "will" olayları klavye animasyonu BAŞLAMADAN önce gelir → senkron
    // hareket için şart. Android'de yalnız "did" var.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvt, (e: any) => {
      setVisible(true);
      Animated.timing(height, {
        toValue: e?.endCoordinates?.height ?? 0,
        duration: e?.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvt, (e: any) => {
      Animated.timing(height, {
        toValue: 0,
        duration: e?.duration || 250,
        useNativeDriver: false,
      }).start(() => setVisible(false));
    });

    return () => { subShow.remove(); subHide.remove(); };
  }, [height]);

  return { height, visible };
}
