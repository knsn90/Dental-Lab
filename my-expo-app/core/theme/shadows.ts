import { Platform } from 'react-native';
export const Shadows = {
  sm: Platform.OS === 'web'
    ? { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  md: Platform.OS === 'web'
    ? { boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  lg: Platform.OS === 'web'
    ? { boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }
    : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 24, elevation: 8 },
};
