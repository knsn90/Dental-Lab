import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { FinanceHubScreen } from '../../modules/finance/screens/FinanceHubScreen';

function AccessDenied({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        {label} bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabFinanceScreen() {
  return (
    <PermissionGate
      requires="view_financials"
      fallback={<AccessDenied label="Mali İşlemler" />}
    >
      <FinanceHubScreen />
    </PermissionGate>
  );
}
