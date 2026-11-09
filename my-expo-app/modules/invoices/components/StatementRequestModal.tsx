/**
 * Lab ekstresi → Ön ekstre: "Onay iste" (plan 4 Task 5).
 *
 * request_pre_statement_approval yeni onay bağlantısı oluşturur (kliniğin önceki bağlantısı
 * iptal olur) ve seçili kanallardan kliniğin onaylayıcısına gönderir. Kanal kutuları
 * get_statement_request_contacts'ın yalnız boolean yanıtıyla açılır/kapanır; adres ya da
 * numara istemciye gelmez. Sonuç kanal başına gösterilir; jeton istemciye dönmez.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { X, Send, Mail, MessageCircle, Info, CheckSquare, Square } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { fetchStatementRequestContacts, requestPreStatementApproval } from '../preStatementApi';
import { channelDisabledReason, preStatementErrorText, sendStatusText, sendStatusTone } from '../lib/preStatement';
import type { StatementRequestContacts, StatementRequestResult, StatementSendChannel } from '../types';
import { fmtDate } from '../../finance-clinic/components/atoms';

const CHANNELS: StatementSendChannel[] = ['email', 'whatsapp'];
const CHANNEL_LABEL: Record<StatementSendChannel, string> = { email: 'E-posta', whatsapp: 'WhatsApp' };

function errText(e: unknown): string {
  const msg = String((e as any)?.message ?? e);
  const known = preStatementErrorText(msg);
  return known ? autoT(known) : msg;
}

/** Kanal onay kutusu satırı (render dışında: her çizimde yeni bileşen tipi oluşmasın). */
function ChannelRow({ ch, contacts, checked, locked, onToggle }: {
  ch: StatementSendChannel;
  contacts: StatementRequestContacts | null;
  checked: boolean;
  /** Gönderim sürüyor ya da sonuç alındı → değiştirilemez */
  locked: boolean;
  onToggle: (ch: StatementSendChannel) => void;
}) {
  const U = useInkUI();
  const reason = channelDisabledReason(ch, contacts);
  const disabled = reason !== null || locked;
  const on = checked && reason === null;
  const Icon = ch === 'email' ? Mail : MessageCircle;
  const Box = on ? CheckSquare : Square;
  return (
    <Pressable
      onPress={() => { if (!disabled) onToggle(ch); }}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={autoT(CHANNEL_LABEL[ch])}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14,
        borderWidth: 1.5, borderColor: on ? U.ink[900] : U.plainBtn.border,
        backgroundColor: U.plainBtn.bg, opacity: reason !== null ? 0.5 : 1,
        ...(Platform.OS === 'web' ? ({ cursor: disabled ? 'default' : 'pointer' } as any) : {}),
      }}
    >
      <Box size={16} color={on ? U.ink[900] : U.ink[400]} strokeWidth={1.8} style={{ marginTop: 1 }} />
      <Icon size={15} color={U.plainBtn.fg} strokeWidth={1.8} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT(CHANNEL_LABEL[ch])}</Text>
        {reason ? <Text style={{ fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>{autoT(reason)}</Text> : null}
      </View>
    </Pressable>
  );
}

