/**
 * NotificationsSection — Bildirim ayarları (Patterns Design Language).
 *
 * Çalışır durumda:
 *   • Store: `useNotificationPrefs` (Zustand)
 *   • DB: profiles.notification_prefs (JSONB) — toggle anında upsert
 *   • Cache: localStorage (instant render + offline fallback)
 *   • Browser Push: Notification API — kullanıcı izin verirse aktif
 *
 * Yapı:
 *   1. Hero: Master switch + özet
 *   2. Kanal Tercihleri: Uygulama / Tarayıcı / E-posta (global)
 *   3. Kategori Listesi: her bildirim tipi × 3 kanal
 *   4. Test gönderici
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions, TextInput } from 'react-native';
import {
  ClipboardList, RefreshCw, MessageCircle, CheckCircle,
  CreditCard, Package, Truck, Camera, Wrench,
  Mail, Smartphone, Bell, BellOff, Volume2, AlertTriangle,
  Shield, Check, X, AlarmClock, ClipboardCheck, PenLine,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { toE164 } from '../../../core/utils/format';
import {
  useNotificationPrefs,
  requestBrowserPushPermission,
  showBrowserPush,
  type NotificationCategory,
  type NotificationChannel,
} from '../../../core/store/notificationPrefsStore';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { getWebPushState, unsubscribeWebPush } from '../../../core/notifications/webPush';
import { registerForNativePush, unregisterNativePush, getNativePushState } from '../../../core/notifications/nativePush';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { WhatsAppGlyph } from '../../../core/ui/WhatsAppGlyph';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

interface Props {
  panelType: string;
  accentColor: string;
}

// Bildirim kategorileri — gruplu (rol bazlı filtreleme aşağıda)
const ALL_GROUPS: {
  title: string;
  items: { key: NotificationCategory; icon: any; label: string; sub: string }[];
}[] = [
  {
    title: 'Operasyon',
    items: [
      { key: 'new_order',    icon: ClipboardList, label: 'Yeni Sipariş',         sub: 'Yeni iş emri geldiğinde' },
      { key: 'order_status', icon: RefreshCw,     label: 'Sipariş Durumu',       sub: 'Aşama veya statü değiştiğinde' },
      { key: 'order_watch',  icon: AlarmClock,    label: 'Günlük İş Takibi',     sub: 'Her gün geciken + beklemedeki işler' },
      { key: 'stock_count',  icon: ClipboardCheck, label: 'Stok Sayımı',          sub: 'Sayım zamanı geldiğinde / taslak yarım kaldığında' },
      { key: 'stage_critical', icon: CheckCircle,  label: 'Kritik Aşama',         sub: 'Kritik bir aşama tamamlandığında' },
      { key: 'paper_order',  icon: Camera,        label: 'Kağıt Inbox',          sub: 'OCR sonrası bekleyen sipariş' },
      { key: 'approval',     icon: CheckCircle,   label: 'Onay Bekleyenler',     sub: 'Tasarım/üretim onayı gerektiğinde' },
      { key: 'delivery',     icon: Truck,         label: 'Teslimat & Kurye',     sub: 'Kurye atama/teslim olayları' },
      { key: 'implant_parts', icon: Package,      label: 'İmplant Parçaları',    sub: 'Scan body, dijital analog … talep ve teslim' },
      { key: 'scan_annotation', icon: PenLine,    label: 'Tarama Notları',       sub: '3D tarama üzerine çizim/not eklendiğinde' },
    ],
  },
  {
    title: 'İletişim',
    items: [
      { key: 'chat', icon: MessageCircle, label: 'Mesajlar', sub: 'Yeni mesaj geldiğinde' },
    ],
  },
  {
    title: 'Finans & Stok',
    items: [
      { key: 'payment',          icon: CreditCard, label: 'Ödeme & Fatura',     sub: 'Tahsilat, fatura, vade uyarıları' },
      { key: 'stock',            icon: Package,    label: 'Stok Uyarıları',     sub: 'Kritik seviye / tükenme' },
      { key: 'material_request', icon: Wrench,     label: 'Malzeme Talepleri',  sub: 'Sarf/alet talebi, onay süreci' },
    ],
  },
];

// Rol bazlı kategori filtresi:
//   clinic_admin / doctor → klinik dışı kategoriler gizlenir
//   teknisyen             → kendisini ilgilendirmeyen finans/operasyon gizlenir
//   manager / admin       → hepsi görünür
function getGroupsForRole(userType?: string | null, role?: string | null) {
  const isClient     = userType === 'clinic_admin' || userType === 'doctor';
  const isTechnician = userType === 'lab' && (role === 'technician' || role === 'courier');

  // Klinik tarafına gizlenecek kategoriler
  const hideForClient = new Set<NotificationCategory>([
    'paper_order',       // OCR sipariş inbox — lab içi
    'stock',             // stok seviyesi — lab içi
    'stock_count',       // stok sayımı hatırlatma — lab içi
    'material_request',  // sarf/alet talebi — lab içi
    'order_watch',       // günlük geciken/beklemede digest — yalnız admin/lab-manager
  ]);

  // Teknisyen için gereksiz kategoriler — finans/yönetim odaklı olanlar
  const hideForTechnician = new Set<NotificationCategory>([
    'new_order',     // Yeni sipariş kabul — yönetici/lab admin işi
    'paper_order',   // OCR inbox — yönetici/admin
    'approval',      // Tasarım/üretim onayı — yönetici işi
    'payment',       // Ödeme/fatura — finans
    'stock',         // Stok kritik seviye — depo/yönetici
    'delivery',      // Kurye/teslimat — operasyon
    'order_watch',   // günlük geciken/beklemede digest — yönetici işi
    'stage_critical',// kritik aşama bildirimi — teknisyene gerekmez
  ]);

  let hide: Set<NotificationCategory> | null = null;
  if (isClient)          hide = hideForClient;
  else if (isTechnician) hide = hideForTechnician;
  if (!hide)             return ALL_GROUPS;

  return ALL_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => !hide!.has(it.key)) }))
    .filter(g => g.items.length > 0);
}

const CHANNEL_META: { key: NotificationChannel; label: string; sub: string; icon: any }[] = [
  { key: 'in_app',       label: 'Uygulama',       sub: 'Uygulama içi bildirim merkezi', icon: Smartphone },
  // 'browser_push' kanalı hem web push hem native push için ortak kullanılır.
  // Platform'a göre label dinamik olarak değiştirilir.
  { key: 'browser_push', label: Platform.OS === 'web' ? 'Tarayıcı Push' : 'Cihaz Bildirimleri',
    sub: Platform.OS === 'web' ? 'Sekme dışıyken masaüstü bildirimi' : 'iOS / Android push notification',
    icon: Bell },
  { key: 'email',        label: 'E-posta',         sub: 'Hesabınızın e-posta adresine gönderilir', icon: Mail },
  { key: 'whatsapp',     label: 'WhatsApp',        sub: 'WhatsApp numaranıza mesaj olarak gönderilir', icon: WhatsAppGlyph },
];

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

const THUMB_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});

function Toggle({ on, disabled, onPress, accentColor }: { on: boolean; disabled?: boolean; onPress: () => void; accentColor: string }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: on ? accentColor : (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'),
        padding: 2, justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } as any : {}),
      }}
    >
      <View
        style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF',
          alignSelf: on ? 'flex-end' : 'flex-start',
          ...THUMB_SHADOW,
        }}
      />
    </Pressable>
  );
}

function getBrowserPermission(): NotificationPermission | 'unsupported' {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export function NotificationsSection({ accentColor }: Props) {
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 560;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const inkPrimary  = T.ink;
  const inkMuted    = T.ink3;
  const surface     = T.card;
  const surfaceSoft = T.cardSoft;
  const hairline    = T.hairline;
  // Mobile: Uyg/Push/E-posta gösterilir, WhatsApp desktop'a kalır; kolon genişliği düşürülür
  const VISIBLE_CHANNELS = isNarrow
    ? (['in_app','browser_push','email'] as const)
    : (['in_app','browser_push','email','whatsapp'] as const);
  const COL_W = isNarrow ? 42 : 56;
  const ICON_GUTTER = isNarrow ? 36 : 48;
  const prefs = useNotificationPrefs(s => s.prefs);
  const setMaster = useNotificationPrefs(s => s.setMaster);
  const setChannel = useNotificationPrefs(s => s.setChannel);
  const setCategoryChannel = useNotificationPrefs(s => s.setCategoryChannel);
  const setCategoriesBulk  = useNotificationPrefs(s => s.setCategoriesBulk);

  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(getBrowserPermission());
  const [savingMaster, setSavingMaster] = useState(false);
  const [webPushSubscribed, setWebPushSubscribed] = useState(false);

  // WhatsApp numarası — profiles.whatsapp_phone (E.164)
  const profileWa = useAuthStore(s => (s.profile as any)?.whatsapp_phone ?? '');
  const setProfile = useAuthStore(s => s.setProfile);
  const [waPhone, setWaPhone] = useState<string>(profileWa);
  const [waSaving, setWaSaving] = useState(false);
  React.useEffect(() => { setWaPhone(profileWa); }, [profileWa]);

  const userId   = useAuthStore(s => s.profile?.id ?? null);
  const userType = useAuthStore(s => s.profile?.user_type ?? null);
  const userRole = useAuthStore(s => (s.profile as any)?.role ?? null);
  const GROUPS = React.useMemo(() => getGroupsForRole(userType, userRole), [userType, userRole]);

  const waDirty = waPhone.trim() !== (profileWa ?? '').trim();
  const saveWaPhone = async () => {
    if (!userId || waSaving) return;
    const trimmed = waPhone.trim();
    // Boş bırakmak = numarayı kaldır. Doluysa E.164'e otomatik normalize et.
    const val = trimmed ? toE164(trimmed) : null;
    if (trimmed && !val) {
      toast.error('Geçerli bir telefon numarası girin (örn. 0534 264 96 20)');
      return;
    }
    setWaSaving(true);
    const { error } = await supabase.from('profiles').update({ whatsapp_phone: val }).eq('id', userId);
    setWaSaving(false);
    if (error) { toast.error('Kaydedilemedi: ' + error.message); return; }
    if (val) setWaPhone(val);   // input'u düzeltilmiş biçime güncelle
    setProfile({ ...(useAuthStore.getState().profile as any), whatsapp_phone: val });
    toast.success(val ? `WhatsApp numarası kaydedildi: ${val}` : 'WhatsApp numarası kaldırıldı');
  };

  // İlk render'da push subscription state'ini sorgula (web veya native)
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      getWebPushState().then(st => {
        setWebPushSubscribed(st.status === 'subscribed');
        if (st.permission) setBrowserPerm(st.permission);
      });
    } else {
      getNativePushState().then(st => {
        if (st.status === 'granted') setBrowserPerm('granted');
        else if (st.status === 'denied') setBrowserPerm('denied');
      });
    }
  }, []);

  const handleRequestPush = async () => {
    // Native (iOS/Android) — Expo Push token akışı
    if (Platform.OS !== 'web') {
      if (!userId) return;
      const st = await registerForNativePush(userId);
      if (st.status === 'granted') {
        setBrowserPerm('granted');
        await setChannel('browser_push', true);
        toast.success('Push bildirimleri aktif (cihaz tokenı kaydedildi)');
      } else if (st.status === 'denied') {
        setBrowserPerm('denied');
        toast.error('Bildirimler reddedildi — sistem ayarlarından açabilirsin');
      } else if (st.status === 'simulator') {
        toast.error('Simülatörde push çalışmaz — gerçek cihaz gerekli');
      } else {
        toast.error(st.errorMessage ?? 'Push kaydedilemedi');
      }
      return;
    }

    // Web — Service Worker subscription akışı
    const res = await requestBrowserPushPermission(userId);
    setBrowserPerm(res === 'unsupported' ? 'unsupported' : res);
    if (res === 'granted') {
      await setChannel('browser_push', true);
      const st = await getWebPushState();
      setWebPushSubscribed(st.status === 'subscribed');
      toast.success(st.status === 'subscribed'
        ? 'Push aboneliği başarılı (kapalı sekme bildirimi aktif)'
        : 'Tarayıcı bildirimleri açıldı');
    } else if (res === 'denied') {
      toast.error('Bildirimler reddedildi — tarayıcı ayarlarından açabilirsin');
    }
  };

  const handleUnsubscribe = async () => {
    if (Platform.OS !== 'web') {
      if (userId) await unregisterNativePush(userId);
      await setChannel('browser_push', false);
      toast.success('Cihaz push aboneliği iptal edildi');
      return;
    }
    const ok = await unsubscribeWebPush();
    if (ok) {
      setWebPushSubscribed(false);
      await setChannel('browser_push', false);
      toast.success('Push aboneliği iptal edildi');
    }
  };

  const sendTest = async () => {
    if (browserPerm === 'granted') {
      showBrowserPush('Siman', 'Test bildirimi — her şey yolunda!', { tag: 'test-notif' });
    }
    // Gerçek e-posta testi — mevcut kullanıcıya. category:'test' kategori-filtresini
    // atlar (prefs.categories['test'] yok); yalnız email KANALI açıksa gönderir.
    if (!userId) { toast.success('Test bildirimi gönderildi'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('send-email-notification', {
        body: {
          userIds: [userId],
          category: 'test',
          payload: {
            title: 'Siman test bildirimi',
            body:  'Bu bir test e-postasıdır — e-posta bildirimleriniz çalışıyor.',
            actionUrl: '/settings?tab=notifications',
          },
        },
      });
      if (error) { toast.error('Test e-postası gönderilemedi: ' + error.message); return; }
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) toast.success('Test bildirimi + e-posta gönderildi ✓');
      else toast.error('E-posta gönderilmedi — e-posta kanalın kapalı veya adresin yok');
    } catch (e: any) {
      toast.error('Test e-postası hatası: ' + (e?.message ?? String(e)));
    }
  };

  const toggleMaster = async () => {
    setSavingMaster(true);
    await setMaster(!prefs.master_enabled);
    setSavingMaster(false);
  };

  const categoryEnabled = (cat: NotificationCategory, ch: NotificationChannel) =>
    !!prefs.categories?.[cat]?.[ch];

  // Hero özeti: aktif kanal sayısı + gerçekten çalışan kural sayısı.
  // "Kural" = kategori × kanal çifti; kanalın kendisi kapalıysa sayılmaz,
  // çünkü o kural fiilen bildirim üretmiyor.
  const activeChannelCount = CHANNEL_META.filter(c => !!prefs.channels?.[c.key]).length;
  const activeRuleCount = GROUPS.reduce((n, g) => n + g.items.reduce((m, it) =>
    m + CHANNEL_META.filter(ch => !!prefs.channels?.[ch.key] && categoryEnabled(it.key, ch.key)).length, 0), 0);

  /** "Tümünü Aç / Kapat" — tek persist ile (bkz. store.setCategoriesBulk). */
  const toggleGroup = (items: { key: NotificationCategory }[], on: boolean) => {
    setCategoriesBulk(
      items.map(i => i.key),
      CHANNEL_META.filter(ch => (VISIBLE_CHANNELS as readonly string[]).includes(ch.key)).map(ch => ch.key),
      on,
    );
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 0, paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ═════ HERO — Master switch ═════ */}
      <View
        style={{
          backgroundColor: prefs.master_enabled ? `${accentColor}10` : surfaceSoft,
          borderRadius: 20, padding: 20, marginTop: 4,
          borderWidth: 1, borderColor: prefs.master_enabled ? `${accentColor}30` : hairline,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{
            width: 48, height: 48, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: prefs.master_enabled ? accentColor : '#9CA3AF',
          }}>
            {prefs.master_enabled
              ? <Bell size={22} color="#FFFFFF" strokeWidth={1.8} />
              : <BellOff size={22} color="#FFFFFF" strokeWidth={1.8} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: inkPrimary, letterSpacing: -0.2 }}>
              {prefs.master_enabled ? 'Bildirimler açık' : 'Tüm bildirimler kapalı'}
            </Text>
            <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
              {prefs.master_enabled
                ? 'Aşağıdaki tercihlerine göre bildirim alıyorsun.'
                : 'Hiçbir bildirim almıyorsun. Açmak için sağdaki anahtarı kullan.'}
            </Text>
          </View>
          <Toggle on={prefs.master_enabled} onPress={toggleMaster} accentColor={accentColor} disabled={savingMaster} />
        </View>

        {/* Durum özeti — "şu an ne oluyor?" sorusunu tek bakışta yanıtlar.
            Kanal ve kural sayısı aynı kaynaklardan türetilir (aşağıdaki
            listelerle birebir), elle güncellenen bir metin değil. */}
        {prefs.master_enabled && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: `${accentColor}26` }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: surface }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: inkPrimary }}>{activeChannelCount}</Text>
              <Text style={{ fontSize: 11.5, color: T.ink3 }}>kanal aktif</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: surface }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: inkPrimary }}>{activeRuleCount}</Text>
              <Text style={{ fontSize: 11.5, color: T.ink3 }}>bildirim kuralı aktif</Text>
            </View>
          </View>
        )}
      </View>

      {/* ═════ KANAL TERCİHLERİ ═════ */}
      <Text style={{ fontSize: 10, fontWeight: '700', color: T.ink3, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 28, marginBottom: 10 }}>
        Bildirim Kanalları
      </Text>
      <View style={{ backgroundColor: surface, borderRadius: 20, padding: 18, ...CARD_SHADOW }}>
        {CHANNEL_META.map((ch, i) => {
          const isPush = ch.key === 'browser_push';
          const isEmail = ch.key === 'email';
          const on = !!prefs.channels?.[ch.key];
          const disabled = !prefs.master_enabled || (isPush && browserPerm === 'denied');
          const Icon = ch.icon;
          return (
            <React.Fragment key={ch.key}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 10,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: `${accentColor}14`,
                }}>
                  <Icon size={16} color={accentColor} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: inkPrimary }}>{ch.label}</Text>
                    {isPush && browserPerm === 'granted' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(16,185,129,0.12)' }}>
                        <Check size={9} color="#0F6E50" strokeWidth={2.4} />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#0F6E50', letterSpacing: 0.4 }}>İZİN VERİLDİ</Text>
                      </View>
                    )}
                    {isPush && browserPerm === 'denied' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(220,38,38,0.12)' }}>
                        <X size={9} color="#9C2E2E" strokeWidth={2.4} />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#9C2E2E', letterSpacing: 0.4 }}>REDDEDİLDİ</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{ch.sub}</Text>
                </View>
                {isPush && browserPerm !== 'granted' && browserPerm !== 'unsupported' ? (
                  <Pressable
                    onPress={handleRequestPush}
                    style={({ hovered }: any) => ({
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                      backgroundColor: hovered ? accentColor : `${accentColor}E0`,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    })}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>İzin İste</Text>
                  </Pressable>
                ) : (
                  <Toggle
                    on={on}
                    disabled={disabled}
                    onPress={() => setChannel(ch.key, !on)}
                    accentColor={accentColor}
                  />
                )}
              </View>

              {/* WhatsApp numarası kanalın İÇİNDE — ayrı bir kart olarak
                  durduğunda "hangi ayara ait?" bağı kopuyordu. Yakınlık =
                  ilişki: numara, açtığın kanalın hemen altında. */}
              {ch.key === 'whatsapp' && on && (
                <View style={{ marginStart: 48, marginBottom: 12, gap: 8 }}>
                  <Text style={{ fontSize: 11, color: T.ink3 }}>
                    Telefon numarası — uluslararası biçim, örn. +905551112233
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={waPhone}
                      onChangeText={setWaPhone}
                      placeholder="+90..."
                      placeholderTextColor={isDark ? (T.ink3 as string) : "#9CA3AF"}
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                      style={{
                        flex: 1, height: 42, borderRadius: 12, paddingHorizontal: 14,
                        borderWidth: 1, borderColor: hairline, backgroundColor: surfaceSoft,
                        fontSize: 14, color: inkPrimary,
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                      }}
                    />
                    <Pressable
                      onPress={saveWaPhone}
                      disabled={!waDirty || waSaving}
                      style={({ pressed }: any) => ({
                        height: 42, paddingHorizontal: 18, borderRadius: 12,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: (!waDirty || waSaving) ? `${accentColor}55` : accentColor,
                        opacity: pressed ? 0.85 : 1,
                        ...(Platform.OS === 'web' ? { cursor: (!waDirty || waSaving) ? 'not-allowed' : 'pointer' } as any : {}),
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{waSaving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {i < CHANNEL_META.length - 1 && (
                <View style={{ height: 1, backgroundColor: hairline, marginStart: 48 }} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* ═════ KATEGORİ TERCİHLERİ ═════ */}
      {GROUPS.map(group => (
        <React.Fragment key={group.title}>
          {/* Grup başlığı + toplu işlemler. Çok sayıda anahtar tek tek
              çevrilmek zorunda kalmasın diye. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 26, marginBottom: 10, gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: T.ink3, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {group.title}
            </Text>
            <Pressable
              onPress={() => toggleGroup(group.items, true)}
              disabled={!prefs.master_enabled}
              style={({ pressed }: any) => ({
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                opacity: !prefs.master_enabled ? 0.4 : pressed ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: prefs.master_enabled ? 'pointer' : 'not-allowed' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor }}>Tümünü aç</Text>
            </Pressable>
            <Pressable
              onPress={() => toggleGroup(group.items, false)}
              disabled={!prefs.master_enabled}
              style={({ pressed }: any) => ({
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                opacity: !prefs.master_enabled ? 0.4 : pressed ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: prefs.master_enabled ? 'pointer' : 'not-allowed' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3 }}>Tümünü kapat</Text>
            </Pressable>
          </View>
          <View style={{ backgroundColor: surface, borderRadius: 20, padding: isNarrow ? 12 : 18, ...CARD_SHADOW }}>
            {/* Kolon başlıkları */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingStart: ICON_GUTTER, paddingBottom: 6 }}>
              <View style={{ flex: 1 }} />
              {CHANNEL_META.filter(ch => (VISIBLE_CHANNELS as readonly string[]).includes(ch.key)).map(ch => (
                /* "UYG / PUSH / E-PST / WAPP" kısaltmaları okunmuyordu —
                   kanalın kendi ikonu zaten yukarıdaki kanal listesinde
                   öğrenildi, burada onu tekrarlamak yeter. */
                <View key={ch.key} style={{ width: COL_W, alignItems: 'center' }} accessibilityLabel={ch.label}>
                  <ch.icon size={14} color={isDark ? (T.ink3 as string) : "#94A3B8"} strokeWidth={1.9} />
                </View>
              ))}
            </View>
            <View style={{ height: 1, backgroundColor: hairline, marginBottom: 4 }} />

            {group.items.map((item, idx) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.key}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: isNarrow ? 8 : 12, paddingVertical: 14 }}>
                    <View style={{
                      width: isNarrow ? 28 : 36, height: isNarrow ? 28 : 36, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: `${accentColor}10`,
                    }}>
                      <Icon size={isNarrow ? 14 : 16} color={accentColor} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '600', color: inkPrimary }} numberOfLines={1}>{item.label}</Text>
                      <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }} numberOfLines={isNarrow ? 2 : undefined}>{item.sub}</Text>
                    </View>
                    {CHANNEL_META.filter(ch => (VISIBLE_CHANNELS as readonly string[]).includes(ch.key)).map(ch => {
                      const on = categoryEnabled(item.key, ch.key);
                      const globalChannelOn = !!prefs.channels?.[ch.key];
                      const disabled = !prefs.master_enabled
                                    || !globalChannelOn
                                    || (ch.key === 'browser_push' && browserPerm !== 'granted');
                      return (
                        <View key={ch.key} style={{ width: COL_W, alignItems: 'center' }}>
                          <Toggle
                            on={on && globalChannelOn && prefs.master_enabled && !(ch.key === 'browser_push' && browserPerm !== 'granted')}
                            disabled={disabled}
                            onPress={() => setCategoryChannel(item.key, ch.key, !on)}
                            accentColor={accentColor}
                          />
                        </View>
                      );
                    })}
                  </View>
                  {idx < group.items.length - 1 && (
                    <View style={{ height: 1, backgroundColor: hairline, marginStart: ICON_GUTTER }} />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </React.Fragment>
      ))}

      {/* ═════ TEST + bilgi ═════ */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
        <Pressable
          onPress={sendTest}
          disabled={!prefs.master_enabled}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999,
            backgroundColor: hovered ? '#0A0A0A' : '#1F2937',
            opacity: prefs.master_enabled ? 1 : 0.5,
            ...(Platform.OS === 'web' ? { cursor: prefs.master_enabled ? 'pointer' : 'not-allowed' } as any : {}),
          })}
        >
          <Volume2 size={13} color="#FFFFFF" strokeWidth={1.8} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>Test bildirimi gönder</Text>
        </Pressable>
      </View>

      {/* Info banner */}
      <View
        style={{
          flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, marginTop: 16,
          backgroundColor: '#FFFBEB',
          borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
          alignItems: 'flex-start',
        }}
      >
        <Shield size={14} color="#D97706" strokeWidth={1.8} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 }}>
          E-posta bildirimleri hesabının e-posta adresine gönderilir; kanalı açıp istediğin kategorileri seçebilirsin. Tarayıcı push için bildirim izni gerekir;
          izin verirsen sekme arka planda olsa bile masaüstü bildirimi alırsın. WhatsApp bildirimleri için
          kanalı açıp WhatsApp numaranı kaydetmelisin. Tüm tercihler kullanıcı profiline kaydedilir.
        </Text>
      </View>
    </ScrollView>
  );
}
