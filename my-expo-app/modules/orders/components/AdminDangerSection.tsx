/**
 * AdminDangerSection — Sipariş detayı altında admin-only "Tehlikeli işlemler" kartı.
 *
 * - Pasife al (arşivle): soft delete, geri alınabilir
 * - Geri yükle (arşivde ise): un-archive
 * - Kalıcı sil: hard delete + cascade
 *
 * Yetki: yalnız user_type='admin'. Frontend gating + RPC içinde DB kontrolü.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, useWindowDimensions } from 'react-native';
import { ShieldAlert, Archive, RotateCcw, Trash2, AlertCircle, X, Pencil, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { isRTL } from '../../../core/i18n';
import { archiveOrder, restoreOrder, hardDeleteOrder } from '../api';
import { toast } from '../../../core/ui/Toast';
import { useSegments } from 'expo-router';
// Admin düzenleme artık yeni-sipariş SİHİRBAZINI (aynı 4 adım) düzenleme modunda açar.
const NewOrderEditWizard: any = React.lazy(() => import('../screens/NewOrderScreen').then((m) => ({ default: (m as any).NewOrderScreen })));
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface Props {
  orderId: string;
  order: any;                  // tüm order objesi (edit modal için)
  isArchived: boolean;
  onArchived: () => void;
  onDeleted: () => void;
  onEdited?: () => void;
}

export function AdminDangerSection({ orderId, order, isArchived, onArchived, onDeleted, onEdited }: Props) {
  const segs = useSegments() as string[];
  const editPanel = ((segs?.[0] ?? '').replace(/[()]/g, '') || 'lab') as any; // '(lab)' → 'lab'
  const { width: winW } = useWindowDimensions();
  const [confirmType, setConfirmType] = useState<null | 'archive' | 'restore' | 'delete'>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const closeConfirm = () => { setConfirmType(null); setConfirmText(''); };

  const handleAction = async () => {
    setBusy(true);
    let result: { ok: boolean; error?: string };
    if (confirmType === 'archive')      result = await archiveOrder(orderId);
    else if (confirmType === 'restore') result = await restoreOrder(orderId);
    else if (confirmType === 'delete')  result = await hardDeleteOrder(orderId);
    else { setBusy(false); return; }
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error ?? 'İşlem başarısız');
      return;
    }
    if (confirmType === 'archive')      { toast.success('Sipariş pasife alındı'); onArchived(); }
    else if (confirmType === 'restore') { toast.success('Sipariş geri yüklendi'); onArchived(); }
    else if (confirmType === 'delete')  { toast.success('Sipariş kalıcı olarak silindi'); onDeleted(); }
    closeConfirm();
  };

  return (
    <>
      <View
        style={{
          borderRadius: 24,
          backgroundColor: '#FFFFFF',
          padding: 20,
        }}
      >
        {/* Header — eyebrow */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ShieldAlert size={11} color="#D97706" strokeWidth={2} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706', letterSpacing: 1.1, textTransform: 'uppercase' }}>
            Yönetici işlemleri
          </Text>
        </View>

        {/* Archived state inline — kart başlığı altında */}
        {isArchived && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9999,
            backgroundColor: 'rgba(217,119,6,0.10)',
            alignSelf: 'flex-start',
            marginTop: 8, marginBottom: 4,
          }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#D97706' }} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#92400E', letterSpacing: 0.4 }}>
              PASİF (ARŞİVDE)
            </Text>
          </View>
        )}

        {/* List rows — sade satır deseni, ayırıcı çizgi ile */}
        <View style={{ marginTop: 12, marginHorizontal: -8 }}>
          {/* Düzenle */}
          <ActionRow
            icon={Pencil}
            iconColor="#1F5689"
            iconBg="rgba(31,86,137,0.10)"
            label="Düzenle"
            sub="Sipariş alanlarını güncelle"
            onPress={() => setEditOpen(true)}
            isFirst
          />
          {/* Pasife al / Geri yükle */}
          {!isArchived ? (
            <ActionRow
              icon={Archive}
              iconColor="#92400E"
              iconBg="rgba(217,119,6,0.10)"
              label="Pasife al"
              sub="Listelerden gizle, geri alınabilir"
              onPress={() => setConfirmType('archive')}
            />
          ) : (
            <ActionRow
              icon={RotateCcw}
              iconColor="#1F6B47"
              iconBg="rgba(31,107,71,0.10)"
              label="Geri yükle"
              sub="Aktif listeye geri al"
              onPress={() => setConfirmType('restore')}
            />
          )}
          {/* Kalıcı sil */}
          <ActionRow
            icon={Trash2}
            iconColor="#9C2E2E"
            iconBg="rgba(156,46,46,0.10)"
            label="Kalıcı sil"
            sub="Geri alınamaz · CASCADE"
            onPress={() => setConfirmType('delete')}
            isLast
            destructive
          />
        </View>
      </View>

      {/* Kapsamlı düzenleme — yeni-sipariş sihirbazı (aynı 4 adım), bilgi dolu, popup */}
      {editOpen && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: winW >= 768 ? 24 : 0 }}>
            <View style={{ width: '100%', maxWidth: 1120, flex: 1, maxHeight: winW >= 768 ? '94%' : '100%', borderRadius: winW >= 768 ? 20 : 0, overflow: 'hidden', backgroundColor: '#F1F5F9', ...(Platform.OS === 'web' ? ({ boxShadow: '0 24px 60px rgba(15,23,42,0.28)' } as any) : {}) }}>
              <React.Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#0A0A0A" /></View>}>
                <NewOrderEditWizard
                  panel={editPanel}
                  editOrderId={orderId}
                  onClose={() => setEditOpen(false)}
                  onSaved={() => { setEditOpen(false); onEdited?.(); }}
                />
              </React.Suspense>
            </View>
          </View>
        </Modal>
      )}

      {/* Confirmation modal */}
      {confirmType && (
        <ConfirmModal
          type={confirmType}
          busy={busy}
          confirmText={confirmText}
          onChangeConfirmText={setConfirmText}
          onCancel={closeConfirm}
          onConfirm={handleAction}
        />
      )}
    </>
  );
}

