// Nakit kasa kartı (TL / EUR): beklenen nakit, son sayım; Sayım yap · Bankaya yatır.
// Kasa yoksa "Kasayı aç". Saf görünüm — veri ve eylemler prop ile gelir (dev sayfası da çizer).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { Wallet, Plus, ClipboardCheck, Landmark } from '../../../core/ui/icons';
import type { Drawer } from '../api';
import type { DrawerCurrency } from '../drawerModel';
import { fmtCash } from './CashModalShell';

const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};

function CardBtn({ icon: Icon, label, hint, onPress, primary }: {
  icon: React.ComponentType<any>; label: string; hint: string; onPress: () => void; primary?: boolean;
}) {
  const U = useInkUI();
  const fg = primary ? U.onDarkPill : U.plainBtn.fg;
  return (
    <GlassTooltip title={label} text={hint}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
        style={({ hovered }: any) => ({
          height: 34, paddingHorizontal: 12, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: primary ? U.ink[900] : hovered ? U.plainBtn.hoverBg : U.plainBtn.bg,
          borderWidth: primary ? 0 : 1, borderColor: U.plainBtn.border,
          // @ts-ignore web
          cursor: 'pointer',
        })}>
        <Icon size={14} color={fg} strokeWidth={1.8} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: fg }} numberOfLines={1}>{label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

export function DrawerCard({ currency, drawer, selected, canManage, onSelect, onOpen, onCount, onDeposit }: {
  currency: DrawerCurrency;
  drawer: Drawer | null;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onCount: () => void;
  onDeposit: () => void;
}) {
  const U = useInkUI();
  const TH = usePanelTheme();
  const title = currency === 'EUR' ? autoT('EUR Kasası') : autoT('TL Kasası');
  const balance = Number(drawer?.balance) || 0;
  const lc = drawer?.last_count ?? null;
  const diffTone = !lc || lc.diff === 0 ? U.ink[500] : lc.diff > 0 ? U.chipTones.success.fg : U.chipTones.danger.fg;

  return (
    <Pressable
      onPress={drawer ? onSelect : undefined}
      disabled={!drawer}
      // İçinde düğmeler var → dış katman 'button' rolü almaz (web'de <button> içinde <button> geçersiz)
      accessibilityState={drawer ? { selected } : undefined}
      style={{
        flex: 1, minWidth: 240, padding: 16, borderRadius: 20, gap: 10,
        backgroundColor: U.surface,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? TH.primary : U.hairline,
        cursor: (drawer ? 'pointer' : 'default') as any,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.success.bg }}>
          <Wallet size={15} color={U.chipTones.success.fg} strokeWidth={1.7} />
        </View>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{title}</Text>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: U.ink[400] }}>{currency}</Text>
      </View>

      {drawer ? (
        <>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: U.ink[500] }}>
              {autoT('Beklenen nakit')}
            </Text>
            <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 30, letterSpacing: -0.8,
              color: balance < 0 ? U.chipTones.danger.fg : U.ink[900] }} numberOfLines={1}>
              {fmtCash(balance, currency)}
            </Text>
            <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={1}>
              {lc ? (
                <>
                  {autoT('Son sayım')} {fmtDay(lc.counted_at)}
                  <Text style={{ color: diffTone }}>
                    {' · '}{lc.diff === 0 ? autoT('fark yok') : `${lc.diff > 0 ? '+' : '−'}${fmtCash(Math.abs(lc.diff), currency)}`}
                  </Text>
                </>
              ) : (
                <>{autoT('Açılış')} {fmtDay(drawer.opened_at)}</>
              )}
            </Text>
          </View>
          {canManage ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <CardBtn icon={ClipboardCheck} label={autoT('Sayım yap')} hint={autoT('Kasadaki nakdi sayıp farkı kaydeder')} onPress={onCount} />
              <CardBtn icon={Landmark} label={autoT('Bankaya yatır')} hint={autoT('Kasadan bankaya yatırılan nakdi düşer')} onPress={onDeposit} />
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: U.ink[500] }}>
            {canManage ? autoT('Kasa henüz açılmadı. Kasadaki nakdi sayıp kasayı açın.') : autoT('Kasa henüz açılmadı.')}
          </Text>
          {canManage ? (
            <View style={{ flexDirection: 'row' }}>
              <CardBtn icon={Plus} primary label={autoT('Kasayı aç')} hint={autoT('Sayılan tutarla kasayı başlatır')} onPress={onOpen} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}
