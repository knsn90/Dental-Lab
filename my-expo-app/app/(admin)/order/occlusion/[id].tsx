import React from 'react';
import { Platform, View, Text } from 'react-native';

const Screen = Platform.OS === 'web'
  ? React.lazy(() => import('../../../../modules/occlusion/screens/OcclusionScreen'))
  : () => (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Oklüzyon analizi sadece web'de desteklenir.</Text>
      </View>
    );

export default function OcclusionRoute() {
  return (
    <React.Suspense fallback={null}>
      <Screen />
    </React.Suspense>
  );
}
