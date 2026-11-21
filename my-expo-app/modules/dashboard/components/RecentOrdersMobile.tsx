// RecentOrdersMobile — mobil ana ekranlar için "Son Siparişler" kart listesi.
// Desktop tablonun mobile-uygun karşılığı; 4 panelde (lab/admin/klinik/hekim) paylaşılır.
// Durum etiketi/rengi çağıran panelde (STATUS_CFG) çözülür; bu bileşen yalnız sunum.
import { LogoImage, DefaultLogo } from '../../../core/ui/LogoImage';
import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { ClipboardList, ChevronRight, ChevronLeft, CornerDownRight, CornerDownLeft } from '../../../core/ui/icons';
import { isRTL, localeTag } from '../../../core/i18n';
import { daysBetween } from '../../orders/holdDates';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { lightenForDark } from '../../../core/ui/HeroGlow';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';

// Tüm sipariş statülerini + duraklatmayı kapsayan çözümleyici (dashboard muted paleti).
// Lokal STATUS_CFG yalnız 5 statü içerdiği için asamada/kurye_bekleniyor/on_hold gibi
// durumlar ham/yanlış görünüyordu; kartlar bunu kullanmalı.
export function resolveOrderStatus(status?: string | null, holdStatus?: string | null, holdCategory?: string | null): { label: string; color: string; bg: string } {
  // NOT: etiketler sabit sözlük (veri) — JSX değil, bu yüzden autoT() ile çevrilir.
  // Prova beklemesi "Provada" (2. dalga 4), diğer beklemeler "Duraklatıldı".
  if (holdStatus === 'on_hold') return { label: autoT(holdCategory === 'client_prova' ? 'Provada' : 'Duraklatıldı'), color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' };
  const GRAY  = { color: '#6B6B6B', bg: 'rgba(0,0,0,0.05)' };
  const AMBER = { color: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' };
  const BLUE  = { color: '#1F5689', bg: 'rgba(74,143,201,0.12)' };
  const GREEN = { color: '#1F6B47', bg: 'rgba(45,154,107,0.12)' };
  const RED   = { color: '#9C2E2E', bg: 'rgba(217,75,75,0.10)' };
  const M: Record<string, { label: string; color: string; bg: string }> = {
    atama_bekleniyor:         { label: autoT('Atama Bekliyor'), ...GRAY },
    kutu_atandi:              { label: autoT('Kutu Atandı'),    ...GRAY },
    tasarim_onayi_bekleniyor: { label: autoT('Tasarım Onayı'),  ...BLUE },
    onay_bekliyor:            { label: autoT('Onay Bekliyor'),  ...AMBER },
    alindi:                   { label: autoT('Alındı'),         ...GRAY },
    asamada:                  { label: autoT('Üretimde'),       ...AMBER },
    uretimde:                 { label: autoT('Üretimde'),       ...AMBER },
    kalite_kontrol:           { label: autoT('Kalite Kontrol'), ...BLUE },
    teslimata_hazir:          { label: autoT('Teslime Hazır'),      ...GREEN },
    kurye_bekleniyor:         { label: autoT('Kurye Bekleniyor'), ...GREEN },
    kuryede:                  { label: autoT('Kuryede'),        ...GREEN },
    teslim_edildi:            { label: autoT('Teslim Edildi'),  ...GRAY },
    iptal:                    { label: autoT('İptal'),          ...RED },
  };
  return M[status ?? ''] ?? { label: status ?? '—', ...GRAY };
}

/**
 * `rich` satır düzeninin ek alanları — her panelin satır kurucusu aynı hesabı kullansın diye tek yerde.
 * `today` laboratuvar gününün 'YYYY-MM-DD' hâli.
 */
export function richOrderFields(
  o: { status?: string | null; delivery_date?: string | null },
  today: string,
  isOverdue: boolean,
): { progress: number; deliveryShort: string; deliveryNote: string } {
  const progress = ({ alindi: 1, asamada: 2, uretimde: 2, kalite_kontrol: 3, teslimata_hazir: 4, kurye_bekleniyor: 4, kuryede: 4, teslim_edildi: 4 } as Record<string, number>)[String(o.status)] ?? 0;
  const deliveryShort = o.delivery_date
    ? new Intl.DateTimeFormat(localeTag(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${o.delivery_date}T12:00:00Z`))
    : '';
  let deliveryNote = '';
  if (o.delivery_date && o.status !== 'teslim_edildi' && o.status !== 'iptal') {
    const left = daysBetween(today, o.delivery_date);
    if (isOverdue && left < 0) deliveryNote = `${-left} ${autoT('gün gecikti')}`;
    else if (left === 0) deliveryNote = autoT('Bugün teslim');
    else if (left > 0) deliveryNote = `${left} ${autoT('gün kaldı')}`;
  }
  return { progress, deliveryShort, deliveryNote };
}

export interface RecentOrderItem {
  id: string;          // db id (navigasyon)
  no: string;          // order_number
  title: string;       // birincil satır (hasta adı)
  subtitle?: string;   // ikincil satır (hekim adı) — verilirse title'ın altında
  initials: string;    // avatar baş harfleri (logo yoksa geri dönüş)
  /** Siparişin geldiği kliniğin logosu — varsa baş harfler yerine logo gösterilir. */
  clinicLogoUrl?: string | null;
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
  /** `rich` düzen: üretim akışındaki konum, 0–4 (Alındı 1 · Üretimde 2 · KK 3 · Hazır/yolda/teslim 4) */
  progress?: number;
  /** `rich` düzen: tarihin yanındaki not — "6 gün kaldı", "Bugün teslim", "2 gün gecikti" */
  deliveryNote?: string;
  /** `rich` düzen: kısa tarih ("20 Kas"); yoksa `delivery` kullanılır */
  deliveryShort?: string;
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
  items, accent, accentDark, heading, onOpenOrder, onAllOrders, art, rich,
}: {
  items: RecentOrderItem[];
  accent: string;
  accentDark: string;
  heading?: string;
  /**
   * Opsiyonel 3D başlık görseli (require'lanmış PNG). Verilirse Lucide pano
   * ikonunun yerine geçer — admin mobil özetteki 3D kart diliyle uyum.
   * Verilmezse kart bugünkü hâlini korur (lab/klinik/hekim etkilenmez).
   */
  art?: any;
  /**
   * Dolu satır düzeni (admin mobil Özet, 2026-11-14): sade başlık + "Tümünü gör",
   * iş tipi · hekim tek satır, dört parçalı aşama çubuğu, "20 Kas · 6 gün kaldı",
   * geciken işte kırmızı "N gün gecikti" rozeti. Verilmezse kart eski hâlindedir
   * (lab/klinik/hekim etkilenmez).
   */
  rich?: boolean;
  onOpenOrder: (id: string) => void;
  onAllOrders?: () => void;
}) {
  const T = useMobileTokens();
  const rtl = isRTL();
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  const CornerIcon = rtl ? CornerDownLeft : CornerDownRight;
  const headingText = heading ?? autoT('Son Siparişler');
  // accentDark (zümrütün DERİN tonu) koyu kartta neredeyse görünmezdi —
  // koyu temada accent'in AÇIK karşılığına çevir (başlık + chevron + baş harfler).
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const accentReadable = isDark ? lightenForDark(accent, 0.42) : accentDark;
  if (!items.length) return null;

  // Mesajlar kartıyla aynı dil: tek kapsayıcı kart + renkli başlık şeridi +
  // hairline ile ayrılmış satırlar (satır başına ayrı kart YOK).
  const headerBg = `${accent}14`;
  const overdueCount = items.filter(o => o.overdue).length;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ borderRadius: 22, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        {rich ? (
          <Pressable
            onPress={onAllOrders}
            accessibilityRole={onAllOrders ? 'button' : undefined}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: T.ink }}>{headingText}</Text>
            {overdueCount > 0 && (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: T.ruby, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{overdueCount}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {!!onAllOrders && <Text style={{ fontSize: 13, fontWeight: '500', color: accentReadable }}>{autoT('Tümünü gör')}</Text>}
          </Pressable>
        ) : (
          <Pressable
            onPress={onAllOrders}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
              backgroundColor: headerBg,
            }}
          >
            {art ? (
              <Image source={art} resizeMode="contain" style={{ width: 32, height: 30 }} />
            ) : (
              <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' }}>
                <ClipboardList size={16} color={accent} strokeWidth={2.2} />
              </View>
            )}
            <Text style={{ fontSize: 13, fontWeight: '700', color: accentReadable, letterSpacing: 0.2 }}>{headingText}</Text>
            {/* Geciken varsa kırmızı rozet — mesajlardaki okunmamış rozetinin karşılığı */}
            {overdueCount > 0 && (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: T.ruby, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{overdueCount}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {!!onAllOrders && <Chevron size={18} color={accentReadable} strokeWidth={2} />}
          </Pressable>
        )}

        {/* Satırlar — her satır bir VAKA; revizyon geçmişi altında girintili */}
        {items.map(o => (
          <View key={o.id}>
            {rich ? (
            <Pressable
              onPress={() => onOpenOrder(o.id)}
              style={{
                flexDirection: 'row', gap: 12,
                paddingHorizontal: 16, paddingVertical: 12,
                borderTopWidth: 1, borderTopColor: T.hairline,
              }}
            >
              {/* Klinik logosu (yoksa baş harfler) */}
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: o.clinicLogoUrl ? '#FFFFFF' : `${accent}1F`,
                ...(o.clinicLogoUrl ? { borderWidth: 1, borderColor: T.hairline } : {}),
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {o.clinicLogoUrl
                  ? <LogoImage uri={o.clinicLogoUrl} style={{ width: 38, height: 38 }} />
                  : <DefaultLogo size={19} color={accentReadable} />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: T.ink, flex: 1, minWidth: 0, letterSpacing: -0.1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                    {o.title}
                  </Text>
                  {/* Geciken işte durum yerine gecikme yazar — karar verdiren bilgi o */}
                  <View style={{ maxWidth: '50%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: o.overdue ? 'rgba(217,75,75,0.12)' : o.statusBg, flexShrink: 0 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: o.overdue ? T.ruby : o.statusColor }} numberOfLines={1}>
                      {o.overdue && o.deliveryNote ? o.deliveryNote : o.statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 13, color: T.ink2, marginTop: 2, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                  {[o.workType, o.subtitle].filter(Boolean).join(' · ')}
                </Text>
                {typeof o.progress === 'number' ? (
                  <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }}>
                    {[1, 2, 3, 4].map(n => (
                      <View key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: n <= (o.progress ?? 0) ? (o.overdue ? T.ruby : accentReadable) : T.hairline }} />
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 7 }}>
                  <Text style={{ fontSize: 12, color: T.ink3, fontFamily: T.mono, flexShrink: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                    #{o.no}
                  </Text>
                  {o.isRevision && <RevisionTag />}
                  {o.isContinuation && <ContinuationTag />}
                  <View style={{ flex: 1 }} />
                  {!!(o.deliveryShort || o.delivery) && (
                    <Text style={{ fontSize: 12, fontWeight: o.overdue ? '600' : '400', color: o.overdue ? T.ruby : T.ink3, flexShrink: 0 }} numberOfLines={1}>
                      {[o.deliveryShort || o.delivery, o.overdue ? null : o.deliveryNote].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
            ) : (
            <Pressable
              onPress={() => onOpenOrder(o.id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingHorizontal: 16, paddingVertical: 11,
                borderTopWidth: 1, borderTopColor: T.hairline,
                backgroundColor: o.overdue ? 'rgba(217,75,75,0.06)' : 'transparent',
              }}
            >
              {/* Klinik logosu varsa onu göster; yoksa baş harflere düş.
                  (Kliniklerin bir kısmında logo_url boş.) */}
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: o.clinicLogoUrl ? (isDark ? T.cardSoft : '#FFFFFF') : `${accent}1F`,
                ...(o.clinicLogoUrl ? { borderWidth: 1, borderColor: T.hairline } : {}),
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {o.clinicLogoUrl
                  ? <Image source={{ uri: o.clinicLogoUrl }} style={{ width: 36, height: 36 }} resizeMode="contain" />
                  : <Text style={{ fontSize: 12, fontWeight: '700', color: accentReadable }}>{o.initials}</Text>}
              </View>
              {/* Dar ekranda ad, sipariş no, rozet ve durum çipi tek satırda
                  yarışınca hep ad kırpılıyordu ("Dr. Ayl…"). Ada kendi satırı
                  verildi; kimlik taşımayan alanlar (no, rozet, tarih) alta indi. */}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                  {/* Hasta/hekim adı Latin olabilir → RNW dir="auto" LTR seçer; RTL'de hizayı sabitle */}
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.ink, flex: 1, minWidth: 0, letterSpacing: -0.1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
                    {o.title}
                  </Text>
                  <View style={{ maxWidth: '46%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: o.statusBg, flexShrink: 0 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: o.statusColor, textAlign: 'center' }} numberOfLines={2}>
                      {o.statusLabel}
                    </Text>
                  </View>
                </View>

                {/* Hiyerarşi: Hasta (üstte) → VAKA (ikinci) → Hekim/klinik (üçüncü) */}
                <Text style={{ fontSize: 12, color: T.ink2 }} numberOfLines={1}>{o.workType}</Text>

                {o.subtitle ? (
                  <Text style={{ fontSize: 11.5, color: T.ink3, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{o.subtitle}</Text>
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Text style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono, flexShrink: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
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
            )}

            {/* Geçmiş üyeler — girintili alt liste. Avatar tekrarlanmaz;
                aynı hastanın aynı vakası olduğu zaten üstteki satırda belli. */}
            {(o.history ?? []).map(h => (
              <Pressable
                key={h.id}
                onPress={() => onOpenOrder(h.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingStart: 34, paddingEnd: 16, paddingVertical: 9,
                  borderTopWidth: 1, borderTopColor: T.hairline,
                  backgroundColor: `${accent}0A`,
                }}
              >
                <CornerIcon size={13} color={T.ink3} strokeWidth={2} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Tam genişlik Text + Latin sipariş no → dir="auto" LTR yapar; RTL'de sabitle */}
                  <Text style={{ fontSize: 11.5, color: T.ink2, fontFamily: T.mono, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>#{h.no}</Text>
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
