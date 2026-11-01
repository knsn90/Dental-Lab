/**
 * Telefon Talepleri — yapay zekâ telefon asistanının görüşme sonu kayıtları.
 *
 * Modül: 'phone_assistant' (platform panelinden lab bazında açılır/kapanır).
 * Erişim: lab admin + lab müdürü. Sunucu da kontrol eder (RLS + set_phone_lead_status).
 * Derin link: ?id=<lead> → detay açılır (bildirim / e-posta butonu /phone-leads/<id> üzerinden gelir).
 *
 * Düzen: "beyaz hero" (bekleyen sayısı + geri arama bağlamı + durum sekmeleri)
 * → arama → talep satırları. Satır, geri aranmayı bekleyen kişiyi monogram
 * renginden tek bakışta ayırır; detay kimlik başlığı + sabit işlem şeridiyle açılır.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, ActivityIndicator, Linking, Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { useAuthStore } from '../../../core/store/authStore';
import { useFeatureFlagsStore } from '../../../core/store/featureFlagsStore';
import { useRealtimeRefresh } from '../../../core/hooks/useRealtimeRefresh';
import { autoT } from '../../../core/i18n/autoTranslate';
import { fmtDayMonthShort, isRTL } from '../../../core/i18n';
import { AccessDenied } from '../../../core/ui/AccessDenied';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDesktop } from '../../../core/layout/PatternsShell';
import { PhoneCall, Search, X, Check, RotateCcw, Archive } from '../../../core/ui/icons';
import { listPhoneLeads, setPhoneLeadStatus, formatPhone, type PhoneLead, type PhoneLeadStatus } from '../api';

type TabKey = 'new' | 'called' | 'closed' | 'all';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

function useCanSee(): { ready: boolean; allowed: boolean } {
  const profile = useAuthStore((s) => s.profile);
  const loaded = useFeatureFlagsStore((s) => s.loaded);
  const on = useFeatureFlagsStore((s) => s.flags.phone_assistant === true);
  const load = useFeatureFlagsStore((s) => s.load);
  useEffect(() => { void load(profile?.lab_id ?? null); }, [profile?.lab_id, load]);
  const role = profile?.user_type === 'admin' || (profile?.user_type === 'lab' && profile?.role === 'manager');
  return { ready: loaded && !!profile, allowed: on && role };
}

/** Uygulamanın seçili diline ve takvim tercihine göre: «9 Eki · 18:32» */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${fmtDayMonthShort(d)} · ${hh}:${mm}`;
}

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m} ${autoT('dk')} ${s} ${autoT('sn')}` : `${s} ${autoT('sn')}`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** «Melek Beşoluk» → «MB». İsim yoksa (ya da numara yazılmışsa) null → telefon ikonu. */
function initials(name: string | null): string | null {
  const parts = (name ?? '').trim().split(/\s+/).filter((p) => p && !/^\d/.test(p));
  if (!parts.length) return null;
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toLocaleUpperCase('tr');
}

/** Geri aranmayı bekleyen talep — listede ve detayda en öne çıkan durum. */
function isUrgent(l: PhoneLead): boolean {
  return l.wants_callback && l.status === 'new';
}

