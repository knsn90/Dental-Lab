// Klinik özeti popup'ı — sayfadan çıkmadan, ortada. Bu ay / Tüm zamanlar.
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { useAuthStore } from '../../../core/store/authStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { X, Star, AlertTriangle, ArrowUpRight } from '../../../core/ui/icons';
import { useClinicSummary } from '../useClinicSummaries';
import { fetchClinicRecentMessages, type RecentMessage } from '../api';
import type { ClinicSummary } from '../summary';
import { fmtMoney } from './MoneyText';
import { fmtDay, qtyExtras } from './ClinicSummaryStrip';
import { printLocale } from '../../../core/i18n/printLocale';

type Period = 'month' | 'all';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const U = useInkUI();
  return (
    <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: U.hairlineSoft }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: U.ink[400], marginBottom: 8 }}>
        {title.toLocaleUpperCase(printLocale())}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, gap: 12 }}>
      <Text style={{ fontSize: 13, color: U.ink[500], flexShrink: 1 }}>{label}</Text>
      {typeof value === 'string'
        ? <Text style={{ fontSize: 13.5, fontWeight: '600', color: tone ?? U.ink[900] }}>{value}</Text>
        : value}
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
          paddingVertical: 8, paddingHorizontal: active ? 18 : 12, borderRadius: 999,
          backgroundColor: active ? U.segActive : 'transparent',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        } as any}
      >
        <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>{label}</Text>
      </Pressable>
    );
  };

  const link = (label: string, path: string) => (
    <Pressable
      key={path}
      onPress={() => go(path)}
      accessibilityRole="link"
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999,
        backgroundColor: hovered ? U.rowHover : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
      })}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{label}</Text>
      <ArrowUpRight size={14} color={U.plainBtn.fg} strokeWidth={1.8} />
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={U.modalOverlay}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={props.onClose} accessibilityLabel={autoT('Kapat')} />
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle} numberOfLines={1}>{s?.name || autoT('Klinik özeti')}</Text>
            <Pressable onPress={props.onClose} style={U.modalCloseBtn} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}>
              <X size={16} color={U.ink[700]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral, marginTop: 14, marginBottom: 6 }}>
              {seg('month', autoT('Bu ay'))}
              {seg('all', autoT('Tüm zamanlar'))}
            </View>

            {!s || !f ? (
              <Text style={{ fontSize: 13, color: U.ink[500], paddingVertical: 24, textAlign: 'center' }}>
                {status === 'loading' ? autoT('Yükleniyor…') : autoT('Özet yüklenemedi')}
              </Text>
            ) : (
              <>
                <Section title={autoT('Siparişler')}>
                  <Row label={autoT('Sipariş')} value={String(f.orders)} />
                  <Row label={autoT('Üye')} value={String(f.qty.uye)} />
                  {qtyExtras(f.qty) ? <Row label={autoT('Diğer')} value={qtyExtras(f.qty)} /> : null}
                  <Row label={autoT('Son sipariş')} value={s.lastOrderAt ? fmtDay(s.lastOrderAt, true) : autoT('Son sipariş yok')} />
                </Section>

                {canProfit ? (
                  <Section title={autoT('Ciro (KDV hariç)')}>
                    {f.revenue.length
                      ? f.revenue.map((m) => <Row key={m.currency} label={m.currency} value={fmtMoney(m)} />)
                      : <Row label={autoT('Ciro')} value="—" />}
                    <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 4 }}>{autoT('Ciro fatura tarihine göre')}</Text>
                  </Section>
                ) : null}

                {canBalance ? (
                  <Section title={autoT('Borç')}>
                    {s.balance.length
                      ? s.balance.map((m) => <Row key={m.currency} label={`${autoT('Bakiye')} · ${m.currency}`} value={fmtMoney(m)} />)
                      : <Row label={autoT('Bakiye')} value="—" />}
                    {s.overdue.map((m) => (
                      <Row key={`o${m.currency}`} label={`${autoT('Vadesi geçmiş')} · ${m.currency}`} value={fmtMoney(m)} tone={danger} />
                    ))}
                    {s.oldestOverdueDays != null ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <AlertTriangle size={14} color={danger} strokeWidth={1.8} />
                        <Text style={{ fontSize: 12.5, color: danger, fontWeight: '600' }}>
                          {`${autoT('En eski gecikme')}: ${s.oldestOverdueDays} ${autoT('gün')}`}
                        </Text>
                      </View>
                    ) : null}
                    {s.aging ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {([[autoT('Vadesi gelmemiş'), s.aging.current], ['30+', s.aging.d30], ['60+', s.aging.d60], ['90+', s.aging.d90]] as [string, number][]).map(([k, v]) => (
                          <View key={k} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: U.chipNeutral }}>
                            <Text style={{ fontSize: 11.5, color: U.ink[700] }}>
                              {`${k}: ${fmtMoney({ currency: s.balance[0]?.currency ?? 'TRY', amount: v })}`}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Section>
                ) : null}

                <Section title={autoT('Değerlendirme puanı')}>
                  {s.rating ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Star size={16} color={U.chipTones.warning.fg} strokeWidth={1.8} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{s.rating.avg.toFixed(1)}</Text>
                      <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{`(${s.rating.count} ${autoT('değerlendirme')})`}</Text>
                    </View>
                  ) : <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Henüz değerlendirme yok')}</Text>}
                </Section>

                <Section title={autoT('Son yazışmalar')}>
                  {msgErr ? (
                    <Text style={{ fontSize: 12.5, color: danger }}>{autoT('Yazışmalar yüklenemedi')}</Text>
                  ) : msgs == null ? (
                    <Text style={{ fontSize: 12.5, color: U.ink[400] }}>…</Text>
                  ) : msgs.length === 0 ? (
                    <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Yazışma yok')}</Text>
                  ) : msgs.map((m) => (
                    <View key={m.id} style={{ paddingVertical: 5 }}>
                      <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{`${m.orderNumber} · ${fmtDay(m.createdAt)}`}</Text>
                      <Text style={{ fontSize: 13, color: U.ink[800] }} numberOfLines={2}>
                        {m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content}
                      </Text>
                    </View>
                  ))}
                </Section>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {canBalance ? link(autoT('Ekstre'), `/${panel}/statement/${s.clinicId}`) : null}
                  {panel === '(admin)' ? link(autoT('İş İstatistikleri'), '/(admin)/work-stats') : null}
                </View>
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
