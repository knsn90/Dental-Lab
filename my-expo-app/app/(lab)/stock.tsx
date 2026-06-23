import { View, Text } from 'react-native';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { StockScreen } from '../../modules/stock/screens/StockScreen';

function AccessDenied({ label }: { label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <Text style={{ fontSize: 15, color: '#6B6B6B', textAlign: 'center' }}>
        {label} bölümüne erişim yetkiniz yok.
      </Text>
    </View>
  );
}

export default function LabStockScreen() {
  return (
    <PermissionGate
      requires="view_stock"
      fallback={<AccessDenied label="Stok & Depo" />}
    >
      <StockScreen />
    </PermissionGate>
  );
}
