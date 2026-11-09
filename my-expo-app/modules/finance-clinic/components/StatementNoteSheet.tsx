/**
 * Ön ekstre — kalem notları (klinik/hekim tarafı).
 *
 * Ortalanmış popup (U.modalOverlay): kalemin mesaj dizisi + yazma alanı.
 * Klinik tarafının notu sunucuda o kalem için itiraz açar (add_statement_note).
 * side='lab' (lab ekstresi): not lab yanıtıdır (itirazı 'Yanıtlandı' yapar) ve
 * "Çözüldü" düğmesi çıkar (resolve_statement_dispute). readOnly: yalnız okunur
 * (finans GÖRME yetkili lab kullanıcısı — yazma manage_finance ister).
 * Mesaj dizisi ebeveynin yeniden çektiği veriden gelir; gönderince onSent()
 * çağrılır, ebeveyn ön ekstreyi yeniden yükler.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { X, Send, Info, CheckCircle2 } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { addStatementNote, resolveStatementDispute } from '../../invoices/preStatementApi';
import { disputeLabel, preStatementErrorText } from '../../invoices/lib/preStatement';
import type { DisputeStatus, PreStatementItem } from '../../invoices/types';
import { fmtDate } from './atoms';

const money = (n: unknown, cur: string | null | undefined) =>
  formatMoney(Number(n) || 0, (cur || 'TRY') as Currency);

export function useDisputeTone(status: DisputeStatus | null) {
  const U = useInkUI();
  if (status === 'acik') return U.chipTones.danger;
  if (status === 'yanitlandi') return U.chipTones.warning;
  return U.chipTones.success;
}

export function DisputeChip({ status }: { status: DisputeStatus }) {
  const tone = useDisputeTone(status);
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone.fg }}>{autoT(disputeLabel(status))}</Text>
    </View>
  );
}

export function StatementNoteSheet({
  open, item: liveItem, currency, onClose, onSent, side = 'clinic', readOnly = false, sendNote, readOnlyText,
}: {
  /** Görünürlüğü ebeveyn yönetir (kalem tazelemede kaybolsa da popup ve hatası açık kalır). */
  open: boolean;
  /** Tazelenen veriden kalem; fatura bu arada kesildiyse null → son görülen kalem gösterilir. */
  item: PreStatementItem | null;
  currency: string | null;
  onClose: () => void;
  /** Not kaydedildi ya da kalem/fatura artık geçerli değil → ebeveyn yeniden yükler. */
  onSent: () => Promise<void> | void;
  /** Kimin adına yazılıyor: 'clinic' (varsayılan, not itiraz açar) ya da 'lab' (yanıt + Çözüldü). */
  side?: 'clinic' | 'lab';
  /** Yazma alanı ve Çözüldü gizlenir (yalnız okuma yetkisi). */
  readOnly?: boolean;
  /** Notu gönderen çağrı (varsayılan add_statement_note). Girişsiz bağlantı sayfası jetonlu çağrıyı verir. */
  sendNote?: (itemId: string, body: string) => Promise<unknown>;
  /** readOnly iken gösterilen açıklama (varsayılan: yetki metni). */
  readOnlyText?: string;
}) {
  const U = useInkUI();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Çift dokunuşta ikinci not gitmesin: state bir sonraki çizime kadar eski kalır, ref anında.
  const inFlight = useRef(false);
  // Son görülen kalem: tazeleme kalemi düşürse de popup (ve hata metni) yerinde kalır.
  const [snapshot, setSnapshot] = useState<PreStatementItem | null>(liveItem);
  useEffect(() => { if (liveItem) setSnapshot(liveItem); }, [liveItem]);
  useEffect(() => { if (!open) setSnapshot(null); }, [open]);
  const item = liveItem ?? snapshot;

  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const resolveInFlight = useRef(false);

  // Başka kaleme geçince taslak metin ve hata sıfırlanır.
  useEffect(() => { setBody(''); setError(null); setResolveError(null); }, [item?.id]);

  const send = async () => {
    if (!item || inFlight.current) return;
    const text = body.trim();
    if (!text) { setError(autoT('Not 1–2000 karakter olmalı')); return; }
    inFlight.current = true;
    setSending(true); setError(null);
    try {
      await (sendNote ?? addStatementNote)(item.id, text);
      setBody('');
      await onSent();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const known = preStatementErrorText(msg);
      setError(known ? autoT(known) : msg);
      // Fatura bu arada kesildiyse / kapsam değiştiyse liste arka planda tazelensin;
      // popup açık kalır, hata Gönder'in yanında görünür.
      if (/PS_NOT_DRAFT|PS_SCOPE/.test(msg)) void onSent();
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!item || resolveInFlight.current) return;
    resolveInFlight.current = true;
    setResolving(true); setResolveError(null);
    try {
      await resolveStatementDispute(item.id);
      await onSent();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const known = preStatementErrorText(msg);
      setResolveError(known ? autoT(known) : msg);
      if (/PS_NOT_DRAFT|PS_SCOPE/.test(msg)) void onSent();
    } finally {
      resolveInFlight.current = false;
      setResolving(false);
    }
  };

  const notes = item?.notes ?? [];
  const isLab = side === 'lab';
  const canResolve = isLab && !readOnly && (item?.dispute_status === 'acik' || item?.dispute_status === 'yanitlandi');

  return (
    <Modal visible={open && !!item} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={U.modalOverlay}>
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle} numberOfLines={1}>{autoT('Kalem notları')}</Text>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Notlar penceresini kapatır')} placement="bottom">
              <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                <X size={14} color={U.ink[700]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          {item ? (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
              {/* Kalem özeti */}
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], flexShrink: 1 }}>
                    {item.description || '—'}
                  </Text>
                  {item.dispute_status ? <DisputeChip status={item.dispute_status} /> : null}
                </View>
                <Text style={{ fontSize: 12, color: U.ink[500] }}>
                  {[item.order_no, item.patient_initials, `${Number(item.quantity) || 0} × ${money(item.unit_price, currency)}`, money(item.total, currency)]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>

              {/* Mesaj dizisi */}
              <View style={{ gap: 8 }}>
                {notes.length === 0 ? (
                  <Text style={{ fontSize: 12.5, color: U.ink[400] }}>{autoT('Henüz not yok')}</Text>
                ) : notes.map(n => {
                  const mine = n.author_side === side;
                  const fromClinic = n.author_side === 'clinic';
                  return (
                    <View key={n.id} style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%',
                      backgroundColor: mine ? U.chipTones.info.bg : U.chipNeutral,
                      borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 3,
                    }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: mine ? U.chipTones.info.fg : U.ink[500] }}>
                        {fromClinic ? autoT('Klinik') : autoT('Lab')} · {fmtDate(n.created_at)}
                      </Text>
                      <Text style={{ fontSize: 13, color: U.ink[900], lineHeight: 18 }}>{n.body}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Lab: itirazı çözüldü say (düzeltme yapıldıktan sonra) */}
              {canResolve ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {resolveError ? (
                    <Text style={{ flex: 1, minWidth: 160, fontSize: 12, color: U.chipTones.danger.fg }}>{resolveError}</Text>
                  ) : null}
                  <GlassTooltip title={autoT('Çözüldü')} text={autoT('İtirazı kapatır; kalem onaya hazır olur')} placement="top">
                    <Pressable
                      onPress={resolve}
                      disabled={resolving}
                      accessibilityLabel={autoT('Çözüldü')}
                      style={({ pressed }) => ({
                        flexDirection: 'row', alignItems: 'center', gap: 7,
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: U.chipTones.success.bg, opacity: resolving ? 0.6 : pressed ? 0.85 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      })}
                    >
                      {resolving
                        ? <ActivityIndicator size="small" color={U.chipTones.success.fg} />
                        : <CheckCircle2 size={13} color={U.chipTones.success.fg} strokeWidth={2} />}
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.chipTones.success.fg }}>{autoT('Çözüldü')}</Text>
                    </Pressable>
                  </GlassTooltip>
                </View>
              ) : null}

              {/* Yazma alanı */}
              {readOnly ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Info size={13} color={U.ink[400]} strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>
                    {readOnlyText ?? autoT('Yanıt yazmak için mali işlem yönetme yetkisi gerekir')}
                  </Text>
                </View>
              ) : (<>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <Info size={13} color={U.ink[400]} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>
                  {isLab
                    ? autoT('Yanıtınız itirazı "Yanıtlandı" yapar; taslağı düzelttiyseniz Çözüldü deyin')
                    : autoT('Notunuz bu kalem için itiraz açar; lab yanıtlar')}
                </Text>
              </View>
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder={isLab ? autoT('Yanıtınızı yazın') : autoT('Notunuzu yazın')}
                placeholderTextColor={U.ink[400]}
                multiline
                maxLength={2000}
                style={[U.inputStyle, { height: 96, paddingTop: 10, textAlignVertical: 'top' }]}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {error ? (
                  <Text style={{ flex: 1, minWidth: 160, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text>
                ) : null}
                <Pressable
                  onPress={send}
                  disabled={sending}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
                    backgroundColor: U.ink[900], opacity: sending ? 0.6 : pressed ? 0.85 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  {sending
                    ? <ActivityIndicator size="small" color={U.onDarkPill} />
                    : <Send size={13} color={U.onDarkPill} strokeWidth={2} />}
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Gönder')}</Text>
                </Pressable>
              </View>
              </>)}
            </ScrollView>
          ) : null}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
