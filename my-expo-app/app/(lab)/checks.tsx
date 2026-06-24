import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { ChecksScreen } from '../../modules/checks/screens/ChecksScreen';

function AccessDenied() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        Çek/Senet bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabChecksScreen() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <ChecksScreen />
    </PermissionGate>
  );
}
