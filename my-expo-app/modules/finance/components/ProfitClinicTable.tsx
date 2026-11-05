// Karlılık · Klinik Bazında Ciro (KDV hariç). Klinik satırına dokununca hekimleri altında açılır.
// Kliniğin ekstre indirimleri (eksi) hekimlerin altında, en sonda ayrı alt satırdır; klinik toplamı bunu içerir.
// Kâr/marj YOK — kullanıcı kararı: kâr yalnız dönem toplamı, kırılım ciro gösterir.
import React, { useState } from 'react';
import { View, Text } from 'react-native';

import { ChevronDown, ChevronRight } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { MobileTableRowX, MobileTableInitialX, useMobileTableText } from '../../../core/ui/MobileTableX';
import type { ClinicRow } from '../profitBreakdown';
import { SliceAmount } from './ProfitBreakdownParts';

export function ProfitClinicTable({ rows }: { rows: ClinicRow[] }) {
  const U = useInkUI();
  const TT = useMobileTableText();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <>
      {rows.map((r, i) => {
        const isOpen = open.has(r.key);
        const isLast = i === rows.length - 1;
        const Chevron = isOpen ? ChevronDown : ChevronRight;
        return (
          <View key={r.key}>
            <MobileTableRowX isLast={isLast && !isOpen} onPress={() => toggle(r.key)}>
              <MobileTableInitialX name={r.name ?? autoT('Kliniksiz')} tone={U.chipTones.info} muted={r.kind === 'none'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={TT.title} numberOfLines={1}>{r.name ?? 'Kliniksiz'}</Text>
                <Text style={TT.sub} numberOfLines={1}>{`${r.orderCount} ${autoT('sipariş')}`}</Text>
              </View>
              <SliceAmount slices={r.slices} share={r.share} />
              <GlassTooltip
                title={autoT(isOpen ? 'Hekimleri gizle' : 'Hekimleri göster')}
                text={autoT('Bu kliniğin cirosunu hekim hekim açar')}
                placement="left"
              >
                <Chevron size={14} color={U.ink[400]} strokeWidth={1.8} />
              </GlassTooltip>
            </MobileTableRowX>
            {isOpen && r.doctors.map((d, j) => (
              <MobileTableRowX key={d.key} isLast={isLast && j === r.doctors.length - 1} tint={U.surfaceSoft}>
                <View style={{ width: 32 }} />
                {d.kind === 'statement_discount' ? (
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={TT.title} numberOfLines={1}>{autoT('Ekstre indirimleri')}</Text>
                  </View>
                ) : (
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={TT.title} numberOfLines={1}>{d.name ?? 'Hekim belirtilmemiş'}</Text>
                    <Text style={TT.sub} numberOfLines={1}>{`${d.orderCount} ${autoT('sipariş')}`}</Text>
                  </View>
                )}
                <SliceAmount slices={d.slices} share={d.shareInClinic} />
                <View style={{ width: 14 }} />
              </MobileTableRowX>
            ))}
          </View>
        );
      })}
    </>
  );
}
