/**
 * CommandPalette — Cmd+K / Ctrl+K global komut paleti
 *
 * Web:    Cmd+K (Mac) / Ctrl+K (Win/Linux) klavye kısayolu
 * Mobil:  FAB butonu (sağ alt) ile açılır
 *
 * Kullanım:
 *   <CommandPalette navItems={LAB_NAV} onNavigate={(href) => router.push(href)} />
 *
 * Layout dosyasına mount edilir; state `useCommandPalette` store'undan yönetilir.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { useCommandPalette } from '../store/commandPaletteStore';
import { C } from '../theme/colors';
import { useThemeModeStore } from '../store/themeModeStore';
import { autoT } from '../i18n/autoTranslate';
import { formatMoney } from '../money/currency';
import { formatDate } from '../utils/dates';
import { useGlobalSearch } from '../../modules/search/useGlobalSearch';
import { kindsForPanel, hrefFor, shouldSearch, isFresh } from '../../modules/search/lib/searchModel';
import { foldTR } from '../../modules/search/lib/fold';
import type { SearchKind, SearchPanel } from '../../modules/search/types';
import { STATUS_CONFIG } from '../../modules/orders/constants';
import { INVOICE_STATUS_LABELS } from '../../modules/invoices/types';
import { buildPageCommands, recordRows, GROUP_LABEL, type RecordRow } from './commandPaletteModel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  iconName?: string;
  emoji?: string;
  sectionLabel?: string;
}

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  emoji?: string;
  group: string;
  /** Kayıt satırı (genel arama): ikinci satır + sağ rozet */
  sublabel?: string;
  badge?: string;
  onSelect: () => void;
}

interface Props {
  navItems: NavItem[];
  onNavigate: (href: string) => void;
  accentColor?: string;
  /** Verilirse sipariş/klinik/hekim/fatura da aranır (2. dalga 1). Verilmezse bugünkü gibi yalnız sayfalar. */
  panel?: SearchPanel;
}

const KIND_ICON: Record<SearchKind, string> = {
  orders: 'list-check', clinics: 'building-2', doctors: 'stethoscope', invoices: 'receipt',
};

