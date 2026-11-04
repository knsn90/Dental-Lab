/**
 * Sağlık Kurumları menüsü (kullanıcı onayı 2026-11-04): sekme şeridi yerine
 * Finans'taki gibi sol menü (masaüstü) ve 3 sekme + ortada açılan menü (mobil).
 * Bölüm listesi ve kuralları: ../clinicsNav.ts
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Platform, useWindowDimensions } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AppIcon } from '../../../core/ui/AppIcon';
import { autoT } from '../../../core/i18n/autoTranslate';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { LayoutGrid, Users, Briefcase, Link2, Star, Plus, UserPlus, Printer, Menu, X } from '../../../core/ui/icons';
import { clinicsNavGroups, clinicsMobilePills, clinicsSection, isClinicType, type ClinicsTabKey, type ClinicTypeKey } from '../clinicsNav';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };
const WEB_POINTER = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

const TYPE_ICON: Record<ClinicTypeKey, string> = {
  muayenehane: 'account-outline',
  klinik: 'tooth-outline',
  poliklinik: 'stethoscope',
  hastane: 'hospital-box-outline',
  laboratuvar: 'flask-outline',
};
const KEY_ICON: Record<Exclude<ClinicsTabKey, ClinicTypeKey>, React.ComponentType<any>> = {
  all: LayoutGrid,
  doctors: Users,
  managers: Briefcase,
  connections: Link2,
  reviews: Star,
};

function NavIcon({ k, size, color, strokeWidth }: { k: ClinicsTabKey; size: number; color: string; strokeWidth: number }) {
  if (isClinicType(k)) return <AppIcon name={TYPE_ICON[k] as any} size={size} color={color} strokeWidth={strokeWidth} />;
  const I = KEY_ICON[k];
  return <I size={size} color={color} strokeWidth={strokeWidth} />;
}

export interface ClinicsNavActions {
  onAddClinic: () => void;
  onAddDoctor: () => void;
  onPrintForm: () => void;
  onSendInvite: () => void;
}

export interface ClinicsNavProps {
  activeKey: ClinicsTabKey;
  onSelect: (k: ClinicsTabKey) => void;
  canSeeReviews: boolean;
  /** Satır sonundaki sayı (kurum / hekim / yönetici). */
  counts: Partial<Record<ClinicsTabKey, number>>;
  /** Takip: ilgi bekleyen işler (bekleyen bağlantı isteği, aranmamış düşük puan). null = bilinmiyor. */
  attention: { connections: number | null; reviews: number | null };
  actions: ClinicsNavActions;
}

/** Takip satırının alt satırı: "2 bekliyor" / "3 aranmadı". */
function attentionText(k: ClinicsTabKey, attention: ClinicsNavProps['attention']): string | null {
  if (k === 'connections' && attention.connections) return `${attention.connections} ${autoT('bekliyor')}`;
  if (k === 'reviews' && attention.reviews) return `${attention.reviews} ${autoT('aranmadı')}`;
  return null;
}

const ACTION_ROWS = (a: ClinicsNavActions) => [
  { key: 'doctor', label: 'Hekim ekle', hint: 'Bir kuruma yeni hekim kaydet', Icon: UserPlus, onPress: a.onAddDoctor },
  { key: 'print', label: 'İş emri formu yazdır', hint: 'Kurum adı ve hekimleri önceden yazılı boş form', Icon: Printer, onPress: a.onPrintForm },
  { key: 'invite', label: 'Bağlantı davet kodu', hint: 'Tek kullanımlık kod üret; klinik girince laboratuvarına bağlanır', Icon: Link2, onPress: a.onSendInvite },
];

