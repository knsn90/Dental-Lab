import { Platform } from 'react-native';

/**
 * Plus Jakarta Sans font families.
 * - On web: CSS weight axis handles variants, single family string suffices.
 * - On native: each weight is a separate loaded font file.
 */
export const F = {
  light:    Platform.OS === 'web' ? "'Plus Jakarta Sans', sans-serif" : 'PlusJakartaSans_300Light',
  regular:  Platform.OS === 'web' ? "'Plus Jakarta Sans', sans-serif" : 'PlusJakartaSans_400Regular',
  medium:   Platform.OS === 'web' ? "'Plus Jakarta Sans', sans-serif" : 'PlusJakartaSans_500Medium',
  semibold: Platform.OS === 'web' ? "'Plus Jakarta Sans', sans-serif" : 'PlusJakartaSans_600SemiBold',
  bold:     Platform.OS === 'web' ? "'Plus Jakarta Sans', sans-serif" : 'PlusJakartaSans_700Bold',
};

export const T = {
  pageTitle:    { fontSize: 20, fontWeight: '600' as const, fontFamily: F.semibold, color: '#0F172A', letterSpacing: -0.3 },
  sectionTitle: { fontSize: 13, fontWeight: '600' as const, fontFamily: F.semibold, color: '#0F172A', letterSpacing: -0.1 },
  body:         { fontSize: 14, fontWeight: '400' as const, fontFamily: F.regular,  color: '#64748B' },
  bodyBold:     { fontSize: 14, fontWeight: '500' as const, fontFamily: F.medium,   color: '#0F172A' },
  small:        { fontSize: 12, fontWeight: '400' as const, fontFamily: F.regular,  color: '#94A3B8' },
  label:        { fontSize: 11, fontWeight: '500' as const, fontFamily: F.medium,   color: '#64748B', letterSpacing: 0.3 },
  number:       { fontSize: 26, fontWeight: '600' as const, fontFamily: F.semibold, color: '#0F172A' },
};
