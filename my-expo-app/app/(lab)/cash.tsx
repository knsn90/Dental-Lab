import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { CashScreen } from '../../modules/cash/screens/CashScreen';

function AccessDenied() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        Kasa/Banka bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabCashScreen() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <CashScreen />
    </PermissionGate>
  );
}
