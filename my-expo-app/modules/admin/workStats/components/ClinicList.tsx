/**
 * Seçili ayın klinikleri (spec §7.4): bu ay en çok üye gönderenden aza; kıyas
 * ayında gönderip bu ay göndermeyenler sonda soluk ve "bu ay 0". Kliniğe basınca
 * üstteki klinik seçici o kliniğe geçer (sayfanın tamamı süzülür). İş tipine
 * odaklanılmışsa başlıkta odak çipi görünür, çarpısı odağı kaldırır.
 */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { ChevronRight, ChevronLeft, X } from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { hexA } from '../../../../core/theme/stationPalette';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import type { ClinicRow } from '../aggregate';
import { UNKNOWN_CLINIC_NAME } from '../aggregate';
import { diffOf, signedText } from '../overview';

const web = Platform.OS === 'web';

export interface ClinicListProps {
  rows: ClinicRow[];
  onPick(clinicId: string): void;
  /** İş tipi odağı (klinik listesi o tipe süzülü). */
  focusLabel?: string | null;
  onClearFocus?(): void;
}

export function ClinicList({ rows, onPick, focusLabel, onClearFocus }: ClinicListProps) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const tint = U.isDark ? '#93C5FD' : accent;
  // Açık temada accent metni (ör. safran) beyazda okunmaz → koyu mürekkep.
  const chipInk = U.isDark ? tint : U.ink[900];
  return (
    <View style={{ ...U.cardSolid, padding: 16, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[400] }}>
          Klinikler
        </Text>
        {focusLabel ? (
          <Pressable
            onPress={onClearFocus}
            accessibilityRole="button"
            accessibilityLabel={`${autoT('Süzgeci kaldır')}: ${autoT(focusLabel)}`}
            style={({ pressed, hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
              backgroundColor: hexA(tint, hovered ? 0.2 : 0.12),
              transform: [{ scale: pressed ? 0.97 : 1 }],
              ...(web ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '600', color: chipInk, maxWidth: 180 }}>{autoT(focusLabel)}</Text>
            <X size={11} color={chipInk} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </View>
      {rows.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: U.ink[500], paddingHorizontal: 6, paddingVertical: 8 }}>Bu ay sipariş gelmedi</Text>
      ) : rows.map((r) => <ClinicItem key={r.id} row={r} onPress={() => onPick(r.id)} />)}
    </View>
  );
}

function ClinicItem({ row, onPress }: { row: ClinicRow; onPress(): void }) {
  const U = useInkUI();
  const silent = row.qty.uye === 0 && row.qty.cene === 0 && row.qty.adet === 0;
  const d = diffOf(row.qty.uye, row.compare?.uye);
  const diffTone = d?.dir === 'up' ? U.chipTones.success.fg : d?.dir === 'down' ? U.chipTones.danger.fg : U.ink[400];
  const name = row.name === UNKNOWN_CLINIC_NAME ? autoT(UNKNOWN_CLINIC_NAME) : row.name;
  const extra: string[] = [];
  if (row.qty.cene) extra.push(`${row.qty.cene} ${autoT('çene')}`);
  if (row.qty.adet) extra.push(`${row.qty.adet} ${autoT('adet')}`);
  const dirWord = d?.dir === 'up' ? autoT('artış') : d?.dir === 'down' ? autoT('azalış') : d ? autoT('değişmedi') : autoT('kıyas yok');
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}: ${silent ? autoT('bu ay 0') : `${row.qty.uye} ${autoT('üye')}`} · ${dirWord}${d ? ` ${signedText(d.delta)}` : ''}`}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 10, paddingVertical: 10, borderRadius: 14,
        backgroundColor: hovered ? U.rowHover : 'transparent',
        opacity: silent ? 0.55 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(web ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ textAlign: isRTL() ? 'right' : 'left', fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>{name}</Text>
        {extra.length ? (
          <Text numberOfLines={1} style={{ textAlign: isRTL() ? 'right' : 'left', fontSize: 11, color: U.ink[500], marginTop: 1 }}>{extra.join(' · ')}</Text>
        ) : null}
      </View>
      {silent ? (
        <Text style={{ fontSize: 12, color: U.ink[500] }}>bu ay 0</Text>
      ) : (
        <>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{String(row.qty.uye)}</Text>
          <Text style={{ fontSize: 11, color: U.ink[500] }}>üye</Text>
        </>
      )}
      <Text style={{ minWidth: 34, writingDirection: 'ltr', textAlign: isRTL() ? 'left' : 'right', fontSize: 11.5, fontWeight: '600', color: diffTone, fontVariant: ['tabular-nums'] }}>
        {d ? signedText(d.delta) : '—'}
      </Text>
      <Chevron size={14} color={U.ink[300]} strokeWidth={2} />
    </Pressable>
  );
}
