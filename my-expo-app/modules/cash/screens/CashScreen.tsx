/**
 * CashScreen — Kasa / Banka (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';

import { useCashAccounts, useMovements } from '../hooks/useCash';
import {
  createCashAccount, updateCashAccount, deleteCashAccount,
  createMovement, deleteMovement,
  ACCOUNT_TYPE_LABELS, MOVEMENT_CATEGORY_LABELS,
  type CashAccount, type AccountType, type MovementCategory, type MovementDirection,
} from '../api';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import {
  Plus, X, Inbox, Pencil, Trash2, Search,
  Wallet, Landmark, ArrowDownCircle, ArrowUpCircle,
  Receipt, Building, Users, Wrench, Package,
  CircleDot, ChevronRight, Banknote, CreditCard,
  ArrowDown, ArrowUp,
} from 'lucide-react-native';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

// ── Account type icon mapping ───────────────────────────────────────
const ACCOUNT_ICON: Record<AccountType, React.ComponentType<any>> = {
  kasa:  Wallet,
  banka: Landmark,
};

const ACCOUNT_COLORS: Record<AccountType, string> = {
  kasa:  '#1F6B47',
  banka: '#1F5689',
};

// ── Movement category → Lucide ──────────────────────────────────────
const CAT_ICON: Record<MovementCategory, React.ComponentType<any>> = {
  tahsilat: Banknote,
  odeme:    CreditCard,
  maas:     Users,
  kira:     Building,
  malzeme:  Package,
  vergi:    Receipt,
  diger:    CircleDot,
};

const CATEGORIES: MovementCategory[] = ['tahsilat', 'odeme', 'maas', 'kira', 'malzeme', 'vergi', 'diger'];
const DIRECTION_COLORS = { giris: '#1F6B47', cikis: '#9C2E2E' };

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

// ── §03 Pill Button ─────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', size = 'md', disabled }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost'; size?: 'sm' | 'md'; disabled?: boolean;
}) {
  const dark = variant === 'dark';
  const h = size === 'sm' ? 32 : 38;
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        height: h, paddingHorizontal: size === 'sm' ? 12 : 16, borderRadius: 999,
        backgroundColor: dark ? DS.ink[900] : 'transparent',
        borderWidth: dark ? 0 : 1, borderColor: 'rgba(0,0,0,0.10)',
        opacity: disabled ? 0.5 : 1, cursor: 'pointer' as any,
      }}
    >
      <Icon size={size === 'sm' ? 13 : 15} color={dark ? '#FFF' : DS.ink[700]} strokeWidth={1.8} />
      <Text style={{ fontSize: size === 'sm' ? 11 : 13, fontWeight: '600', color: dark ? '#FFF' : DS.ink[700] }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function CashScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const { accounts, loading, refetch } = useCashAccounts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<CashAccount | null>(null);
  const [addMovementOpen, setAddMovementOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedId) ?? (accounts[0] ?? null),
    [accounts, selectedId],
  );
  const activeAccountId = selectedAccount?.id ?? null;
  const { movements, loading: movLoading, refetch: refetchMov } = useMovements(activeAccountId);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const totalKasa   = accounts.filter(a => a.account_type === 'kasa').reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const totalBanka  = accounts.filter(a => a.account_type === 'banka').reduce((s, a) => s + Number(a.balance ?? 0), 0);

  const filteredMovements = useMemo(() => {
    if (!search) return movements;
    const sl = search.toLowerCase();
    return movements.filter(m =>
      m.description.toLowerCase().includes(sl) ||
      MOVEMENT_CATEGORY_LABELS[m.category as MovementCategory]?.toLowerCase().includes(sl),
    );
  }, [movements, search]);

  const handleDeleteAccount = (acc: CashAccount) => {
    Alert.alert('Hesabı Sil', `"${acc.name}" hesabını silmek istiyor musunuz? Tüm hareketler silinecek.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          const { error } = await deleteCashAccount(acc.id);
          if (error) toast.error((error as any).message);
          else { if (selectedId === acc.id) setSelectedId(null); refetch(); }
        },
      },
    ]);
  };

  const handleDeleteMovement = (id: string) => {
    Alert.alert('Hareketi Sil', 'Bu hareketi silmek istiyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          await deleteMovement(id);
          refetchMov(); refetch();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 0 : 16, paddingBottom: 48, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism ─────────────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: DS.lab.bg, padding: isDesktop ? 36 : 24,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: DS.lab.bgDeep, opacity: 0.4 }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>
                Toplam Bakiye
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 48 : 36, letterSpacing: -1.4, color: DS.ink[900] }}>
                {fmtMoney(totalBalance)}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 6 }}>
                {accounts.length} hesap
              </Text>
            </View>

            {/* Action */}
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <PillBtn icon={Plus} label="Hesap Ekle" onPress={() => setAddAccountOpen(true)} />
            </View>
          </View>

          {/* Kasa / Banka breakdown */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 36 : 20, marginTop: 20 }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Wallet size={11} color={ACCOUNT_COLORS.kasa} strokeWidth={1.8} />
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Kasa
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[700], marginTop: 2 }}>
                {fmtMoney(totalKasa)}
              </Text>
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Landmark size={11} color={ACCOUNT_COLORS.banka} strokeWidth={1.8} />
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                  Banka
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[700], marginTop: 2 }}>
                {fmtMoney(totalBanka)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Desktop: two-column layout ──────────────────────── */}
        {isDesktop ? (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {/* Left: Accounts table */}
            <View style={{ flex: 1, ...tableCard }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Hesaplar</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, color: DS.ink[400] }}>{accounts.length} hesap</Text>
              </View>

              {/* Table header */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                {[
                  { label: 'HESAP',    flex: 2 },
                  { label: 'TÜR',      flex: 1 },
                  { label: 'BANKA',    flex: 1.5 },
                  { label: 'GİRİŞ',   flex: 1, align: 'right' as const },
                  { label: 'ÇIKIŞ',   flex: 1, align: 'right' as const },
                  { label: 'BAKİYE',  flex: 1.2, align: 'right' as const },
                  { label: 'İŞLEM',   flex: 0.8 },
                ].map((h, i) => (
                  <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                    {h.label}
                  </Text>
                ))}
              </View>

              {accounts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
                  <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>Henüz hesap yok</Text>
                </View>
              ) : accounts.map((acc, i) => {
                const isActive = acc.id === activeAccountId;
                const Icon = ACCOUNT_ICON[acc.account_type];
                const color = ACCOUNT_COLORS[acc.account_type];
                const bal = Number(acc.balance ?? 0);
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => setSelectedId(acc.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingVertical: 14,
                      borderBottomWidth: i < accounts.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                      backgroundColor: isActive ? 'rgba(74,143,201,0.06)' : 'transparent',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} color={color} strokeWidth={1.6} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                        {acc.name}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{
                        alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                        backgroundColor: acc.account_type === 'kasa' ? CHIP_TONES.success.bg : CHIP_TONES.info.bg,
                      }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: acc.account_type === 'kasa' ? CHIP_TONES.success.fg : CHIP_TONES.info.fg }}>
                          {ACCOUNT_TYPE_LABELS[acc.account_type]}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ flex: 1.5, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>
                      {acc.bank_name || '—'}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: CHIP_TONES.success.fg, textAlign: 'right' }}>
                      {acc.total_in ? fmtMoney(acc.total_in) : '—'}
                    </Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '500', color: CHIP_TONES.danger.fg, textAlign: 'right' }}>
                      {acc.total_out ? fmtMoney(acc.total_out) : '—'}
                    </Text>
                    <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '700', color: bal >= 0 ? DS.ink[900] : CHIP_TONES.danger.fg, textAlign: 'right' }}>
                      {fmtMoney(bal)}
                    </Text>
                    <View style={{ flex: 0.8, flexDirection: 'row', gap: 4 }}>
                      <Pressable
                        onPress={() => setEditAccount(acc)}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteAccount(acc)}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Right: Movements for selected account */}
            <View style={{ flex: 1.3, ...tableCard }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                    {selectedAccount?.name ?? 'Hareketler'}
                  </Text>
                  {selectedAccount && (
                    <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>
                      Bakiye: {fmtMoney(selectedAccount.balance)}
                    </Text>
                  )}
                </View>
                {activeAccountId && (
                  <PillBtn icon={Plus} label="Hareket Ekle" size="sm" onPress={() => setAddMovementOpen(true)} />
                )}
              </View>

              {/* Search inside movements */}
              {activeAccountId && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  height: 40, paddingHorizontal: 16, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
                  borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
                }}>
                  <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    style={{ flex: 1, fontSize: 13, color: DS.ink[900], outline: 'none' as any }}
                    placeholder="Hareket ara..."
                    placeholderTextColor={DS.ink[400]}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                      <X size={13} color={DS.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>
              )}

              {/* Movement table header */}
              {activeAccountId && (
                <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', marginTop: 8 }}>
                  {[
                    { label: 'TARİH',     flex: 1 },
                    { label: 'KATEGORİ',  flex: 1 },
                    { label: 'AÇIKLAMA',  flex: 2 },
                    { label: 'TUTAR',     flex: 1, align: 'right' as const },
                    { label: 'İŞLEM',     flex: 0.5 },
                  ].map((h, i) => (
                    <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                      {h.label}
                    </Text>
                  ))}
                </View>
              )}

              {/* Movement rows */}
              {!activeAccountId ? (
                <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
                  <Wallet size={32} color={DS.ink[300]} strokeWidth={1.4} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>Hesap seçin</Text>
                </View>
              ) : movLoading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={DS.lab.primary} />
              ) : filteredMovements.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
                  <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>Hareket yok</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
                  {filteredMovements.map((mv, i) => {
                    const isIn = mv.direction === 'giris';
                    const color = isIn ? DIRECTION_COLORS.giris : DIRECTION_COLORS.cikis;
                    const CIcon = CAT_ICON[mv.category as MovementCategory] ?? CircleDot;
                    return (
                      <View key={mv.id} style={{
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 20, paddingVertical: 14,
                        borderBottomWidth: i < filteredMovements.length - 1 ? 1 : 0,
                        borderBottomColor: 'rgba(0,0,0,0.04)',
                      }}>
                        <Text style={{ flex: 1, fontSize: 12, color: DS.ink[500], fontFamily: 'monospace' }}>
                          {fmtDate(mv.movement_date)}
                        </Text>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CIcon size={13} color={color} strokeWidth={1.6} />
                          <Text style={{ fontSize: 12, color: DS.ink[700] }}>
                            {MOVEMENT_CATEGORY_LABELS[mv.category as MovementCategory] ?? mv.category}
                          </Text>
                        </View>
                        <Text style={{ flex: 2, fontSize: 12, color: DS.ink[700] }} numberOfLines={1}>
                          {mv.description}
                        </Text>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color, textAlign: 'right' }}>
                          {isIn ? '+' : '−'}{fmtMoney(mv.amount)}
                        </Text>
                        <View style={{ flex: 0.5, alignItems: 'flex-end' }}>
                          <Pressable
                            onPress={() => handleDeleteMovement(mv.id)}
                            style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                          >
                            <Trash2 size={12} color={DS.ink[400]} strokeWidth={1.6} />
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        ) : (
          /* ── Mobile layout ─────────────────────────────────── */
          <>
            {/* Account cards */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
              {accounts.map(acc => {
                const isActive = acc.id === activeAccountId;
                const Icon = ACCOUNT_ICON[acc.account_type];
                const color = ACCOUNT_COLORS[acc.account_type];
                const bal = Number(acc.balance ?? 0);
                return (
                  <Pressable
                    key={acc.id}
                    onPress={() => setSelectedId(acc.id)}
                    style={{
                      ...cardSolid,
                      padding: 16, width: 180,
                      borderWidth: isActive ? 1.5 : 0,
                      borderColor: isActive ? color : 'transparent',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={14} color={color} strokeWidth={1.6} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{acc.name}</Text>
                        <Text style={{ fontSize: 10, color: DS.ink[400] }}>{ACCOUNT_TYPE_LABELS[acc.account_type]}</Text>
                      </View>
                    </View>
                    <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.5, color: bal >= 0 ? DS.ink[900] : CHIP_TONES.danger.fg }}>
                      {fmtMoney(bal)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                      <Pressable
                        onPress={() => setEditAccount(acc)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Pencil size={12} color={DS.ink[500]} strokeWidth={1.6} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteAccount(acc)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Trash2 size={12} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
              {accounts.length === 0 && (
                <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 32, paddingHorizontal: 32, gap: 8 }}>
                  <Wallet size={28} color={DS.ink[300]} strokeWidth={1.4} />
                  <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[400] }}>Henüz hesap yok</Text>
                </View>
              )}
            </ScrollView>

            {/* Selected account movements */}
            {activeAccountId && (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[900] }}>
                      {selectedAccount?.name} Hareketleri
                    </Text>
                    <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 1 }}>
                      Bakiye: {fmtMoney(selectedAccount?.balance)}
                    </Text>
                  </View>
                  <PillBtn icon={Plus} label="Hareket" size="sm" onPress={() => setAddMovementOpen(true)} />
                </View>

                {/* Search */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  height: 44, paddingHorizontal: 14, borderRadius: 14,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
                }}>
                  <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
                    placeholder="Hareket ara..."
                    placeholderTextColor={DS.ink[400]}
                    value={search}
                    onChangeText={setSearch}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                      <X size={14} color={DS.ink[400]} strokeWidth={2} />
                    </Pressable>
                  )}
                </View>

                {movLoading ? (
                  <ActivityIndicator style={{ marginTop: 24 }} color={DS.lab.primary} />
                ) : filteredMovements.length === 0 ? (
                  <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 36, gap: 10 }}>
                    <Inbox size={28} color={DS.ink[300]} strokeWidth={1.4} />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[400] }}>Hareket yok</Text>
                  </View>
                ) : filteredMovements.map(mv => {
                  const isIn = mv.direction === 'giris';
                  const color = isIn ? DIRECTION_COLORS.giris : DIRECTION_COLORS.cikis;
                  const CIcon = CAT_ICON[mv.category as MovementCategory] ?? CircleDot;
                  return (
                    <View key={mv.id} style={{
                      ...cardSolid, padding: 16,
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                    }}>
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: `${color}14`, alignItems: 'center', justifyContent: 'center' }}>
                        <CIcon size={16} color={color} strokeWidth={1.6} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                          {mv.description}
                        </Text>
                        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                          {MOVEMENT_CATEGORY_LABELS[mv.category as MovementCategory]} · {fmtDate(mv.movement_date)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={{ ...DISPLAY, fontSize: 16, fontWeight: '400', letterSpacing: -0.3, color }}>
                          {isIn ? '+' : '−'}{fmtMoney(mv.amount)}
                        </Text>
                        <Pressable
                          onPress={() => handleDeleteMovement(mv.id)}
                          style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                        >
                          <Trash2 size={11} color={DS.ink[400]} strokeWidth={1.6} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Account Modal — §08 ───────────────────────────────── */}
      <AccountModal
        visible={addAccountOpen || !!editAccount}
        account={editAccount}
        onClose={() => { setAddAccountOpen(false); setEditAccount(null); }}
        onSaved={() => { setAddAccountOpen(false); setEditAccount(null); refetch(); }}
      />

      {/* ── Movement Modal — §08 ──────────────────────────────── */}
      {activeAccountId && (
        <MovementModal
          visible={addMovementOpen}
          accountId={activeAccountId}
          accountName={selectedAccount?.name ?? ''}
          onClose={() => setAddMovementOpen(false)}
          onSaved={() => { setAddMovementOpen(false); refetchMov(); refetch(); }}
        />
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// AccountModal — §08 dialog
// ═════════════════════════════════════════════════════════════════════
function AccountModal({
  visible, account, onClose, onSaved,
}: {
  visible: boolean; account: CashAccount | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName]           = useState('');
  const [type, setType]           = useState<AccountType>('kasa');
  const [bankName, setBankName]   = useState('');
  const [iban, setIban]           = useState('');
  const [opening, setOpening]     = useState('');
  const [saving, setSaving]       = useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(account?.name ?? '');
      setType(account?.account_type ?? 'kasa');
      setBankName(account?.bank_name ?? '');
      setIban(account?.iban ?? '');
      setOpening(account ? String(account.opening_balance ?? 0) : '');
    }
  }, [visible, account]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Hesap adı zorunlu.'); return; }
    setSaving(true);
    const params = {
      name: name.trim(),
      account_type: type,
      bank_name: bankName.trim() || undefined,
      iban: iban.trim() || undefined,
      opening_balance: Number(opening.replace(',', '.')) || 0,
    };
    const { error } = account
      ? await updateCashAccount(account.id, params)
      : await createCashAccount(params);
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 480,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, flex: 1, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
              {account ? 'Hesabı Düzenle' : 'Yeni Hesap'}
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 4 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>
              Hesap Türü
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['kasa', 'banka'] as AccountType[]).map(t => {
                const active = type === t;
                const Icon = ACCOUNT_ICON[t];
                const color = ACCOUNT_COLORS[t];
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      paddingVertical: 12, borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: active ? color : 'rgba(0,0,0,0.08)',
                      backgroundColor: active ? `${color}12` : '#FFF',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Icon size={16} color={active ? color : DS.ink[400]} strokeWidth={1.6} />
                    <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? color : DS.ink[500] }}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
              Hesap Adı *
            </Text>
            <TextInput
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
                marginBottom: 14,
              }}
              value={name} onChangeText={setName}
              placeholder="Örn: Ana Kasa, İş Bankası Hesabı" placeholderTextColor={DS.ink[400]}
            />

            {type === 'banka' && (
              <>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                  Banka Adı
                </Text>
                <TextInput
                  style={{
                    height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                    paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
                    marginBottom: 14,
                  }}
                  value={bankName} onChangeText={setBankName}
                  placeholder="Örn: İş Bankası" placeholderTextColor={DS.ink[400]}
                />

                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                  IBAN
                </Text>
                <TextInput
                  style={{
                    height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                    paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
                    marginBottom: 14,
                  }}
                  value={iban} onChangeText={setIban}
                  placeholder="TR00 0000 0000 0000 0000 0000 00" placeholderTextColor={DS.ink[400]}
                  autoCapitalize="characters"
                />
              </>
            )}

            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
              Açılış Bakiyesi (₺)
            </Text>
            <TextInput
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
              }}
              value={opening} onChangeText={setOpening}
              placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad"
            />
          </ScrollView>

          {/* Footer — ghost + dark pill */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 24, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <PillBtn icon={X} label="İptal" variant="ghost" onPress={onClose} disabled={saving} />
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 38, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                  {account ? 'Güncelle' : 'Oluştur'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MovementModal — §08 dialog
// ═════════════════════════════════════════════════════════════════════
function MovementModal({
  visible, accountId, accountName, onClose, onSaved,
}: {
  visible: boolean; accountId: string; accountName: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [direction, setDirection] = useState<MovementDirection>('giris');
  const [amount, setAmount]       = useState('');
  const [category, setCategory]   = useState<MovementCategory>('tahsilat');
  const [desc, setDesc]           = useState('');
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving]       = useState(false);

  React.useEffect(() => {
    if (visible) {
      setDirection('giris'); setAmount(''); setCategory('tahsilat');
      setDesc(''); setDate(new Date().toISOString().slice(0, 10));
    }
  }, [visible]);

  React.useEffect(() => {
    setCategory(direction === 'giris' ? 'tahsilat' : 'odeme');
  }, [direction]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli tutar girin.'); return; }
    if (!desc.trim()) { toast.error('Açıklama zorunlu.'); return; }
    setSaving(true);
    const { error } = await createMovement({
      account_id: accountId,
      direction, amount: amt, category,
      description: desc.trim(),
      movement_date: date,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    onSaved();
  };

  const inCategories: MovementCategory[]  = ['tahsilat', 'diger'];
  const outCategories: MovementCategory[] = ['odeme', 'maas', 'kira', 'malzeme', 'vergi', 'diger'];
  const catOptions = direction === 'giris' ? inCategories : outCategories;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 480,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Hareket Ekle
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{accountName}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 4 }}>
            {/* Direction toggle */}
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>
              Hareket Türü
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <Pressable
                onPress={() => setDirection('giris')}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingVertical: 12, borderRadius: 14, borderWidth: 1.5,
                  borderColor: direction === 'giris' ? DIRECTION_COLORS.giris : 'rgba(0,0,0,0.08)',
                  backgroundColor: direction === 'giris' ? `${DIRECTION_COLORS.giris}12` : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <ArrowDownCircle size={16} color={direction === 'giris' ? DIRECTION_COLORS.giris : DS.ink[400]} strokeWidth={1.6} />
                <Text style={{ fontSize: 13, fontWeight: direction === 'giris' ? '700' : '500', color: direction === 'giris' ? DIRECTION_COLORS.giris : DS.ink[500] }}>
                  Para Girişi
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDirection('cikis')}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  paddingVertical: 12, borderRadius: 14, borderWidth: 1.5,
                  borderColor: direction === 'cikis' ? DIRECTION_COLORS.cikis : 'rgba(0,0,0,0.08)',
                  backgroundColor: direction === 'cikis' ? `${DIRECTION_COLORS.cikis}12` : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <ArrowUpCircle size={16} color={direction === 'cikis' ? DIRECTION_COLORS.cikis : DS.ink[400]} strokeWidth={1.6} />
                <Text style={{ fontSize: 13, fontWeight: direction === 'cikis' ? '700' : '500', color: direction === 'cikis' ? DIRECTION_COLORS.cikis : DS.ink[500] }}>
                  Para Çıkışı
                </Text>
              </Pressable>
            </View>

            {/* Amount */}
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
              Tutar (₺)
            </Text>
            <TextInput
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
                marginBottom: 14,
              }}
              value={amount} onChangeText={setAmount}
              placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad"
            />

            {/* Category pills */}
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>
              Kategori
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {catOptions.map(cat => {
                const active = category === cat;
                const CIcon = CAT_ICON[cat];
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                      backgroundColor: active ? DS.ink[50] : '#FFF',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <CIcon size={12} color={active ? DS.ink[900] : DS.ink[400]} strokeWidth={1.6} />
                    <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                      {MOVEMENT_CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Description */}
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
              Açıklama *
            </Text>
            <TextInput
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
                marginBottom: 14,
              }}
              value={desc} onChangeText={setDesc}
              placeholder="Kısa not…" placeholderTextColor={DS.ink[400]}
            />

            {/* Date */}
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
              Tarih
            </Text>
            <TextInput
              style={{
                height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
              }}
              value={date} onChangeText={setDate}
              placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]}
            />
          </ScrollView>

          {/* Footer — ghost + dark pill */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 24, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <PillBtn icon={X} label="İptal" variant="ghost" onPress={onClose} disabled={saving} />
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 38, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: direction === 'cikis' ? CHIP_TONES.danger.fg : DS.ink[900],
                opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                  Kaydet
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
