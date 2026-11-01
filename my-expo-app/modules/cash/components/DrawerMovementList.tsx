// Seçili nakit kasanın hareketleri. Otomatik hareket (tahsilat · makbuz · gider · sayım) burada
// silinmez/düzenlenmez — dokununca kaynağına gidilir; yalnız elle hareket (bankaya yatırma vb.) silinir.
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { MobileTableX, MobileTableRowX, MobileTableIconX } from '../../../core/ui/MobileTableX';
import { confirmAsync } from '../../../core/util/confirm';
import { Inbox, Trash2, ChevronRight, Banknote, Receipt, Wallet, ClipboardCheck, Landmark } from '../../../core/ui/icons';
import {
  deleteMovement, resolveMovementSource, MOVEMENT_CATEGORY_LABELS,
  type CashMovement, type Drawer, type MovementCategory,
} from '../api';
import { movementSource, isEditable, type MovementSource } from '../drawerModel';
import { fmtCash } from './CashModalShell';

const SOURCE_LABEL: Record<MovementSource, string> = {
  tahsilat: 'Tahsilat', makbuz: 'Makbuz', gider: 'Gider', sayim: 'Sayım farkı', elle: 'Elle',
};
const SOURCE_TONE: Record<MovementSource, 'success' | 'info' | 'warning' | 'neutral'> = {
  tahsilat: 'success', makbuz: 'info', gider: 'warning', sayim: 'neutral', elle: 'neutral',
};

const fmtDay = (iso: string) => {
  try { return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' }); }
  catch { return iso; }
};

export function DrawerMovementList({ drawer, movements, loading, canManage, onChanged }: {
  drawer: Drawer;
  movements: CashMovement[];
  loading: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const U = useInkUI();
  const router = useRouter();
  const seg = String(useSegments()?.[0] ?? '(lab)');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openSource = async (m: CashMovement) => {
    setError(null); setBusyId(m.id);
    const t = await resolveMovementSource(m);
    setBusyId(null);
    if (!t) { setError(autoT('Kaynak kayıt bulunamadı')); return; }
    router.push(`/${seg}/${t.kind}/${t.id}` as any);
  };

  const remove = async (m: CashMovement) => {
    const ok = await confirmAsync(autoT('Hareketi Sil'), autoT('Bu hareketi silmek istiyor musunuz?'), { confirmText: autoT('Sil'), destructive: true });
    if (!ok) return;
    setError(null); setBusyId(m.id);
    const { error: e } = await deleteMovement(m.id);
    setBusyId(null);
    if (e) { setError(autoT(String((e as any).message ?? 'İşlem kaydedilemedi'))); return; }
    onChanged();
  };

  return (
    <MobileTableX title={autoT('Kasa hareketleri')} subtitle={autoT(drawer.name)}
      count={loading ? undefined : movements.length} countLabel="kayıt">
      {error ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: U.chipTones.danger.bg, borderBottomWidth: 1, borderBottomColor: U.hairlineSoft }}>
          <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }} numberOfLines={2}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 32 }} color={U.ink[500]} />
      ) : movements.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
          <Inbox size={28} color={U.ink[400]} strokeWidth={1.4} />
          <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Henüz hareket yok')}</Text>
        </View>
      ) : movements.map((m, i) => {
        const src = movementSource(m);
        const tone = U.chipTones[SOURCE_TONE[src]];
        const isIn = m.direction === 'giris';
        const amountColor = isIn ? U.chipTones.success.fg : U.chipTones.danger.fg;
        const Icon = src === 'tahsilat' ? Banknote : src === 'makbuz' ? Receipt : src === 'sayim' ? ClipboardCheck
          : m.category === 'transfer' ? Landmark : Wallet;
        const editable = isEditable(m);
        const linkable = !editable && src !== 'sayim';
        const cells = (
          <>
            <MobileTableIconX icon={Icon} tone={tone} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{autoT(m.description)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: tone.fg }}>{autoT(SOURCE_LABEL[src])}</Text>
                </View>
                <Text style={{ fontSize: 11.5, color: U.ink[500] }} numberOfLines={1}>
                  {fmtDay(m.movement_date)} · {autoT(MOVEMENT_CATEGORY_LABELS[m.category as MovementCategory] ?? m.category)}
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: amountColor }} numberOfLines={1}>
              {isIn ? '+' : '−'}{fmtCash(m.amount, drawer.currency)}
            </Text>
            {busyId === m.id ? (
              <ActivityIndicator size="small" color={U.ink[500]} style={{ width: 28 }} />
            ) : editable && canManage ? (
              <GlassTooltip title={autoT('Sil')} text={autoT('Elle girilen hareketi siler')}>
                <Pressable onPress={() => remove(m)} accessibilityRole="button" accessibilityLabel={autoT('Sil')}
                  style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                    // @ts-ignore web
                    cursor: 'pointer' }}>
                  <Trash2 size={13} color={U.plainBtn.fgMuted} strokeWidth={1.7} />
                </Pressable>
              </GlassTooltip>
            ) : linkable ? (
              <ChevronRight size={16} color={U.ink[400]} strokeWidth={1.8} />
            ) : (
              <View style={{ width: 16 }} />
            )}
          </>
        );
        const isLast = i === movements.length - 1;
        return linkable ? (
          <GlassTooltip key={m.id} title={autoT('Kaynağa git')} text={autoT('Bu hareketi yazan kaydı açar')}>
            <MobileTableRowX isLast={isLast} onPress={() => openSource(m)}>{cells}</MobileTableRowX>
          </GlassTooltip>
        ) : <MobileTableRowX key={m.id} isLast={isLast}>{cells}</MobileTableRowX>;
      })}
    </MobileTableX>
  );
}
