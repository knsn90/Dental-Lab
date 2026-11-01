/**
 * MobileTableX — mobil kayıt tablosu kabuğu (ekstre / giderler / faturalar dili).
 *
 * Kullanıcı: "finans bölümünde bütün tablolar bu tarz olsun". Tek kart (`tableCard`)
 * + panel accent'li başlık şeridi (başlık + kayıt sayısı) + hairline ayrımlı
 * satırlar + isteğe bağlı surfaceSoft alt satır. Satır içeriği ekrana aittir;
 * ölçüler (16/12 dolgu, 32px ikon karesi, 13/11 metin) buradan gelir.
 *
 * ```tsx
 * <MobileTableX title="Gider Listesi" count={rows.length} countLabel="kayıt"
 *   footer={<><Text style={T.footNote}>…</Text>…</>}>
 *   {rows.map((r, i) => (
 *     <MobileTableRowX key={r.id} isLast={i === rows.length - 1} onPress={() => open(r)}>
 *       <MobileTableIconX icon={Receipt} />
 *       <View style={{ flex: 1, minWidth: 0 }}>
 *         <Text style={T.title} numberOfLines={1}>{r.name}</Text>
 *         <Text style={T.sub} numberOfLines={1}>{r.detail}</Text>
 *       </View>
 *       <Text style={T.amount}>{fmt(r.amount)}</Text>
 *     </MobileTableRowX>
 *   ))}
 * </MobileTableX>
 * ```
 *
 * Başlık ve `countLabel` düz Türkçe dize verilir; ayrı string çocuğu olarak
 * çizildiği için otomatik sözlük çevirir.
 */
import React from 'react';
import { View, Text, Pressable, Platform, type ViewStyle, type TextStyle } from 'react-native';
import { useInkUI } from '../theme/inkScale';
import { usePanelTheme, onAccentInk } from '../theme/usePanelTheme';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

export function MobileTableX({ title, subtitle, count, countLabel, accent, right, footer, children, style }: {
  title: string;
  /** Başlığın altında küçük satır (ör. seçili kasanın adı) */
  subtitle?: string;
  /** Başlık şeridinin sağındaki sayı ("4 kayıt") */
  count?: number;
  countLabel?: string;
  /** Şerit zemini — verilmezse aktif panelin primary'si (masaüstü tablolarla aynı) */
  accent?: string;
  /** Sayının yerine/yanına şeride konacak öğe (ör. küçük bir düğme) */
  right?: React.ReactNode;
  /** surfaceSoft alt satırın içeriği (toplamlar vb.) */
  footer?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const U = useInkUI();
  const panelAccent = usePanelTheme().primary;
  const bg = accent ?? panelAccent;
  const ink = onAccentInk(bg);
  return (
    <View style={[U.tableCard as ViewStyle, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: bg }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: ink }} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 11, color: ink, opacity: 0.75, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={{ flex: 1 }} />
        {count != null ? (
          <Text style={{ fontSize: 12, color: ink, opacity: 0.75 }}>{count} {countLabel ?? 'kayıt'}</Text>
        ) : null}
        {right}
      </View>
      {children}
      {footer ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 12,
          borderTopWidth: 1, borderTopColor: U.hairline,
          backgroundColor: U.surfaceSoft,
        }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Tablo satırı. `onPress` yoksa düz View. Fonksiyon-stil yalnız web'de verilir —
 * iOS'ta fonksiyon-stilli Pressable satır yerleşimini düşürüyordu.
 */
export function MobileTableRowX({ onPress, isLast, tint, children, align = 'center' }: {
  onPress?: () => void;
  isLast?: boolean;
  /** Satır zemini (ör. gecikmiş kayıt için hafif kırmızı) */
  tint?: string;
  align?: 'center' | 'flex-start';
  children: React.ReactNode;
}) {
  const U = useInkUI();
  const base: ViewStyle = {
    flexDirection: 'row', alignItems: align, gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: isLast ? 0 : 1,
    borderBottomColor: U.hairlineSoft,
    backgroundColor: tint ?? 'transparent',
  };
  if (!onPress) return <View style={base}>{children}</View>;
  const fn = ({ hovered, pressed }: any) => ({
    ...base,
    ...(hovered || pressed ? { backgroundColor: U.rowHover } : {}),
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  });
  return (
    <Pressable onPress={onPress} style={Platform.OS === 'web' ? fn : fn({ hovered: false, pressed: false })}>
      {children}
    </Pressable>
  );
}

/** Satır başı 32px ikon karesi. `tone` yoksa nötr. */
export function MobileTableIconX({ icon: Icon, tone }: {
  icon: React.ComponentType<any>;
  tone?: { bg: string; fg: string };
}) {
  const U = useInkUI();
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: tone?.bg ?? U.chipNeutral,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon size={14} color={tone?.fg ?? U.ink[500]} strokeWidth={1.8} />
    </View>
  );
}

/** Kişi satırları için 32px baş harf karesi (ikon karesiyle aynı ölçü). */
export function MobileTableInitialX({ name, tone, muted }: {
  name?: string | null;
  tone?: { bg: string; fg: string };
  /** Pasif kayıt — nötr ton */
  muted?: boolean;
}) {
  const U = useInkUI();
  const t = muted || !tone ? { bg: U.chipNeutral, fg: U.ink[500] } : tone;
  return (
    <View style={{
      width: 32, height: 32, borderRadius: 10,
      backgroundColor: t.bg,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: t.fg }}>{(name?.trim()?.[0] ?? '?').toLocaleUpperCase('tr-TR')}</Text>
    </View>
  );
}

/** Satır metin ölçüleri — başlık 13/600, alt satır 11, tutar 13/600, alt satır notu 11. */
export function useMobileTableText(): {
  title: TextStyle; sub: TextStyle; meta: TextStyle; amount: TextStyle; amountSub: TextStyle; footNote: TextStyle; footLabel: TextStyle;
} {
  const U = useInkUI();
  return {
    title:     { fontSize: 13, fontWeight: '600', color: U.ink[900] },
    sub:       { fontSize: 11, color: U.ink[400], marginTop: 1 },
    meta:      { fontSize: 11, color: U.ink[400] },
    amount:    { fontSize: 13, fontWeight: '600', color: U.ink[900] },
    amountSub: { fontSize: 10, color: U.ink[400], marginTop: 1 },
    footNote:  { fontSize: 11, color: U.ink[500] },
    footLabel: { fontSize: 12, fontWeight: '600', color: U.ink[700] },
  };
}
