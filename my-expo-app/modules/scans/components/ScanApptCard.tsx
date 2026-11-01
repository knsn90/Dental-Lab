// Teknisyen "Randevularım" randevu kartı — ekrandan AYRI dosya: ekran lazyRoute hedefi, /dev/scan-widget
// bu kartı statik içe aktarır (lazy hedef modülü statik içe aktarmak prod'da #130 çökmesi yapar).
import React from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { formatAddress } from '../../../core/util/formatAddress';
import { Navigation, Check, ChevronRight } from '../../../core/ui/icons';
import { hhmm, clinicAddressLine, type ScanKind } from '../scanModel';
import type { ScanAppointmentRow } from '../types';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { Btn, Chip, KIND_LABEL, DISPLAY_FONT } from './ui';

/** Tek randevu kartı — /dev/scan-widget?view=tech sahte veriyle de çizer */
export function ApptCard({ row, startMin, devices, onOpen }: {
  row: ScanAppointmentRow; startMin: number; devices: { id: string; name: string }[]; onOpen: (o: OriginRect | null) => void;
}) {
  const U = useInkUI();
  const ref = React.useRef<any>(null);
  const addr = clinicAddressLine(row.clinic?.address ?? null, (raw) => formatAddress(raw));
  const kinds = Array.from(new Set(row.services.map((s) => s.scan_kind).filter(Boolean))) as ScanKind[];
  const deviceNames = Array.from(new Set(row.services.map((s) => devices.find((d) => d.id === s.equipment_id)?.name).filter(Boolean))) as string[];
  const done = row.status !== 'planlandi';
  const openMaps = () => {
    if (!addr) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    if (Platform.OS === 'web') { try { window.open(url, '_blank', 'noopener'); } catch { /* yoksay */ } } else void Linking.openURL(url);
  };
  return (
    <View ref={ref} style={{ ...U.cardSolid, padding: 18, gap: 10, opacity: done ? 0.75 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <Text style={{ fontFamily: DISPLAY_FONT, fontSize: 26, fontWeight: '300', letterSpacing: -0.6, color: U.ink[900], fontVariant: ['tabular-nums'] }}>
          {hhmm(startMin)}
        </Text>
        <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }} numberOfLines={2}>{row.clinic?.name ?? '—'}</Text>
          {addr ? <Text style={{ fontSize: 12.5, color: U.ink[500], marginTop: 2 }} numberOfLines={2}>{addr}</Text> : null}
        </View>
        {done ? <Chip label={autoT('Yapıldı')} tone="success" /> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {kinds.map((k) => <Chip key={k} kind={k} label={autoT(KIND_LABEL[k])} />)}
        {deviceNames.map((n) => <Chip key={n} label={n} />)}
        {row.patients.length > 0 ? <Chip label={`${row.patients.length} ${autoT('hasta')}`} /> : null}
      </View>
      {row.note ? <Text style={{ fontSize: 12.5, color: U.ink[700] }}>{row.note}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn flex kind="sec" label={autoT('Yol tarifi')} onPress={openMaps} disabled={!addr}
          icon={(c) => <Navigation size={15} color={c} />} tip={addr ? autoT('Kliniğin adresini Google Haritalar\'da açar') : autoT('Kliniğin adresi kayıtlı değil')} />
        <Btn flex kind={done ? 'sec' : 'pri'} label={done ? autoT('Ayrıntı') : autoT('Taramayı bitir')}
          onPress={() => measureOrigin(ref.current, onOpen)}
          icon={(c) => (done ? <ChevronRight size={15} color={c} /> : <Check size={15} color={c} />)}
          tip={done ? autoT('Randevunun hastalarını ve dosyalarını gösterir') : autoT('Hastaları ve dosyaları ekleyip taramayı yapıldı olarak işaretleyin')} />
      </View>
    </View>
  );
}

