import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { localeTag } from '../../core/i18n';
import { supabase } from '../../core/api/supabase';
import { IconBtn } from '../../core/ui/IconBtn';
import { SlideTabBar } from '../../core/ui/SlideTabBar';

import { AppIcon } from '../../core/ui/AppIcon';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useInkUI } from '../../core/theme/inkScale';
import { LogDetail, logSummaryLine, fullTimestamp, ENTITY_LABEL } from '../../modules/logs/logDetail';

type LogTab = 'all' | 'users' | 'technicians' | 'clinics' | 'doctors';

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

function timeAgo(dateStr: string, t: (k: string, o?: any) => string, lang: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60)     return t('admin.logs.time.justNow');
  if (diff < 3600)   return t('admin.logs.time.minutesAgo', { minutes: Math.floor(diff / 60) });
  if (diff < 86400)  return t('admin.logs.time.hoursAgo', { hours: Math.floor(diff / 3600) });
  if (diff < 172800) return t('admin.logs.time.yesterday', { time: date.toLocaleTimeString(localeTag(lang), { hour: '2-digit', minute: '2-digit' }) });
  if (diff < 604800) return t('admin.logs.time.daysAgo', { days: Math.floor(diff / 86400) });
  return date.toLocaleDateString(localeTag(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

// Normalize eski/ham actor_type değerlerini sabit kümeye indir
function normType(t: string): string {
  if (t === 'clinic_admin' || t === 'clinic_secretary') return 'clinic';
  return t;
}

function actionMeta(action: string): { icon: string; color: string; bg: string } {
  if (action.includes('Giriş'))
    return { icon: 'log-in',                color: '#2563EB', bg: '#DBEAFE' };
  if (action.includes('Mesaj'))
    return { icon: 'message-circle',        color: '#0891B2', bg: '#CFFAFE' };
  if (action.includes('Dosya'))
    return { icon: 'paperclip',             color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('Malzeme'))
    return { icon: 'package',               color: '#B45309', bg: '#FEF3C7' };
  if (action.includes('Aşama'))
    return { icon: 'swap-horizontal',       color: '#4338CA', bg: '#E0E7FF' };
  if (action.includes('iptal'))
    return { icon: 'close-circle-outline',  color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('talebi'))
    return { icon: 'clipboard-check',       color: '#0369A1', bg: '#E0F2FE' };
  if (action.includes('oluşturdu') || action.includes('oluşturuldu'))
    return { icon: 'plus-circle-outline',   color: '#059669', bg: '#D1FAE5' };
  if (action.includes('aktif edildi'))
    return { icon: 'account-check-outline', color: '#059669', bg: '#D1FAE5' };
  if (action.includes('pasif edildi') || action.includes('silindi'))
    return { icon: 'trash-can-outline',     color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('→') || action.includes('Durumu'))
    return { icon: 'swap-horizontal',       color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('düzenledi') || action.includes('güncelledi') || action.includes('güncellendi'))
    return { icon: 'pencil-circle-outline', color: '#0F172A', bg: '#F1F5F9' };
  return   { icon: 'information-outline',  color: '#64748B', bg: '#F1F5F9' };
}

// ─── Log Row ─────────────────────────────────────────────────────────────────

function LogRow({ log, isLast }: { log: ActivityLog; isLast: boolean }) {
  const { t, i18n } = useTranslation();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Ayrıntı VARSAYILAN kapalı: liste taranabilir kalsın, isteyen satırı açsın.
  const [open, setOpen] = useState(false);
  const meta = actionMeta(log.action);
  const summary = logSummaryLine(log);
  const entityName = log.entity_type ? (ENTITY_LABEL[log.entity_type] ?? log.entity_type) : null;
  const at = normType(log.actor_type);
  const badge =
    at === 'admin'      ? { label: t('admin.logs.actor.admin'),      bg: '#FEF3C7', text: '#92400E' } :
    at === 'doctor'     ? { label: t('admin.logs.actor.doctor'),     bg: '#DBEAFE', text: '#1D4ED8' } :
    at === 'clinic'     ? { label: t('admin.logs.actor.clinic'),     bg: '#E0F2FE', text: '#0369A1' } :
    at === 'technician' ? { label: t('admin.logs.actor.technician'), bg: '#E0E7FF', text: '#4338CA' } :
    at === 'courier'    ? { label: t('admin.logs.actor.courier'),    bg: '#FEF3C7', text: '#B45309' } :
                          { label: t('admin.logs.actor.lab'),        bg: '#DCFCE7', text: '#166534' };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => setOpen(v => !v)}
      accessibilityLabel={open ? 'Ayrıntıyı kapat' : 'Ayrıntıyı aç'}
      style={[
        lr.row,
        !isLast && lr.rowBorder,
        !isLast && isDark && { borderBottomColor: T.hairline },
        open && { backgroundColor: U.rowHover },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null,
      ]}
    >
      {/* Icon */}
      <View style={[lr.iconWrap, { backgroundColor: meta.bg }]}>
        <AppIcon name={meta.icon as any} size={17} color={meta.color} />
      </View>

      {/* Content */}
      <View style={lr.content}>
        <View style={lr.topLine}>
          <Text style={[lr.name, isDark && { color: T.ink }]} numberOfLines={1}>{log.actor_name}</Text>
          <View style={[lr.badge, { backgroundColor: badge.bg }]}>
            <Text style={[lr.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
          {/* Göreli zamanın yanında TAM zaman damgası — "3 gün önce" denetim için yetmez */}
          <Text style={[lr.time, isDark && { color: T.ink3 }]} numberOfLines={1}>
            {timeAgo(log.created_at, t, i18n.language)}
          </Text>
        </View>
        <Text style={[lr.action, isDark && { color: T.ink2 }]}>{log.action}</Text>

        {/* Bağlam şeridi — açmadan da hangi sipariş/hasta/aşama olduğu görünsün */}
        {(log.entity_label || summary) ? (
          <View style={lr.metaLine}>
            {entityName ? (
              <View style={[lr.chip, { backgroundColor: U.chipNeutral }]}>
                <Text style={[lr.chipText, { color: U.ink[500] }]}>{entityName}</Text>
              </View>
            ) : null}
            <Text style={[lr.entity, isDark && { color: T.ink3 }]} numberOfLines={1}>
              {[log.entity_label, summary].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}

        <View style={lr.footLine}>
          <Text style={[lr.stamp, { color: U.ink[400] }]}>{fullTimestamp(log.created_at)}</Text>
          <Text style={[lr.toggle, { color: U.ink[500] }]}>
            {open ? 'Ayrıntıyı gizle ▴' : 'Ayrıntı ▾'}
          </Text>
        </View>

        {open && <LogDetail log={log} />}
      </View>
    </TouchableOpacity>
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
  time:      { fontSize: 11, color: '#AEAEB2', marginStart: 'auto' as any },
  action:    { fontSize: 13, color: '#6C6C70', marginBottom: 2 },
  entity:    { fontSize: 11, color: '#AEAEB2', flexShrink: 1 },
  metaLine:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  chip:      { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, flexShrink: 0 },
  chipText:  { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3 },
  footLine:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  stamp:     { fontSize: 10.5 },
  toggle:    { fontSize: 10.5, fontWeight: '700', marginStart: 'auto' as any },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AdminLogsScreen() {
  const { t } = useTranslation();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
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
    const at = normType(l.actor_type);
    if (tab === 'users'       && !(at === 'admin' || at === 'lab' || at === 'courier')) return false;
    if (tab === 'technicians' && at !== 'technician') return false;
    if (tab === 'clinics'     && at !== 'clinic')     return false;
    if (tab === 'doctors'     && at !== 'doctor')     return false;
    if (!q) return true;
    // Arama artık metadata'nın İÇİNDE de dolaşır: hasta adı, sipariş no,
    // malzeme, istasyon, not… hepsi aranabilir hâle gelir.
    const meta = l.metadata ? JSON.stringify(l.metadata).toLowerCase() : '';
    return l.actor_name.toLowerCase().includes(q) || l.action.toLowerCase().includes(q)
      || l.entity_label?.toLowerCase().includes(q) || meta.includes(q);
  });

  const TABS: { key: LogTab; label: string }[] = [
    { key: 'all',         label: t('admin.logs.tab.all') },
    { key: 'users',       label: t('admin.logs.tab.users') },
    { key: 'technicians', label: t('admin.logs.tab.technicians') },
    { key: 'clinics',     label: t('admin.logs.tab.clinics') },
    { key: 'doctors',     label: t('admin.logs.tab.doctors') },
  ];

  return (
    <SafeAreaView style={[s.safe, isDark && { backgroundColor: T.bg }]} edges={['bottom']}>

      {/* Header (non-scrollable) */}
      <View style={[s.header, isDark && { borderBottomColor: T.hairline }]}>

        {/* Toolbar row */}
        <View style={s.toolbarRow}>
          <View style={s.rightGroup}>
            <IconBtn active={searchExpanded || search.length > 0} onPress={() => setSearchExpanded(!searchExpanded)}>
              <AppIcon name="search" size={20} color={(searchExpanded || search.length > 0) ? (isDark ? (T.ink as string) : '#0F172A') : (isDark ? (T.ink3 as string) : '#64748B')} />
            </IconBtn>
            <IconBtn onPress={() => loadLogs(true)}>
              {refreshing
                ? <ActivityIndicator size="small" color={isDark ? (T.ink3 as string) : '#64748B'} />
                : <AppIcon name="refresh-cw" size={20} color={isDark ? (T.ink3 as string) : '#64748B'} />}
            </IconBtn>
          </View>
        </View>

        {/* Slide tab bar */}
        <SlideTabBar
          items={TABS.map(t => ({ key: t.key, label: t.label }))}
          activeKey={tab}
          onChange={(k) => setTab(k as any)}
          accentColor="#0F172A"
        />

        {/* Search */}
        {(searchExpanded || search.length > 0) && (
          <View style={s.searchRow}>
            <View style={[s.searchWrap, isDark && { backgroundColor: T.cardSoft, borderColor: T.hairline }, searchFocused && s.searchWrapFocused, searchFocused && isDark && { borderColor: 'rgba(255,255,255,0.25)' }]}>
              <AppIcon name="search" size={16} color={searchFocused ? (isDark ? (T.ink as string) : '#0F172A') : (isDark ? (T.ink3 as string) : '#AEAEB2')} />
              <TextInput
                style={[s.searchInput, isDark && { color: T.ink }]}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={t('admin.logs.searchPlaceholder')}
                placeholderTextColor={isDark ? (T.ink3 as string) : '#AEAEB2'}
                returnKeyType="search"
                autoFocus={searchExpanded && search.length === 0}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                  <AppIcon name="x-circle" size={15} color={isDark ? (T.ink3 as string) : '#AEAEB2'} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={isDark ? (T.ink as string) : '#0F172A'} />
          <Text style={[s.loadingText, isDark && { color: T.ink3 }]}>{t('admin.logs.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} tintColor={isDark ? (T.ink as string) : '#0F172A'} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <AppIcon name="clipboard-text-off-outline" size={44} color={isDark ? (T.ink3 as string) : '#AEAEB2'} />
              <Text style={[s.emptyTitle, isDark && { color: T.ink }]}>{t('admin.logs.empty.title')}</Text>
              <Text style={[s.emptySub, isDark && { color: T.ink3 }]}>{q ? t('admin.logs.empty.noMatch', { query: q }) : t('admin.logs.empty.noActions')}</Text>
            </View>
          ) : (
            <View style={[s.card, isDark && { backgroundColor: T.card, borderColor: T.hairline }]}>
              {/* Header */}
              <View style={[s.cardHeader, isDark && { backgroundColor: T.cardSoft, borderBottomColor: T.hairline }]}>
                <Text style={[s.hCell, isDark && { color: T.ink3 }]} numberOfLines={1}>{t('admin.logs.table.user')}</Text>
                <Text style={[s.hCell, { marginStart: 'auto' as any }, isDark && { color: T.ink3 }]}>{t('admin.logs.table.recordsRealtime', { count: logs.length })}</Text>
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
  tabBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },

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