export function PhoneLeadsScreen() {
  const U = useInkUI();
  const panel = usePanelTheme();
  const headInk = onAccentInk(panel.primary) === '#FFFFFF' ? 'rgba(255,255,255,0.88)' : 'rgba(10,10,10,0.72)';
  // Diğer beyaz hero'larla aynı: panel primary (koyu temada hero yüzeyi panel kimliğini korur).
  const heroInk = useWhiteHeroInk(panel.primary);
  const isDesktop = useIsDesktop();
  const MT = useMobileTokens();
  const insets = useSafeAreaInsets();
  // Mobilde sekmeler şeffaf (yüzen navbar için) → zemini ekran çizer; yoksa
  // arkadaki sekmenin görselleri kartların arasından sızıyordu (2026-10-17).
  const mobileBg = isDesktop ? undefined : MT.bg;
  // Liste başlığı: masaüstü tablo başlığıyla aynı düz panel accent; yazı zeminden seçilir.
  const { ready, allowed } = useCanSee();
  const params = useLocalSearchParams<{ id?: string }>();

  const [leads, setLeads] = useState<PhoneLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('new');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => { setTitle('Telefon Talepleri', ''); return () => clear(); }, [setTitle, clear]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLeads(await listPhoneLeads());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  useRealtimeRefresh('phone-leads', ['phone_leads'], () => { void load(); }, { enabled: allowed });

  // Bildirimden gelen ?id= → detay
  useEffect(() => {
    const id = typeof params.id === 'string' ? params.id : null;
    if (id && leads.some((l) => l.id === id)) setOpenId(id);
  }, [params.id, leads]);

  const counts = useMemo(() => ({
    new: leads.filter((l) => l.status === 'new').length,
    called: leads.filter((l) => l.status === 'called').length,
    closed: leads.filter((l) => l.status === 'closed').length,
    all: leads.length,
  }), [leads]);

  // Hero bağlamı — liste created_at DESC geldiği için ilk kayıt son çağrıdır.
  const hero = useMemo(() => ({
    callbacks: leads.filter(isUrgent).length,
    today: leads.filter((l) => isToday(l.created_at)).length,
    lastCall: leads[0]?.created_at ?? null,
  }), [leads]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    const digits = needle.replace(/\D/g, '');
    return leads.filter((l) => {
      if (tab !== 'all' && l.status !== tab) return false;
      if (!needle) return true;
      const hay = [l.contact_name, l.request, l.summary].filter(Boolean).join(' ').toLocaleLowerCase('tr');
      const phones = `${l.caller_number ?? ''} ${l.contact_phone ?? ''}`.replace(/\D/g, '');
      return hay.includes(needle) || (digits.length >= 3 && phones.includes(digits));
    });
  }, [leads, tab, q]);

  const openLead = leads.find((l) => l.id === openId) ?? null;

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: mobileBg }}><ActivityIndicator /></View>;
  }
  if (!allowed) return <AccessDenied />;

  const heroDescription = [
    hero.callbacks > 0 ? `${hero.callbacks} ${autoT('kişi geri arama bekliyor')}` : null,
    hero.lastCall ? `${autoT('Son çağrı')} ${fmtDate(hero.lastCall)}` : null,
  ].filter(Boolean).join(' · ') || undefined;

  return (
    // Masaüstünde zemin YOK: kabuk panelin bgPage'ini çizer (Tedarikçiler vb. ile aynı).
    // Mobilde panelin sayfa zemini (MT.bg) — sekme sahnesi şeffaf.
    <View style={{ flex: 1, backgroundColor: mobileBg }}>
      {/* Tam genişlik: masaüstünde üst çubuktaki sayfa başlığıyla aynı kolonda başlar
          (eskiden 1080px ortalanıyordu, başlıktan ~90px içeride duruyordu). */}
      {/* Mobil üst boşluk: yüzen logo + üst butonların altından başla (Siparişler ile aynı +72) */}
      <ScrollView contentContainerStyle={{
        paddingHorizontal: PAGE_PADDING,
        paddingTop: isDesktop ? 8 : Math.max(insets.top, 8) + 72,
        paddingBottom: isDesktop ? 120 : navBarMetrics(insets.bottom).clearance + 16,
        gap: CARD_GAP,
      }}>
        {/* ── Beyaz hero — en önemli bilgi en büyük: bekleyen talep sayısı ── */}
        <WhiteHero
          compact
          accent={panel.primary}
          kicker={autoT('Telefon Talepleri')}
          title={counts.new > 0
            ? <>{autoT('Bekleyen')} <Text style={{ color: heroInk.accentInk }}>{counts.new}</Text></>
            : autoT('Bekleyen talep yok')}
          description={heroDescription}
          stats={[
            { value: String(hero.today), label: autoT('Bugün') },
            { value: String(hero.callbacks), label: autoT('Geri arama') },
            { value: String(counts.all), label: autoT('Toplam') },
          ]}
        >
          <View style={{ marginTop: 14, alignItems: 'flex-start' }}>
            <SlideTabBar<TabKey>
              items={[
                { key: 'new', label: autoT('Yeni'), count: counts.new },
                { key: 'called', label: autoT('Arandı'), count: counts.called },
                { key: 'closed', label: autoT('Kapandı'), count: counts.closed },
                { key: 'all', label: autoT('Tümü'), count: counts.all },
              ] as any}
              activeKey={tab}
              onChange={setTab}
              accentColor={panel.accent}
              size="sm"
            />
          </View>
        </WhiteHero>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...U.inputStyle, height: 42, borderRadius: 999 }}>
          <Search size={16} color={U.ink[400]} strokeWidth={1.8} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="İsim, numara ya da talep ara"
            placeholderTextColor={U.ink[400]}
            style={{ flex: 1, color: U.ink[900], fontSize: 14, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) }}
          />
          {q ? (
            <GlassTooltip text={autoT('Temizle')}>
              <Pressable onPress={() => setQ('')} accessibilityLabel={autoT('Temizle')} hitSlop={8} style={webPointer}>
                <X size={16} color={U.ink[400]} strokeWidth={1.8} />
              </Pressable>
            </GlassTooltip>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : error ? (
            <Text style={{ color: U.chipTones.danger.fg, paddingVertical: 24 }}>{error}</Text>
          ) : leads.length === 0 ? (
            <EmptyState title="Henüz telefon talebi yok" sub="Telefon asistanının aldığı talepler burada listelenir." />
          ) : visible.length === 0 ? (
            <EmptyState title="Bu filtrede talep yok" />
          ) : (
            // Siparişler listesiyle aynı dil: tek kap + panel-accent başlık + ince çizgili satırlar
            <View style={{ borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: MT.hairline, backgroundColor: MT.card }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: panel.primary }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: headInk }}>
                  {autoT('Arayan')} · {autoT('Talep')}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: headInk }}>
                  {autoT('Durum')}
                </Text>
              </View>
              {visible.map((l) => <LeadRow key={l.id} lead={l} onPress={() => setOpenId(l.id)} />)}
            </View>
          )}
        </View>
      </ScrollView>

      <LeadDetail
        lead={openLead}
        onClose={() => setOpenId(null)}
        onChanged={(updated) => setLeads((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))}
      />
    </View>
  );
}

