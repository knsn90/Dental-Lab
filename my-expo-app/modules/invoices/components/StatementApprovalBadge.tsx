/**
 * Onay geçmişi rozeti.
 *
 * Lab'ın klinik adına kaydettiği onay ('lab') "Lab tarafından kaydedildi · tarih · gerekçe"
 * diye AYRI tonda ve ikonla görünür; hekim/klinik onayıyla aynı görünmez (anti-hedef 2).
 * Metin saf `approvalBadgeText`'ten gelir (preStatement.ts, testli).
 */
import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2, UserCog } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { fmtDate } from '../../finance-clinic/components/atoms';
import { approvalBadgeText } from '../lib/preStatement';
import type { StatementApprovalRow } from '../types';

export function StatementApprovalBadge({ a }: { a: Pick<StatementApprovalRow, 'via' | 'reason' | 'created_at'> }) {
  const U = useInkUI();
  const byLab = a.via === 'lab';
  const tone = byLab ? U.chipTones.warning : U.chipTones.success;
  const Icon = byLab ? UserCog : CheckCircle2;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 7, alignSelf: 'flex-start', maxWidth: '100%',
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: tone.bg,
    }}>
      <Icon size={13} color={tone.fg} strokeWidth={1.9} style={{ marginTop: 1 }} />
      <Text style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: tone.fg, lineHeight: 17 }}>
        {approvalBadgeText(a, fmtDate, autoT)}
      </Text>
    </View>
  );
}
