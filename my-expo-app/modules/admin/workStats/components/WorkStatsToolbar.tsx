/**
 * İş İstatistikleri araç çubuğu — başlık + ay seçici (‹ ay ›), klinik seçici,
 * kıyas segmenti, dışa aktarma. Yapışkanlık ve yarı saydam malzeme ekranın
 * işi (useStickyToolbar); bu bileşen yalnız içeriği çizer.
 * Dar ekranda (<768) Excel + PDF tek "Dışa aktar" menüsüne toplanır.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import {
  ChevronLeft, ChevronRight, ChevronDown, Building2, Download,
  FileSpreadsheet, FileText,
} from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { DS } from '../../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { NavyBackButtonX } from '../../../../core/ui/NavyBackButtonX';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import type { CompareMode } from '../months';
import { AnchoredPopover, measureAnchor, type AnchorRect } from './AnchoredPopover';

export interface WorkStatsToolbarProps {
  monthText: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev(): void;
  onNext(): void;
  onOpenMonthList(): void;
  clinicLabel: string;
  onOpenClinicPicker(anchor: AnchorRect | null): void;
  compare: CompareMode;
  onCompare(m: CompareMode): void;
  onExportXls(): void;
  onExportPdf(): void;
  exportError: string | null;
  busy: 'xls' | 'pdf' | null;
  narrow: boolean;
  /** Ekranın geri eylemi (Admin Özet'e döner). */
  onBack?(): void;
  /** Veri hazır değilken dışa aktarma kapalı. */
  exportDisabled?: boolean;
}

const web = Platform.OS === 'web';
const cursor = (on: boolean) => (web ? ({ cursor: on ? 'pointer' : 'default' } as any) : {});

/** Düz (beyaz) kapsül düğme — koyu temada U.plainBtn. Basınca anında 0.97. */
function PlainBtn({ onPress, children, label, disabled, dim, square, btnRef }: {
  onPress(): void; children: React.ReactNode; label: string;
  disabled?: boolean; dim?: boolean; square?: boolean; btnRef?: any;
}) {
  const U = useInkUI();
  return (
    <Pressable
      ref={btnRef}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || dim) }}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: 34, borderRadius: 999,
        ...(square ? { width: 34 } : { paddingHorizontal: 12 }),
        backgroundColor: hovered && !disabled && !dim ? U.plainBtn.hoverBg : U.plainBtn.bg,
        borderWidth: 1, borderColor: U.plainBtn.border,
        opacity: disabled ? 0.5 : dim ? 0.38 : 1,
        transform: [{ scale: pressed && !disabled && !dim ? 0.97 : 1 }],
        ...cursor(!disabled && !dim),
      })}
    >
      {children}
    </Pressable>
  );
}