function EmptyState({ title, sub }: { title: string; sub?: string }) {
  const U = useInkUI();
  return (
    <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 40, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: U.surfaceSoft }}>
        <PhoneCall size={24} color={U.ink[400]} strokeWidth={1.6} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>{title}</Text>
      {sub ? <Text style={{ fontSize: 13, color: U.ink[500], textAlign: 'center' }}>{sub}</Text> : null}
    </View>
  );
}

function Chip({ tone, label }: { tone: { bg: string; fg: string }; label: string }) {
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: tone.fg, fontSize: 10.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function StatusChip({ status }: { status: PhoneLeadStatus }) {
  const U = useInkUI();
  const tone = status === 'new' ? U.chipTones.warning : status === 'called' ? U.chipTones.info : U.chipTones.neutral;
  return <Chip tone={tone} label={status === 'new' ? 'Yeni' : status === 'called' ? 'Arandı' : 'Kapandı'} />;
}

/** Baş harfler (isim yoksa telefon ikonu). Geri arama bekleyen kırmızı tonda — listede ilk bakışta seçilir. */
function Monogram({ lead, size = 40 }: { lead: PhoneLead; size?: number }) {
  const U = useInkUI();
  const tone = isUrgent(lead) ? U.chipTones.danger : lead.status === 'new' ? U.chipTones.warning : U.chipTones.neutral;
  const ini = initials(lead.contact_name);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.bg }}>
      {ini
        ? <Text style={{ fontSize: Math.round(size * 0.36), fontWeight: '700', letterSpacing: 0.3, color: tone.fg }}>{ini}</Text>
        : <PhoneCall size={Math.round(size * 0.42)} color={tone.fg} strokeWidth={1.8} />}
    </View>
  );
}

