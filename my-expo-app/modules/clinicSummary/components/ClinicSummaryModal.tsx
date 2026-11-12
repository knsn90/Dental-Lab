// Klinik özeti popup'ı — sayfadan çıkmadan, ortada. Bu ay / Tüm zamanlar.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { useAuthStore } from '../../../core/store/authStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { titleCaseTR } from '../../../core/utils/textCase';
import { X, Star, AlertTriangle, ArrowUpRight, Info } from '../../../core/ui/icons';
import { useClinicSummary } from '../useClinicSummaries';
import { fetchClinicRecentMessages, type RecentMessage } from '../api';
import type { ClinicSummary } from '../summary';
import { fmtMoney } from './MoneyText';
import { fmtDay, qtyExtras } from './ClinicSummaryStrip';
import { printLocale } from '../../../core/i18n/printLocale';

type Period = 'month' | 'all';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined;

/** Gruplu liste: küçük başlık + yumuşak zeminli tek kart, satırlar ince çizgiyle ayrılır. */
function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const U = useInkUI();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: U.ink[400] }}>
          {title.toLocaleUpperCase(printLocale())}
        </Text>
        {note ? <Text style={{ fontSize: 11, color: U.ink[400] }}>{note}</Text> : null}
      </View>
      <View style={{ backgroundColor: U.surfaceSoft, borderRadius: 14, borderWidth: 1, borderColor: U.hairlineSoft, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <View key={i} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: U.hairlineSoft }}>{c}</View>
        ))}
      </View>
    </View>
  );
}

function Line({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontSize: 13, color: tone ?? U.ink[500], flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{
        fontSize: strong ? 20 : 14, fontWeight: strong ? '500' : '600', color: tone ?? U.ink[900],
        letterSpacing: strong ? -0.4 : 0, fontVariant: ['tabular-nums'], fontFamily: strong ? DISPLAY_FONT : undefined,
      }}>{value}</Text>
    </View>
  );
}

/** Büyük, ince sayı + küçük etiket. */
function Metric({ label, value, extra, caption, wide }: { label: string; value: string; extra?: string[]; caption?: string; wide?: boolean }) {
  const U = useInkUI();
  const size = value.length > 9 ? 20 : value.length > 6 ? 23 : 26;
  return (
    <View style={{ flexGrow: wide ? 1.8 : 1, flexBasis: 0, minWidth: wide ? 150 : 92, backgroundColor: U.surfaceSoft, borderRadius: 14, borderWidth: 1, borderColor: U.hairlineSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: U.ink[500] }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: size, lineHeight: 32, fontWeight: '300', letterSpacing: -0.03 * size, color: U.ink[900], marginTop: 4, fontVariant: ['tabular-nums'], fontFamily: DISPLAY_FONT }} numberOfLines={1}>
        {value}
      </Text>
      {extra?.map((x) => (
        <Text key={x} style={{ fontSize: 12.5, fontWeight: '500', color: U.ink[700], fontVariant: ['tabular-nums'] }} numberOfLines={1}>{x}</Text>
      ))}
      {caption ? <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 2 }} numberOfLines={2}>{caption}</Text> : null}
    </View>
  );
}

