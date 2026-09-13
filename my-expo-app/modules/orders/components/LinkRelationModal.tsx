/**
 * LinkRelationModal — Mevcut bir siparişi başka siparişin DEVAM'ı veya
 * REVİZYON'u yapar (geriye dönük bağ). Yalnız Yönetici İşlemleri'nden açılır.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { X, Link2, Search } from '../../../core/ui/icons';
import { linkOrderRelation, searchLinkableOrders, type LinkableOrder } from '../api';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Props {
  visible: boolean;
  orderId: string;
  orderNumber?: string | null;
  /** Yalnız aynı hastaya ait siparişler listelensin diye. */
  patientName?: string | null;
  onClose: () => void;
  onLinked: () => void;
}

const DISPLAY = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

function fmtD(s?: string | null): string {
  if (!s) return '';
  try { const d = new Date(s.includes('T') ? s : s + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; } catch { return ''; }
}
const STL: Record<string, { l: string; c: string }> = {
  alindi: { l: 'Alındı', c: '#4A8FC9' }, uretimde: { l: 'Üretimde', c: '#B45309' }, asamada: { l: 'Üretimde', c: '#B45309' },
  kalite_kontrol: { l: 'Final QC', c: '#7C3AED' }, teslimata_hazir: { l: 'Teslime Hazır', c: '#0F6E50' },
  kuryede: { l: 'Kuryede', c: '#1E5A8A' }, teslim_edildi: { l: 'Teslim edildi', c: '#6B6B6B' }, iptal: { l: 'İptal', c: '#9C2E2E' },
};

export function LinkRelationModal({ visible, orderId, orderNumber, patientName, onClose, onLinked }: Props) {
  const [type, setType] = useState<'continuation' | 'revision'>('continuation');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkableOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [parent, setParent] = useState<LinkableOrder | null>(null);
  const [reason, setReason] = useState('');
  const [responsible, setResponsible] = useState<'lab' | 'client'>('lab');
  const [busy, setBusy] = useState(false);
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const accentTxt = isDark ? '#93C5FD' : '#1F5689';   // accent metin/ikon koyu yüzeyde okunur

  useEffect(() => {
    if (!visible) return;
    setType('continuation'); setQuery(''); setResults([]); setParent(null); setReason(''); setResponsible('lab');
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchLinkableOrders(query, orderId, patientName);
      if (alive) { setResults(r); setLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, visible, orderId, patientName]);

  const canConfirm = useMemo(() => {
    if (!parent) return false;
    if (type === 'revision' && reason.trim().length === 0) return false;
    return true;
  }, [parent, type, reason]);

  const confirm = async () => {
    if (!parent || busy) return;
    setBusy(true);
    const res = await linkOrderRelation(
      orderId, parent.id, type,
      type === 'revision' ? reason : null,
      type === 'revision' ? responsible : null,
    );
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? autoT('İşlem başarısız')); return; }
    toast.success(type === 'revision' ? autoT('Revizyon olarak bağlandı') : autoT('Devam siparişi olarak bağlandı'));
    onLinked(); onClose();
  };

  const Seg = ({ v, label }: { v: 'continuation' | 'revision'; label: string }) => (
    <Pressable
      onPress={() => setType(v)}
      style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
        backgroundColor: type === v ? '#1F5689' : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: type === v ? '#FFFFFF' : (isDark ? T.ink3 : '#6B6B6B') }}>{autoT(label)}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View style={{ width: '100%', maxWidth: 480, maxHeight: "92%", backgroundColor: isDark ? T.card : "#FFFFFF", borderRadius: 22, overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}) }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(31,86,137,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Link2 size={18} color={accentTxt} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: accentTxt, letterSpacing: 1, textTransform: 'uppercase' }}>{autoT('Başka siparişe bağla')}</Text>
              <Text style={{ fontFamily: DISPLAY, fontWeight: '300', fontSize: 19, color: isDark ? T.ink : "#0A0A0A", marginTop: 1 }} numberOfLines={1}>{orderNumber ?? ''}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: isDark ? T.hairline : "rgba(0,0,0,0.08)", alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={15} color={isDark ? (T.ink2 as string) : "#6B6B6B"} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: isDark ? T.hairline : "rgba(0,0,0,0.05)" }} />

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 22, gap: 14 }} keyboardShouldPersistTaps="handled">
            {/* Tip seçimi */}
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: isDark ? T.cardSoft : "#F1F5F9", borderRadius: 12, padding: 4 }}>
              <Seg v="continuation" label="Devam siparişi" />
              <Seg v="revision" label="Revizyon" />
            </View>

            {/* Ebeveyn seçici */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? T.ink2 : "#2C2C2C", marginBottom: 6 }}>{autoT('Bağlanacak ana sipariş')}</Text>
              {parent ? (
                <Pressable onPress={() => setParent(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1F5689', backgroundColor: 'rgba(31,86,137,0.06)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? T.ink : "#0A0A0A" }}>{parent.order_number}</Text>
                    <Text style={{ fontSize: 11, color: isDark ? T.ink2 : "#6B6B6B" }} numberOfLines={1}>{parent.work_type || parent.patient_name || '—'}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: accentTxt, fontWeight: '600' }}>{autoT('Değiştir')}</Text>
                </Pressable>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderRadius: 12, borderWidth: 1, borderColor: isDark ? T.hairline : "rgba(0,0,0,0.12)", backgroundColor: isDark ? T.cardSoft : "#FFFFFF" }}>
                    <Search size={15} color={isDark ? (T.ink3 as string) : "#9A9A9A"} />
                    <TextInput
                      value={query} onChangeText={setQuery} autoFocus
                      placeholder={autoT('Sipariş no veya hasta ara…')} placeholderTextColor={isDark ? (T.ink3 as string) : "#9A9A9A"}
                      style={{ flex: 1, fontSize: 13, color: isDark ? T.ink : "#0A0A0A", ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                    />
                  </View>
                  <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: isDark ? T.hairline : "rgba(0,0,0,0.08)", overflow: 'hidden' }}>
                    {loading ? (
                      <View style={{ padding: 16, alignItems: 'center' }}><ActivityIndicator color="#1F5689" /></View>
                    ) : results.length === 0 ? (
                      <View style={{ padding: 16 }}>
                        <Text style={{ fontSize: 12.5, color: isDark ? T.ink3 : "#9A9A9A" }}>
                          {query.trim()
                            ? autoT('Sonuç yok')
                            : (patientName?.trim() ? autoT('Bu hastaya ait başka sipariş yok') : autoT('Sonuç yok'))}
                        </Text>
                      </View>
                    ) : results.map((o, i) => (
                      <Pressable key={o.id} onPress={() => setParent(o)}
                        style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
                          borderTopWidth: i > 0 ? 1 : 0, borderTopColor: isDark ? T.hairline : "rgba(0,0,0,0.05)",
                          backgroundColor: hovered ? (isDark ? "rgba(255,255,255,0.05)" : "#F8FAFC") : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A" }}>{o.order_number}</Text>
                          <Text style={{ fontSize: 11.5, color: isDark ? T.ink2 : "#3C3C3C" }} numberOfLines={1}>{o.work_type || o.patient_name || '—'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                          {o.delivery_date ? <Text style={{ fontSize: 10.5, color: isDark ? T.ink3 : "#9A9A9A" }}>{fmtD(o.delivery_date)}</Text> : null}
                          {o.status && STL[o.status] ? (
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: STL[o.status].c, marginTop: 1 }}>{autoT(STL[o.status].l)}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Revizyon alanları */}
            {type === 'revision' && (
              <>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? T.ink2 : "#2C2C2C", marginBottom: 6 }}>{autoT('Revizyon sebebi')}</Text>
                  <TextInput
                    value={reason} onChangeText={setReason} multiline
                    placeholder={autoT('Neden revizyon gerekti?')} placeholderTextColor={isDark ? (T.ink3 as string) : "#9A9A9A"}
                    style={{ minHeight: 66, borderRadius: 12, borderWidth: 1, borderColor: isDark ? T.hairline : "rgba(0,0,0,0.12)", backgroundColor: isDark ? T.cardSoft : "#FFFFFF", padding: 12, fontSize: 13, color: isDark ? T.ink : "#0A0A0A", textAlignVertical: 'top', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? T.ink2 : "#2C2C2C", marginBottom: 6 }}>{autoT('Sorumlu')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['lab', 'client'] as const).map(r => (
                      <Pressable key={r} onPress={() => setResponsible(r)}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1,
                          borderColor: responsible === r ? '#1F5689' : 'rgba(0,0,0,0.12)',
                          backgroundColor: responsible === r ? 'rgba(31,86,137,0.08)' : (isDark ? T.cardSoft : '#FFFFFF'),
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: responsible === r ? accentTxt : (isDark ? T.ink3 : "#6B6B6B") }}>
                          {autoT(r === 'lab' ? 'Laboratuvar' : 'Klinik / Hekim')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 16, borderTopWidth: 1, borderTopColor: isDark ? T.hairline : "rgba(0,0,0,0.05)" }}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} disabled={busy} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, borderWidth: 1, borderColor: isDark ? T.hairline : "rgba(0,0,0,0.10)", ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isDark ? T.ink2 : "#6B6B6B" }}>{autoT('Vazgeç')}</Text>
            </Pressable>
            <Pressable onPress={confirm} disabled={!canConfirm || busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 9999, backgroundColor: '#1F5689', opacity: (!canConfirm || busy) ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: (!canConfirm || busy) ? 'not-allowed' : 'pointer' } as any : {}) }}>
              <Link2 size={14} color="#FFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{busy ? autoT('Bağlanıyor…') : autoT('Bağla')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
