/**
 * Siparişler listesi satır rozeti (2. dalga 4, spec §5.5): "Provada · 2. gün", "Prova 1 gün gecikti",
 * "Randevuya yetişmiyor", "Randevu yaklaşıyor". Rozete dokununca sipariş detayında Prova popup'ı açılır.
 *
 * Veri, liste ekranının sağladığı ProvaFlagsContext'ten okunur — satır bileşenlerinden prop geçirilmez.
 * Bağlam yoksa (başka ekranlar) hiçbir şey çizmez.
 */
import React, { createContext, useContext } from 'react';
import { Text, Pressable, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { listBadge, type ProvaFlag } from './provaModel';

export type ProvaFlagsCtx = { flags: Map<string, ProvaFlag>; open: (orderId: string) => void };
export const ProvaFlagsContext = createContext<ProvaFlagsCtx | null>(null);

export function ProvaListBadge({ orderId }: { orderId: string }) {
  const U = useInkUI();
  const ctx = useContext(ProvaFlagsContext);
  const b = ctx ? listBadge(ctx.flags.get(orderId), autoT) : null;
  if (!ctx || !b) return null;
  const tone = b.tone === 'bad' ? U.chipTones.danger : U.chipTones.warning;
  return (
    <GlassTooltip title={b.label} text={autoT('Prova penceresini açar')}>
      <Pressable
        onPress={(e: any) => { e?.stopPropagation?.(); e?.preventDefault?.(); ctx.open(orderId); }}
        accessibilityRole="button"
        accessibilityLabel={b.label}
        hitSlop={4}
        style={({ pressed }: any) => ({
          alignSelf: 'flex-start', flexShrink: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
          backgroundColor: tone.bg, transform: [{ scale: pressed ? 0.97 : 1 }],
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
        })}
      >
        <Text style={{ fontSize: 11, fontWeight: '600', color: tone.fg }} numberOfLines={1}>{b.label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

export default ProvaListBadge;
