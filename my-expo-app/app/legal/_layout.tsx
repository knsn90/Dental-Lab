// Public yasal sayfalar (giriş gerektirmez) — iyzico web sitesi kriterleri.
// app/_layout.tsx isPublicRoute listesinde 'legal' var → auth guard atlanır.
import { Stack } from 'expo-router';

export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
