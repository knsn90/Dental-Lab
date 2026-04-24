import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTimeline } from '../components/StatusTimeline';
import { Card } from '../../../core/ui/Card';
import { isOrderOverdue, formatDeliveryDate } from '../constants';
import { C } from '../../../core/theme/colors';

export function DoctorOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { order, signedUrls, loading, error } = useOrderDetail(id);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.textSecondary }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center' }}>
            Sipariş yüklenemedi
          </Text>
          <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', maxWidth: 320 }}>
            {error ?? 'Sipariş bulunamadı veya erişim yetkiniz yok.'}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ marginTop: 8, backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>← Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const overdue = isOrderOverdue(order.delivery_date, order.status);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.orderNumber}>{order.order_number}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status */}
        <Card style={styles.card}>
          <StatusBadge status={order.status} />
          {overdue && (
            <Text style={styles.overdueWarning}>⚠️ Teslim tarihi geçti!</Text>
          )}
        </Card>

        {/* Work Details */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>İş Detayları</Text>
          <InfoRow label="İş Türü" value={order.work_type} />
          <InfoRow label="Diş Numaraları" value={order.tooth_numbers.join(', ')} />
          {order.shade && <InfoRow label="Renk" value={order.shade} />}
          <InfoRow
            label="Makine"
            value={order.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'}
          />
          <InfoRow
            label="Teslim Tarihi"
            value={formatDeliveryDate(order.delivery_date)}
            valueStyle={overdue ? { color: C.danger } : undefined}
          />
          {order.notes && <InfoRow label="Notlar" value={order.notes} />}
        </Card>

        {/* Photos */}
        {order.photos && order.photos.length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Fotoğraflar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoRow}>
                {order.photos.map((photo) => {
                  const url = signedUrls[photo.storage_path];
                  return url ? (
                    <Image key={photo.id} source={{ uri: url }} style={styles.photo} />
                  ) : null;
                })}
              </View>
            </ScrollView>
          </Card>
        )}

        {/* Status History */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Durum Geçmişi</Text>
          <StatusTimeline history={order.status_history ?? []} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, valueStyle]}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  value: { fontSize: 14, color: C.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  back: { fontSize: 16, color: C.primary, fontWeight: '600' },
  orderNumber: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  content: { padding: 16 },
  card: { marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  overdueWarning: { color: C.danger, fontWeight: '600', marginTop: 8 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photo: { width: 120, height: 120, borderRadius: 10 },
});
