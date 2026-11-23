/**
 * DeliveryUndoModal — "Teslimi geri al" popup'ı (lab yöneticisi/admin, teslim edilmiş sipariş).
 *
 * Akış: açılınca sunucudan önizleme (delivery_undo_preview) alınır →
 *   - engel varsa (kesilmiş fatura, toplu taslak, ödeme, kurye teslim kanıtı) nedeni yazılır, işlem yapılmaz;
 *   - yoksa dönülecek aşama seçilir (varsayılan son tamamlanan) ve silinecekler listelenir.
 * Taslak fatura ya da gönderilmemiş değerlendirme isteği silinecekse "anladım" kutusu
 * işaretlenmeden "Geri al" açılmaz (kullanıcı kararı 2026-11-14: silinecekse uyarı + onay).
 * Sunucu aynı denetimi uygularken yeniden yapar; önizleme ile uygulama arasında fatura kesilirse reddeder.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { X, Undo2, AlertTriangle, Square, CheckSquare, Circle, CircleCheck } from '../../../core/ui/icons';
import { fetchDeliveryUndoPreview, undoDelivery, type DeliveryUndoBlock, type DeliveryUndoPreview } from '../api';

const BLOCK_TEXT: Record<DeliveryUndoBlock, string> = {
  not_found: 'Sipariş bulunamadı.',
  not_delivered: 'Bu sipariş teslim edilmiş görünmüyor; geri alınacak bir teslim yok.',
  invoice_issued: 'Bu siparişin hizmet bedeli kesinleşmiş. Kesinleşmiş hizmet bedeli değiştirilemez; önce hizmet bedelini iptal edin, sonra teslimi geri alın.',
  invoice_shared: 'Bu siparişin taslak hizmet bedeli başka siparişleri de kapsıyor. Önce siparişi o hizmet bedelinden çıkarın.',
  invoice_paid: 'Bu siparişin taslak hizmet bedeline ödeme bağlanmış. Önce ödemeyi hizmet bedelinden ayırın.',
  courier_delivered: 'Kurye bu siparişi kliniğe teslim etmiş (teslim kanıtı var). Kuryeyle teslim edilen iş geri alınamaz; gerekirse revizyon açın.',
  no_stage: 'Bu siparişte dönülebilecek tamamlanmış aşama yok.',
  bad_stage: 'Seçilen aşama artık uygun değil. Pencereyi kapatıp yeniden açın.',
};

function fmtAmount(n: number | string, cur: string): string {
  const v = Number(n) || 0;
  const s = v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur === 'TRY' ? '₺' : cur + ' ';
  return `${sym}${s}`;
}

export function DeliveryUndoModal({ visible, onClose, onDone, orderId, orderNumber }: {
  visible: boolean;
  onClose: () => void;
  /** Geri alma başarılı → ekran yenilensin */
  onDone: () => void;
  orderId: string;
  orderNumber?: string | null;
}) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const narrow = width < 768;
  const [loading, setLoading] = useState(false);
  const [prev, setPrev] = useState<DeliveryUndoPreview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true); setPrev(null); setLoadErr(null); setAck(false); setActErr(null); setStageId(null);
    fetchDeliveryUndoPreview(orderId).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) { setLoadErr(r.error ?? autoT('Önizleme alınamadı')); return; }
      setPrev(r.data);
      setStageId(r.data.default_stage_id ?? null);
    });
    return () => { alive = false; };
  }, [visible, orderId]);

  if (!visible) return null;

  const drafts = prev?.draft_invoices ?? [];
  const reviewQueued = prev?.review === 'queued';
  const willDelete = drafts.length > 0 || reviewQueued;
  const stages = prev?.stages ?? [];
  const multiLane = new Set(stages.map(s => s.lane)).size > 1;
  const canSubmit = !!prev?.ok && !!stageId && (!willDelete || ack) && !busy;
  const warn = U.chipTones.warning;
  const danger = U.chipTones.danger;
  const web = Platform.OS === 'web';

  const submit = async () => {
    if (!canSubmit || !stageId) return;
    setBusy(true); setActErr(null);
    const r = await undoDelivery(orderId, stageId);
    setBusy(false);
    if (!r.ok) {
      setActErr(r.block ? autoT(BLOCK_TEXT[r.block]) : `${autoT('Geri alınamadı')}: ${r.error ?? ''}`);
      return;
    }
    onDone();
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable
          onPress={busy ? undefined : onClose}
          accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(web ? { cursor: 'default' } as any : null) }}
        />
        <View style={[U.modalCard, { maxWidth: 520 }]} accessibilityViewIsModal>
          <View style={[U.modalHeaderRow, { gap: 12 }]}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.neutral.bg }}>
              <Undo2 size={17} color={U.ink[700]} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[U.modalTitle, { letterSpacing: -0.2 }]} numberOfLines={1}>{autoT('Teslimi geri al')}</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>
                {orderNumber ? `#${orderNumber} · ` : ''}{autoT('Sipariş üretim aşamasına döner')}
              </Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Hiçbir şey değişmeden kapatır')} placement="bottom">
              <Pressable
                onPress={onClose}
                disabled={busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...(web ? { cursor: 'pointer' } as any : {}) })}
              >
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
            {loading && (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                <ActivityIndicator color={U.ink[500]} />
              </View>
            )}

            {loadErr && (
              <Text style={{ fontSize: 13, color: danger.fg }}>{loadErr}</Text>
            )}

            {/* Engel: işlem yapılmaz, nedeni yazılır */}
            {prev && !prev.ok && (
              <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: danger.bg }}>
                <AlertTriangle size={18} color={danger.fg} strokeWidth={1.8} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: danger.fg }}>{autoT('Teslim geri alınamaz')}</Text>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: danger.fg }}>
                    {autoT(BLOCK_TEXT[prev.block ?? 'not_found'])}
                  </Text>
                  {prev.block_ref ? (
                    <Text style={{ fontSize: 12, color: danger.fg, fontVariant: ['tabular-nums'] }}>{prev.block_ref}</Text>
                  ) : null}
                </View>
              </View>
            )}

            {prev?.ok && (
              <>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: U.ink[400] }}>
                    {autoT('DÖNÜLECEK AŞAMA')}
                  </Text>
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: U.hairline, overflow: 'hidden' }}>
                    {stages.map((s, i) => {
                      const sel = s.id === stageId;
                      const Ico = sel ? CircleCheck : Circle;
                      return (
                        <Pressable
                          key={s.id}
                          onPress={() => setStageId(s.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: sel }}
                          style={({ hovered }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 14, paddingVertical: 10,
                            borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft,
                            backgroundColor: sel ? U.chipTones.info.bg : hovered ? U.rowHover : 'transparent',
                            ...(web ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          <Ico size={16} color={sel ? U.chipTones.info.fg : U.ink[400]} strokeWidth={1.8} />
                          <Text style={{ flex: 1, fontSize: 13, color: sel ? U.chipTones.info.fg : U.ink[800], fontWeight: sel ? '600' : '400' }} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <Text style={{ fontSize: 11, color: U.ink[400], fontVariant: ['tabular-nums'] }}>
                            {multiLane ? `${s.lane}.${s.seq}` : String(s.seq)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 12, lineHeight: 17, color: U.ink[500] }}>
                    {autoT('Seçilen aşama yeniden başlar; ondan sonraki aşamalar beklemeye döner. Öncekiler tamamlanmış kalır.')}
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: U.ink[400] }}>
                    {autoT('NE DEĞİŞECEK')}
                  </Text>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: U.ink[800] }}>
                    {autoT('Sipariş "Üretim Aşamasında" durumuna döner ve teslim saati silinir. Geçmiş\'e "Teslim geri alındı" kaydı düşer.')}
                  </Text>
                  {prev.review === 'sent' && (
                    <Text style={{ fontSize: 12, lineHeight: 17, color: U.ink[500] }}>
                      {autoT('Değerlendirme isteği kliniğe zaten gönderilmiş; o mesaj geri alınamaz.')}
                    </Text>
                  )}
                  {prev.review === 'answered' && (
                    <Text style={{ fontSize: 12, lineHeight: 17, color: U.ink[500] }}>
                      {autoT('Klinik bu işi zaten puanlamış; puan silinmez.')}
                    </Text>
                  )}
                </View>

                {/* Silinecekler: uyarı + onay kutusu */}
                {willDelete && (
                  <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: warn.bg }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <AlertTriangle size={16} color={warn.fg} strokeWidth={1.8} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: warn.fg }}>{autoT('Şunlar silinecek')}</Text>
                    </View>
                    {drafts.map(d => (
                      <View key={d.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ flex: 1, fontSize: 13, color: warn.fg }} numberOfLines={1}>
                          {autoT('Taslak hizmet bedeli')} {d.number}
                        </Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: warn.fg, fontVariant: ['tabular-nums'] }}>
                          {fmtAmount(d.total, d.currency)}
                        </Text>
                      </View>
                    ))}
                    {reviewQueued && (
                      <Text style={{ fontSize: 13, color: warn.fg }}>{autoT('Sırada bekleyen değerlendirme isteği (henüz gönderilmedi)')}</Text>
                    )}
                    <Text style={{ fontSize: 12, lineHeight: 17, color: warn.fg }}>
                      {autoT('Sipariş yeniden teslim edildiğinde taslak hizmet bedeli ve değerlendirme isteği kendiliğinden yeniden oluşur.')}
                    </Text>
                    <Pressable
                      onPress={() => setAck(a => !a)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: ack }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, ...(web ? { cursor: 'pointer' } as any : {}) }}
                    >
                      {ack
                        ? <CheckSquare size={18} color={warn.fg} strokeWidth={1.9} />
                        : <Square size={18} color={warn.fg} strokeWidth={1.9} />}
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: warn.fg }}>
                        {autoT('Bunların silineceğini anladım')}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Alt düğmeler — hata düğmenin hemen üstünde */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 18, paddingTop: 4, gap: 10 }}>
            {actErr && <Text style={{ fontSize: 12.5, lineHeight: 18, color: danger.fg }}>{actErr}</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                accessibilityRole="button"
                style={({ hovered }: any) => ({
                  height: 40, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center',
                  backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                  ...(web ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>
                  {prev && !prev.ok ? autoT('Kapat') : autoT('Vazgeç')}
                </Text>
              </Pressable>
              {prev?.ok && (
                <Pressable
                  onPress={submit}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit }}
                  style={{
                    height: 40, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', flexDirection: 'row',
                    alignItems: 'center', gap: 8, backgroundColor: '#D94B4B', opacity: canSubmit ? 1 : 0.45,
                    ...(web ? { cursor: canSubmit ? 'pointer' : 'not-allowed' } as any : {}),
                  }}
                >
                  {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Undo2 size={15} color="#FFFFFF" strokeWidth={2} />}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{autoT('Teslimi geri al')}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default DeliveryUndoModal;
