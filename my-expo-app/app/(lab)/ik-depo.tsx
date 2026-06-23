import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { HRHubScreen } from '../../modules/hr/screens/HRHubScreen';

function AccessDenied({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        {label} bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabIkDepoScreen() {
  return (
    <PermissionGate
      requires="view_team"
      fallback={<AccessDenied label="Ekip & Performans" />}
    >
      <HRHubScreen />
    </PermissionGate>
  );
}
