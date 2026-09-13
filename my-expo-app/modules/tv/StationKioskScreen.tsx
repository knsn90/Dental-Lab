// modules/tv/StationKioskScreen.tsx — Teknisyen İSTASYON KİOSK (TV, D-pad)
// İş döngüsü: liste (↑↓) → seç (OK) → detay + dosyalar + Başla/Tamamla.
// Backend: mevcut start_stage_simple / complete_stage_simple (OperatorScreen ile aynı).

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Image, Platform, Modal } from 'react-native';
import { Play, Check, Clock, AlertTriangle, User as UserIcon, Layers, RefreshCw, Image as ImageIcon } from '../../core/ui/icons';
import { autoT } from '../../core/i18n/autoTranslate';
import { localeTag } from '../../core/i18n';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../core/store/authStore';
import { supabase } from '../../core/api/supabase';
import { getSignedUrls } from '../../lib/photos';
import { TV } from '../../core/tv/tvTheme';
import { TVFocusable } from '../../core/tv/tvFocus';
import { fetchMyStationJobs, type KioskJob } from './api';
import { startStage, completeStageResilient } from '../orders/api/timing';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

const STATUS_LABEL: Record<string, string> = {
  aktif: 'Aktif', bekliyor: 'Bekliyor', durakladi: 'Duraklatıldı',
  makine_bekliyor: 'Makinede', onay_bekliyor: 'Onay bekliyor', bloklu: 'Bloklu', yeniden: 'Yeniden',
};
const STATUS_COLOR: Record<string, string> = {
  aktif: TV.accent, bekliyor: TV.ink3, durakladi: TV.warning,
  makine_bekliyor: TV.warning, onay_bekliyor: TV.warning, bloklu: TV.danger, yeniden: TV.danger,
};

export function StationKioskScreen() {
  const { i18n } = useTranslation();
  const { profile } = useAuthStore();
  const techId = profile?.id ?? null;

  const [jobs, setJobs] = useState<KioskJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!techId) return;
    const list = await fetchMyStationJobs(techId);
    setJobs(list);
    setSelectedId(prev => (prev && list.some(j => j.stageId === prev)) ? prev : (list[0]?.stageId ?? null));
  }, [techId]);

  useEffect(() => {
    load();
    if (!techId) return;
    const ch = supabase
      .channel(`tv-kiosk-${techId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stages', filter: `technician_id=eq.${techId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [techId, load]);

  const selected = jobs.find(j => j.stageId === selectedId) ?? null;

  const flash = (m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(null), 2600); };

  const doStart = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    const r = await startStage(selected.stageId);
    setBusy(false);
    if (!r.ok) { flash(autoT('İşlem başarısız') + (r.error ? `: ${r.error}` : '')); return; }
    flash(autoT('İş başlatıldı'));
    load();
  }, [selected, busy, load]);

  const doComplete = useCallback(async () => {
    if (!selected || busy) return;
    setBusy(true);
    const r = await completeStageResilient(selected.stageId, []);
    setBusy(false);
    if (!r.ok) { flash(autoT('İşlem başarısız') + (r.error ? `: ${r.error}` : '')); return; }
    flash(autoT('İş tamamlandı'));
    load();
  }, [selected, busy, load]);

  const canAct = !!selected && selected.status === 'aktif';
  const isStarted = !!selected?.startedAt;

  return (
    <View style={{ flex: 1 }}>
      {/* Üst şerit */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', color: TV.ink3 }}>
            {autoT('İstasyon Kiosk')}
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 40, color: TV.ink, letterSpacing: -1.2, marginTop: 2 }}>
            {profile?.full_name ?? autoT('Teknisyen')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RefreshCw size={18} color={TV.ink3} strokeWidth={2} />
          <Text style={{ fontSize: 15, color: TV.ink3 }}>{jobs.length} {autoT('iş')}</Text>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', gap: 18 }}>
        {/* SOL — iş listesi (D-pad ↑↓) */}
        <View style={{ width: 420 }}>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
            {jobs.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, color: TV.ink3 }}>{autoT('Atanmış iş yok')}</Text>
              </View>
            ) : jobs.map((j, i) => (
              <TVFocusable
                key={j.stageId}
                autoFocus={i === 0}
                onSelect={() => setSelectedId(j.stageId)}
                style={{ borderRadius: 18 }}
              >
                {(focused: boolean) => {
                  const isSel = j.stageId === selectedId;
                  return (
                    <View style={{
                      backgroundColor: isSel ? TV.panelHi : TV.panel,
                      borderRadius: 18, borderWidth: 2,
                      borderColor: isSel ? TV.accent : TV.hair,
                      padding: 16, opacity: focused || isSel ? 1 : 0.8,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: (STATUS_COLOR[j.status] ?? TV.ink3) + '22' }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: STATUS_COLOR[j.status] ?? TV.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {autoT(STATUS_LABEL[j.status] ?? j.status)}
                          </Text>
                        </View>
                        {j.isUrgent && <AlertTriangle size={15} color={TV.danger} strokeWidth={2.2} />}
                        <Text style={{ fontSize: 13, color: TV.ink3, marginLeft: 'auto' }}>{j.station}</Text>
                      </View>
                      <Text style={{ fontSize: 22, fontWeight: '600', color: TV.ink, letterSpacing: -0.4 }} numberOfLines={1}>
                        {j.patient ?? j.orderNumber}
                      </Text>
                      <Text style={{ fontSize: 13, color: TV.ink3, marginTop: 2 }}>#{j.orderNumber} · {j.teeth.length} {autoT('diş')}</Text>
                    </View>
                  );
                }}
              </TVFocusable>
            ))}
          </ScrollView>
        </View>

        {/* SAĞ — seçili iş detayı */}
        <View style={{ flex: 1, backgroundColor: TV.panel, borderRadius: 22, borderWidth: 1, borderColor: TV.hair, padding: 24 }}>
          {!selected ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22, color: TV.ink3 }}>{autoT('Soldan bir iş seç')}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: STATUS_COLOR[selected.status] ?? TV.ink3 }}>
                {selected.station} · {autoT(STATUS_LABEL[selected.status] ?? selected.status)}
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 52, color: TV.ink, letterSpacing: -1.6, lineHeight: 56, marginTop: 4 }}>
                {selected.patient ?? selected.orderNumber}
              </Text>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                <Meta label={autoT('Sipariş')} value={`#${selected.orderNumber}`} />
                <Meta label={autoT('Diş')} value={`${selected.teeth.length}`} />
                {selected.workType && <Meta label={autoT('Tür')} value={autoT(selected.workType)} />}
                {selected.deliveryDate && <Meta label={autoT('Teslim')} value={fmtDate(selected.deliveryDate, i18n.language)} />}
              </View>

              {!!selected.teeth.length && (
                <Text style={{ fontSize: 16, color: TV.ink2, marginTop: 14 }}>
                  {autoT('Dişler')}: {selected.teeth.join(', ')}
                </Text>
              )}
              {!!selected.notes && (
                <View style={{ marginTop: 14, backgroundColor: TV.panelHi, borderRadius: 14, padding: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: TV.ink3, marginBottom: 6 }}>{autoT('Not')}</Text>
                  <Text style={{ fontSize: 17, color: TV.ink, lineHeight: 24 }}>{selected.notes}</Text>
                </View>
              )}

              {/* Dosya önizleme şeridi (OK → tam ekran) */}
              <FileStrip workOrderId={selected.workOrderId} />

              {/* Aksiyon */}
              <View style={{ marginTop: 22 }}>
                {canAct ? (
                  <TVFocusable onSelect={isStarted ? doComplete : doStart} style={{ borderRadius: 999, alignSelf: 'flex-start' }}>
                    {(focused: boolean) => (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 32, paddingVertical: 18, borderRadius: 999,
                        backgroundColor: isStarted ? TV.success : TV.accent,
                        opacity: busy ? 0.6 : 1,
                        transform: [{ scale: focused ? 1.03 : 1 }],
                      }}>
                        {isStarted ? <Check size={24} color="#04140C" strokeWidth={2.6} /> : <Play size={24} color="#04121F" strokeWidth={2.6} />}
                        <Text style={{ fontSize: 22, fontWeight: '800', color: isStarted ? '#04140C' : '#04121F' }}>
                          {isStarted ? autoT('Tamamla') : autoT('İşe Başla')}
                        </Text>
                      </View>
                    )}
                  </TVFocusable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 }}>
                    <Clock size={20} color={TV.ink3} strokeWidth={2} />
                    <Text style={{ fontSize: 18, color: TV.ink3 }}>{autoT('Bu iş için henüz işlem yok (sırada / bekliyor)')}</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Toast */}
      {toastMsg && (
        <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: TV.panelHi, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 14, borderWidth: 1, borderColor: TV.hair }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: TV.ink }}>{toastMsg}</Text>
        </View>
      )}
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: TV.ink3 }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '600', color: TV.ink, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

