// Özet sayfası widget'ı: en çok iş gönderen ilk 5 klinik.
// Dönem: Bu ay / Tüm zamanlar · Sıralama: Üye / Puan (0.5 üye + 0.5 ciro, 0–100).
// Ödeme durumu sıralamayı ETKİLEMEZ; vadesi geçen borçta yalnız uyarı işareti.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { DS } from '../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AlertTriangle } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { rankTop, type RankMode, type ClinicSummary } from '../summary';
import { useClinicSummaries } from '../useClinicSummaries';
import { useClinicSummaryModal } from './ClinicSummaryModal';

type Period = 'month' | 'all';

function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral }}>
      {options.map(([k, label]) => {
        const active = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingVertical: 6, paddingHorizontal: active ? 14 : 10, borderRadius: 999,
              backgroundColor: active ? U.segActive : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
          >
            <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TopClinicsCard(props: { compact?: boolean; summaries?: Map<string, ClinicSummary>; onOpen?: (clinicId: string) => void }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const canProfit = usePermissionStore((s) => s.can('view_profit'));
  const live = useClinicSummaries();
  const modal = useClinicSummaryModal();
  const map = props.summaries ?? live.map;
  const status = props.summaries ? 'ready' : live.status;
  const [period, setPeriod] = useState<Period>('month');
  const [modeRaw, setMode] = useState<RankMode>('uye');
  const mode: RankMode = canProfit ? modeRaw : 'uye';
  const rows = useMemo(() => rankTop(map, period, mode), [map, period, mode]);
  const bar = isDark ? '#7FA8D9' : DS.exec.primaryDeep;
  const max = Math.max(1, ...rows.map((r) => (mode === 'uye' ? r.uye : r.score)));
  const open = (id: string) => (props.onOpen ? props.onOpen(id) : modal.open(id));

  return (
    <View style={{ backgroundColor: T.card, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: T.hairline, padding: props.compact ? 14 : 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{autoT('En çok iş gönderenler')}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Seg value={period} onChange={setPeriod} options={[['month', autoT('Bu ay')], ['all', autoT('Tüm zamanlar')]]} />
          {canProfit ? <Seg value={mode} onChange={setMode} options={[['uye', autoT('Üye')], ['score', autoT('Puan')]]} /> : null}
        </View>
      </View>

      {status === 'loading' && rows.length === 0 ? (
        <Text style={{ fontSize: 13, color: T.ink3, paddingVertical: 16 }}>…</Text>
      ) : status === 'error' && rows.length === 0 ? (
        <Text style={{ fontSize: 13, color: U.chipTones.danger.fg, paddingVertical: 16 }}>{autoT('Özet yüklenemedi')}</Text>
      ) : rows.length === 0 ? (
        <Text style={{ fontSize: 13, color: T.ink3, paddingVertical: 16 }}>
          {period === 'month' ? autoT('Bu ay henüz iş yok') : autoT('Henüz iş yok')}
        </Text>
      ) : (
        <View style={{ gap: props.compact ? 4 : 6 }}>
          {rows.map((r, i) => {
            const v = mode === 'uye' ? r.uye : r.score;
            return (
              <Pressable
                key={r.clinicId}
                onPress={() => open(r.clinicId)}
                accessibilityRole="button"
                style={({ hovered, pressed }: any) => ({
                  borderRadius: 12, paddingVertical: 7, paddingHorizontal: 8, marginHorizontal: -8,
                  backgroundColor: hovered ? U.rowHover : 'transparent', opacity: pressed ? 0.7 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 16, fontSize: 12, fontWeight: '700', color: T.ink3, textAlign: 'center' }}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ flexShrink: 1, fontSize: 13.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.name}</Text>
                    {r.overdue ? (
                      <GlassTooltip title={autoT('Vadesi geçmiş borç')} text={autoT('Ödeme durumu sıralamayı etkilemez')}>
                        <View accessibilityLabel={autoT('Vadesi geçmiş borç')}>
                          <AlertTriangle size={13} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                        </View>
                      </GlassTooltip>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.ink }}>
                      {mode === 'uye' ? `${r.uye} ${autoT('üye')}` : String(r.score)}
                    </Text>
                    {mode === 'score' ? <Text style={{ fontSize: 11, color: T.ink3 }}>{`${r.uye} ${autoT('üye')}`}</Text> : null}
                  </View>
                </View>
                {!props.compact ? (
                  <View style={{ height: 4, borderRadius: 999, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', marginTop: 6, marginStart: 26 }}>
                    <View style={{ height: 4, borderRadius: 999, width: `${Math.max(3, Math.round((v / max) * 100))}%`, backgroundColor: bar }} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
      {modal.element}
    </View>
  );
}