// ─── ActionRow — sade list-row pattern ──────────────────────────────────────
function ActionRow({
  icon: Icon, iconColor, iconBg, label, sub, onPress, isFirst, isLast, destructive,
}: {
  icon: any; iconColor: string; iconBg: string;
  label: string; sub?: string;
  onPress: () => void;
  isFirst?: boolean; isLast?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingVertical: 11, paddingHorizontal: 8, borderRadius: 12,
        backgroundColor: hovered ? (destructive ? 'rgba(156,46,46,0.04)' : 'rgba(0,0,0,0.02)') : 'transparent',
        borderTopWidth: !isFirst ? 1 : 0,
        borderTopColor: 'rgba(0,0,0,0.04)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : {}),
      })}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
        <Icon size={13} color={iconColor} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: destructive ? '#9C2E2E' : '#0A0A0A' }}>{label}</Text>
        {sub ? (
          <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 1 }}>{sub}</Text>
        ) : null}
      </View>
      {isRTL() ? <ChevronLeft size={14} color="#CCC" strokeWidth={1.6} /> : <ChevronRight size={14} color="#CCC" strokeWidth={1.6} />}
    </Pressable>
  );
}

function ConfirmModal({
  type, busy, confirmText, onChangeConfirmText, onCancel, onConfirm,
}: {
  type: 'archive' | 'restore' | 'delete';
  busy: boolean;
  confirmText: string;
  onChangeConfirmText: (t: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cfg = {
    archive: {
      title: 'Siparişi pasife al',
      desc: 'Bu sipariş arşive taşınır ve listelerde görünmez. İstediğin zaman geri yükleyebilirsin.',
      icon: Archive,
      iconColor: '#D97706',
      iconBg: 'rgba(217,119,6,0.14)',
      cta: 'Pasife al',
      ctaColor: '#D97706',
      requireType: false,
    },
    restore: {
      title: 'Siparişi geri yükle',
      desc: 'Sipariş aktif listeye geri döner.',
      icon: RotateCcw,
      iconColor: '#1F6B47',
      iconBg: 'rgba(31,107,71,0.14)',
      cta: 'Geri yükle',
      ctaColor: '#1F6B47',
      requireType: false,
    },
    delete: {
      title: 'Siparişi silmek istediğine emin misin?',
      desc: 'Sipariş ve tüm bağlı kayıtları (aşamalar, fotoğraflar, ödemeler) kalıcı olarak silinir. Bu işlem geri alınamaz.',
      icon: Trash2,
      iconColor: '#9C2E2E',
      iconBg: 'rgba(156,46,46,0.14)',
      cta: 'Evet, sil',
      ctaColor: '#9C2E2E',
      requireType: false,
    },
  }[type];

  const Icon = cfg.icon;
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const canConfirm = !cfg.requireType || confirmText.trim().toUpperCase() === 'SIL';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: 460, maxWidth: '100%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 18, gap: 16 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: cfg.iconBg,
                borderWidth: 1, borderColor: cfg.iconColor + '33',
              }}>
                <Icon size={20} color={cfg.iconColor} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: cfg.iconColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Onay gerekli
                </Text>
                <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: '#0A0A0A', lineHeight: 28, marginTop: 2 }}>
                  {cfg.title}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <X size={15} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.04)', marginHorizontal: 28 }} />

          {/* Body */}
          <View style={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 22 }}>
            <Text style={{ fontSize: 13, color: '#2C2C2C', lineHeight: 19 }}>
              {cfg.desc}
            </Text>

            {cfg.requireType && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 7 }}>
                  Onaylamak için <Text style={{ color: cfg.ctaColor, fontWeight: '700' }}>SIL</Text> yazın
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={onChangeConfirmText}
                  placeholder="SIL"
                  placeholderTextColor="#9A9A9A"
                  autoCapitalize="characters"
                  style={{
                    backgroundColor: '#FFFFFF', borderRadius: 12,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                    paddingHorizontal: 14, height: 44,
                    fontSize: 14, color: '#0A0A0A', fontWeight: '600',
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                  }}
                />
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', backgroundColor: '#FBF9F4' }}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy || !canConfirm}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                backgroundColor: cfg.ctaColor,
                opacity: (busy || !canConfirm) ? 0.5 : 1,
                ...(Platform.OS === 'web' ? { cursor: (busy || !canConfirm) ? 'not-allowed' : 'pointer', boxShadow: `0 6px 20px ${cfg.ctaColor}44` } as any : {}),
              }}
            >
              <Icon size={14} color="#FFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                {busy ? 'İşleniyor…' : cfg.cta}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
