import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { fetchOrderItems, addOrderItem, deleteOrderItem, fetchLabServices } from '../../lib/services';
import { OrderItem, LabService } from '../../lib/types';
import Colors from '../../constants/colors';

export function OrderItemsSection({ workOrderId }: { workOrderId: string }) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [services, setServices] = useState<LabService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [showManual, setShowManual] = useState(false);

  const load = async () => {
    setLoading(true);
    const [itemsRes, servicesRes] = await Promise.all([
      fetchOrderItems(workOrderId),
      fetchLabServices(),
    ]);
    setItems((itemsRes.data as OrderItem[]) ?? []);
    setServices((servicesRes.data as LabService[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workOrderId]);

  const handleAddService = async (service: LabService) => {
    setAdding(true);
    await addOrderItem({
      work_order_id: workOrderId,
      service_id: service.id,
      name: service.name,
      price: service.price,
      quantity: 1,
    });
    setAdding(false);
    load();
  };

  const handleAddManual = async () => {
    if (!manualName.trim()) return;
    setAdding(true);
    await addOrderItem({
      work_order_id: workOrderId,
      name: manualName.trim(),
      price: parseFloat(manualPrice) || 0,
      quantity: 1,
    });
    setManualName(''); setManualPrice(''); setShowManual(false);
    setAdding(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await deleteOrderItem(id);
    load();
  };

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const currency = services[0]?.currency ?? 'TRY';

  const filtered = services.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.category ?? '').toLowerCase().includes(search.toLowerCase())
  );

  // Group services by category
  const categoryMap: Record<string, LabService[]> = {};
  filtered.forEach((s) => {
    const cat = s.category ?? 'Diğer';
    if (!categoryMap[cat]) categoryMap[cat] = [];
    categoryMap[cat].push(s);
  });

  if (loading) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />;

  return (
    <View>
      <Text style={styles.heading}>İş Kalemleri & Ücretlendirme</Text>

      {/* Current items */}
      {items.length > 0 && (
        <View style={styles.itemsCard}>
          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.quantity > 1 && (
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                )}
              </View>
              <Text style={styles.itemPrice}>
                {(item.price * item.quantity).toFixed(2)} {currency}
              </Text>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Toplam</Text>
            <Text style={styles.totalValue}>{total.toFixed(2)} {currency}</Text>
          </View>
        </View>
      )}

      {/* Service catalog */}
      <Text style={styles.subHeading}>Katalogdan Ekle</Text>
      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="🔍  Hizmet ara..."
        placeholderTextColor={Colors.textMuted}
      />

      {services.length === 0 ? (
        <View style={styles.emptyServices}>
          <Text style={styles.emptyServicesText}>
            Henüz hizmet kataloğu oluşturulmamış.
          </Text>
          <Text style={styles.emptyServicesSubText}>
            Hizmet Kataloğu bölümünden hizmet ekleyin.
          </Text>
        </View>
      ) : (
        <View style={styles.catalog}>
          {Object.entries(categoryMap).map(([cat, catServices]) => (
            <View key={cat}>
              <Text style={styles.catLabel}>{cat}</Text>
              {catServices.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.catalogRow}
                  onPress={() => handleAddService(s)}
                  disabled={adding}
                >
                  <View style={styles.addIcon}>
                    <Text style={styles.addIconText}>+</Text>
                  </View>
                  <Text style={styles.catalogName}>{s.name}</Text>
                  <Text style={styles.catalogPrice}>
                    {s.price > 0 ? `${s.price.toFixed(2)} ${s.currency}` : '—'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Manual entry */}
      {showManual ? (
        <View style={styles.manualForm}>
          <Text style={styles.subHeading}>Manuel Ekle</Text>
          <TextInput
            style={styles.manualInput}
            value={manualName}
            onChangeText={setManualName}
            placeholder="Hizmet adı..."
            placeholderTextColor={Colors.textMuted}
          />
          <View style={styles.manualRow}>
            <TextInput
              style={[styles.manualInput, { flex: 1 }]}
              value={manualPrice}
              onChangeText={setManualPrice}
              placeholder="Fiyat (0.00)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.manualAddBtn}
              onPress={handleAddManual}
              disabled={adding || !manualName.trim()}
            >
              <Text style={styles.manualAddBtnText}>Ekle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.manualCancelBtn}
              onPress={() => setShowManual(false)}
            >
              <Text style={styles.manualCancelText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.manualBtn}
          onPress={() => setShowManual(true)}
        >
          <Text style={styles.manualBtnText}>+ Manuel Kalem Ekle</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 14 },
  subHeading: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: 8, marginTop: 12 },
  itemsCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: 16,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  itemInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500' },
  itemQty: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  itemPrice: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginRight: 10 },
  deleteBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 11, color: '#DC2626', fontWeight: '700' },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: Colors.primaryLight,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  totalValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  searchInput: {
    backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 13, color: Colors.textPrimary, marginBottom: 4,
  },
  catalog: { marginBottom: 8 },
  catLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    letterSpacing: 0.5, paddingVertical: 6, paddingHorizontal: 2,
  },
  catalogRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  addIcon: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: '#059669',
    alignItems: 'center', justifyContent: 'center',
  },
  addIconText: { fontSize: 16, color: '#059669', fontWeight: '700', lineHeight: 20 },
  catalogName: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  catalogPrice: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyServices: { paddingVertical: 24, alignItems: 'center', gap: 6 },
  emptyServicesText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  emptyServicesSubText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  manualForm: { marginTop: 8, padding: 12, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  manualInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
    color: Colors.textPrimary, backgroundColor: Colors.surface, marginBottom: 8,
  },
  manualRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualAddBtn: { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  manualAddBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  manualCancelBtn: { paddingHorizontal: 10, paddingVertical: 9 },
  manualCancelText: { color: Colors.textSecondary, fontSize: 13 },
  manualBtn: {
    marginTop: 10, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
  },
  manualBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
});
