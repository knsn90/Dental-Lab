import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { InvoicesListScreen } from '../../modules/invoices/screens/InvoicesListScreen';

function AccessDenied() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        Faturalar bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabInvoicesScreen() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <InvoicesListScreen />
    </PermissionGate>
  );
}
