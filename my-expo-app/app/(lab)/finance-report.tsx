import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { FinanceReportScreen } from '../../modules/finance/screens/FinanceReportScreen';

function AccessDenied() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        Gelir/Gider Raporu bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabFinanceReportScreen() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <FinanceReportScreen />
    </PermissionGate>
  );
}
