import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../lib/supabase';
import Colors from '../../constants/colors';

type LogTab = 'users' | 'doctors';

interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

// ─── Yardımcı: zaman önce ────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60)     return 'Az önce';
  if (diff < 3600)   return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 172800) {
    return 'Dün ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Aksiyon renk/ikon ───────────────────────────────────────────────────────

function actionMeta(action: string): { icon: string; color: string; bg: string } {
  if (action.includes('oluşturdu') || action.includes('oluşturuldu'))
    return { icon: 'plus-circle-outline',    color: '#059669', bg: '#D1FAE5' };
  if (action.includes('aktif edildi'))
    return { icon: 'account-check-outline',  color: '#059669', bg: '#D1FAE5' };
  if (action.includes('pasif edildi'))
    return { icon: 'account-off-outline',    color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('silindi'))
    return { icon: 'trash-can-outline',      color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('Durumu') || action.includes('→'))
    return { icon: 'swap-horizontal',        color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('güncelledi') || action.includes('güncellendi'))
    return { icon: 'pencil-circle-outline',  color: '#2563EB', bg: '#DBEAFE' };
  return   { icon: 'information-outline',   color: '#64748B', bg: '#F1F5F9' };
}

// ─── Rol etiketi ──────────────────────────────────────────────────────────────

function RoleBadge({ type }: { type: string }) {
  const cfg =
    type === 'admin'  ? { label: 'Admin',  bg: '#FEF3C7', text: '#92400E' } :
    type === 'doctor' ? { label: 'Hekim',  bg: '#DBEAFE', text: '#1D4ED8' } :
                        { label: 'Lab',    bg: '#DCFCE7', text: '#166534' };
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={[badge.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const badge = StyleSheet.create({
  wrap: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  text: { fontSize: 10, fontWeight: '700' },
});

// ─── Tek log satırı ──────────────────────────────────────────────────────────

function LogRow({ log }: { log: ActivityLog }) {
  const meta = actionMeta(log.action);
  const time = timeAgo(log.created_at);

  return (
    <View style={row.wrap}>
      {/* Sol ikon */}
      <View style={[row.iconWrap, { backgroundColor: meta.bg }]}>
        <MaterialCommunityIcons
          name={meta.icon as any}
          size={18}
          color={meta.color}
        />
      </View>

      {/* İçerik */}
      <View style={row.content}>
        {/* Üst: isim + badge + zaman */}
        <View style={row.topLine}>
          <Text style={row.name} numberOfLines={1}>{log.actor_name}</Text>
          <RoleBadge type={log.actor_type} />
          <Text style={row.time}>{time}</Text>
        </View>
        {/* Alt: aksiyon metni */}
        <Text style={row.action}>{log.action}</Text>
        {/* Entity label (sipariş no, vb.) */}
        {log.entity_label ? (
          <Text style={row.entity}>
            {log.entity_type === 'work_order' ? '📋 ' : ''}
            {log.entity_label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const row = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  content: { flex: 1 },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  name:   { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  time:   { fontSize: 11, color: Colors.textMuted, marginLeft: 'auto' },
  action: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  entity: { fontSize: 11, color: Colors.textMuted },
});

// ─── Ana ekran ────────────────────────────────────────────────────────────────

export default function AdminLogsScreen() {
  const [logs, setLogs]         = useState<ActivityLog[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]           = useState<LogTab>('users');

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && data) {
        setLogs(data as ActivityLog[]);
      }
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Realtime: yeni log geldiğinde otomatik güncelle
  useEffect(() => {
    const channel = supabase
      .channel('activity_logs_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs' },
        (payload) => {
          setLogs((prev) => [payload.new as ActivityLog, ...prev].slice(0, 300));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Tab'a göre filtrele
  const filtered = logs.filter((l) =>
    tab === 'doctors'
      ? l.actor_type === 'doctor'
      : l.actor_type === 'lab' || l.actor_type === 'admin'
  );

  const userCount   = logs.filter((l) => l.actor_type === 'lab' || l.actor_type === 'admin').length;
  const doctorCount = logs.filter((l) => l.actor_type === 'doctor').length;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Eylem Logları</Text>
          <Text style={s.subtitle}>Son 300 kayıt</Text>
        </View>
        <TouchableOpacity
          style={s.refreshBtn}
          onPress={() => loadLogs(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <MaterialCommunityIcons name="refresh" size={20} color={Colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Tab seçici */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === 'users' && s.tabBtnActive]}
          onPress={() => setTab('users')}
        >
          <MaterialCommunityIcons
            name="account-group-outline"
            size={16}
            color={tab === 'users' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[s.tabText, tab === 'users' && s.tabTextActive]}>
            Kullanıcılar
          </Text>
          <View style={[s.tabCount, tab === 'users' && s.tabCountActive]}>
            <Text style={[s.tabCountText, tab === 'users' && s.tabCountTextActive]}>
              {userCount}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.tabBtn, tab === 'doctors' && s.tabBtnActive]}
          onPress={() => setTab('doctors')}
        >
          <MaterialCommunityIcons
            name="tooth-outline"
            size={16}
            color={tab === 'doctors' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[s.tabText, tab === 'doctors' && s.tabTextActive]}>
            Hekimler
          </Text>
          <View style={[s.tabCount, tab === 'doctors' && s.tabCountActive]}>
            <Text style={[s.tabCountText, tab === 'doctors' && s.tabCountTextActive]}>
              {doctorCount}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* İçerik */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>Loglar yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadLogs(true)}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons
                name="clipboard-text-off-outline"
                size={44}
                color={Colors.textMuted}
              />
              <Text style={s.emptyTitle}>Henüz log yok</Text>
              <Text style={s.emptySubtitle}>
                {tab === 'doctors'
                  ? 'Hekimlerin eylemleri burada görünecek'
                  : 'Kullanıcıların eylemleri burada görünecek'}
              </Text>
            </View>
          ) : (
            <View style={s.logList}>
              {/* Bugün / Önceki gruplandırma */}
              {filtered.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  refreshBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#FAFAFA',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FFFFFF',
  },
  tabBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  tabText: {
    fontSize: 13, fontWeight: '600', color: Colors.textSecondary,
  },
  tabTextActive: { color: '#FFFFFF' },
  tabCount: {
    minWidth: 22, height: 18, borderRadius: 9,
    backgroundColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  tabCountText: {
    fontSize: 10, fontWeight: '700', color: Colors.textSecondary,
  },
  tabCountTextActive: { color: '#FFFFFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },

  logList: { gap: 0 },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80,
  },
  loadingText: { fontSize: 14, color: Colors.textMuted },

  empty: {
    alignItems: 'center', paddingTop: 60, gap: 10,
  },
  emptyTitle:    { fontSize: 16, fontWeight: '700', color: Colors.textSecondary },
  emptySubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
});
