// Liste kartlarındaki 4 rakamlık şerit (TÜM ZAMANLAR): üye · ciro · borç · son sipariş.
// Yüklenirken "…", hata/özet yok → hiç çizilmez (liste beklemez, bozulmaz).
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { printLocale } from '../../../core/i18n/printLocale';
import { gregorianLocale } from '../../admin/workStats/months';
import { useClinicSummary } from '../useClinicSummaries';
import type { ClinicSummary } from '../summary';
import { MoneyText } from './MoneyText';

export function fmtDay(iso: string | null, withYear = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(gregorianLocale(printLocale()), {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  }).format(d);
}

export function qtyExtras(q: { cene: number; adet: number }): string {
  const parts: string[] = [];
  if (q.cene > 0) parts.push(`${q.cene} ${autoT('çene')}`);
  if (q.adet > 0) parts.push(`${q.adet} ${autoT('adet')}`);
  return parts.join(' · ');
}

export function ClinicSummaryStrip(props: { clinicId: string; onOpen?: () => void; summary?: ClinicSummary | null }) {
  const U = useInkUI();
  const canProfit = usePermissionStore((s) => s.can('view_profit'));
  const canBalance = usePermissionStore((s) => s.can('view_clinic_balance'));
  const live = useClinicSummary(props.summary === undefined ? props.clinicId : null);
  const s = props.summary !== undefined ? props.summary : live.summary;
  const status = props.summary !== undefined ? 'ready' : live.status;
  const group = (useSegments() as string[])[0];
  const allowed = props.summary !== undefined || group === '(lab)' || group === '(admin)';

  if (!allowed) return null;
  if (status === 'loading' && !s) {
    return <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 6 }}>…</Text>;
  }
  if (!s) return null;

  const label = { fontSize: 11.5, color: U.ink[500] } as const;
  const value = { fontSize: 12.5, fontWeight: '600' as const, color: U.ink[900] };
  const dot = <Text style={{ fontSize: 12, color: U.ink[300] }}>·</Text>;
  const extras = qtyExtras(s.all.qty);
  const late = s.overdue.length > 0;
  const danger = U.chipTones.danger;

  const body = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginTop: 8 }}>
      <Text style={value}>{`${s.all.qty.uye} ${autoT('üye')}`}{extras ? <Text style={label}>{` · ${extras}`}</Text> : null}</Text>
      {canProfit ? (<>{dot}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={label}>{autoT('Ciro')}</Text><MoneyText list={s.all.revenue} /></View></>) : null}
      {canBalance ? (
        <>
          {dot}
          <GlassTooltip
            enabled={late}
            title={autoT('Vadesi geçmiş borç')}
            text={s.oldestOverdueDays != null ? `${s.oldestOverdueDays} ${autoT('gün gecikti')}` : autoT('Vadesi geçmiş borç')}
          >
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              ...(late ? { backgroundColor: danger.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 } : {}),
            }}>
              <Text style={late ? { ...label, color: danger.fg } : label}>{autoT('Borç')}</Text>
              <MoneyText list={s.balance} color={late ? danger.fg : undefined} />
            </View>
          </GlassTooltip>
        </>
      ) : null}
      {dot}
      <Text style={label}>
        {s.lastOrderAt ? `${autoT('Son sipariş')}: ${fmtDay(s.lastOrderAt)}` : autoT('Son sipariş yok')}
      </Text>
    </View>
  );

  if (!props.onOpen) return body;
  return (
    <Pressable
      onPress={(e: any) => { e?.stopPropagation?.(); props.onOpen?.(); }}
      accessibilityRole="button"
      accessibilityLabel={autoT('Klinik özeti')}
      style={({ pressed, hovered }: any) => ({
        alignSelf: 'flex-start', borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6, paddingBottom: 4,
        backgroundColor: hovered ? U.rowHover : 'transparent', opacity: pressed ? 0.7 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
      })}
    >
      {body}
    </Pressable>
  );
}
