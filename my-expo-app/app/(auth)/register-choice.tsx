// Eski adres → /register (paylaşılmış linkler kırılmasın; sorgu parametreleri korunur).
import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function RegisterChoiceRedirect() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/(auth)/register', params } as any} />;
}
