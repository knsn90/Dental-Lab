/**
 * Malzeme Talebi — Onay aksiyonları modal'ı.
 *
 * Aksiyonlar:
 *   manager.forward / manager.reject
 *   admin.approve   / admin.reject  /  admin.order  /  admin.receive
 *
 * Tek modal — `action` prop'una göre içerik değişir.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import {
  X, CheckCircle2, AlertCircle, Send, Truck, PackageCheck, ArrowRight,
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  managerForward, managerReject, adminApprove, adminReject,
  markOrdered, markReceived,
  type MaterialRequestRow, type AdminApproveItem,
} from '../api';
import { DISPLAY, TRY, PillButton } from './atoms';

export type ApprovalAction =
  | 'manager_forward'
  | 'manager_reject'
  | 'admin_approve'
  | 'admin_reject'
  | 'admin_order'
  | 'admin_receive';

type Props = {
  visible: boolean;
  action: ApprovalAction | null;
  request: MaterialRequestRow | null;
  onClose: () => void;
  onDone: () => void;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const ACTION_CFG: Record<ApprovalAction, {
  title: string; eyebrow: string; icon: any; cta: string;
  variant: 'dark' | 'primary' | 'success' | 'danger';
  needsReason?: boolean;
  destructive?: boolean;
}> = {
  manager_forward: { title: 'Admin\'e Yönlendir', eyebrow: 'Mesul Müdür Aksiyonu', icon: ArrowRight,   cta: 'Yönlendir',  variant: 'dark' },
  manager_reject:  { title: 'Talebi Reddet',      eyebrow: 'Mesul Müdür Aksiyonu', icon: X,            cta: 'Reddet',     variant: 'danger', needsReason: true, destructive: true },
  admin_approve:   { title: 'Talebi Onayla',      eyebrow: 'Admin Aksiyonu',       icon: CheckCircle2, cta: 'Onayla',     variant: 'success' },
  admin_reject:    { title: 'Talebi Reddet',      eyebrow: 'Admin Aksiyonu',       icon: X,            cta: 'Reddet',     variant: 'danger', needsReason: true, destructive: true },
  admin_order:     { title: 'Siparişi Kaydet',    eyebrow: 'Admin Aksiyonu',       icon: Truck,        cta: 'Sipariş Ver',variant: 'dark' },
  admin_receive:   { title: 'Teslim Alındı',      eyebrow: 'Admin Aksiyonu',       icon: PackageCheck, cta: 'Teslim Al',  variant: 'success' },
};

export function ApprovalActionsModal({ visible, action, request, onClose, onDone }: Props) {
  const TH = usePanelTheme();

  // State
  const [note, setNote]         = useState('');
  const [orderedAt, setOrderedAt]   = useState<string>(todayISO());
  const [expectedAt, setExpectedAt] = useState<string | null>(null);
  const [totalCost, setTotalCost]   = useState<string>('');
  const [receivedAt, setReceivedAt] = useState<string>(todayISO());
  const [approveItems, setApproveItems] = useState<AdminApproveItem[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    setNote(''); setError(null); setSuccess(false);
    setOrderedAt(todayISO()); setExpectedAt(null); setTotalCost('');
    setReceivedAt(todayISO());
    if (request?.items) {
      setApproveItems(request.items.map(i => ({
        id: i.id,
        approved_qty: i.approved_qty ?? i.quantity,
        actual_unit_cost: i.actual_unit_cost ?? i.est_unit_cost,
      })));
    } else {
      setApproveItems([]);
    }
  }, [visible, request?.id]);

  if (!action || !request) return null;
  const cfg = ACTION_CFG[action];
  const Icon = cfg.icon;

  const reasonOk = !cfg.needsReason || note.trim().length >= 4;
  const canSubmit = reasonOk && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !request) return;
    setSubmitting(true); setError(null);
    try {
      switch (action) {
        case 'manager_forward':
          await managerForward(request.id, note.trim() || null);
          break;
        case 'manager_reject':
          await managerReject(request.id, note.trim());
          break;
        case 'admin_approve':
          await adminApprove(request.id, approveItems, note.trim() || null);
          break;
        case 'admin_reject':
          await adminReject(request.id, note.trim());
          break;
        case 'admin_order':
          await markOrdered(request.id, {
            orderedAt,
            expectedAt: expectedAt || null,
            totalCost: totalCost.trim()
              ? Number(totalCost.replace(/\./g, '').replace(',', '.')) || null
              : null,
          });
          break;
        case 'admin_receive':
          await markReceived(request.id, receivedAt);
          break;
      }
      setSuccess(true);
      setTimeout(() => { onDone(); onClose(); }, 1100);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 560, maxHeight: '92%',
            backgroundColor: '#FFF', borderRadius: 22, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon size={11} color={cfg.destructive ? '#9C2E2E' : DS.ink[500]} />
                <Text style={{
                  fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
                  color: cfg.destructive ? '#9C2E2E' : DS.ink[500],
                }}>
                  {cfg.eyebrow}
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>
                {cfg.title}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }} numberOfLines={1}>
                {request.request_no} · {request.title}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color={DS.ink[500]} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              <View style={{
                padding: 24, alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(45,154,107,0.08)', borderRadius: 16,
                borderWidth: 1, borderColor: 'rgba(45,154,107,0.25)',
              }}>
                <CheckCircle2 size={36} color="#1F6B47" />
                <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.3 }}>
                  İşlem tamam
                </Text>
              </View>
            ) : (
              <>
                {/* Action-specific body */}
                {action === 'admin_approve' && request.items && (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                      Kalemler ({request.items.length})
                    </Text>
                    {request.items.map(it => {
                      const ap = approveItems.find(a => a.id === it.id);
                      return (
                        <View key={it.id} style={{
                          padding: 10, borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                          backgroundColor: '#FFF', gap: 6,
                        }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                            {it.name}
                          </Text>
                          <Text style={{ fontSize: 10, color: DS.ink[500] }}>
                            Talep edilen: {it.quantity} {it.unit}
                            {it.est_unit_cost != null ? `  ·  ${TRY(it.est_unit_cost)}/br tahmini` : ''}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500], marginBottom: 2 }}>
                                ONAYLI MİKTAR
                              </Text>
                              <TextInput
                                value={String(ap?.approved_qty ?? '')}
                                onChangeText={(v) => setApproveItems(prev => prev.map(x =>
                                  x.id === it.id ? { ...x, approved_qty: Number(v.replace(',', '.')) || 0 } : x
                                ))}
                                keyboardType="decimal-pad"
                                style={{
                                  borderWidth: 1, borderColor: DS.ink[200], borderRadius: 8,
                                  paddingHorizontal: 10, paddingVertical: 6,
                                  fontSize: 13, color: DS.ink[900],
                                  outlineStyle: 'none' as any,
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500], marginBottom: 2 }}>
                                GERÇEK ₺/BR
                              </Text>
                              <TextInput
                                value={ap?.actual_unit_cost != null ? String(ap.actual_unit_cost) : ''}
                                onChangeText={(v) => setApproveItems(prev => prev.map(x =>
                                  x.id === it.id ? { ...x, actual_unit_cost: v.trim() ? Number(v.replace(',', '.')) || null : null } : x
                                ))}
                                placeholder="—"
                                placeholderTextColor={DS.ink[300]}
                                keyboardType="decimal-pad"
                                style={{
                                  borderWidth: 1, borderColor: DS.ink[200], borderRadius: 8,
                                  paddingHorizontal: 10, paddingVertical: 6,
                                  fontSize: 13, color: DS.ink[900],
                                  outlineStyle: 'none' as any,
                                }}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {action === 'admin_order' && (
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                          Sipariş Tarihi
                        </Text>
                        <DatePicker value={orderedAt} onChange={setOrderedAt} accent={TH.primary} compact maxDate={todayISO()} />
                      </View>
                      <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                          Tahmini Teslim
                        </Text>
                        <DatePicker value={expectedAt} onChange={(iso) => setExpectedAt(iso || null)} accent={TH.primary} compact minDate={orderedAt} />
                      </View>
                    </View>
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                        Toplam Tutar (opsiyonel)
                      </Text>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10, paddingHorizontal: 12,
                        backgroundColor: '#FFF',
                      }}>
                        <Text style={{ fontSize: 14, color: DS.ink[400] }}>₺</Text>
                        <TextInput
                          value={totalCost}
                          onChangeText={setTotalCost}
                          keyboardType="decimal-pad"
                          placeholder="0,00"
                          placeholderTextColor={DS.ink[300]}
                          style={{
                            flex: 1, fontSize: 14, color: DS.ink[900], paddingVertical: 9,
                            outlineStyle: 'none' as any,
                          }}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {action === 'admin_receive' && (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                      Teslim Tarihi
                    </Text>
                    <DatePicker value={receivedAt} onChange={setReceivedAt} accent={TH.primary} compact maxDate={todayISO()} />
                  </View>
                )}

                {/* Note / Reason (her aksiyonda) */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
                    {cfg.needsReason ? 'Red Sebebi *' : 'Not (opsiyonel)'}
                  </Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={cfg.needsReason ? 'Kısa ve net bir gerekçe yazın' : 'Eklemek istediğiniz açıklama'}
                    placeholderTextColor={DS.ink[300]}
                    multiline
                    maxLength={400}
                    style={{
                      borderWidth: 1,
                      borderColor: cfg.needsReason && note.trim().length < 4 ? 'rgba(217,75,75,0.40)' : DS.ink[200],
                      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, color: DS.ink[900], minHeight: 72,
                      textAlignVertical: 'top',
                      backgroundColor: '#FFF',
                      outlineStyle: 'none' as any,
                    }}
                  />
                </View>

                {error && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(217,75,75,0.08)', borderWidth: 1, borderColor: 'rgba(217,75,75,0.25)',
                  }}>
                    <AlertCircle size={14} color="#9C2E2E" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E' }}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {!success && (
            <View style={{
              paddingHorizontal: 22, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: DS.ink[100],
              flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
            }}>
              <PillButton variant="ghost" onPress={onClose}>Vazgeç</PillButton>
              <PillButton
                variant={cfg.variant}
                disabled={!canSubmit}
                onPress={handleSubmit}
                leftIcon={submitting ? <ActivityIndicator size="small" color="#FFF" /> : <Icon size={13} color="#FFF" />}
              >
                {submitting ? 'İşleniyor…' : cfg.cta}
              </PillButton>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
