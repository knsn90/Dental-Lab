/**
 * LayerPanel — White card with panel-accent highlights.
 *
 * Tasarım dili (toolbar dock ile tutarlı):
 *   • Beyaz card + ince accent border + soft drop shadow
 *   • Aktif satır → accent tint bg + accent sol-border
 *   • Eye / Lock / Isolate butonları → pill-shape, aktif = accent fill
 *   • Quick Tümü / Gizle butonları → pill-style segmented control
 *   • Diagnostic badges → accent-tinted renkler
 *   • Sliders → accent thumb
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import {
  Eye, EyeOff, Layers, ChevronDown, ChevronRight, ChevronLeft, Box, Grid3x3, X,
  Lock, Unlock, Focus, PenLine,
} from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import type { ViewerFile, LayerStyle } from '../types';
import { classifyFile, type LayerType } from '../lib/layerMap';
import { useViewerTheme } from '../lib/viewerTheme';
import { type MeshDiagnostics, flagLabel, flagDescription } from '../lib/meshDiagnostics';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

interface Props {
  files: ViewerFile[];
  layerStyles: Record<string, LayerStyle>;
  onChange: (fileId: string, patch: Partial<LayerStyle>) => void;
  onSetAllVisible: (visible: boolean) => void;
  onClose?: () => void;
  diagnostics?: Record<string, MeshDiagnostics>;
  /** 3D kalem notları — sipariş bağlamı yoksa verilmez (özellik kapalı) */
  notes?: { count: number; visible: boolean; onToggle: () => void };
}

interface Group {
  key: string;
  label: string;
  types: LayerType[];
}