/** Vade dağılımı: tek orantılı şerit + yalnız dolu dilimlerin açıklaması. */
function AgingBar({ aging, currency }: { aging: NonNullable<ClinicSummary['aging']>; currency: string }) {
  const U = useInkUI();
  const warn = U.chipTones.warning.fg;
  const parts = [
    { k: 'c', label: autoT('Vadesi gelmemiş'), v: Number(aging.current) || 0, color: U.ink[300] },
    { k: '30', label: `1–30 ${autoT('gün')}`, v: Number(aging.d30) || 0, color: warn + '88' },
    { k: '60', label: `31–60 ${autoT('gün')}`, v: Number(aging.d60) || 0, color: warn },
    { k: '90', label: `61+ ${autoT('gün')}`, v: Number(aging.d90) || 0, color: U.chipTones.danger.fg },
  ].filter((p) => p.v > 0);
  if (!parts.length) return null;
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
        {parts.map((p) => <View key={p.k} style={{ flex: p.v, backgroundColor: p.color }} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 }}>
        {parts.map((p) => (
          <View key={p.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
            <Text style={{ fontSize: 12, color: U.ink[500] }}>{p.label}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[800], fontVariant: ['tabular-nums'] }}>{fmtMoney({ currency, amount: p.v })}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ClinicSummaryModal(props: { clinicId: string | null; onClose: () => void; summary?: ClinicSummary | null; messages?: RecentMessage[] }) {
  const U = useInkUI();
  const router = useRouter();
  const segments = useSegments() as string[];
  const panel = segments[0] === '(admin)' ? '(admin)' : '(lab)';
  const canProfit = usePermissionStore((s) => s.can('view_profit'));
  const canBalance = usePermissionStore((s) => s.can('view_clinic_balance'));
  const labId = useAuthStore((s) => (s.profile as any)?.lab_id) as string | undefined;
  const live = useClinicSummary(props.summary === undefined ? props.clinicId : null);
  const s = props.summary !== undefined ? props.summary : live.summary;
  const status = props.summary !== undefined ? 'ready' : live.status;
  const [period, setPeriod] = useState<Period>('month');
  const [msgs, setMsgs] = useState<RecentMessage[] | null>(props.messages ?? null);
  const [msgErr, setMsgErr] = useState(false);

  useEffect(() => {
    setPeriod('month');
    if (props.messages || !props.clinicId || !labId) return;
    let alive = true;
    setMsgs(null); setMsgErr(false);
    fetchClinicRecentMessages(props.clinicId, labId)
      .then((m) => { if (alive) setMsgs(m); })
      .catch(() => { if (alive) setMsgErr(true); });
    return () => { alive = false; };
  }, [props.clinicId, labId, props.messages]);

  const open = !!props.clinicId;
  const f = s ? s[period] : null;
  const danger = U.chipTones.danger.fg;
  const go = (path: string) => { props.onClose(); router.push(path as any); };

  const seg = (p: Period, label: string) => {
    const active = period === p;
    return (
      <Pressable
        key={p}
        onPress={() => setPeriod(p)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          flex: active ? 1.55 : 1, alignItems: 'center',
          paddingVertical: 8, paddingHorizontal: active ? 12 : 8, borderRadius: 999,
          backgroundColor: active ? U.segActive : 'transparent', ...webPointer,
          ...(active && Platform.OS === 'web' && !U.isDark ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } : {}),
        } as any}
      >
        <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  };

  const link = (label: string, path: string) => (
    <Pressable
      key={path}
      onPress={() => go(path)}
      accessibilityRole="link"
      style={({ hovered, pressed }: any) => ({
        flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999,
        backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        transform: [{ scale: pressed ? 0.97 : 1 }], ...webPointer,
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{label}</Text>
      <ArrowUpRight size={14} color={U.plainBtn.fg} strokeWidth={1.8} />
    </Pressable>
  );

  const revenue = f?.revenue ?? [];
  const extras = f ? qtyExtras(f.qty) : '';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={U.modalOverlay}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={props.onClose} accessibilityLabel={autoT('Kapat')} />
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={U.modalTitle} numberOfLines={1}>{s?.name ? titleCaseTR(s.name) : autoT('Klinik özeti')}</Text>
              {s ? (
                <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }} numberOfLines={1}>
                  {autoT('Son sipariş')}: {s.lastOrderAt ? fmtDay(s.lastOrderAt, true) : autoT('Son sipariş yok')}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={props.onClose} style={U.modalCloseBtn} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}>
              <X size={16} color={U.ink[700]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral, marginTop: 14 }}>
              {seg('month', autoT('Bu ay'))}
              {seg('all', autoT('Tüm zamanlar'))}
            </View>

            {!s || !f ? (
              <Text style={{ fontSize: 13, color: U.ink[500], paddingVertical: 24, textAlign: 'center' }}>
                {status === 'loading' ? autoT('Yükleniyor…') : autoT('Özet yüklenemedi')}
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <Metric label={autoT('Sipariş')} value={String(f.orders)} />
                  <Metric label={autoT('Üye')} value={String(f.qty.uye)} caption={extras ? `${autoT('Diğer')}: ${extras}` : undefined} />
                  {canProfit ? (
                    <Metric
                      wide
                      label={autoT('Ciro')}
                      value={revenue.length ? fmtMoney(revenue[0]) : '—'}
                      extra={revenue.slice(1).map(fmtMoney)}
                      caption={autoT('KDV hariç')}
                    />
                  ) : null}
                </View>

                {canBalance ? (
                  <Group title={autoT('Borç')} note={autoT('KDV dahil')}>
                    {s.balance.length
                      ? s.balance.map((m) => <Line key={m.currency} strong label={`${autoT('Bakiye')} · ${m.currency}`} value={fmtMoney(m)} />)
                      : <Line label={autoT('Bakiye')} value="—" />}
                    {s.overdue.length || s.oldestOverdueDays != null ? (
                      <View style={{ gap: 6 }}>
                        {s.overdue.map((m) => (
                          <Line key={`o${m.currency}`} label={`${autoT('Vadesi geçmiş')} · ${m.currency}`} value={fmtMoney(m)} tone={danger} />
                        ))}
                        {s.oldestOverdueDays != null ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <AlertTriangle size={13} color={danger} strokeWidth={1.8} />
                            <Text style={{ fontSize: 12, color: danger }}>
                              {`${autoT('En eski gecikme')}: ${s.oldestOverdueDays} ${autoT('gün')}`}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    {s.aging ? <AgingBar aging={s.aging} currency={s.balance[0]?.currency ?? 'TRY'} /> : null}
                  </Group>
                ) : null}

                {canProfit && canBalance ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 4 }}>
                    <Info size={13} color={U.ink[400]} strokeWidth={1.8} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 17, color: U.ink[400] }}>
                      {autoT('Ciro fatura tarihine göre ve KDV hariç hesaplanır. Borç KDV dahildir; bu yüzden ödeme alınmamış olsa da borç ciro + KDV kadar görünür.')}
                    </Text>
                  </View>
                ) : null}

                <Group title={autoT('Değerlendirme puanı')}>
                  {s.rating ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Star size={16} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                      <Text style={{ fontSize: 20, fontWeight: '500', letterSpacing: -0.4, color: U.ink[900], fontFamily: DISPLAY_FONT }}>{s.rating.avg.toFixed(1)}</Text>
                      <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{`${s.rating.count} ${autoT('değerlendirme')}`}</Text>
                    </View>
                  ) : <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Henüz değerlendirme yok')}</Text>}
                </Group>

                <Group title={autoT('Son yazışmalar')}>
                  {msgErr ? (
                    <Text style={{ fontSize: 12.5, color: danger }}>{autoT('Yazışmalar yüklenemedi')}</Text>
                  ) : msgs == null ? (
                    <Text style={{ fontSize: 12.5, color: U.ink[400] }}>{autoT('Yükleniyor…')}</Text>
                  ) : msgs.length === 0 ? (
                    <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Yazışma yok')}</Text>
                  ) : null}
                  {!msgErr && msgs ? msgs.map((m) => (
                    <View key={m.id}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }} numberOfLines={1}>{m.orderNumber}</Text>
                        <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{fmtDay(m.createdAt)}</Text>
                      </View>
                      <Text style={{ fontSize: 13, lineHeight: 18, color: U.ink[800], marginTop: 2 }} numberOfLines={2}>
                        {m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content}
                      </Text>
                    </View>
                  )) : null}
                </Group>

                {canBalance || panel === '(admin)' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                    {canBalance ? link(autoT('Ekstre'), `/${panel}/statement/${s.clinicId}`) : null}
                    {panel === '(admin)' ? link(autoT('İş İstatistikleri'), '/(admin)/work-stats') : null}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Ekran düzeyinde tek popup: `open(id)` çağır, `element`'i render et. */
/** Yalnız (lab)/(admin) panelinde etkin; diğer panellerde `enabled` false, open no-op. */
export function useClinicSummaryModal(): { open(clinicId: string): void; element: React.ReactElement | null; enabled: boolean } {
  const [id, setId] = useState<string | null>(null);
  const group = (useSegments() as string[])[0];
  const enabled = group === '(lab)' || group === '(admin)';
  const element = enabled && id ? <ClinicSummaryModal clinicId={id} onClose={() => setId(null)} /> : null;
  return { open: (cid: string) => { if (enabled) setId(cid); }, element, enabled };
}
