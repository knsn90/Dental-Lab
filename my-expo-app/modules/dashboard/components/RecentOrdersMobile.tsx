// RecentOrdersMobile — mobil ana ekranlar için "Son Siparişler" kart listesi.
// Desktop tablonun mobile-uygun karşılığı; 4 panelde (lab/admin/klinik/hekim) paylaşılır.
// Durum etiketi/rengi çağıran panelde (STATUS_CFG) çözülür; bu bileşen yalnız sunum.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ClipboardList, ChevronRight, CornerDownRight } from 'lucide-react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';

// Tüm sipariş statülerini + duraklatmayı kapsayan çözümleyici (dashboard muted paleti).
// Lokal STATUS_CFG yalnız 5 statü içerdiği için asamada/kurye_bekleniyor/on_hold gibi
// durumlar ham/yanlış görünüyordu; kartlar bunu kullanmalı.
export function resolveOrderStatus(status?: string | null, holdStatus?: string | null): { label: string; color: string; bg: string } {
  if (holdStatus === 'on_hold') return { label: 'Duraklatıldı', color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' };
  const GRAY  = { color: '#6B6B6B', bg: 'rgba(0,0,0,0.05)' };
  const AMBER = { color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' };
  const BLUE  = { color: '#1F5689', bg: 'rgba(74,143,201,0.12)' };
  const GREEN = { color: '#1F6B47', bg: 'rgba(45,154,107,0.12)' };
  const RED   = { color: '#9C2E2E', bg: 'rgba(217,75,75,0.10)' };
  const M: Record<string, { label: string; color: string; bg: string }> = {
    atama_bekleniyor:         { label: 'Atama Bekliyor', ...GRAY },
    kutu_atandi:              { label: 'Kutu Atandı',    ...GRAY },
    tasarim_onayi_bekleniyor: { label: 'Tasarım Onayı',  ...BLUE },
    onay_bekliyor:            { label: 'Onay Bekliyor',  ...AMBER },
    alindi:                   { label: 'Alındı',         ...GRAY },
    asamada:                  { label: 'Üretimde',       ...AMBER },
    uretimde:                 { label: 'Üretimde',       ...AMBER },
    kalite_kontrol:           { label: 'Kalite Kontrol', ...BLUE },
    teslimata_hazir:          { label: 'Kuryeye Teslim Edildi', ...GREEN },
    kurye_bekleniyor:         { label: 'Kurye Bekleniyor', ...GREEN },
    kuryede:                  { label: 'Kuryede',        ...GREEN },
    teslim_edildi:            { label: 'Teslim Edildi',  ...GRAY },
    iptal:                    { label: 'İptal',          ...RED },
  };
  return M[status ?? ''] ?? { label: status ?? '—', ...GRAY };
}

export interface RecentOrderItem {
  id: string;          // db id (navigasyon)
  no: string;          // order_number
  title: string;       // birincil satır (hekim veya hasta adı)
  initials: string;    // avatar baş harfleri
  workType: string;    // iş tipi
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  delivery: string;    // formatlı teslim tarihi ('' → gizle)
  overdue: boolean;
  /** Bu kayıt bir revizyon mu (zincirin kökü değil) → REVİZYON rozeti */
  isRevision?: boolean;
  /** Bu kayıt bir devam siparişi mi (planlı sonraki aşama) → DEVAM rozeti */
  isContinuation?: boolean;
  /** Aynı vakanın daha eski üyeleri — bu satırın altında girintili gösterilir.
   *  Yerleşim kuralı: grup en güncel revizyonun yerinde durur, geçmiş altında. */
  history?: RecentOrderItem[];
}

/** REVİZYON etiketi — masaüstü listedeki (OrdersListScreenV2) amber dille aynı. */
function RevisionTag() {
  return (
    <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(232,155,42,0.15)', flexShrink: 0 }}>
      <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#9C5E0E', letterSpacing: 0.4 }}>REVİZYON</Text>
    </View>
  );
}

/** DEVAM etiketi — devam siparişi (geçici→nihai); masaüstü listeyle aynı mavi dil. */
function ContinuationTag() {
  return (
    <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(53,99,168,0.14)', flexShrink: 0 }}>
      <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#3563A8', letterSpacing: 0.4 }}>DEVAM</Text>
    </View>
  );
}

export function RecentOrdersMobile({
  items, accent, accentDark, heading = 'Son Siparişler', onOpenOrder, onAllOrders,
}: {
  items: RecentOrderItem[];
  accent: string;
  accentDark: string;
  heading?: string;
  onOpenOrder: (id: string) => void;
  onAllOrders?: () => void;
}) {
  const T = useMobileTokens();
  if (!items.length) return null;

  // Mesajlar kartıyla aynı dil: tek kapsayıcı kart + renkli başlık şeridi +
  // hairline ile ayrılmış satırlar (satır başına ayrı kart YOK).
  const headerBg = `${accent}14`;
  const overdueCount = items.filter(o => o.overdue).length;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ borderRadius: 22, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        {/* Başlık şeridi */}
        <Pressable
          onPress={onAllOrders}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
            backgroundColor: headerBg,
          }}
        >
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={16} color={accent} strokeWidth={2.2} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: accentDark, letterSpacing: 0.2 }}>{heading}</Text>
          {/* Geciken varsa kırmızı rozet — mesajlardaki okunmamış rozetinin karşılığı */}
          {overdueCount > 0 && (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: T.ruby, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{overdueCount}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {!!onAllOrders && <ChevronRight size={18} color={accentDark} strokeWidth={2} />}
        </Pressable>

        {/* Satırlar — her satır bir VAKA; revizyon geçmişi altında girintili */}
        {items.map(o => (
          <View key={o.id}>
            <Pressable
              onPress={() => onOpenOrder(o.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingHorizontal: 16, paddingVertical: 11,
                borderTopWidth: 1, borderTopColor: T.hairline,
                backgroundColor: o.overdue ? 'rgba(217,75,75,0.06)' : 'transparent',
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: `${accent}1F`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: accentDark }}>{o.initials}</Text>
              </View>
              {/* Dar ekranda ad, sipariş no, rozet ve durum çipi tek satırda
                  yarışınca hep ad kırpılıyordu ("Dr. Ayl…"). Ada kendi satırı
                  verildi; kimlik taşımayan alanlar (no, rozet, tarih) alta indi. */}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.ink, flex: 1, minWidth: 0, letterSpacing: -0.1 }} numberOfLines={1}>
                    {o.title}
                  </Text>
                  <View style={{ maxWidth: '46%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: o.statusBg, flexShrink: 0 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: o.statusColor, textAlign: 'center' }} numberOfLines={2}>
                      {o.statusLabel}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: T.ink2 }} numberOfLines={1}>{o.workType}</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Text style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono, flexShrink: 1 }} numberOfLines={1}>
                    #{o.no}
                  </Text>
                  {o.isRevision && <RevisionTag />}
                  {o.isContinuation && <ContinuationTag />}
                  <View style={{ flex: 1 }} />
                  {!!o.delivery && (
                    <Text style={{ fontSize: 10.5, fontWeight: o.overdue ? '700' : '500', color: o.overdue ? T.ruby : T.ink3, flexShrink: 0 }}>
                      {o.delivery}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>

            {/* Geçmiş üyeler — girintili alt liste. Avatar tekrarlanmaz;
                aynı hastanın aynı vakası olduğu zaten üstteki satırda belli. */}
            {(o.history ?? []).map(h => (
              <Pressable
                key={h.id}
                onPress={() => onOpenOrder(h.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingLeft: 34, paddingRight: 16, paddingVertical: 9,
                  borderTopWidth: 1, borderTopColor: T.hairline,
                  backgroundColor: `${accent}0A`,
                }}
              >
                <CornerDownRight size={13} color={T.ink3} strokeWidth={2} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 11.5, color: T.ink2, fontFamily: T.mono }} numberOfLines={1}>#{h.no}</Text>
                </View>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7, backgroundColor: h.statusBg }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: h.statusColor }} numberOfLines={1}>{h.statusLabel}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
