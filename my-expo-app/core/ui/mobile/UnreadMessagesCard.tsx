// Dashboard "Mesajlar" kartı — okunmamış mesajları öne çıkarır.
// Panel-agnostik: accent prop'u ile her panel kendi rengini verir (belirgin ama sade).
// Veriyi useOrderChatInbox'tan çeker (realtime); mesaj yoksa hiç render etmez.
import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { MessageCircle, ChevronRight, ChevronLeft } from '../icons';
import { isRTL } from '../../i18n';
import { autoT } from '../../i18n/autoTranslate';
import { useMobileTokens } from '../../theme/mobileDesignTokens';
import { useThemeModeStore } from '../../store/themeModeStore';
import { lightenForDark } from '../HeroGlow';
import { useOrderChatInbox } from '../../../modules/orders/hooks/useOrderChatInbox';

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return autoT('şimdi');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${autoT('dk')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${autoT('sa')}`;
  return `${Math.floor(diff / 86400)} ${autoT('g')}`;
}

/** Accent'i siyaha doğru karıştırır. Başlık metni için şart: lab safranı (#F5C24B)
 *  gibi açık accent'ler soft tint zemininde ham haliyle okunmuyor. */
function deepen(hex: string, ratio = 0.42): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const mix = (v: number) => Math.round(v * (1 - ratio));
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UnreadMessagesCard({
  accent,
  art,
  onOpenOrder,
  onOpenInbox,
  showClinicLogo = false,
}: {
  accent: string;
  /**
   * Opsiyonel 3D başlık görseli (require'lanmış PNG). Verilirse Lucide balon
   * ikonunun yerine geçer — admin mobil özet sayfasındaki 3D kart diliyle uyum.
   * Verilmezse kart bugünkü hâlini birebir korur (lab/klinik/hekim etkilenmez).
   */
  art?: any;
  onOpenOrder?: (workOrderId: string) => void;
  onOpenInbox?: () => void;
  /** Lab/admin tarafında avatar yerine kliniğin logosu gösterilir (karşı taraf klinik).
   *  Klinik/hekim panelinde anlamsız olurdu — kendi logolarını görürlerdi. */
  showClinicLogo?: boolean;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const rtl = isRTL();
  // Kart başlığındaki chevron yön bildirir → RTL'de aynalanır
  const Chevron = rtl ? ChevronLeft : ChevronRight;
  const { items, totalUnread } = useOrderChatInbox();

  if (!items || items.length === 0) return null;

  // Okunmamışı olanlar önce, sonra en yeni mesaja göre — ilk 3'ü göster
  const sorted = [...items].sort((a, b) => {
    const ua = a.unread_for_me > 0 ? 1 : 0;
    const ub = b.unread_for_me > 0 ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return (b.last_created_at ?? '').localeCompare(a.last_created_at ?? '');
  });
  const top = sorted.slice(0, 3);
  const tint = `${accent}1A`;
  // Okunmuş satırlarda da accent görünsün diye avatar zemini nötr bej yerine
  // accent'in çok açık tonu. Metin ink kalır: lab safranı gibi açık accent'lerde
  // accent-renkli metin okunmuyordu.
  const avatarIdle = `${accent}1F`;
  // Başlık şeridi: yumuşak accent zemin + koyulaştırılmış accent metin.
  // Dolu accent + beyaz metin denenmedi çünkü lab safranında kontrast düşük kalıyor.
  const headerBg  = `${accent}14`;
  // Koyu temada koyulaştırılmış accent (deepen) koyu şerit üstünde okunmuyordu.
  // "Son Siparişler" kartıyla BİREBİR aynı hesap: koyuda açılmış accent.
  const headerInk = isDark ? lightenForDark(accent, 0.42) : deepen(accent);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <View style={{ borderRadius: 22, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        {/* Başlık */}
        <Pressable
          onPress={onOpenInbox}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
            backgroundColor: headerBg,
          }}
        >
          {art ? (
            <Image source={art} resizeMode="contain" style={{ width: 34, height: 29 }} />
          ) : (
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={16} color={accent} strokeWidth={2.2} />
            </View>
          )}
          <Text style={{ fontSize: 13, fontWeight: '700', color: headerInk, letterSpacing: 0.2 }}>{autoT('Mesajlar')}</Text>
          {totalUnread > 0 && (
            <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Chevron size={18} color={headerInk} strokeWidth={2} />
        </Pressable>

        {/* Konuşmalar */}
        {top.map((it, i) => {
          const title = it.patient_name || it.order_number || autoT('Sipariş');
          const unread = it.unread_for_me > 0;
          // Eski localStorage cache'inde clinic_logo alanı yok → undefined → baş harf
          const logo = showClinicLogo ? (it.clinic_logo || null) : null;
          return (
            <Pressable
              key={it.work_order_id}
              onPress={() => onOpenOrder?.(it.work_order_id)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingHorizontal: 16, paddingVertical: 11,
                borderTopWidth: 1, borderTopColor: T.hairline,
                backgroundColor: unread ? tint : 'transparent',
              }}
            >
              <View style={{
                width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
                backgroundColor: logo ? '#FFFFFF' : (unread ? accent : avatarIdle),
                borderWidth: logo ? 1 : 0, borderColor: T.hairline,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {logo ? (
                  // Logo genelde kare/yatay ve beyaz zeminli → 'contain' ile kırpmadan sığdır
                  <Image source={{ uri: logo }} style={{ width: '82%', height: '82%' }} resizeMode="contain" />
                ) : (
                  /* Baş harfler BAŞLIKTAN (hasta/sipariş) türetilir; daha önce
                     last_sender_name kullanılıyordu ve tüm satırlar aynı gönderici
                     yüzünden "AE, AE, AE" görünüyordu — isimle avatar uyuşmuyordu. */
                  <Text style={{ fontSize: 12, fontWeight: '700', color: unread ? '#FFFFFF' : T.ink2 }}>{initials(title)}</Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {/* Hasta adı / sipariş no Latin olabilir → dir="auto" LTR seçer; RTL'de sabitle */}
                  <Text style={{ fontSize: 13, fontWeight: unread ? '700' : '600', color: T.ink, flex: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{title}</Text>
                  <Text style={{ fontSize: 10.5, color: T.ink3 }}>{relTime(it.last_created_at)}</Text>
                </View>
                <Text style={{ fontSize: 12, color: unread ? T.ink2 : T.ink3, marginTop: 1 }} numberOfLines={1}>
                  {it.last_attachment_type ? `📎 ${autoT('Ek')}` : (it.last_content || '—')}
                </Text>
              </View>
              {unread && (
                <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{it.unread_for_me}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
