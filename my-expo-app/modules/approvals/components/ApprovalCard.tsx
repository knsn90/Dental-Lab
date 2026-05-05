/**
 * ApprovalCard — Patterns design language
 *
 * Tasarım onayı kartı: step adı + durum badge + onayla/reddet aksiyonları.
 * DS tokens, DISPLAY typography, inline styles.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import {
  Clock, CheckCircle2, XCircle, Pencil, Cog,
  Flame, Package, Truck, ScanSearch, FileDown, Box, Gem, CookingPot,
  Check, X,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { Approval } from '../types';
import { useApprove } from '../hooks/useApprove';
import { MANUAL_STEPS, DIGITAL_STEPS } from '../../workflow/templates';
import { DS } from '../../../core/theme/dsTokens';

const R = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };
const CARD = {
  backgroundColor: '#FFFFFF',
  borderRadius: R.xl,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
} as const;

// ── Step label map ──
const STEP_LABELS: Record<string, string> = Object.fromEntries(
  [...MANUAL_STEPS, ...DIGITAL_STEPS].map(s => [s.name, s.label]),
);

// ── Lucide icon map ──
const STEP_ICON_MAP: Record<string, React.ComponentType<any>> = {
  receive_impression: FileDown,
  model_cast:         Box,
  scan:               ScanSearch,
  receive_file:       FileDown,
  design:             Pencil,
  milling:            Cog,
  sinter:             Flame,
  porcelain:          Gem,
  oven:               CookingPot,
  qc:                 CheckCircle2,
  packaging:          Package,
  delivery:           Truck,
};

// ── Status config ──
const STATUS_CFG = {
  pending:  { label: 'Bekliyor',   bg: 'rgba(232,155,42,0.12)', color: '#9C5E0E' },
  approved: { label: 'Onaylandı',  bg: 'rgba(45,154,107,0.1)',  color: '#1F6B47' },
  rejected: { label: 'Reddedildi', bg: 'rgba(217,75,75,0.1)',   color: '#9C2E2E' },
};

interface Props {
  approval: Approval;
  onResolved?: () => void;
  canApprove?: boolean;
}

export function ApprovalCard({ approval, onResolved, canApprove = false }: Props) {
  const { approve, reject, loading } = useApprove();
  const [showReject, setShowReject]  = useState(false);
  const [reason, setReason]          = useState('');

  const sc        = STATUS_CFG[approval.status];
  const StepIcon  = STEP_ICON_MAP[approval.step_name] ?? Clock;
  const stepLabel = STEP_LABELS[approval.step_name] ?? approval.step_name.replace(/_/g, ' ');

  const handleApprove = async () => {
    const ok = await approve(approval.id);
    if (ok) onResolved?.();
    else toast.error('Onaylanamadı');
  };

  const handleReject = async () => {
    if (!reason.trim()) { toast.error('Red gerekçesi giriniz'); return; }
    const ok = await reject(approval.id, reason);
    if (ok) onResolved?.();
    else toast.error('Reddedilemedi');
  };

  return (
    <View style={{ ...CARD, padding: 24, gap: 16 }}>
      {/* ── Header: icon + info + status badge ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        {/* Step icon */}
        <View style={{
          width: 44, height: 44, borderRadius: 14,
          backgroundColor: DS.ink[100],
          alignItems: 'center', justifyContent: 'center',
        }}>
          <StepIcon size={18} color={DS.ink[700]} strokeWidth={1.8} />
        </View>

        {/* Info */}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{
            fontSize: 15, fontWeight: '600',
            color: DS.ink[900], textTransform: 'capitalize',
          }}>
            {stepLabel}
          </Text>
          <Text style={{ fontSize: 12, color: DS.ink[500] }}>
            Talep: {approval.requester?.full_name ?? '—'}
          </Text>
          <Text style={{ fontSize: 11, color: DS.ink[300] }}>
            {new Date(approval.requested_at).toLocaleDateString('tr-TR', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </Text>
        </View>

        {/* Status chip */}
        <View style={{
          paddingHorizontal: 10, paddingVertical: 5,
          borderRadius: R.pill, backgroundColor: sc.bg,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: sc.color }}>
            {sc.label}
          </Text>
        </View>
      </View>

      {/* ── Rejection note ── */}
      {approval.status === 'rejected' && approval.rejection_reason && (
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 8,
          padding: 12, borderRadius: R.md,
          backgroundColor: 'rgba(217,75,75,0.06)',
        }}>
          <XCircle size={14} color="#9C2E2E" strokeWidth={1.8} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', lineHeight: 18 }}>
            {approval.rejection_reason}
          </Text>
        </View>
      )}

      {/* ── Approved by note ── */}
      {approval.status === 'approved' && approval.approver && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={13} color="#1F6B47" strokeWidth={1.8} />
          <Text style={{ fontSize: 12, color: '#1F6B47' }}>
            Onaylayan: {approval.approver.full_name}
          </Text>
        </View>
      )}

      {/* ── Action buttons ── */}
      {canApprove && approval.status === 'pending' && !showReject && (
        <View style={{
          flexDirection: 'row', gap: 10,
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
          paddingTop: 14,
        }}>
          <Pressable
            onPress={() => setShowReject(true)}
            disabled={loading}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              paddingVertical: 10, borderRadius: R.pill,
              borderWidth: 1.5, borderColor: 'rgba(217,75,75,0.2)',
              backgroundColor: 'rgba(217,75,75,0.06)',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <X size={14} color="#9C2E2E" strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#9C2E2E' }}>Reddet</Text>
          </Pressable>

          <Pressable
            onPress={handleApprove}
            disabled={loading}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              paddingVertical: 10, borderRadius: R.pill,
              backgroundColor: DS.ink[900],
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Check size={14} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Onayla</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      {/* ── Reject form ── */}
      {showReject && (
        <View style={{
          gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
          paddingTop: 14,
        }}>
          <TextInput
            style={{
              backgroundColor: DS.ink[50], borderRadius: R.md,
              padding: 14, fontSize: 13, color: DS.ink[900],
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              minHeight: 72, textAlignVertical: 'top',
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
            }}
            placeholder="Red gerekçesi..."
            placeholderTextColor={DS.ink[400]}
            value={reason}
            onChangeText={setReason}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => setShowReject(false)}
              style={{
                flex: 1, alignItems: 'center',
                paddingVertical: 10, borderRadius: R.pill,
                backgroundColor: DS.ink[100],
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleReject}
              disabled={loading}
              style={{
                flex: 2, flexDirection: 'row', alignItems: 'center',
                justifyContent: 'center', gap: 6,
                paddingVertical: 10, borderRadius: R.pill,
                backgroundColor: DS.lab.danger,
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <X size={14} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Reddet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