// ═════════════════════════════════════════════════════════════════════
// Masaüstü — sol menü
// ═════════════════════════════════════════════════════════════════════
export function ClinicsSideNav({ activeKey, onSelect, canSeeReviews, counts, attention, actions }: ClinicsNavProps) {
  const T = useMobileTokens();
  const U = useInkUI();
  const panel = usePanelTheme();
  const groups = clinicsNavGroups({ canSeeReviews });

  const groupLabel = (title: string, first: boolean) => (
    <Text style={{ fontSize: 10, fontWeight: '700', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: first ? 0 : 16, paddingBottom: 8 }}>
      {autoT(title)}
    </Text>
  );

  return (
    <View style={{ width: 220, flexShrink: 0, paddingTop: 16, paddingBottom: 16 }}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ gap: 2, paddingHorizontal: 8 }}>
        {/* Yeni kurum — sayfanın birincil eylemi */}
        <GlassTooltip title={autoT('Yeni kurum')} text={autoT('Yeni klinik ya da sağlık kurumu ekle')} placement="right">
          <Pressable
            onPress={actions.onAddClinic}
            accessibilityRole="button"
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 38, marginHorizontal: 6, marginBottom: 18, borderRadius: 9999,
              backgroundColor: panel.primary, opacity: hovered ? 0.9 : 1, ...WEB_POINTER,
            })}
          >
            <Plus size={14} color={onAccentInk(panel.primary)} strokeWidth={2.2} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: onAccentInk(panel.primary) }}>{autoT('Yeni kurum')}</Text>
          </Pressable>
        </GlassTooltip>

        {groups.map((group, gi) => (
          <View key={group.title}>
            {groupLabel(group.title, gi === 0)}
            {group.items.map((it) => {
              const isActive = it.key === activeKey;
              const meta = attentionText(it.key, attention);
              const count = counts[it.key];
              return (
                <GlassTooltip key={it.key} title={autoT(it.label)} text={autoT(it.hint)} placement="right">
                  <Pressable
                    onPress={() => onSelect(it.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                      backgroundColor: isActive ? T.card : hovered ? U.rowHover : 'transparent',
                      ...WEB_POINTER,
                    })}
                  >
                    {isActive && <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: panel.primary, marginStart: -6, marginEnd: 4 }} />}
                    <NavIcon k={it.key} size={15} strokeWidth={isActive ? 2 : 1.6} color={isActive ? T.ink : T.ink3} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? T.ink : T.ink2 }} numberOfLines={1}>
                        {autoT(it.label)}
                      </Text>
                      {meta ? <Text style={{ fontSize: 11, fontWeight: '600', color: U.chipTones.warning.fg, marginTop: 1 }} numberOfLines={1}>{meta}</Text> : null}
                    </View>
                    {typeof count === 'number' ? (
                      <Text style={{ fontSize: 11.5, color: T.ink3, fontVariant: ['tabular-nums'] }}>{count}</Text>
                    ) : null}
                  </Pressable>
                </GlassTooltip>
              );
            })}
          </View>
        ))}

        {groupLabel('Hızlı İşlemler', false)}
        {ACTION_ROWS(actions).map((a) => (
          <GlassTooltip key={a.key} title={autoT(a.label)} text={autoT(a.hint)} placement="right">
            <Pressable
              onPress={a.onPress}
              accessibilityRole="button"
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                backgroundColor: hovered ? U.rowHover : 'transparent', ...WEB_POINTER,
              })}
            >
              <a.Icon size={15} color={T.ink3} strokeWidth={1.6} />
              <Text style={{ flex: 1, fontSize: 13, color: T.ink2 }} numberOfLines={1}>{autoT(a.label)}</Text>
            </Pressable>
          </GlassTooltip>
        ))}
      </ScrollView>
    </View>
  );
}

/** Masaüstü bölüm başlığı (Finans'taki gibi): ad + kısa açıklama. */
export function ClinicsSectionHeader({ activeKey }: { activeKey: ClinicsTabKey }) {
  const T = useMobileTokens();
  const s = clinicsSection(activeKey);
  if (!s) return null;
  return (
    <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 16, paddingBottom: 12 }}>
      <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: T.ink, marginBottom: 4 }}>{autoT(s.label)}</Text>
      <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 19 }}>{autoT(s.hint)}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Mobil — 3 sekme + ortada açılan menü