export function WorkStatsToolbar(p: WorkStatsToolbarProps) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const clinicRef = useRef<any>(null);
  const exportRef = useRef<any>(null);
  const [menu, setMenu] = useState<AnchorRect | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const rtl = isRTL();
  // RTL'de araç çubuğu aynalanır; "önceki" oku sağda, ok yönleri de döner.
  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;
  const fg = U.plainBtn.fg;

  const seg = (m: CompareMode, label: string) => {
    const on = p.compare === m;
    return (
      <Pressable
        key={m}
        onPress={() => p.onCompare(m)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={({ pressed }: any) => ({
          // §1c kaydırmalı şerit: pasif 12 / aktif 18, dikey 8
          paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
          backgroundColor: on ? U.segActive : 'transparent',
          ...(on && web ? { boxShadow: U.isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.12)' } as any : {}),
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...cursor(true),
        })}
      >
        <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[500] }}>{label}</Text>
      </Pressable>
    );
  };

  const exportBtn = (kind: 'xls' | 'pdf') => {
    const isX = kind === 'xls';
    const Icon = isX ? FileSpreadsheet : FileText;
    const label = isX ? 'Excel' : 'PDF';
    return (
      <GlassTooltip
        key={kind}
        title={isX ? autoT('Excel olarak indir') : autoT('PDF olarak indir')}
        text={autoT('Seçili ay, klinik ve kıyasla dosya hazırlar')}
        placement="bottom"
      >
        <PlainBtn onPress={isX ? p.onExportXls : p.onExportPdf} label={label} disabled={!!p.busy || p.exportDisabled}>
          <Icon size={14} color={fg} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: fg }}>
            {p.busy === kind ? autoT('Hazırlanıyor…') : label}
          </Text>
        </PlainBtn>
      </GlassTooltip>
    );
  };

  const errorText = p.exportError ? (
    <Text accessibilityRole="alert" style={{ fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg, flexShrink: 1, maxWidth: 320 }}>
      {p.exportError}
    </Text>
  ) : null;

  const exportArea = p.narrow ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      {errorText}
      <PlainBtn
        btnRef={exportRef}
        label={autoT('Dışa aktar')}
        disabled={!!p.busy || p.exportDisabled}
        onPress={() => measureAnchor(exportRef.current, (a) => { setMenu(a); setMenuOpen(true); })}
      >
        <Download size={14} color={fg} strokeWidth={2} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: fg }}>
          {p.busy ? autoT('Hazırlanıyor…') : autoT('Dışa aktar')}
        </Text>
      </PlainBtn>
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      {errorText}
      {exportBtn('xls')}
      {exportBtn('pdf')}
    </View>
  );

  const menuRow = (kind: 'xls' | 'pdf') => {
    const isX = kind === 'xls';
    const Icon = isX ? FileSpreadsheet : FileText;
    return (
      <Pressable
        key={kind}
        onPress={() => { setMenuOpen(false); (isX ? p.onExportXls : p.onExportPdf)(); }}
        accessibilityRole="button"
        style={({ pressed, hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11,
          borderRadius: 12, backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }], ...cursor(true),
        })}
      >
        <Icon size={15} color={U.ink[700]} strokeWidth={2} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{isX ? 'Excel' : 'PDF'}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ gap: 12, paddingVertical: 12 }}>
      {/* 1. satır: geri + başlık · dışa aktarma */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {p.onBack ? (
          <NavyBackButtonX onPress={p.onBack} />
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={{
            flex: 1, minWidth: 140, fontFamily: DS.font.display as string, fontWeight: '300',
            fontSize: p.narrow ? 22 : 26, letterSpacing: p.narrow ? -0.55 : -0.65, color: U.ink[900],
          }}
        >
          İş İstatistikleri
        </Text>
        {exportArea}
      </View>

      {/* 2. satır: ay seçici · klinik · kıyas */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GlassTooltip title={autoT('Önceki ay')} text={autoT('Bir ay geri gider')} placement="bottom" enabled={p.canPrev}>
            <PlainBtn square dim={!p.canPrev} onPress={() => { if (p.canPrev) p.onPrev(); }} label={autoT('Önceki ay')}>
              <PrevIcon size={16} color={fg} strokeWidth={2.2} />
            </PlainBtn>
          </GlassTooltip>
          <GlassTooltip title={autoT('Ay seç')} text={autoT('Kayıt dönemindeki ayları listeler')} placement="bottom">
            <Pressable
              onPress={p.onOpenMonthList}
              accessibilityRole="button"
              accessibilityLabel={`${autoT('Ay seç')}: ${p.monthText}`}
              style={({ pressed, hovered }: any) => ({
                height: 34, minWidth: 128, paddingHorizontal: 14, borderRadius: 999,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? U.rowHover : 'transparent',
                transform: [{ scale: pressed ? 0.97 : 1 }], ...cursor(true),
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{p.monthText}</Text>
            </Pressable>
          </GlassTooltip>
          <GlassTooltip title={autoT('Sonraki ay')} text={autoT('Bir ay ileri gider')} placement="bottom" enabled={p.canNext}>
            <PlainBtn square dim={!p.canNext} onPress={() => { if (p.canNext) p.onNext(); }} label={autoT('Sonraki ay')}>
              <NextIcon size={16} color={fg} strokeWidth={2.2} />
            </PlainBtn>
          </GlassTooltip>
        </View>

        <PlainBtn
          btnRef={clinicRef}
          label={`${autoT('Klinik')}: ${p.clinicLabel}`}
          onPress={() => measureAnchor(clinicRef.current, p.onOpenClinicPicker)}
        >
          <Building2 size={14} color={U.isDark ? '#93C5FD' : accent} strokeWidth={2} />
          <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: fg, maxWidth: p.narrow ? 150 : 240 }}>
            {p.clinicLabel}
          </Text>
          <ChevronDown size={13} color={U.plainBtn.fgMuted} strokeWidth={2} />
        </PlainBtn>

        <View
          accessibilityRole="tablist"
          style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral }}
        >
          {seg('prev', autoT('Önceki ay'))}
          {seg('lastYear', autoT('Geçen yıl'))}
        </View>
      </View>

      <AnchoredPopover visible={menuOpen} anchor={menu} onClose={() => setMenuOpen(false)} width={200}>
        <View style={{ padding: 6 }}>
          {menuRow('xls')}
          {menuRow('pdf')}
        </View>
      </AnchoredPopover>
    </View>
  );
}
