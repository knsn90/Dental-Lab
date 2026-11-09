/**
 * e-Fatura önizlemesinin satır biçimi işaretleri (Luca, lab ayarı efatura_line_mode):
 *  - LineModeBadge: satırlar gerçekten birleştiyse (preview.consolidated) "Birleşik satır" rozeti.
 *  - LineModeFallback: birleşik ayarda kuruş yuvarlaması tutmadıysa (consolidateFallback='rounding') uyarı.
 * Önizleme alanları yoksa (eski sağlayıcı / kalem ayarı) hiçbir şey çizilmez.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { AlertCircle, Layers } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import type { EFaturaPreview } from '../types';

export function LineModeBadge({ preview }: { preview: Pick<EFaturaPreview, 'consolidated'> | null | undefined }) {
  const U = useInkUI();
  if (!preview?.consolidated) return null;
  const tone = U.chipTones.info;
  return (
    <GlassTooltip title={autoT('Birleşik satır')} text={autoT('Aynı hizmetler e-faturada tek satırda; ayrıntılı iş listesi iş dökümü PDF\'inde')}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg,
      }}>
        <Layers size={11} strokeWidth={2} color={tone.fg} />
        <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone.fg }}>{autoT('Birleşik satır')}</Text>
      </View>
    </GlassTooltip>
  );
}

export function LineModeFallback({ preview }: { preview: Pick<EFaturaPreview, 'consolidateFallback'> | null | undefined }) {
  const U = useInkUI();
  if (preview?.consolidateFallback !== 'rounding') return null;
  const tone = U.chipTones.warning;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, backgroundColor: tone.bg }}>
      <AlertCircle size={14} strokeWidth={1.9} color={tone.fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600', color: tone.fg }}>
        {autoT('Kuruş yuvarlaması nedeniyle bu fatura kalem kalem gönderilecek.')}
      </Text>
    </View>
  );
}