const GROUPS: Group[] = [
  { key: 'jaws',    label: 'Çene Taramaları',     types: ['maxilla', 'mandible', 'antagonist'] },
  { key: 'tissue',  label: 'Bite & Yumuşak Doku', types: ['bite', 'gingiva'] },
  { key: 'design',  label: 'Restorasyon',         types: ['design', 'wax', 'scanbody'] },
  { key: 'other',   label: 'Diğer',               types: ['other'] },
];

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function LayerPanel({ files, layerStyles, onChange, onSetAllVisible, onClose, diagnostics, notes }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({
    jaws: true, tissue: true, design: true, other: true,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const T = useViewerTheme();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  // Telefon genişliği: panel 300px kart olarak sol üstte durunca ekranın
  // yarısını ve modelin tamamını kapatıyor (kullanıcı cihazda gördü).
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 768;

  // Beyaz card paleti — toolbar dock ile uyumlu
  const C = {
    cardBg: '#FFFFFF',
    cardBorder: hexAlpha(T.accent, 0.18),
    fg: '#18181B',
    fgMuted: '#71717A',
    fgFaint: '#A1A1AA',
    rowHover: hexAlpha(T.accent, 0.06),
    rowActive: hexAlpha(T.accent, 0.10),
    accent: T.accent,
    accentFg: '#FFFFFF',
    accentSoft: hexAlpha(T.accent, 0.12),
    divider: '#F1F1F4',
    controlBg: '#F4F4F5',
    controlBgHover: '#E4E4E7',
    tooltipBg: '#27272A',
    tooltipFg: '#FFFFFF',
  };

  // Classify all files & group by type
  const grouped = useMemo(() => {
    const byType = new Map<LayerType, { file: ViewerFile; layer: ReturnType<typeof classifyFile> }[]>();
    for (const f of files) {
      const layer = classifyFile(f.name);
      if (!byType.has(layer.type)) byType.set(layer.type, []);
      byType.get(layer.type)!.push({ file: f, layer });
    }
    return GROUPS.map((g) => ({
      ...g,
      items: g.types
        .flatMap((t) => byType.get(t) ?? [])
        .sort((a, b) => a.layer.order - b.layer.order),
    })).filter((g) => g.items.length > 0);
  }, [files]);

  const visibleCount = files.filter((f) => layerStyles[f.id]?.visible !== false).length;
  const allVisible = visibleCount === files.length;
  const noneVisible = visibleCount === 0;

  const isolateOne = (fileId: string) => {
    for (const f of files) {
      const isMe = f.id === fileId;
      const cur = layerStyles[f.id];
      if (cur?.locked) continue;
      if ((cur?.visible !== false) !== isMe) onChange(f.id, { visible: isMe });
    }
    setActiveId(fileId);
  };

  return (
    <View style={{
      position: 'absolute',
      // Dar ekran (telefon): panel modelin ÜSTÜNÜ kapatmasın → alta yerleşir,
      // yüksekliği ekranın yarısıyla sınırlı, kenardan kenara. Geniş ekranda
      // eskisi gibi sol üstte 300px kart.
      ...(isNarrow
        ? { left: 10, right: 10, bottom: 12, maxHeight: '46%' as any }
        : { top: 14, start: 14, width: 300, maxHeight: '85%' as any }),
      backgroundColor: C.cardBg,
      borderRadius: 18,
      borderWidth: 1, borderColor: C.cardBorder,
      flexDirection: 'column',
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
      ...(Platform.OS === 'web' ? { backdropFilter: 'blur(14px)' } as any : {}),
      zIndex: 20,
      overflow: 'hidden',
    } as any}>
      {/* ── Header ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: C.divider,
      }}>
        <View style={{
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: C.accentSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Layers size={12} color={C.accent} strokeWidth={2.2} />
        </View>
        <Text style={{ color: C.fg, fontSize: 13, fontWeight: '700', letterSpacing: -0.1 }}>
          Katmanlar
        </Text>
        <View style={{
          marginStart: 'auto' as any,
          paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
          backgroundColor: C.accentSoft,
        }}>
          <Text style={{ color: C.accent, fontSize: 10, fontWeight: '800' }}>
            {visibleCount}/{files.length}
          </Text>
        </View>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={6}
            style={({ hovered }: any) => ({
              width: 26, height: 26, borderRadius: 13,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? C.controlBg : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 140ms ease' } as any : {}),
            })}
          >
            <X size={13} color={C.fgMuted} strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>

      {/* ── Quick toggles (segmented pill) ── */}
      <View style={{
        flexDirection: 'row',
        marginHorizontal: 12, marginTop: 10, marginBottom: 4,
        backgroundColor: C.controlBg,
        borderRadius: 999, padding: 3,
      }}>
        <SegPill
          label="Tümü"
          active={allVisible}
          disabled={allVisible}
          onPress={() => onSetAllVisible(true)}
          C={C}
        />
        <SegPill
          label="Gizle"
          active={noneVisible}
          disabled={noneVisible}
          onPress={() => onSetAllVisible(false)}
          C={C}
        />
      </View>

      {/* ── Notlar katmanı ──────────────────────────────────────────────
          Hekimin/labın 3D kalemle bıraktığı işaretler AYRI bir katman: tarama
          dosyasına dokunulmuyor, buradan tek dokunuşla gizlenebiliyor. */}
      {notes && notes.count > 0 && (
        <Pressable
          onPress={notes.onToggle}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 9,
            marginHorizontal: 12, marginTop: 8,
            paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12,
            backgroundColor: hovered ? C.rowHover : 'transparent',
            borderWidth: 1, borderColor: C.divider,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <View style={{
            width: 22, height: 22, borderRadius: 7,
            backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center',
          }}>
            <PenLine size={12} color={C.accent} strokeWidth={2.2} />
          </View>
          <Text style={{ flex: 1, color: C.fg, fontSize: 12.5, fontWeight: '600' }} numberOfLines={1}>
            {autoT('Notlar')}
          </Text>
          <Text style={{ color: C.fgMuted, fontSize: 10.5, fontWeight: '700' }}>{notes.count}</Text>
          <View style={{
            width: 28, height: 28, borderRadius: 14,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: notes.visible ? C.accent : C.controlBg,
          }}>
            {notes.visible
              ? <Eye size={14} color={C.accentFg} strokeWidth={2} />
              : <EyeOff size={14} color={C.fgMuted} strokeWidth={2} />}
          </View>
        </Pressable>
      )}

      {/* ── Grouped layer list ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 14, paddingTop: 6 }}>
        {grouped.length === 0 && (
          <View style={{ padding: 30, alignItems: 'center' }}>
            <Text style={{ color: C.fgFaint, fontSize: 12 }}>Dosya yok</Text>
          </View>
        )}
        {grouped.map((group) => {
          const open = groupOpen[group.key] ?? true;
          return (
            <View key={group.key}>
              {/* Group header */}
              <Pressable
                onPress={() => setGroupOpen(s => ({ ...s, [group.key]: !open }))}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8, marginTop: 4,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                {open
                  ? <ChevronDown size={11} color={C.fgMuted} strokeWidth={2.2} />
                  : isRTL()
                    ? <ChevronLeft size={11} color={C.fgMuted} strokeWidth={2.2} />
                    : <ChevronRight size={11} color={C.fgMuted} strokeWidth={2.2} />}
                <Text style={{
                  color: C.fgMuted, fontSize: 9.5, fontWeight: '800',
                  letterSpacing: 0.7, textTransform: 'uppercase', flex: 1,
                }}>
                  {group.label}
                </Text>
                <Text style={{ color: C.fgFaint, fontSize: 10, fontWeight: '700' }}>
                  {group.items.length}
                </Text>
              </Pressable>
              {open && group.items.map(({ file, layer }) => {
                const style = layerStyles[file.id] ?? {
                  visible: true, opacity: layer.opacity ?? 1, color: layer.color, wireframe: false,
                };
                const visible = style.visible;
                const locked = !!style.locked;
                const isExpanded = expanded[file.id] ?? false;
                const isActive = activeId === file.id;
                const flags = diagnostics?.[file.id]?.flags ?? [];

                return (
                  <View key={file.id}>
                    {/* Row */}
                    <Pressable
                      onPress={() => setActiveId(file.id)}
                      style={({ hovered }: any) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        marginHorizontal: 8, marginVertical: 1,
                        paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12,
                        backgroundColor: isActive
                          ? C.rowActive
                          : hovered ? C.rowHover : 'transparent',
                        position: 'relative',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 140ms ease' } as any : {}),
                      })}
                    >
                      {/* Active left bar */}
                      {isActive && (
                        <View style={{
                          position: 'absolute', start: 0, top: 8, bottom: 8,
                          width: 3, borderRadius: 2,
                          backgroundColor: C.accent,
                        }} />
                      )}

                      <Pressable
                        onPress={() => setExpanded(e => ({ ...e, [file.id]: !isExpanded }))}
                        hitSlop={4}
                        style={({ hovered }: any) => ({
                          width: 20, height: 20, borderRadius: 6,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: hovered ? C.controlBg : 'transparent',
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        {isExpanded
                          ? <ChevronDown size={11} color={C.fgMuted} strokeWidth={2.2} />
                          : isRTL()
                            ? <ChevronLeft size={11} color={C.fgMuted} strokeWidth={2.2} />
                            : <ChevronRight size={11} color={C.fgMuted} strokeWidth={2.2} />}
                      </Pressable>

                      <View style={{
                        width: 14, height: 14, borderRadius: 4,
                        backgroundColor: style.color,
                        borderWidth: 1, borderColor: hexAlpha('#000000', 0.08),
                        opacity: visible ? 1 : 0.35,
                      }} />

                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text numberOfLines={1} style={{
                            color: visible ? C.fg : C.fgMuted,
                            fontSize: 12, fontWeight: '600',
                            flex: 1,
                          }}>
                            {layer.label}
                          </Text>
                          {flags.slice(0, 3).map((f) => (
                            <View
                              key={f}
                              // @ts-ignore web tooltip
                              title={flagDescription(f) + ' — ' + flagLabel(f)}
                              style={{
                                paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999,
                                backgroundColor: f === 'huge' ? '#FEF3C7'
                                  : f === 'low-density' ? '#E4E4E7'
                                  : '#FECACA',
                              }}
                            >
                              <Text style={{
                                color: f === 'huge' ? '#92400E'
                                  : f === 'low-density' ? '#52525B'
                                  : '#991B1B',
                                fontSize: 8, fontWeight: '800', letterSpacing: 0.2,
                              }}>
                                {f === 'holes' ? '⊘'
                                  : f === 'non-manifold' ? '≠'
                                  : f === 'inverted' ? '⇅'
                                  : f === 'low-density' ? 'LD'
                                  : 'HUGE'}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text numberOfLines={1} style={{ color: C.fgFaint, fontSize: 10 }}>
                          {file.name}
                        </Text>
                      </View>

                      {/* Action icons */}
                      <IconPill
                        active={false}
                        onPress={() => isolateOne(file.id)}
                        label="İzole et"
                        C={C}
                      >
                        <Focus size={12} color={C.fgMuted} strokeWidth={2} />
                      </IconPill>

                      <IconPill
                        active={locked}
                        onPress={() => onChange(file.id, { locked: !locked })}
                        label={locked ? 'Kilidi aç' : 'Kilitle'}
                        C={C}
                      >
                        {locked
                          ? <Lock size={12} color={C.accentFg} strokeWidth={2.2} />
                          : <Unlock size={12} color={C.fgMuted} strokeWidth={2} />}
                      </IconPill>

                      <IconPill
                        active={visible}
                        onPress={() => !locked && onChange(file.id, { visible: !visible })}
                        disabled={locked}
                        label={visible ? 'Gizle' : 'Göster'}
                        C={C}
                      >
                        {visible
                          ? <Eye size={13} color={C.accentFg} strokeWidth={2.2} />
                          : <EyeOff size={13} color={C.fgMuted} strokeWidth={2} />}
                      </IconPill>
                    </Pressable>

                    {/* Expanded controls */}
                    {isExpanded && (
                      <View style={{
                        marginHorizontal: 14, marginBottom: 10,
                        padding: 12, borderRadius: 14,
                        backgroundColor: C.controlBg,
                        gap: 12,
                        opacity: locked ? 0.55 : 1,
                      }}>
                        {locked && (
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            alignSelf: 'flex-start',
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                            backgroundColor: C.accentSoft,
                          }}>
                            <Lock size={9} color={C.accent} strokeWidth={2.4} />
                            <Text style={{ color: C.accent, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 }}>
                              KİLİTLİ
                            </Text>
                          </View>
                        )}

                        {/* Opacity */}
                        <View style={{ gap: 5 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: C.fgMuted, fontSize: 10.5, fontWeight: '600' }}>
                              Opaklık
                            </Text>
                            <View style={{
                              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                              backgroundColor: C.accent,
                            }}>
                              <Text style={{ color: C.accentFg, fontSize: 10, fontWeight: '800' }}>
                                {Math.round(style.opacity * 100)}%
                              </Text>
                            </View>
                          </View>
                          {Platform.OS === 'web' ? (
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            React.createElement('input' as any, {
                              type: 'range',
                              min: 0, max: 100, step: 1,
                              value: Math.round(style.opacity * 100),
                              disabled: locked,
                              onChange: (e: any) => onChange(file.id, { opacity: parseInt(e.target.value, 10) / 100 }),
                              style: { width: '100%', accentColor: C.accent, cursor: locked ? 'not-allowed' : 'pointer' },
                            })
                          ) : null}
                        </View>

                        {/* Color */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ color: C.fgMuted, fontSize: 10.5, fontWeight: '600', flex: 1 }}>
                            Renk
                          </Text>
                          {Platform.OS === 'web' ? (
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            React.createElement('input' as any, {
                              type: 'color',
                              value: style.color,
                              disabled: locked,
                              onChange: (e: any) => onChange(file.id, { color: e.target.value }),
                              style: {
                                width: 28, height: 24, borderRadius: 8, border: 'none',
                                background: 'transparent', cursor: locked ? 'not-allowed' : 'pointer', padding: 0,
                              },
                            })
                          ) : (
                            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: style.color }} />
                          )}
                        </View>

                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ── SegPill: Tümü / Gizle segmented control ── */
function SegPill({ label, active, disabled, onPress, C }: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  C: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered }: any) => ({
        flex: 1, paddingVertical: 7, borderRadius: 999,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active ? C.accent : hovered && !disabled ? '#FFFFFF' : 'transparent',
        opacity: disabled ? 0.5 : 1,
        ...(Platform.OS === 'web' ? {
          cursor: disabled ? 'default' : 'pointer',
          transition: 'background-color 140ms ease',
        } as any : {}),
      })}
    >
      <Text style={{
        color: active ? C.accentFg : C.fg,
        fontSize: 11, fontWeight: '700',
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── IconPill: küçük yuvarlak buton, aktifte accent fill ── */
function IconPill({ active, disabled, onPress, label, children, C }: {
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  C: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      // @ts-ignore web tooltip
      title={label}
      style={({ hovered }: any) => ({
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: active
          ? C.accent
          : hovered && !disabled ? C.controlBgHover : 'transparent',
        opacity: disabled ? 0.5 : 1,
        ...(Platform.OS === 'web' ? {
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 140ms ease',
        } as any : {}),
      })}
    >
      {children}
    </Pressable>
  );
}
