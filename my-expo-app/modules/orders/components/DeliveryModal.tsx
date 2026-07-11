// modules/orders/components/DeliveryModal.tsx
// "Kuryeye Gönder" — manager/admin bir siparişi internal kurye veya external firmaya gönderir.

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, Platform, ScrollView,
} from 'react-native';
import { Truck, User, Building2, X, Check, Search, MapPin } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { createDelivery } from '../api';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { searchPlaces, getPlaceDetails, type PlaceSuggestion } from '../../auth/api/places';
import { BanaBiKuryeLogo } from './BanaBiKuryeLogo';

interface CourierOption { id: string; full_name: string; }

interface Props {
  visible:     boolean;
  workOrderId: string;
  labId:       string;
  onClose:     () => void;
  onCreated:   (deliveryId: string) => void;
  accentColor?: string;
  /** Teslim şekli "kargo" → sadece dış kargo; iç kurye seçeneği gizlenir. */
  lockExternal?: boolean;
  /** Verilirse: BanaBiKurye DÜZENLEME modu — mevcut siparişin adresi/notu /edit-order ile güncellenir. */
  editDelivery?: { id: string; orderId: string } | null;
}

const PROVIDERS = ['MNG Kargo', 'Aras Kargo', 'Sürat Kargo', 'Yurtiçi Kargo', 'PTT Kargo', 'UPS', 'Diğer'];