function LeadRow({ lead, onPress }: { lead: PhoneLead; onPress: () => void }) {
  const U = useInkUI();
  const MT = useMobileTokens();
  const phone = formatPhone(lead.contact_phone || lead.caller_number);
  const who = lead.contact_name || phone;
  const urgent = isUrgent(lead);
  const rtl = isRTL();
  // Siparişler satırıyla birebir: arayan → talep → telefon → etiket + tarih
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 11,
        paddingHorizontal: 16, paddingVertical: 11,
        borderTopWidth: 1, borderTopColor: MT.hairline,
        backgroundColor: hovered ? U.rowHover : (urgent ? 'rgba(217,75,75,0.06)' : 'transparent'),
        ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '120ms' } as any) : {}),
      })}
    >
      <Monogram lead={lead} size={36} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: '700', letterSpacing: -0.1, color: MT.ink, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
            {who || 'Bilinmeyen arayan'}
          </Text>
          <StatusChip status={lead.status} />
        </View>
        {lead.request ? (
          <Text style={{ fontSize: 12, lineHeight: 17, color: MT.ink2 }} numberOfLines={2}>{lead.request}</Text>
        ) : null}
        {lead.contact_name && phone ? (
          <Text style={{ fontSize: 11.5, color: MT.ink3, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{phone}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {urgent ? <Chip tone={U.chipTones.danger} label="Geri arama istiyor" /> : null}
          {lead.anonymized_at ? <Text style={{ fontSize: 10.5, color: MT.ink3 }}>Anonimleştirildi</Text> : null}
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 10.5, fontWeight: '500', color: MT.ink3, flexShrink: 0 }}>{fmtDate(lead.created_at)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Detay alt şeridindeki pill düğme. `primary` koyu pill — metni koyu temada da okunur (onDarkPill). */
function ActionBtn({ label, icon, onPress, primary, disabled }: {
  label: string; icon: (color: string) => React.ReactNode; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  const U = useInkUI();
  const fg = primary ? U.onDarkPill : U.plainBtn.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 999,
        backgroundColor: primary ? U.ink[900] : (hovered ? U.plainBtn.hoverBg : U.plainBtn.bg),
        borderWidth: primary ? 0 : 1, borderColor: U.plainBtn.border,
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : {}),
      })}
    >
      {icon(fg)}
      <Text style={{ fontSize: 13, fontWeight: '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}

function LeadDetail({ lead, onClose, onChanged }: {
  lead: PhoneLead | null; onClose: () => void; onChanged: (l: PhoneLead) => void;
}) {
  const U = useInkUI();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setNote(lead?.note ?? ''); setErr(null); }, [lead?.id, lead?.note]);

  if (!lead) return null;
  const rawPhone = lead.contact_phone || lead.caller_number;
  const phone = formatPhone(rawPhone);
  const urgent = isUrgent(lead);
  const noteDirty = note.trim() !== (lead.note ?? '').trim();
  const meta = [lead.contact_name ? phone : '', fmtDate(lead.created_at), fmtDuration(lead.duration_sec)].filter(Boolean).join(' · ');

  const call = () => { if (rawPhone) void Linking.openURL(`tel:${String(rawPhone).replace(/\s/g, '')}`); };

  const update = async (status: PhoneLeadStatus) => {
    setBusy(true); setErr(null);
    try {
      const noteArg = noteDirty ? note : null;
      onChanged(await setPhoneLeadStatus(lead.id, status, noteArg));
    } catch {
      setErr(autoT('Kaydedilemedi, tekrar deneyin.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={{ ...U.modalCard, maxWidth: 640, maxHeight: '90%' }}>
          {/* ── Kimlik: kim aradı, ne zaman, ne kadar sürdü ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: U.hairlineSoft }}>
            <Monogram lead={lead} size={48} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ fontSize: 19, fontWeight: '600', letterSpacing: -0.4, color: U.ink[900] }} numberOfLines={1}>
                {lead.contact_name || phone || 'Bilinmeyen arayan'}
              </Text>
              {meta ? <Text style={{ fontSize: 12.5, color: U.ink[500] }} numberOfLines={1}>{meta}</Text> : null}
            </View>
            <StatusChip status={lead.status} />
            <GlassTooltip text={autoT('Kapat')}>
              <Pressable onPress={onClose} style={{ ...U.modalCloseBtn, ...webPointer }} accessibilityLabel={autoT('Kapat')} hitSlop={8}>
                <X size={16} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
            {/* Geri arama bekliyorsa yapılacak iş en üstte; değilse "Ara" sade düğme. */}
            {urgent ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingStart: 14, borderRadius: 14, backgroundColor: U.chipTones.danger.bg }}>
                <PhoneCall size={16} color={U.chipTones.danger.fg} strokeWidth={2} />
                <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: U.chipTones.danger.fg }}>Geri arama istiyor</Text>
                {rawPhone ? (
                  <ActionBtn primary label="Geri ara" icon={(c) => <PhoneCall size={15} color={c} strokeWidth={1.8} />} onPress={call} />
                ) : null}
              </View>
            ) : rawPhone ? (
              <View style={{ flexDirection: 'row' }}>
                <ActionBtn label="Geri ara" icon={(c) => <PhoneCall size={15} color={c} strokeWidth={1.8} />} onPress={call} />
              </View>
            ) : null}

            {lead.request ? (
              <View style={{ padding: 14, borderRadius: 14, backgroundColor: U.surfaceSoft, gap: 6 }}>
                <Text style={U.colHeader}>Talep</Text>
                <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: '500', color: U.ink[900] }}>{lead.request}</Text>
              </View>
            ) : null}

            {lead.summary ? (
              <View style={{ gap: 4 }}>
                <Text style={U.colHeader}>Özet</Text>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: U.ink[700] }}>{lead.summary}</Text>
              </View>
            ) : null}

            <View style={{ gap: 6 }}>
              <Text style={U.colHeader}>Not</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Not ekle (isteğe bağlı)"
                placeholderTextColor={U.ink[400]}
                multiline
                style={{ ...U.inputStyle, height: 72, paddingTop: 10, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={U.colHeader}>Görüşme dökümü</Text>
              {lead.anonymized_at ? (
                <Text style={{ fontSize: 13, color: U.ink[500] }}>Anonimleştirildi</Text>
              ) : lead.transcript.length === 0 ? (
                <Text style={{ fontSize: 13, color: U.ink[500] }}>Döküm yok</Text>
              ) : (
                lead.transcript.map((t, i) => {
                  const caller = t.role === 'user';
                  return (
                    <View
                      key={i}
                      style={{
                        alignSelf: caller ? 'flex-start' : 'flex-end', maxWidth: '86%',
                        backgroundColor: caller ? U.surfaceSoft : U.chipTones.info.bg,
                        borderRadius: 16,
                        ...(caller ? { borderBottomStartRadius: 6 } : { borderBottomEndRadius: 6 }),
                        paddingHorizontal: 12, paddingVertical: 8,
                      }}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: caller ? U.ink[500] : U.chipTones.info.fg, marginBottom: 2 }}>
                        {caller ? 'Arayan' : 'Asistan'}
                      </Text>
                      <Text style={{ fontSize: 13.5, lineHeight: 19, color: U.ink[900] }}>{t.text}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* ── Sabit işlem şeridi: uzun dökümde de işlemler hep görünür ── */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: U.hairlineSoft, gap: 8 }}>
            {err ? <Text style={{ color: U.chipTones.danger.fg, fontSize: 13 }}>{err}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {lead.status !== 'new' ? (
                <ActionBtn label="Yeniden aç" disabled={busy} icon={(c) => <RotateCcw size={15} color={c} strokeWidth={1.8} />} onPress={() => void update('new')} />
              ) : null}
              {lead.status !== 'closed' ? (
                <ActionBtn label="Talebi kapat" disabled={busy} icon={(c) => <Archive size={15} color={c} strokeWidth={1.8} />} onPress={() => void update('closed')} />
              ) : null}
              <View style={{ flex: 1 }} />
              {busy ? <ActivityIndicator /> : null}
              {noteDirty ? (
                <ActionBtn label="Notu kaydet" disabled={busy} icon={(c) => <Check size={15} color={c} strokeWidth={1.8} />} onPress={() => void update(lead.status)} />
              ) : null}
              {lead.status !== 'called' ? (
                <ActionBtn primary label="Arandı olarak işaretle" disabled={busy} icon={(c) => <Check size={15} color={c} strokeWidth={2} />} onPress={() => void update('called')} />
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default PhoneLeadsScreen;
