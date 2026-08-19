/**
 * Malzeme Talebi — Detay drawer.
 *
 * Sağdan açılır panel:
 *  - Üstte hero (talep no + başlık + status + urgency)
 *  - Meta grid (requester · tarih · ihtiyaç · supplier · admin notu)
 *  - Kalem tablosu
 *  - Timeline (events log)
 *  - Aksiyon butonları (yetkiye göre)
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Platform, ActivityIndicator } from 'react-native';
import {
  X, Wrench, Clock, Calendar as CalendarIcon, User, ArrowRight, ArrowLeft,
  CheckCircle2, XCircle, Truck, PackageCheck, FileText,
  Hourglass, ShieldCheck, Slash,
} from 'lucide-react-native';

import { isRTL } from '../../../core/i18n';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import {
  getRequest, getRequestEvents,
  type MaterialRequestRow, type MaterialRequestEventRow,
} from '../api';
import {
  DISPLAY, TRY, fmtMoneyDec, fmtDate, fmtDateTime, PillButton, StatusChip, UrgencyChip,
  CATEGORY_LABEL,
} from './atoms';
import type { ApprovalAction } from './ApprovalActionsModal';

type Props = {
  visible: boolean;
  requestId: string | null;
  onClose: () => void;
  onAction: (action: ApprovalAction, request: MaterialRequestRow) => void;
  isAdmin: boolean;
  isManager: boolean;
};

const makeEventCfg = (t: ReturnType<typeof useMobileTokens>): Record<string, { label: string; icon: any; color: string }> => {
  // "Yönlendirildi" olayı yön BİLDİRİR — RTL'de ok karşı tarafa bakmalı.
  const Fwd = isRTL() ? ArrowLeft : ArrowRight;
  return ({
  created:              { label: 'Talep oluşturuldu',            icon: Wrench,        color: t.ink2      },
  submitted:            { label: 'Müdür onayına gönderildi',      icon: Hourglass,     color: '#9C5E0E'   },
  auto_forwarded_self:  { label: 'Otomatik admin yönlendirme',    icon: Fwd,           color: '#1D4ED8'   },
  forwarded:            { label: 'Admin\'e yönlendirildi',         icon: Fwd,           color: '#1D4ED8'   },
  rejected_manager:     { label: 'Müdür reddetti',                  icon: XCircle,       color: '#9C2E2E'   },
  rejected_admin:       { label: 'Admin reddetti',                  icon: XCircle,       color: '#9C2E2E'   },
  approved:             { label: 'Admin onayladı',                  icon: CheckCircle2,  color: '#1F6B47'   },
  ordered:              { label: 'Sipariş verildi',                icon: Truck,         color: '#7C3AED'   },
  received:             { label: 'Teslim alındı',                  icon: PackageCheck,  color: '#0EA5E9'   },
  closed:               { label: 'Kapatıldı',                      icon: CheckCircle2,  color: t.ink2      },
  cancelled:            { label: 'İptal edildi',                  icon: Slash,         color: t.ink3      },
  commented:            { label: 'Yorum eklendi',                 icon: FileText,      color: t.ink3      },
  updated:              { label: 'Güncellendi',                   icon: FileText,      color: t.ink3      },
  });
};

export function RequestDetailDrawer({
  visible, requestId, onClose, onAction, isAdmin, isManager,
}: Props) {
  const TH = usePanelTheme();
  const T = useMobileTokens();
  const EVENT_CFG = makeEventCfg(T);
  const [request, setRequest] = useState<MaterialRequestRow | null>(null);
  const [events, setEvents]   = useState<MaterialRequestEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !requestId) return;
    setLoading(true); setError(null);
    Promise.all([getRequest(requestId), getRequestEvents(requestId)])
      .then(([r, e]) => { setRequest(r); setEvents(e); })
      .catch(err => setError(String(err?.message ?? err)))
      .finally(() => setLoading(false));
  }, [visible, requestId]);

  const r = request;

  const canManagerAct  = r && isManager && r.status === 'submitted';
  const canAdminApprove = r && isAdmin && r.status === 'forwarded_admin';
  const canOrder        = r && isAdmin && r.status === 'approved';
  const canReceive      = r && isAdmin && (r.status === 'ordered' || r.status === 'approved');

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
          alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 720, maxHeight: '92%',
            backgroundColor: T.card,
            borderRadius: 22, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: T.hairline,
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>
                Malzeme Talebi · Detay
              </Text>
              {r && (
                <>
                  <Text style={{ ...DISPLAY, fontSize: 24, color: T.ink, letterSpacing: -0.6, marginTop: 4 }} numberOfLines={2}>
                    {r.title}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3, letterSpacing: 0.4 }}>
                      {r.request_no}
                    </Text>
                    <StatusChip status={r.status} size="sm" />
                    <UrgencyChip urgency={r.urgency} size="sm" />
                  </View>
                </>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color={T.ink3} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 18 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={TH.primary} />
              </View>
            ) : error ? (
              <Text style={{ fontSize: 13, color: '#9C2E2E' }}>{error}</Text>
            ) : !r ? null : (
              <>
                {/* Meta grid */}
                <View style={{
                  padding: 14, borderRadius: 14,
                  backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                  flexDirection: 'row', flexWrap: 'wrap', gap: 14,
                }}>
                  <Meta label="Talep Eden" value={r.requester?.full_name ?? '—'} sub={r.requester_type === 'manager' ? 'Mesul Müdür' : 'Teknisyen'} />
                  <Meta label="Bildirim Tarihi" value={fmtDate(r.submitted_at?.slice(0, 10))} />
                  <Meta label="İhtiyaç Tarihi"  value={r.needed_by ? fmtDate(r.needed_by) : '—'} />
                  <Meta label="Toplam Maliyet"  value={r.total_cost != null ? fmtMoneyDec(r.total_cost) : '—'} />
                  {r.manager?.full_name && <Meta label="Müdür Aksiyon" value={r.manager.full_name} sub={r.manager_action_at ? fmtDateTime(r.manager_action_at) : ''} />}
                  {r.admin?.full_name   && <Meta label="Admin Aksiyon" value={r.admin.full_name}   sub={r.admin_action_at ? fmtDateTime(r.admin_action_at) : ''} />}
                </View>

                {/* Manager / Admin notları */}
                {(r.reason || r.manager_note || r.admin_note || r.reject_reason) && (
                  <View style={{ gap: 8 }}>
                    {r.reason && <NoteBox eyebrow="Gerekçe" body={r.reason} />}
                    {r.manager_note && <NoteBox eyebrow="Mesul Müdür Notu" body={r.manager_note} />}
                    {r.admin_note   && <NoteBox eyebrow="Admin Notu" body={r.admin_note} />}
                    {r.reject_reason && <NoteBox eyebrow="Red Sebebi" body={r.reject_reason} danger />}
                  </View>
                )}

                {/* Kalemler */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
                    Kalemler ({r.items?.length ?? 0})
                  </Text>
                  <View style={{
                    borderWidth: 1, borderColor: T.hairline, borderRadius: 14,
                    backgroundColor: T.card, overflow: 'hidden',
                  }}>
                    {(r.items ?? []).map((it, i, arr) => {
                      const aq  = it.approved_qty ?? it.quantity;
                      const auc = it.actual_unit_cost ?? it.est_unit_cost ?? 0;
                      const sub = aq * Number(auc);
                      return (
                        <View
                          key={it.id}
                          style={{
                            flexDirection: 'row', gap: 12,
                            paddingHorizontal: 14, paddingVertical: 12,
                            borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                            borderBottomColor: T.hairline,
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }} numberOfLines={1}>
                              {it.name}
                            </Text>
                            <Text style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                              {it.category ? `${CATEGORY_LABEL[it.category] ?? it.category} · ` : ''}
                              {it.quantity} {it.unit} talep
                              {it.approved_qty != null && it.approved_qty !== it.quantity && (
                                <Text style={{ color: '#9C5E0E' }}> → {it.approved_qty} onaylı</Text>
                              )}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={{ ...DISPLAY, fontSize: 16, color: T.ink, letterSpacing: -0.4 }}>
                              {sub > 0 ? fmtMoneyDec(sub) : '—'}
                            </Text>
                            {Number(auc) > 0 && (
                              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
                                {fmtMoneyDec(auc)}/{it.unit}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Timeline */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: T.ink3 }}>
                    Zaman Çizgisi
                  </Text>
                  <View style={{ paddingStart: 6 }}>
                    {events.map((e, i) => {
                      const cfg = EVENT_CFG[e.action] ?? { label: e.action, icon: FileText, color: T.ink3 };
                      const Icon = cfg.icon;
                      const last = i === events.length - 1;
                      return (
                        <View key={e.id} style={{ flexDirection: 'row', gap: 10 }}>
                          {/* Rail + dot */}
                          <View style={{ alignItems: 'center', width: 22 }}>
                            <View style={{
                              width: 22, height: 22, borderRadius: 11,
                              backgroundColor: cfg.color + '18',
                              borderWidth: 1, borderColor: cfg.color + '33',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Icon size={11} color={cfg.color} strokeWidth={2} />
                            </View>
                            {!last && (
                              <View style={{ width: 1.5, flex: 1, backgroundColor: T.hairline, marginTop: 2, marginBottom: 2 }} />
                            )}
                          </View>
                          <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink }}>
                              {cfg.label}
                            </Text>
                            <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
                              {e.actor?.full_name ?? 'Sistem'} · {fmtDateTime(e.created_at)}
                            </Text>
                            {e.note && (
                              <Text style={{ fontSize: 11, color: T.ink2, marginTop: 4, fontStyle: 'italic' }}>
                                {e.note}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
          </ScrollView>

          {/* Aksiyon barı (footer) */}
          {r && (canManagerAct || canAdminApprove || canOrder || canReceive) && (
            <View style={{
              paddingHorizontal: 22, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: T.hairline,
              flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              {canManagerAct && (
                <>
                  <PillButton variant="ghost" onPress={() => onAction('manager_reject', r)}
                    leftIcon={<XCircle size={13} color="#9C2E2E" />}>
                    Reddet
                  </PillButton>
                  <PillButton variant="dark" onPress={() => onAction('manager_forward', r)}
                    leftIcon={isRTL() ? <ArrowLeft size={13} color={T.card} /> : <ArrowRight size={13} color={T.card} />}>
                    Admin'e Yönlendir
                  </PillButton>
                </>
              )}
              {canAdminApprove && (
                <>
                  <PillButton variant="ghost" onPress={() => onAction('admin_reject', r)}
                    leftIcon={<XCircle size={13} color="#9C2E2E" />}>
                    Reddet
                  </PillButton>
                  <PillButton variant="success" onPress={() => onAction('admin_approve', r)}
                    leftIcon={<CheckCircle2 size={13} color="#FFF" />}>
                    Onayla
                  </PillButton>
                </>
              )}
              {canOrder && (
                <PillButton variant="dark" onPress={() => onAction('admin_order', r)}
                  leftIcon={<Truck size={13} color={T.card} />}>
                  Sipariş Ver
                </PillButton>
              )}
              {canReceive && (
                <PillButton variant="success" onPress={() => onAction('admin_receive', r)}
                  leftIcon={<PackageCheck size={13} color="#FFF" />}>
                  Teslim Al
                </PillButton>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ───── helpers ───── */

function Meta({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: T.ink3 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, color: T.ink, marginTop: 2, fontWeight: '500' }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{sub}</Text> : null}
    </View>
  );
}

function NoteBox({ eyebrow, body, danger }: { eyebrow: string; body: string; danger?: boolean }) {
  const T = useMobileTokens();
  return (
    <View style={{
      padding: 12, borderRadius: 12,
      backgroundColor: danger ? 'rgba(217,75,75,0.06)' : T.cardSoft,
      borderWidth: 1, borderColor: danger ? 'rgba(217,75,75,0.25)' : T.hairline,
    }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: danger ? '#9C2E2E' : T.ink3 }}>
        {eyebrow}
      </Text>
      <Text style={{ fontSize: 13, color: danger ? '#9C2E2E' : T.ink2, marginTop: 4, lineHeight: 19 }}>
        {body}
      </Text>
    </View>
  );
}