export function StatementRequestModal({ open, clinicId, onClose, onSent }: {
  open: boolean;
  clinicId: string;
  onClose: () => void;
  /** Gönderim yapıldı (yeni bağlantı oluştu) → ebeveyn eski bağlantı panelini sıfırlar. */
  onSent?: () => void;
}) {
  const U = useInkUI();
  const [contacts, setContacts] = useState<StatementRequestContacts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<StatementSendChannel, boolean>>({ email: false, whatsapp: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StatementRequestResult | null>(null);
  // Çift dokunuşta ikinci gönderim gitmesin (state bir sonraki çizime kadar eski kalır).
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setContacts(null); setLoadError(null); setError(null); setResult(null);
    setPicked({ email: false, whatsapp: false });
    fetchStatementRequestContacts(clinicId)
      .then((c) => {
        if (!alive) return;
        setContacts(c);
        setPicked({
          email: channelDisabledReason('email', c) === null,
          whatsapp: channelDisabledReason('whatsapp', c) === null,
        });
      })
      .catch((e) => { if (alive) setLoadError(errText(e)); });
    return () => { alive = false; };
  }, [open, clinicId]);

  const chosen = CHANNELS.filter((c) => picked[c] && channelDisabledReason(c, contacts) === null);

  const submit = async () => {
    if (inFlight.current || result) return;
    if (chosen.length === 0) { setError(autoT('En az bir gönderim kanalı seçin')); return; }
    inFlight.current = true;
    setBusy(true); setError(null);
    try {
      const r = await requestPreStatementApproval(clinicId, chosen);
      setResult(r);
      onSent?.();
    } catch (e) {
      setError(errText(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const close = () => { if (!busy) onClose(); };
  // Seçili (ve seçilebilir) kanal yoksa Gönder pasif — iki kanal da kapalıysa da.
  const sendDisabled = busy || !contacts || chosen.length === 0;
  const webCursor = (on: boolean) => (Platform.OS === 'web' ? ({ cursor: on ? 'pointer' : 'default' } as any) : {});

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 460 }]}>
          <View style={U.modalHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.info.bg }}>
                <Send size={16} color={U.chipTones.info.fg} strokeWidth={1.8} />
              </View>
              <Text style={U.modalTitle} numberOfLines={1}>{autoT('Onay iste')}</Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kapatır')} placement="bottom">
              <Pressable onPress={close} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                <X size={14} color={U.ink[700]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Info size={14} color={U.ink[400]} strokeWidth={1.8} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
                {autoT('Kliniğin onaylayıcısına ön ekstre bağlantısı gönderilir. Mesajda lab adı, dönem, onay bekleyen toplam ve bağlantı yer alır; hasta ve kalem bilgisi yer almaz. Yeni bağlantı öncekini geçersiz kılar.')}
              </Text>
            </View>

            {contacts?.recipient_name ? (
              <Text style={{ fontSize: 12.5, color: U.ink[700] }}>{`${autoT('Onaylayacak kişi')}: ${contacts.recipient_name}`}</Text>
            ) : null}

            {loadError ? (
              <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>{loadError}</Text>
            ) : !contacts ? (
              <ActivityIndicator size="small" color={U.ink[500]} />
            ) : (
              <View style={{ gap: 8 }}>
                {CHANNELS.map((ch) => (
                  <ChannelRow
                    key={ch}
                    ch={ch}
                    contacts={contacts}
                    checked={picked[ch]}
                    locked={busy || !!result}
                    onToggle={(c) => { setPicked((p) => ({ ...p, [c]: !p[c] })); setError(null); }}
                  />
                ))}
              </View>
            )}

            {result ? (
              <View style={{ gap: 6, paddingTop: 6 }}>
                {result.sends.map((s) => {
                  const tone = U.chipTones[sendStatusTone(s.status)];
                  return (
                    <View key={s.channel} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700] }}>
                        {autoT(CHANNEL_LABEL[s.channel as StatementSendChannel] ?? s.channel)}
                      </Text>
                      <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: tone.fg }}>{autoT(sendStatusText(s.status, s.error))}</Text>
                      </View>
                    </View>
                  );
                })}
                <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${autoT('Son geçerlilik')}: ${fmtDate(result.expires_at)}`}</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }}>
              {error ? <Text style={{ flex: 1, minWidth: 160, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text> : null}
              <Pressable
                onPress={close}
                disabled={busy}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: busy ? 0.5 : 1, ...webCursor(!busy) }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{result ? autoT('Kapat') : autoT('Vazgeç')}</Text>
              </Pressable>
              {!result ? (
                <Pressable
                  onPress={submit}
                  disabled={sendDisabled}
                  accessibilityLabel={autoT('Gönder')}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 9,
                    borderRadius: 999, backgroundColor: U.ink[900], opacity: sendDisabled ? 0.5 : 1, ...webCursor(!sendDisabled),
                  }}
                >
                  {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : <Send size={13} color={U.onDarkPill} strokeWidth={2} />}
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Gönder')}</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Ön ekstre bölümündeki "Onay iste" düğmesi + popup. */
export function StatementRequestButton({ clinicId, onSent }: { clinicId: string; onSent?: () => void }) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  return (
    <>
      <GlassTooltip title={autoT('Onay iste')} text={autoT('Onay bağlantısını kliniğin onaylayıcısına e-posta ya da WhatsApp ile gönderir')}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityLabel={autoT('Onay iste')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9, alignSelf: 'flex-start',
            borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
            opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
          })}
        >
          <Send size={13} color={U.plainBtn.fg} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>{autoT('Onay iste')}</Text>
        </Pressable>
      </GlassTooltip>
      <StatementRequestModal open={open} clinicId={clinicId} onClose={() => setOpen(false)} onSent={onSent} />
    </>
  );
}
