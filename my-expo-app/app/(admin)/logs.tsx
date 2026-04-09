import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../lib/supabase';

type LogTab = 'all' | 'users' | 'doctors';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60)     return 'Az önce';
  if (diff < 3600)   return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 172800) return 'Dün ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function actionMeta(action: string): { icon: string; color: string; bg: string } {
  if (action.includes('oluşturdu') || action.includes('oluşturuldu'))
    return { icon: 'plus-circle-outline',   color: '#059669', bg: '#D1FAE5' };
  if (action.includes('aktif edildi'))
    return { icon: 'account-check-outline', color: '#059669', bg: '#D1FAE5' };
  if (action.includes('pasif edildi') || action.includes('silindi'))
    return { icon: 'trash-can-outline',     color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('→') || action.includes('Durumu'))
    return { icon: 'swap-horizontal',       color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('güncelledi') || action.includes('güncellendi'))
    return { icon: 'pencil-circle-outline', color: '#0F172A', bg: '#F1F5F9' };
  return   { icon: 'information-outline',  color: '#64748B', bg: '#F1F5F9' };
}

// ─── Log Row ─────────────────────────────────────────────────────────────────

function LogRow({ log, isLast }: { log: ActivityLog; isLast: boolean }) {
  const meta = actionMeta(log.action);
  const badge =
    log.actor_type === 'admin'  ? { label: 'Admin', bg: '#FEF3C7', text: '#92400E' } :
    log.actor_type === 'doctor' ? { label: 'Hekim', bg: '#DBEAFE', text: '#1D4ED8' } :
                                  { label: 'Lab',   bg: '#DCFCE7', text: '#166534' };

  return (
    <View style={[lr.row, !isLast && lr.rowBorder]}>
      {/* Icon */}
      <View style={[lr.iconWrap, { backgroundColor: meta.bg }]}>
        <MaterialCommunityIcons name={meta.icon as any} size={17} color={meta.color} />
      </View>

      {/* Content */}
      <View style={lr.content}>
        <View style={lr.topLine}>
          <Text style={lr.name} numberOfLines={1}>{log.actor_name}</Text>
          <View style={[lr.badge, { backgroundColor: badge.bg }]}>
            <Text style={[lr.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
          <Text style={lr.time}>{timeAgo(log.created_at)}</Text>
        </View>
        <Text style={lr.action}>{log.action}</Text>
        {log.entity_label ? (
          <Text style={lr.entity}>
            {log.entity_type === 'work_order' ? '📋 ' : log.entity_type === 'clinic' ? '🏥 ' : log.entity_type === 'doctor' ? '👨‍⚕️ ' : ''}
            {log.entity_label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const lr = StyleSheet.create({
  row:       { flexDirection: 'row', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  iconWrap:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  content:   { flex: 1 },
  topLine:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  name:      { fontSize: 13, fontWeight: '700', color: '#1C1C1E', flexShrink: 1 },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  time:      { fontSize: 11, color: '#AEAEB2', marginLeft: 'auto' as any },
  action:    { fontSize: 13, color: '#6C6C70', marginBottom: 2 },
  entity:    { fontSize: 11, color: '#AEAEB2' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AdminLogsScreen() {
  const [logs,          setLogs]          = useState<ActivityLog[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [tab,           setTab]           = useState<LogTab>('all');
  const [search,        setSearch]        = useState('');
  const [searchExpanded,setSearchExpanded]= useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const loadLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000);
      if (!error && data) setLogs(data as ActivityLog[]);
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('activity_logs_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (payload) => {
        setLogs(prev => [payload.new as ActivityLog, ...prev].slice(0, 2000));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = logs.filter(l => {
    if (tab === 'users'   && l.actor_type === 'doctor') return false;
    if (tab === 'doctors' && l.actor_type !== 'doctor') return false;
    if (!q) return true;
    return l.actor_name.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.entity_label?.toLowerCase().includes(q);
  });

  const TABS: { key: LogTab; label: string }[] = [
    { key: 'all',     label: 'Tümü' },
    { key: 'users',   label: 'Kullanıcılar' },
    { key: 'doctors', label: 'Hekimler' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>

      {/* Header (non-scrollable) */}
      <View style={s.header}>

        {/* Toolbar row */}
        <View style={s.toolbarRow}>
          <View style={s.rightGroup}>
            <TouchableOpacity
              style={[s.iconBtn, (searchExpanded || search.length > 0) && s.iconBtnActive]}
              onPress={() => setSearchExpanded(!searchExpanded)} activeOpacity={0.75}>
              <Feather name="search" size={18} color={(searchExpanded || search.length > 0) ? '#0F172A' : '#94A3B8'} />
            </TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => loadLogs(true)} disabled={refreshing} activeOpacity={0.75}>
              {refreshing
                ? <ActivityIndicator size="small" color="#94A3B8" />
                : <Feather name="refresh-cw" size={16} color="#94A3B8" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Pill tab bar */}
        <View style={s.tabBar}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[s.tabItem, active && s.tabItemActive]}
                onPress={() => setTab(t.key)} activeOpacity={0.75}>
                <Text style={[s.tabText, active && s.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search */}
        {(searchExpanded || search.length > 0) && (
          <View style={s.searchRow}>
            <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
              <Feather name="search" size={16} color={searchFocused ? '#0F172A' : '#AEAEB2'} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="İsim, aksiyon veya kayıt ara..."
                placeholderTextColor="#AEAEB2"
                returnKeyType="search"
                autoFocus={searchExpanded && search.length === 0}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                  <Feather name="x-circle" size={15} color="#AEAEB2" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#0F172A" />
          <Text style={s.loadingText}>Loglar yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} tintColor="#0F172A" />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <MaterialCommunityIcons name="clipboard-text-off-outline" size={44} color="#AEAEB2" />
              <Text style={s.emptyTitle}>Henüz log yok</Text>
              <Text style={s.emptySub}>{q ? `"${q}" ile eşleşen kayıt yok` : 'Eylemler gerçekleştikçe burada görünecek'}</Text>
            </View>
          ) : (
            <View style={s.card}>
              {/* Header */}
              <View style={s.cardHeader}>
                <Text style={s.hCell} numberOfLines={1}>KULLANICI</Text>
                <Text style={[s.hCell, { marginLeft: 'auto' as any }]}>{logs.length} kayıt · Gerçek zamanlı</Text>
              </View>
              {filtered.map((log, i) => (
                <LogRow key={log.id} log={log} isLast={i === filtered.length - 1} />
              ))}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#FFFFFF' },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  // Toolbar
  toolbarRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  toolbarTitle: { flex: 1 },
  toolbarSub:   { fontSize: 10, fontWeight: '600' as any, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 2 },
  toolbarName:  { fontSize: 22, fontWeight: '800' as any, color: '#0F172A', letterSpacing: -0.5 },

  // Tab bar
  tabBar:        { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' as any, backgroundColor: '#F1F5F9', borderRadius: 100, padding: 3, gap: 2 },
  tabItem:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  tabItemActive: { backgroundColor: '#FFFFFF', boxShadow: '0 1px 6px rgba(15,23,42,0.12)' } as any,
  tabText:       { fontSize: 13, fontWeight: '500' as any, color: '#94A3B8' },
  tabTextActive: { fontSize: 13, fontWeight: '600' as any, color: '#0F172A' },

  rightGroup:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn:       { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  iconBtnActive: { backgroundColor: '#F1F5F9' },

  searchRow:        { marginTop: 10 },
  searchWrap:       { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', paddingHorizontal: 12, height: 42 },
  searchWrapFocused:{ borderColor: '#CBD5E1' },
  searchInput:      { flex: 1, fontSize: 14, color: '#1C1C1E', height: 42, outlineStyle: 'none' } as any,

  scroll:        { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60 },

  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9',
    overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  } as any,
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  hCell: { fontSize: 10, fontWeight: '700' as any, color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' as any },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  loadingText: { fontSize: 14, color: '#AEAEB2' },
  empty:       { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle:  { fontSize: 16, fontWeight: '700' as any, color: '#1C1C1E' },
  emptySub:    { fontSize: 13, color: '#AEAEB2', textAlign: 'center' },
});