function recordToCommand(r: RecordRow): Omit<CommandItem, 'onSelect'> {
  const base = { id: `${r.kind}:${r.id}`, icon: KIND_ICON[r.kind], group: GROUP_LABEL[r.kind] };
  switch (r.kind) {
    case 'orders': {
      const h = r.hit;
      const st = h.is_archived ? autoT('Arşiv') : autoT(STATUS_CONFIG[h.status]?.label ?? h.status);
      return { ...base,
        label: [h.order_number, h.patient_name].filter(Boolean).join(' · '),
        sublabel: [h.clinic_name, h.doctor_name, h.work_type].filter(Boolean).join(' · ') || undefined,
        badge: [st, h.delivery_date ? formatDate(h.delivery_date) : null].filter(Boolean).join(' · ') };
    }
    case 'clinics': {
      const h = r.hit;
      return { ...base, label: h.name,
        sublabel: `${h.doctor_count} ${autoT('hekim')}` + (h.is_active ? '' : ` · ${autoT('pasif')}`) };
    }
    case 'doctors': {
      const h = r.hit;
      return { ...base, label: h.full_name,
        sublabel: [h.clinic_name, h.is_active ? null : autoT('pasif')].filter(Boolean).join(' · ') || undefined };
    }
    case 'invoices': {
      const h = r.hit;
      return { ...base, label: h.invoice_number,
        sublabel: [h.efatura_number, h.clinic_name,
          formatMoney(Number(h.total) || 0, (h.currency as any) ?? undefined),
          autoT((INVOICE_STATUS_LABELS as Record<string, string>)[h.status] ?? h.status)].filter(Boolean).join(' · ') };
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette({ navItems, onNavigate, accentColor = C.primary, panel }: Props) {
  const { open, query, closePalette, setQuery } = useCommandPalette();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const t = useMemo(() => paletteColors(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [activeIdx, setActiveIdx] = React.useState(0);

  // Reset index when query changes
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  // Build command list from navItems
  const allCommands: CommandItem[] = useMemo(() => {
    return navItems.map((item) => ({
      id:       item.href,
      label:    item.label,
      icon:     item.iconName ?? 'home',
      emoji:    item.emoji,
      group:    item.sectionLabel ?? 'Sayfalar',
      onSelect: () => { closePalette(); onNavigate(item.href); },
    }));
  }, [navItems, onNavigate, closePalette]);

  // Genel arama (panel verilmişse): menüde gidilebilen gruplar, sunucuda, çağıranın yetkisiyle
  const navHrefs = useMemo(() => navItems.map((n) => n.href), [navItems]);
  const kinds = useMemo(() => (panel ? kindsForPanel(panel, navHrefs) : []), [panel, navHrefs]);
  const search = useGlobalSearch(open ? query : '', panel, kinds);
  const searching = !!panel && kinds.length > 0 && shouldSearch(query);
  // Sonuç ekrandaki sorgunun değilse (yazma sürüyor / istek uçuşta) kayıt satırları gösterilmez
  const fresh = isFresh(search.forQ, query);

  const recordCommands: CommandItem[] = useMemo(() => {
    if (!panel || !searching || !fresh) return [];
    return recordRows(search.result).map((r) => ({
      ...recordToCommand(r),
      onSelect: () => { closePalette(); onNavigate(hrefFor(panel, r.kind, r.id)); },
    }));
  }, [panel, searching, fresh, search.result, closePalette, onNavigate]);

  // Kayıtlar önce (Siparişler · Klinikler · Hekimler · Faturalar), sonra sayfalar
  const filtered = useMemo(
    () => [...recordCommands, ...buildPageCommands(allCommands, query, foldTR)],
    [recordCommands, allCommands, query],
  );

  // Clamp active index
  const clampedIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));

  function executeActive() {
    if (filtered[clampedIdx]) {
      filtered[clampedIdx].onSelect();
    }
  }

  // Sonuç gelmeden Enter → sonuç gelince ilk satır açılır (yazmaya devam edilirse iptal)
  const pendingEnter = useRef(false);
  useEffect(() => { pendingEnter.current = false; }, [query, open]);
  function submit() {
    if (searching && !fresh) { pendingEnter.current = true; return; }
    executeActive();
  }
  useEffect(() => {
    if (pendingEnter.current && searching && fresh) { pendingEnter.current = false; executeActive(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, searching, filtered]);

  // Web: Cmd+K / Ctrl+K keyboard listener (filtered tanımından SONRA: bağımlılıkta kullanılıyor)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) closePalette();
        else useCommandPalette.getState().openPalette();
      }
      if (!open) return;
      if (e.key === 'Escape')    { closePalette(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => i + 1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); }
      if (e.key === 'Enter')     { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx, filtered]);   // filtered: genel arama sonuçları sonradan gelir; Enter güncel listeyi seçmeli

  // Group commands
  const groups = useMemo(() => {
    const map: Record<string, CommandItem[]> = {};
    for (const cmd of filtered) {
      if (!map[cmd.group]) map[cmd.group] = [];
      map[cmd.group].push(cmd);
    }
    return Object.entries(map);
  }, [filtered]);

  if (!open) return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={closePalette}
      statusBarTranslucent
    >
      {/* Backdrop — anchor panel to top-right (under the search button in TopActionBar) */}
      <Pressable
        style={[s.backdrop, {
          backgroundColor: t.backdrop,
          alignItems: isNative ? 'flex-end' : 'center',
          paddingTop: isNative ? Math.max(insets.top, 8) + 6 + 38 + 8 : 80,
          paddingEnd: isNative ? 12 : 16,
          paddingStart: isNative ? 12 : 16,
        }]}
        onPress={closePalette}
      >
        {/* Panel — stop propagation so taps inside don't close */}
        <Pressable style={[s.panelWrap, isNative && { maxWidth: 360 }]} onPress={(e) => e.stopPropagation()}>

          {/* Solid surface panel — matches NotificationsMenu style */}
          <View style={[
            s.panel,
            {
              backgroundColor: isDark ? '#1B1916' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)',
              ...(Platform.OS === 'web'
                ? ({} as any)
                : {
                    shadowColor: '#000',
                    shadowOpacity: isDark ? 0.45 : 0.18,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 10,
                  }),
            },
          ]}>
            <PanelContent
              query={query}
              setQuery={setQuery}
              inputRef={inputRef}
              groups={groups}
              filtered={filtered}
              clampedIdx={clampedIdx}
              setActiveIdx={setActiveIdx}
              accentColor={accentColor}
              closePalette={closePalette}
              t={t}
              placeholder={panel ? 'Sipariş, hasta, klinik, fatura ara…' : 'Ne yapmak istiyorsunuz?'}
              onSubmit={submit}
              status={{
                loading: searching && (search.loading || !fresh),
                error: searching && fresh && !!search.error,
                ordersMore: searching && search.result.orders_more,
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Palette helper ─────────────────────────────────────────────────────────
type PaletteColors = {
  backdrop:     string;
  panel:        string;
  searchBg:     string;
  ink:          string;
  inkMuted:     string;
  escBg:        string;
  divider:      string;
  itemIconBg:   string;
  footerBg:     string;
};
function paletteColors(isDark: boolean): PaletteColors {
  if (isDark) {
    return {
      backdrop:    'rgba(0,0,0,0.55)',
      panel:       'rgba(27,25,22,0.96)',
      searchBg:    'rgba(255,255,255,0.04)',
      ink:         '#F7F2E9',
      inkMuted:    'rgba(247,242,233,0.55)',
      escBg:       'rgba(255,255,255,0.08)',
      divider:     'rgba(255,255,255,0.08)',
      itemIconBg:  'rgba(255,255,255,0.06)',
      footerBg:    'rgba(255,255,255,0.04)',
    };
  }
  return {
    backdrop:    'rgba(15,23,42,0.45)',
    panel:       'rgba(255,255,255,0.96)',
    searchBg:    'rgba(255,255,255,0.85)',
    ink:         C.textPrimary,
    inkMuted:    C.textMuted,
    escBg:       '#F1F5F9',
    divider:     C.border,
    itemIconBg:  '#F1F5F9',
    footerBg:    'rgba(255,255,255,0.6)',
  };
}

// ── Panel Content (extracted so it renders inside both BlurView and View) ─────

function PanelContent({
  query, setQuery, inputRef, groups, filtered, clampedIdx,
  setActiveIdx, accentColor, closePalette, t, placeholder, status, onSubmit,
}: {
  query: string;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<TextInput | null>;
  groups: [string, CommandItem[]][];
  filtered: CommandItem[];
  clampedIdx: number;
  setActiveIdx: (i: number | ((prev: number) => number)) => void;
  accentColor: string;
  closePalette: () => void;
  t: PaletteColors;
  placeholder: string;
  status: { loading: boolean; error: boolean; ordersMore: boolean };
  onSubmit: () => void;
}) {
  // Scroll to active item
  const scrollRef = useRef<ScrollView>(null);
  const itemHeights = useRef<Record<number, number>>({});

  function scrollToActive(idx: number) {
    const y = Object.entries(itemHeights.current)
      .filter(([k]) => Number(k) < idx)
      .reduce((sum, [, h]) => sum + h, 0);
    scrollRef.current?.scrollTo({ y: y - 8, animated: true });
  }

  return (
    <>
      {/* ── Search bar ── */}
      <View style={[s.searchRow, { backgroundColor: t.searchBg }]}>
        <AppIcon name="search" size={17} color={t.inkMuted} />
        <TextInput
          ref={inputRef}
          style={[s.searchInput, { color: t.ink }]}
          placeholder={placeholder}
          placeholderTextColor={t.inkMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="go"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={onSubmit}
          // react-native-web TextInput tuş olayının yayılmasını durdurur → pencere dinleyicisi ok
          // tuşlarını hiç görmez; yazarken gezinme burada yapılır.
          onKeyPress={(e: any) => {
            const k = e?.nativeEvent?.key;
            if (k === 'ArrowDown') { e.preventDefault?.(); setActiveIdx((i) => Math.min(Math.max(0, filtered.length - 1), i + 1)); }
            else if (k === 'ArrowUp') { e.preventDefault?.(); setActiveIdx((i) => Math.max(0, i - 1)); }
          }}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <AppIcon name="x-circle" size={16} color={t.inkMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.escBadge, { backgroundColor: t.escBg, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8 }]}
          onPress={closePalette}
          accessibilityLabel="Kapat"
        >
          <AppIcon name="x" size={14} color={t.inkMuted} />
        </TouchableOpacity>
      </View>

      <View style={[s.divider, { backgroundColor: t.divider }]} />

      {/* ── Arama durumu (genel arama) — sessiz geçmez ── */}
      {status.error && (
        <View style={s.statusRow}>
          <AppIcon name="alert-circle" size={14} color={t.inkMuted} />
          <Text style={[s.statusText, { color: t.inkMuted }]}>Arama yapılamadı</Text>
        </View>
      )}
      {status.loading && filtered.length > 0 && (
        <View style={s.statusRow}>
          <Text style={[s.statusText, { color: t.inkMuted }]}>Aranıyor…</Text>
        </View>
      )}

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <View style={s.noResults}>
          <AppIcon name="search" size={24} color={t.inkMuted} />
          <Text style={[s.noResultsText, { color: t.inkMuted }]}>{status.loading ? 'Aranıyor…' : 'Sonuç bulunamadı'}</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.resultScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {groups.map(([groupLabel, items]) => {
            return (
              <View key={groupLabel}>
                <Text style={[s.groupLabel, { color: t.inkMuted }]}>{groupLabel}</Text>
                {items.map((cmd) => {
                  const globalIdx = filtered.indexOf(cmd);
                  const isActive  = globalIdx === clampedIdx;
                  // Web hover: spread onMouseEnter as any to avoid TS type error
                  const webHover = Platform.OS === 'web'
                    ? ({ onMouseEnter: () => setActiveIdx(globalIdx) } as any)
                    : {};
                  return (
                    <TouchableOpacity
                      key={cmd.id}
                      style={[s.item, isActive && { backgroundColor: accentColor + '14' }]}
                      onPress={() => { Keyboard.dismiss(); cmd.onSelect(); }}
                      onLayout={(e) => {
                        itemHeights.current[globalIdx] = e.nativeEvent.layout.height;
                      }}
                      {...webHover}
                      activeOpacity={0.75}
                    >
                      {/* Icon — flat 2D Lucide only (emoji ignored per design contract) */}
                      <View style={[s.itemIcon, { backgroundColor: t.itemIconBg }, isActive && { backgroundColor: accentColor + '20' }]}>
                        <AppIcon
                          name={cmd.icon}
                          size={16}
                          color={isActive ? accentColor : t.inkMuted}
                          strokeWidth={isActive ? 2.2 : 1.75}
                        />
                      </View>

                      {/* Label — keep ink color, weight indicates active state */}
                      {cmd.sublabel ? (
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.itemLabel, { color: t.ink, flex: 0 }, isActive && { fontWeight: '600' }]} numberOfLines={1}>
                            {cmd.label}
                          </Text>
                          <Text style={[s.itemSub, { color: t.inkMuted }]} numberOfLines={1}>{cmd.sublabel}</Text>
                        </View>
                      ) : (
                        <Text
                          style={[s.itemLabel, { color: t.ink }, isActive && { fontWeight: '600' }]}
                          numberOfLines={1}
                        >
                          {cmd.label}
                        </Text>
                      )}
                      {cmd.badge ? (
                        <Text style={[s.itemBadge, { color: t.inkMuted, backgroundColor: t.itemIconBg }]} numberOfLines={1}>{cmd.badge}</Text>
                      ) : null}

                      {/* Arrow hint */}
                      {isActive && (
                        <AppIcon name="chevron-right" size={14} color={accentColor} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                {status.ordersMore && groupLabel === GROUP_LABEL.orders && (
                  <Text style={[s.moreHint, { color: t.inkMuted }]}>Daha fazla sonuç var, aramayı daraltın</Text>
                )}
              </View>
            );
          })}
          <View style={{ height: 8 }} />
        </ScrollView>
      )}

      {/* ── Footer hint ── */}
      {Platform.OS === 'web' && (
        <View style={[s.footer, { backgroundColor: t.footerBg, borderTopColor: t.divider }]}>
          <Text style={[s.footerText, { color: t.inkMuted }]}>↑↓ Gezin · Enter Aç · Esc Kapat</Text>
        </View>
      )}
    </>
  );
}

// ── Floating Action Button (mobile shortcut) ─────────────────────────────────

export function CommandPaletteFAB({ accentColor = C.primary }: { accentColor?: string }) {
  const { openPalette } = useCommandPalette();
  // Only show on mobile platforms
  if (Platform.OS === 'web') return null;
  return (
    <TouchableOpacity
      style={[fab.btn, { backgroundColor: accentColor }]}
      onPress={() => openPalette()}
      activeOpacity={0.88}
    >
      <AppIcon name="search" size={20} color="#FFFFFF" strokeWidth={2} />
    </TouchableOpacity>
  );
}

const fab = StyleSheet.create({
  btn: {
    position: 'absolute',
    end: 20,
    bottom: 100,   // above mobile tab bar
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(15,23,42,0.22)',
    elevation: 8,
    zIndex: 999,
  },
});

// ── Styles ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  panelWrap: {
    width: '100%',
    maxWidth: 580,
  },
  panel: {
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: 520,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 20px 60px rgba(15,23,42,0.20)' } as any) : {}),
  },
  panelWeb: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...(Platform.OS === 'web' ? ({
      backdropFilter:       'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
    } as any) : {}),
  },

  // ── Search bar ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: C.textPrimary,
    padding: 0,
    lineHeight: 22,
  },
  escBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  escText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: C.border,
  },

  // ── Results ──
  resultScroll: {
    maxHeight: 400,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 6,
    borderRadius: 10,
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: C.textPrimary,
  },
  // Genel arama kayıt satırı (2. dalga 1)
  itemSub: {
    fontSize: 12,
    marginTop: 1,
  },
  itemBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    maxWidth: 150,
    flexShrink: 0,
  },
  moreHint: {
    fontSize: 11.5,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  statusText: {
    fontSize: 12,
  },

  // ── Empty ──
  noResults: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  noResultsText: {
    fontSize: 14,
    color: C.textMuted,
  },

  // ── Footer ──
  footer: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  footerText: {
    fontSize: 11,
    color: C.textMuted,
  },
});
