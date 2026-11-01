/**
 * Yeni sipariş / düzenleme sihirbazında "Hastanın randevusu var mı?" satırı (2. dalga 4, spec §5.4).
 *
 * Boşken tek sessiz satır: iki bağlantı (+ Prova randevusu / + Takma randevusu). Eklenen randevu küçük bir
 * satır olur: tür · gün · isteğe bağlı saat · ✕. Zorunlu değildir; teslim tarihi takma randevusuyla aynı gün
 * ya da sonrasındaysa alanın altında yalnız bilgi veren bir uyarı çıkar (siparişi engellemez).
 * Kayıt sihirbazın kendisinde yapılır (apptSave / apptRemove) — bu bileşen yalnız taslağı tutar.
 */
import React from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { DatePicker } from '../../../core/ui/DatePicker';
import { Plus, X, CalendarClock } from '../../../core/ui/icons';
import { takmaBeforeDelivery } from './provaModel';

export type DraftAppt = { id?: string; kind: 'prova' | 'takma'; date: string; time: string | null };

const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function AddLink({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const T = useMobileTokens();
  return (
    <GlassTooltip title={label} text={hint}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8,
          backgroundColor: hovered ? T.hairline2 : 'transparent', ...WEB_PTR,
        })}
      >
        <Plus size={12} color={T.ink2} strokeWidth={2} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>{label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

export function ApptDraftEditor({ value, onChange, deliveryDate, accentColor }: {
  value: DraftAppt[];
  onChange: (v: DraftAppt[]) => void;
  deliveryDate: Date | null | undefined;
  accentColor: string;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const today = isoLocal(new Date());
  const deliveryISO = deliveryDate instanceof Date && !isNaN(deliveryDate.getTime()) ? isoLocal(deliveryDate) : null;
  const warn = takmaBeforeDelivery(deliveryISO, value.map((a) => ({ kind: a.kind, date: a.date })));

  const add = (kind: 'prova' | 'takma') => onChange([...value, { kind, date: '', time: null }]);
  const set = (i: number, patch: Partial<DraftAppt>) => onChange(value.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <CalendarClock size={13} color={T.ink3} strokeWidth={1.8} />
        <Text style={{ fontSize: 12, color: T.ink3, marginEnd: 4 }}>{autoT('Hastanın randevusu var mı?')}</Text>
        <AddLink label={autoT('Prova randevusu')} hint={autoT('Hastanın prova randevusunu ekler (isteğe bağlı)')} onPress={() => add('prova')} />
        <AddLink label={autoT('Takma randevusu')} hint={autoT('Hastanın takma randevusunu ekler; teslim tarihiyle karşılaştırılır')} onPress={() => add('takma')} />
      </View>

      {value.map((a, i) => (
        <View key={a.id ?? `n${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ width: 52, fontSize: 12.5, fontWeight: '600', color: T.ink2 }}>{autoT(a.kind === 'prova' ? 'Prova' : 'Takma')}</Text>
          <View style={{ minWidth: 170, flexGrow: 1, maxWidth: 240 }}>
            <DatePicker value={a.date || null} onChange={(iso) => set(i, { date: iso })} accent={accentColor} minDate={today} compact placeholder={autoT('Gün seçin')} />
          </View>
          <TextInput
            value={a.time ?? ''}
            onChangeText={(v) => set(i, { time: v.trim() ? v : null })}
            placeholder={autoT('Saat')}
            placeholderTextColor={T.ink3}
            style={{
              height: 36, width: 76, borderRadius: 10, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card,
              color: T.ink, paddingHorizontal: 10, fontSize: 13,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null),
            }}
          />
          <GlassTooltip title={autoT('Kaldır')} text={autoT('Bu randevuyu siparişten çıkarır')}>
            <Pressable
              onPress={() => remove(i)}
              accessibilityRole="button"
              accessibilityLabel={autoT('Kaldır')}
              hitSlop={6}
              style={({ hovered }: any) => ({
                width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                backgroundColor: hovered ? T.hairline2 : 'transparent', ...WEB_PTR,
              })}
            >
              <X size={14} color={T.ink3} strokeWidth={2} />
            </Pressable>
          </GlassTooltip>
        </View>
      ))}

      {warn ? (
        <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: U.chipTones.warning.bg }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>{autoT('Teslim tarihi takma randevusundan sonra')}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default ApptDraftEditor;