// ═════════════════════════════════════════════════════════════════════
export function ClinicsMobileNav({ activeKey, onSelect, canSeeReviews, counts, attention, actions }: ClinicsNavProps) {
  const T = useMobileTokens();
  const U = useInkUI();
  const panel = usePanelTheme();
  const { width } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const pills = clinicsMobilePills({ canSeeReviews, activeKey });
  const groups = clinicsNavGroups({ canSeeReviews });
  const onPrimary = onAccentInk(panel.primary);
  const close = () => setMenuOpen(false);
  const pick = (k: ClinicsTabKey) => { onSelect(k); close(); };
  const run = (fn: () => void) => { close(); fn(); };

  const row = (opts: { key: string; label: string; hint: string; active?: boolean; meta?: string | null; count?: number; icon: React.ReactNode; onPress: () => void }) => (
    <Pressable
      key={opts.key}
      onPress={opts.onPress}
      accessibilityRole="button"
      accessibilityState={opts.active ? { selected: true } : undefined}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
        backgroundColor: opts.active ? U.rowHover : 'transparent', ...WEB_POINTER,
      }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: opts.active ? panel.primary : T.cardSoft }}>
        {opts.icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>{opts.label}</Text>
        <Text style={{ fontSize: 10.5, color: opts.meta ? U.chipTones.warning.fg : T.ink3, fontWeight: opts.meta ? '600' : '400', marginTop: 1 }} numberOfLines={1}>
          {opts.meta ?? opts.hint}
        </Text>
      </View>
      {typeof opts.count === 'number' ? <Text style={{ fontSize: 12, color: T.ink3, fontVariant: ['tabular-nums'] }}>{opts.count}</Text> : null}
    </Pressable>
  );

  return (
    <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: T.cardSoft, borderRadius: 9999, alignItems: 'center' }}>
        {pills.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => onSelect(p.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: p.active }}
            style={{
              flex: p.active ? 1.55 : 1, minWidth: 0,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
              paddingHorizontal: p.active ? 12 : 8, paddingVertical: 8, borderRadius: 9999,
              backgroundColor: p.active ? panel.primary : 'transparent', ...WEB_POINTER,
            }}
          >
            {p.active ? <NavIcon k={p.key} size={12} strokeWidth={p.active ? 2.2 : 1.8} color={p.active ? onPrimary : T.ink3} /> : null}
            <Text style={{ fontSize: 11, fontWeight: p.active ? '700' : '600', color: p.active ? onPrimary : T.ink3 }} numberOfLines={1}>{autoT(p.label)}</Text>
          </Pressable>
        ))}
        <View style={{ width: 1, height: 16, backgroundColor: T.hairline, marginHorizontal: 2 }} />
        <GlassTooltip title={autoT('Tüm menü')} text={autoT('Kurum türleri, kişiler, takip ve işlemler')} placement="bottom">
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={autoT('Tüm menü')}
            style={{ alignItems: 'center', justifyContent: 'center', width: 36, height: 30, borderRadius: 9999, ...WEB_POINTER }}
          >
            <Menu size={16} strokeWidth={2} color={T.ink} />
          </Pressable>
        </GlassTooltip>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={{ ...U.modalOverlay, padding: width < 560 ? 12 : 24 }} onPress={close}>
          {/* Kart tıklaması dışarıya taşmasın: içteki Pressable dokunmayı yutar */}
          <Pressable style={{ ...U.modalCard, maxWidth: 420 }} onPress={() => {}}>
            <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, marginBottom: 2 }}>{autoT('Sağlık Kurumları')}</Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: T.ink }}>{autoT('Tüm menü')}</Text>
              </View>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Menüyü kapat')}>
                <Pressable onPress={close} accessibilityLabel={autoT('Menüyü kapat')} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center', ...WEB_POINTER }}>
                  <X size={16} color={T.ink2} strokeWidth={2} />
                </Pressable>
              </GlassTooltip>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}>
              {groups.map((g) => (
                <View key={g.title} style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, paddingHorizontal: 6, paddingVertical: 8 }}>{autoT(g.title)}</Text>
                  {g.items.map((it) => {
                    const active = it.key === activeKey;
                    return row({
                      key: it.key, label: autoT(it.label), hint: autoT(it.hint), active,
                      meta: attentionText(it.key, attention), count: counts[it.key],
                      icon: <NavIcon k={it.key} size={15} strokeWidth={active ? 2.2 : 1.8} color={active ? onPrimary : T.ink2} />,
                      onPress: () => pick(it.key),
                    });
                  })}
                </View>
              ))}
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, paddingHorizontal: 6, paddingVertical: 8 }}>{autoT('Hızlı İşlemler')}</Text>
              {ACTION_ROWS(actions).map((a) => row({
                key: a.key, label: autoT(a.label), hint: autoT(a.hint),
                icon: <a.Icon size={15} color={T.ink2} strokeWidth={1.8} />,
                onPress: () => run(a.onPress),
              }))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
