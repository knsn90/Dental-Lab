import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { WorkOrder, WorkOrderStatus } from '../types';
import { isOrderOverdue, STATUS_CONFIG } from '../constants';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

interface WorkOrderCardProps {
  order: WorkOrder;
  onPress: () => void;
  showDoctor?: boolean;
  onAssign?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_PALETTE = ['#6C63FF', '#FF6B9D', '#00C9A7', '#F59E0B', '#3B82F6', '#EF4444'];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function getInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2
    ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

function dateLabel(deliveryDate: string, status: WorkOrderStatus): { text: string; color: string } {
  if (status === 'teslim_edildi') return { text: 'Teslim edildi', color: '#94A3B8' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due   = new Date(deliveryDate + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff <  0) return { text: `${Math.abs(diff)}g gecikti`,                                         color: '#EF4444' };
  if (diff === 0) return { text: 'Bugün',                                                              color: '#8B5CF6' };
  if (diff === 1) return { text: 'Yarın',                                                              color: '#F59E0B' };
  if (diff <=  3) return { text: `${diff} gün kaldı`,                                                 color: '#F59E0B' };
  if (diff <=  7) return { text: `${diff} gün kaldı`,                                                 color: '#6366F1' };
  return { text: due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), color: '#94A3B8' };
}

// ── Component ────────────────────────────────────────────────────────────────

export function WorkOrderCard({ order, onPress, showDoctor = false, onAssign }: WorkOrderCardProps) {
  const overdue    = isOrderOverdue(order.delivery_date, order.status);
  const cfg        = STATUS_CONFIG[order.status];
  const { text: dateText, color: dateColor } = dateLabel(order.delivery_date, order.status);

  const doctorName = order.doctor?.full_name ?? '';
  const initials   = doctorName ? getInitials(doctorName) : '??';
  const bgColor    = doctorName ? avatarColor(doctorName) : '#94A3B8';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78} style={styles.card}>

      {/* Status dot + order number */}
      <View style={styles.topMeta}>
        <View style={[styles.statusDot, { backgroundColor: overdue ? '#EF4444' : cfg.color }]} />
        <Text style={styles.orderNum}>{order.order_number}</Text>
        {order.is_urgent && (
          <View style={styles.urgentBadge}>
            <Text style={styles.urgentText}>ACİL</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={[styles.statusLabel, { color: overdue ? '#EF4444' : cfg.color }]}>
          {overdue ? 'Gecikti' : cfg.label}
        </Text>
      </View>

      {/* Work type — main title */}
      <Text style={styles.workType} numberOfLines={1}>{order.work_type}</Text>

      {/* Doctor + clinic */}
      {showDoctor && order.doctor && (
        <Text style={styles.doctorLine} numberOfLines={1}>
          {order.doctor.full_name}
          {order.doctor.clinic?.name ? `  ·  ${order.doctor.clinic.name}` : ''}
        </Text>
      )}

      {/* Patient */}
      {order.patient_name ? (
        <Text style={styles.patientLine} numberOfLines={1}>{order.patient_name}</Text>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {/* Doctor avatar */}
          <View style={[styles.avatar, { backgroundColor: bgColor }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {/* Tooth count */}
          {order.tooth_numbers.length > 0 && (
            <Text style={styles.teethCount}>
              {order.tooth_numbers.slice(0, 4).join(', ')}
              {order.tooth_numbers.length > 4 ? ` +${order.tooth_numbers.length - 4}` : ''}
            </Text>
          )}
        </View>

        <View style={styles.footerRight}>
          {/* Date */}
          <Text style={[styles.dateText, { color: dateColor }]}>{dateText}</Text>

          {/* Assign button */}
          {onAssign && (
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={(e) => { e.stopPropagation?.(); onAssign(); }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={'account-plus-outline' as any} size={12} color="#FFFFFF" />
              <Text style={styles.assignBtnText}>Teknisyen Ata</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },

  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  orderNum: {
    fontSize: 11,
    fontFamily: F.medium,
    fontWeight: '500',
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  urgentBadge: {
    backgroundColor: '#FEF2F2',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  urgentText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#EF4444',
    letterSpacing: 0.5,
  },
  statusLabel: {
    fontSize: 11,
    fontFamily: F.medium,
    fontWeight: '500',
  },

  workType: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#0F172A',
    letterSpacing: -0.2,
  },

  doctorLine: {
    fontSize: 13,
    fontFamily: F.regular,
    color: '#64748B',
  },
  patientLine: {
    fontSize: 12,
    fontFamily: F.regular,
    color: '#94A3B8',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: F.bold,
    color: '#FFFFFF',
  },
  teethCount: {
    fontSize: 12,
    fontFamily: F.regular,
    color: '#94A3B8',
  },
  dateText: {
    fontSize: 13,
    fontFamily: F.medium,
    fontWeight: '500',
  },

  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F59E0B',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  assignBtnText: {
    fontSize: 11,
    fontFamily: F.semibold,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
});