// ── Dosya şeridi + tam ekran görüntüleyici ──────────────────────────
function FileStrip({ workOrderId }: { workOrderId: string }) {
  const [imgs, setImgs] = useState<{ id: string; url: string; name: string }[]>([]);
  const [full, setFull] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!workOrderId) { setImgs([]); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('work_order_photos')
        .select('id, storage_path, caption')
        .eq('work_order_id', workOrderId)
        .order('created_at', { ascending: false });
      const rows = (data ?? []) as any[];
      const imageRows = rows.filter(r => /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(r.storage_path || ''));
      const urls = await getSignedUrls(imageRows.map(r => r.storage_path));
      if (alive) setImgs(imageRows.map(r => ({ id: r.id, url: urls[r.storage_path] ?? '', name: r.caption ?? '' })).filter(x => !!x.url));
    })();
    return () => { alive = false; };
  }, [workOrderId]);

  // Tam ekran açıkken herhangi bir tuş → kapat (engine'i bloke et)
  useEffect(() => {
    if (!full || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => { e.stopImmediatePropagation(); e.preventDefault(); setFull(null); };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [full]);

  if (!imgs.length) return null;

  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <ImageIcon size={18} color={TV.ink3} strokeWidth={2} />
        <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: TV.ink3 }}>{autoT('Dosyalar')}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {imgs.map(im => (
          <TVFocusable key={im.id} onSelect={() => setFull(im)} style={{ borderRadius: 14 }}>
            {(focused: boolean) => (
              <Image
                source={{ uri: im.url }}
                style={{ width: 150, height: 110, borderRadius: 14, borderWidth: 3, borderColor: focused ? TV.accent : TV.hair }}
                resizeMode="cover"
              />
            )}
          </TVFocusable>
        ))}
      </ScrollView>

      <Modal visible={!!full} transparent animationType="fade" onRequestClose={() => setFull(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' }}>
          {full && <Image source={{ uri: full.url }} style={{ width: '86%', height: '86%' } as any} resizeMode="contain" />}
          <Text style={{ position: 'absolute', bottom: 40, fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>{autoT('Kapatmak için herhangi bir tuşa bas')}</Text>
        </View>
      </Modal>
    </View>
  );
}

function fmtDate(s: string, lang: string): string {
  try {
    const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
    return d.toLocaleDateString(localeTag(lang), { day: '2-digit', month: 'short' });
  } catch { return s; }
}