export function DeliveryModal({ visible, workOrderId, labId, onClose, onCreated, accentColor = '#0A0A0A', lockExternal = false, editDelivery = null }: Props) {
  const [mode, setMode]         = useState<'internal' | 'external' | 'banabikurye'>('external');
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [provider, setProvider]   = useState<string>('');
  const [tracking, setTracking]   = useState<string>('');
  const [notes, setNotes]         = useState<string>('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // BanaBiKurye akışı: önce fiyat hesapla, sonra onayla & çağır
  const [bbkPrice, setBbkPrice]   = useState<string | null>(null);
  const [bbkBusy, setBbkBusy]     = useState(false);
  // Google Places adres arama + onay (BanaBiKurye teslim adresi) — client-side places modülü
  const [addrQuery, setAddrQuery]       = useState('');
  const [addrResults, setAddrResults]   = useState<PlaceSuggestion[]>([]);
  const [addrSelected, setAddrSelected] = useState<{ name: string; address: string; lat: string | null; lng: string | null; phone: string } | null>(null);
  const [addrSearching, setAddrSearching] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBbkPrice(null);
    setAddrQuery(''); setAddrResults([]); setAddrSelected(null);
    if (editDelivery) setMode('banabikurye');        // düzenleme → BanaBiKurye modu sabit
    else if (lockExternal) setMode('external');      // kargo → iç kurye kapalı
    // Adres aramasını siparişin klinik ünvanıyla ön-doldur
    (async () => {
      const { data: wo } = await supabase.from('work_orders').select('doctor_id').eq('id', workOrderId).maybeSingle();
      if (!wo?.doctor_id) return;
      const { data: doc } = await supabase.from('doctors').select('full_name, clinic_id').eq('id', wo.doctor_id).maybeSingle();
      let label = (doc as any)?.full_name ?? '';
      const clinicId = (doc as any)?.clinic_id;
      if (clinicId) {
        const { data: cl } = await supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle();
        if ((cl as any)?.name) label = (cl as any).name;
      }
      if (label) setAddrQuery(label);
    })();
    // Internal kurye listesi
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('user_type', 'lab')
      .eq('role', 'courier')
      .or(`id.eq.${labId},lab_id.eq.${labId}`)
      .then(({ data }) => setCouriers((data ?? []) as CourierOption[]));
  }, [visible, labId]);

  async function handleSubmit() {
    setError(null);
    if (mode === 'banabikurye') return; // BanaBiKurye kendi akışını kullanır (handleBbkCreate)
    if (mode === 'internal' && !courierId) { setError('Kurye seçin'); return; }
    if (mode === 'external' && !provider && !tracking) { setError('Firma veya takip no girin'); return; }
    setSaving(true);
    const res = await createDelivery({
      workOrderId,
      mode,
      courierId:          mode === 'internal' ? courierId ?? undefined : undefined,
      externalProvider:   mode === 'external' ? (provider || undefined) : undefined,
      externalTrackingNo: mode === 'external' ? (tracking || undefined) : undefined,
      notes:              notes.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'Oluşturulamadı'); return; }
    onCreated(res.deliveryId!);
    onClose();
  }

  // Google Places — klinik ünvanından adres ara (client-side, mevcut anahtar)
  async function handleAddrSearch() {
    const q = addrQuery.trim();
    if (q.length < 3) { setError('Arama için en az 3 karakter yaz.'); return; }
    setError(null); setAddrSearching(true);
    const results = await searchPlaces(q);
    setAddrSearching(false);
    setAddrResults(results);
    if (results.length === 0) setError('Eşleşen adres bulunamadı — ünvanı değiştir veya kayıtlı klinik adresi kullanılacak.');
  }

  // Aday seçildi → detay (adres+konum+telefon) çek
  async function handleSelectPlace(s: PlaceSuggestion) {
    setError(null); setAddrSearching(true);
    const det = await getPlaceDetails(s.placeId);
    setAddrSearching(false);
    if (!det || !det.formattedAddress) { setError('Adres detayı alınamadı, tekrar dene.'); return; }
    setAddrSelected({
      name: det.name || s.mainText,
      address: det.formattedAddress,
      lat: det.lat != null ? String(det.lat) : null,
      lng: det.lng != null ? String(det.lng) : null,
      phone: det.phone || '',
    });
    setAddrResults([]); setBbkPrice(null);
  }

  // Seçilen adres override'ını calculate/create body'sine ekler
  function destOverride() {
    if (!addrSelected) return {};
    return {
      dest_address: addrSelected.address,
      dest_lat: addrSelected.lat ?? undefined,
      dest_lng: addrSelected.lng ?? undefined,
      dest_phone: addrSelected.phone || undefined,
    };
  }

  // BanaBiKurye — fiyat hesapla (gerçek kurye çağrılmaz)
  async function handleBbkCalculate() {
    setError(null); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'calculate', work_order_id: workOrderId, notes: notes.trim() || undefined, ...destOverride() },
    });
    setBbkBusy(false);
    if (err || !(data as any)?.ok) { setError((data as any)?.message ?? err?.message ?? 'Fiyat alınamadı'); return; }
    setBbkPrice(String((data as any)?.price ?? '—'));
  }

  // BanaBiKurye — çağrılmış siparişi düzenle (/edit-order): teslim adresi + not
  async function handleBbkEdit() {
    if (!editDelivery) return;
    setError(null); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'edit', order_id: editDelivery.orderId, notes: notes.trim() || undefined, ...destOverride() },
    });
    if (err || !(data as any)?.ok) { setBbkBusy(false); setError((data as any)?.message ?? err?.message ?? 'Düzenlenemedi'); return; }
    // Yerel teslimat kaydının adresini güncelle (varsa)
    if (addrSelected) {
      await supabase.from('deliveries').update({ destination_address: addrSelected.address }).eq('id', editDelivery.id);
    }
    setBbkBusy(false);
    onCreated(editDelivery.id);
    onClose();
  }

  // BanaBiKurye — onayla & kurye çağır (gerçek/ücretli işlem)
  async function handleBbkCreate() {
    setError(null); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'create', work_order_id: workOrderId, notes: notes.trim() || undefined, ...destOverride() },
    });
    if (err || !(data as any)?.ok) { setBbkBusy(false); setError((data as any)?.message ?? err?.message ?? 'Kurye çağrılamadı'); return; }
    const orderId = (data as any)?.order_id ?? (data as any)?.order_name ?? null;
    // Teslimat kaydı — external (banabikurye) + takip no = BanaBiKurye order_id
    const res = await createDelivery({
      workOrderId,
      mode: 'external',
      externalProvider: 'BanaBiKurye',
      externalTrackingNo: orderId ? String(orderId) : undefined,
      notes: notes.trim() || undefined,
    });
    setBbkBusy(false);
    if (!res.ok) { setError('Kurye çağrıldı ama teslimat kaydı oluşmadı: ' + (res.error ?? '')); return; }
    onCreated(res.deliveryId!);
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 520,
            backgroundColor: '#FFFFFF', borderRadius: 20,
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(15,23,42,0.20)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(234,122,76,0.12)' }}>
              <Truck size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>Teslimat</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0A0A0A' }}>{editDelivery ? 'Teslimatı Düzenle' : 'Kuryeye Gönder'}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: 22, gap: 16 }}>
            {/* Mode segment — Bizim Kurye (lockExternal ise gizli) / Dış Kargo / BanaBiKurye */}
            {!editDelivery && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!lockExternal && (
                <Pressable
                  onPress={() => { setMode('internal'); setBbkPrice(null); setError(null); }}
                  style={{
                    flex: 1, paddingVertical: 12, borderRadius: 12,
                    borderWidth: 1, borderColor: mode === 'internal' ? accentColor : 'rgba(0,0,0,0.08)',
                    backgroundColor: mode === 'internal' ? `${accentColor}10` : '#FFF',
                    alignItems: 'center', gap: 4,
                  }}
                >
                  <User size={16} color={mode === 'internal' ? accentColor : '#6B6B6B'} strokeWidth={1.8} />
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: mode === 'internal' ? accentColor : '#6B6B6B' }}>
                    Bizim Kurye
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => { setMode('external'); setBbkPrice(null); setError(null); }}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 12,
                  borderWidth: 1, borderColor: mode === 'external' ? accentColor : 'rgba(0,0,0,0.08)',
                  backgroundColor: mode === 'external' ? `${accentColor}10` : '#FFF',
                  alignItems: 'center', gap: 4,
                }}
              >
                <Building2 size={16} color={mode === 'external' ? accentColor : '#6B6B6B'} strokeWidth={1.8} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: mode === 'external' ? accentColor : '#6B6B6B' }}>
                  Dış Kargo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setMode('banabikurye'); setBbkPrice(null); setError(null); }}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 12,
                  borderWidth: 1, borderColor: mode === 'banabikurye' ? accentColor : 'rgba(0,0,0,0.08)',
                  backgroundColor: mode === 'banabikurye' ? `${accentColor}10` : '#FFF',
                  alignItems: 'center', gap: 4,
                }}
              >
                <BanaBiKuryeLogo width={92} height={17} />
              </Pressable>
            </View>
            )}

            {/* Internal — courier list */}
            {mode === 'internal' && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Kurye</Text>
                {couriers.length === 0 ? (
                  <Text style={{ fontSize: 12, color: '#9A9A9A', padding: 12, backgroundColor: '#F4F8FC', borderRadius: 10 }}>
                    Tanımlı kurye yok. Ayarlar → Kullanıcılar'dan rolü "Kurye" olan kullanıcı ekleyin.
                  </Text>
                ) : (
                  couriers.map(c => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCourierId(c.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        padding: 12, borderRadius: 12,
                        borderWidth: 1, borderColor: courierId === c.id ? accentColor : 'rgba(0,0,0,0.06)',
                        backgroundColor: courierId === c.id ? `${accentColor}08` : '#FFF',
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '22' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>{c.full_name?.[0] ?? '?'}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>{c.full_name}</Text>
                      {courierId === c.id && <Check size={16} color={accentColor} strokeWidth={2.4} />}
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {/* External — provider + tracking */}
            {mode === 'external' && (
              <View style={{ gap: 12 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Kargo Firması</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {PROVIDERS.map(p => (
                      <Pressable
                        key={p}
                        onPress={() => setProvider(p)}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                          borderWidth: 1, borderColor: provider === p ? accentColor : 'rgba(0,0,0,0.08)',
                          backgroundColor: provider === p ? `${accentColor}10` : '#FFF',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: provider === p ? accentColor : '#6B6B6B' }}>{p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Takip No (opsiyonel)</Text>
                  <TextInput
                    value={tracking}
                    onChangeText={setTracking}
                    placeholder="örn. 1234567890"
                    style={{
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
                      // @ts-ignore web
                      outlineWidth: 0,
                    }}
                  />
                </View>
              </View>
            )}

            {/* BanaBiKurye — fiyat hesapla → onayla → çağır */}
            {mode === 'banabikurye' && (
              <View style={{ gap: 10 }}>
                <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F4F8FC', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0A' }}>BanaBiKurye ile kurye çağır</Text>
                  <Text style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 17 }}>
                    Alış lab adresinden, teslim hekim/klinik adresine. Önce fiyat hesaplanır;
                    onayladığında gerçek kurye çağrılır (ücret lab'a aittir).
                  </Text>
                </View>

                {/* Teslim adresi — Google Places'ten ünvanla ara + onay (doğru adres) */}
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Teslim Adresi</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={addrQuery}
                      onChangeText={setAddrQuery}
                      placeholder="Klinik ünvanı / adres ara…"
                      onSubmitEditing={handleAddrSearch}
                      style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                    />
                    <Pressable
                      onPress={handleAddrSearch}
                      disabled={addrSearching}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 10, backgroundColor: `${accentColor}14`, borderWidth: 1, borderColor: `${accentColor}30`, opacity: addrSearching ? 0.6 : 1 }}
                    >
                      <Search size={14} color={accentColor} strokeWidth={2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{addrSearching ? '…' : 'Ara'}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 10.5, color: '#9A9A9A' }}>Boş bırakırsan siparişin kliniği aranır. Seçmezsen kayıtlı klinik adresi kullanılır.</Text>

                  {/* Aday adresler (Google Places autocomplete) */}
                  {addrResults.map((rsp) => (
                    <Pressable
                      key={rsp.placeId}
                      onPress={() => handleSelectPlace(rsp)}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF' }}
                    >
                      <MapPin size={14} color={accentColor} strokeWidth={1.8} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        {!!rsp.mainText && <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0A0A0A' }}>{rsp.mainText}</Text>}
                        {!!rsp.secondaryText && <Text style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 16 }}>{rsp.secondaryText}</Text>}
                      </View>
                    </Pressable>
                  ))}

                  {/* Seçili adres */}
                  {addrSelected && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0C` }}>
                      <Check size={14} color={accentColor} strokeWidth={2.4} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: accentColor, letterSpacing: 0.4, textTransform: 'uppercase' }}>Seçili teslim adresi</Text>
                        <Text style={{ fontSize: 12, color: '#0A0A0A', lineHeight: 16, marginTop: 2 }}>{addrSelected.address}</Text>
                      </View>
                      <Pressable onPress={() => { setAddrSelected(null); setBbkPrice(null); }} hitSlop={8}>
                        <X size={14} color="#9A9A9A" />
                      </Pressable>
                    </View>
                  )}
                </View>

                {bbkPrice != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0C` }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B6B6B' }}>Tahmini ücret</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: accentColor }}>₺{bbkPrice}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Not (opsiyonel)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Teslimat notu, adres tarifi, vb."
                multiline
                style={{
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                  minHeight: 70, textAlignVertical: 'top',
                  // @ts-ignore
                  outlineWidth: 0,
                }}
              />
            </View>

            {error && (
              <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '500' }}>{error}</Text>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FBF9F4', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#3C3C3C' }}>İptal</Text>
            </Pressable>
            {mode === 'banabikurye' ? (
              <Pressable
                onPress={editDelivery ? handleBbkEdit : (bbkPrice == null ? handleBbkCalculate : handleBbkCreate)}
                disabled={bbkBusy}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: accentColor, opacity: bbkBusy ? 0.6 : 1 }}
              >
                {bbkBusy
                  ? <ActivityIndicator color="#FFF" />
                  : <Truck size={14} color="#FFF" strokeWidth={2} />}
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                  {bbkBusy ? 'İşleniyor…'
                    : editDelivery ? 'Düzenle & Kaydet'
                    : bbkPrice == null ? 'Fiyat Hesapla'
                    : `Onayla & Çağır (₺${bbkPrice})`}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={saving}
                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: accentColor, opacity: saving ? 0.6 : 1 }}
              >
                <Truck size={14} color="#FFF" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Kuryeye Gönder</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
