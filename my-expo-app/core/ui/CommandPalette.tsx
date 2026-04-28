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
import { AppIcon } from './AppIcon';
import { useCommandPalette } from '../store/commandPaletteStore';
import { C } from '../theme/colors';

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
  onSelect: () => void;
}

interface Props {
  navItems: NavItem[];
  onNavigate: (href: string) => void;
  accentColor?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette({ navItems, onNavigate, accentColor = C.primary }: Props) {
  const { open, query, closePalette, setQuery } = useCommandPalette();
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

  // Web: Cmd+K / Ctrl+K keyboard listener
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
      if (e.key === 'Enter')     { e.preventDefault(); executeActive(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIdx]);

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

  // Filter by query
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [allCommands, query]);

  // Clamp active index
  const clampedIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1));

  function executeActive() {
    if (filtered[clampedIdx]) {
      filtered[clampedIdx].onSelect();
    }
  }

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
      {/* Backdrop */}
      <Pressable style={s.backdrop} onPress={closePalette}>
        {/* Panel — stop propagation so taps inside don't close */}
        <Pressable style={s.panelWrap} onPress={(e) => e.stopPropagation()}>

          {/* Glass blur panel */}
          {isNative ? (
            <BlurView intensity={60} tint="light" style={s.panel}>
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
              />
            </BlurView>
          ) : (
            <View style={[s.panel, s.panelWeb]}>
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
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Panel Content (extracted so it renders inside both BlurView and View) ─────

function PanelContent({
  query, setQuery, inputRef, groups, filtered, clampedIdx,
  setActiveIdx, accentColor, closePalette,
}: {
  query: string;
  setQuery: (q: string) => void;
  inputRef: React.RefObject<TextInput>;
  groups: [string, CommandItem[]][];
  filtered: CommandItem[];
  clampedIdx: number;
  setActiveIdx: (i: number | ((prev: number) => number)) => void;
  accentColor: string;
  closePalette: () => void;
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
      <View style={s.searchRow}>
        <AppIcon name="search" size={17} color={C.textMuted} />
        <TextInput
          ref={inputRef}
          style={s.searchInput}
          placeholder="Ne yapmak istiyorsunuz?"
          placeholderTextColor={C.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="go"
          autoCorrect={false}
          autoCapitalize="none"
          onSubmitEditing={() => {
            if (filtered[clampedIdx]) filtered[clampedIdx].onSelect();
          }}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <AppIcon name="x-circle" size={16} color={C.textMuted} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.escBadge} onPress={closePalette}>
          <Text style={s.escText}>Esc</Text>
        </TouchableOpacity>
      </View>

      <View style={s.divider} />

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <View style={s.noResults}>
          <AppIcon name="search" size={24} color={C.textMuted} />
          <Text style={s.noResultsText}>Sonuç bulunamadı</Text>
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
                <Text style={s.groupLabel}>{groupLabel}</Text>
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
                      {/* Icon */}
                      <View style={[s.itemIcon, isActive && { backgroundColor: accentColor + '20' }]}>
                        {cmd.emoji ? (
                          <Text style={{ fontSize: 16 }}>{cmd.emoji}</Text>
                        ) : (
                          <AppIcon
                            name={cmd.icon}
                            size={16}
                            color={isActive ? accentColor : C.textSecondary}
                            strokeWidth={isActive ? 2.2 : 1.75}
                          />
                        )}
                      </View>

                      {/* Label */}
                      <Text
                        style={[s.itemLabel, isActive && { color: accentColor, fontWeight: '600' }]}
                        numberOfLines={1}
                      >
                        {cmd.label}
                      </Text>

                      {/* Arrow hint */}
                      {isActive && (
                        <AppIcon name="chevron-right" size={14} color={accentColor} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 8 }} />
        </ScrollView>
      )}

      {/* ── Footer hint ── */}
      {Platform.OS === 'web' && (
        <View style={s.footer}>
          <Text style={s.footerText}>↑↓ Gezin · Enter Aç · Esc Kapat</Text>
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
      onPress={openPalette}
      activeOpacity={0.88}
    >
      <AppIcon name="search" size={20} color="#FFFFFF" strokeWidth={2} />
    </TouchableOpacity>
  );
}

const fab = StyleSheet.create({
  btn: {
    position: 'absolute',
    right: 20,
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
