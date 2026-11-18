/**
 * Ekstre çıktısı (PDF / Yazdır) düğmesi + kapsam menüsü.
 * Düğmeye basınca tetikleyiciye yaslı küçük menü açılır; üç seçenek:
 *   Ön ekstre          — yalnız klinik onayındaki hizmet bedelleri
 *   Onaylanmış ekstre  — yalnız kesinleşmiş hareketler
 *   Tam ekstre         — ikisi birlikte (onaylanmış ekstre + altında onay bekleyenler)
 * Seçim cihazda hatırlanır (menüde işaretli görünür); biçim (Özet/Ayrıntılı) ayrı ayar penceresinde.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { Check } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';

export type StatementScope = 'pre' | 'approved' | 'full';
export const STATEMENT_SCOPES: readonly StatementScope[] = ['pre', 'approved', 'full'];

export function scopeLabel(s: StatementScope): string {
  return s === 'pre' ? autoT('Ön ekstre') : s === 'approved' ? autoT('Onaylanmış ekstre') : autoT('Tam ekstre');
}

export function StatementScopeMenu({
  icon: Icon, label, tooltipTitle, tooltipText, busy, current, preDisabled, onPick, compact,
}: {
  icon: React.ComponentType<any>;
  /** Boşsa yalnız ikon (mobil) */
  label?: string;
  tooltipTitle: string;
  tooltipText: string;
  busy?: boolean;
  /** Son seçilen kapsam (menüde işaretli) */
  current?: StatementScope | null;
  /** Onay bekleyen kalem yoksa "Ön ekstre" pasif */
  preDisabled?: boolean;
  onPick: (s: StatementScope) => void;
  /** Daha küçük dolgu (ön ekstre ekranındaki düğme dizisi) */
  compact?: boolean;
}) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
  const MENU_W = 290;

  const openMenu = () => {
    const node = ref.current;
    if (node?.measureInWindow) node.measureInWindow((x: number, y: number, w: number, h: number) => { setAnchor({ x, y, w, h }); setOpen(true); });
    else { setAnchor(null); setOpen(true); }
  };
  const win = Dimensions.get('window');
  const estH = 3 * 60 + 12;
  // Tetikleyicinin sağ kenarına yaslı; ekrana sığmazsa sola kaydır, altta yer yoksa üstte aç.
  const left = anchor ? Math.max(8, Math.min(anchor.x + anchor.w - MENU_W, win.width - MENU_W - 8)) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const top = anchor && below + estH > win.height - 12 ? Math.max(12, anchor.y - estH - 6) : below;

  const hintOf = (s: StatementScope) =>
    s === 'pre' ? (preDisabled ? autoT('Onay bekleyen kalem yok') : autoT('Yalnız klinik onayındaki hizmet bedelleri'))
      : s === 'approved' ? autoT('Yalnız kesinleşmiş hareketler')
        : autoT('Onaylanmış ekstre ve altında onay bekleyenler');

  return (
    <>
      <GlassTooltip title={tooltipTitle} text={tooltipText}>
        <Pressable
          ref={ref}
          onPress={openMenu}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={tooltipTitle}
          style={({ pressed, hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: label ? (compact ? 14 : 16) : 12, paddingVertical: compact ? 9 : 10,
            borderRadius: 999, borderWidth: 1, borderColor: U.ink[200],
            backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
            opacity: busy ? 0.5 : 1, ...web,
          })}
        >
          <Icon size={14} color={U.ink[700]} strokeWidth={1.8} />
          {label ? <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{label}</Text> : null}
        </Pressable>
      </GlassTooltip>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, left, width: MENU_W, padding: 6, borderRadius: 14,
              backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
              shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
            }}
          >
            {STATEMENT_SCOPES.map(s => {
              const disabled = s === 'pre' && !!preDisabled;
              const active = current === s;
              return (
                <Pressable
                  key={s}
                  disabled={disabled}
                  // Tıklama jesti içinde çalıştır: Yazdır penceresi açılır pencere engeline takılmasın.
                  onPress={() => { setOpen(false); onPick(s); }}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10,
                    borderRadius: 10, backgroundColor: !disabled && (hovered || pressed) ? U.rowHover : 'transparent',
                    opacity: disabled ? 0.45 : 1, ...(disabled ? {} : web),
                  })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{scopeLabel(s)}</Text>
                    <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 1 }}>{hintOf(s)}</Text>
                  </View>
                  {active ? <Check size={14} color={U.ink[700]} strokeWidth={2.2} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
