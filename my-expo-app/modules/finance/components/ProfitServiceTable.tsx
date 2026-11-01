// Karlılık · İşlem Bazında Ciro (KDV hariç). Fatura kalemleri lab hizmetine eşlenir;
// eşlenemeyenler "Diğer", kalemsiz fatura tutarları "Kalemsiz fatura" satırında toplanır.
import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Layers, Package, Receipt } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { fmtBase } from '../../../core/money/baseCurrency';
import { MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import type { ServiceRow } from '../profitBreakdown';
import { SliceAmount, fmtPct } from './ProfitBreakdownParts';

const fmtQty = (n: number) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

export function ProfitServiceTable({ rows }: { rows: ServiceRow[] }) {
  const U = useInkUI();
  const TT = useMobileTableText();
  const { t } = useTranslation();

  return (
    <>
      {rows.map((r, i) => {
        const name = r.kind === 'other' ? 'Diğer' : r.kind === 'no_items' ? 'Kalemsiz fatura' : (r.name ?? 'Diğer');
        const icon = r.kind === 'service' ? Layers : r.kind === 'other' ? Package : Receipt;
        const meta: string[] = [];
        if (r.kind === 'service') {
          meta.push(r.unit ? `${fmtQty(r.quantity)} ${autoT(r.unit)}` : fmtQty(r.quantity));
          if (r.avgUnitPrice != null) meta.push(`${autoT('Ort.')} ${fmtBase(r.avgUnitPrice, 2)}`);
          meta.push(`${t('profitability.listPrice')} ${r.listUnitPrice != null ? fmtBase(r.listUnitPrice, 2) : '—'}`);
        }
        const discount = r.discountPct != null && r.discountPct > 0 ? r.discountPct : null;
        return (
          <MobileTableRowX key={r.key} isLast={i === rows.length - 1}>
            <MobileTableIconX icon={icon} tone={r.kind === 'service' ? U.chipTones.info : U.chipTones.neutral} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={TT.title} numberOfLines={1}>{name}</Text>
              {/* 2 satır: dar telefonda sondaki liste fiyatı kırpılmasın (indirim çipi ona göre okunur) */}
              {meta.length > 0 && <Text style={TT.sub} numberOfLines={2}>{meta.join(' · ')}</Text>}
              {discount != null && (
                <View style={{
                  alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 2,
                  borderRadius: 999, backgroundColor: U.chipTones.warning.bg,
                }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '600', color: U.chipTones.warning.fg }}>
                    {`%${fmtPct(discount)} ${autoT('liste altı')}`}
                  </Text>
                </View>
              )}
            </View>
            <SliceAmount slices={r.slices} share={r.share} />
          </MobileTableRowX>
        );
      })}
    </>
  );
}
