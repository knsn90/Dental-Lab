import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toast } from '../../../core/ui/Toast';

import { useCashAccounts, useMovements } from '../hooks/useCash';
import {
  createCashAccount, updateCashAccount, deleteCashAccount,
  createMovement, deleteMovement,
  ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ICONS,
  MOVEMENT_CATEGORY_LABELS, MOVEMENT_CATEGORY_ICONS,
  type CashAccount, type AccountType, type MovementCategory, type MovementDirection,
} from '../api';
import { useBreakpoint } from '../../../core/layout/Responsive';

import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CATEGORIES: MovementCategory[] = ['tahsilat', 'odeme', 'maas', 'kira', 'malzeme', 'vergi', 'diger'];
const DIRECTION_COLORS = { giris: '#047857', cikis: '#EF4444' };

// ─── Screen ───────────────────────────────────────────────────────────────────
export function CashScreen() {
  const { isDesktop, px, gap } = useBreakpoint();
  const isEmbedded = useContext(HubContext);
  const safeEdges = isEmbedded ? ([] as any) : (['top'] as any);
  const { accounts, loading, refetch } = useCashAccounts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<CashAccount | null>(null);
  const [addMovementOpen, setAddMovementOpen] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedId) ?? (accounts[0] ?? null),
    [accounts, selectedId],
  );
  const activeAccountId = selectedAccount?.id ?? null;
  const { movements, loading: movLoading, refetch: refetchMov } = useMovements(activeAccountId);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const totalKasa   = accounts.filter(a => a.account_type === 'kasa').reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const totalBanka  = accounts.filter(a => a.account_type === 'banka').reduce((s, a) => s + Number(a.balance ?? 0), 0);

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
    <SafeAreaView style={s.safe} edges={safeEdges}>
      {/* Header — embedded ise başlık gizli */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          {!isEmbedded && <Text style={s.title}>Kasa / Banka</Text>}
          {!isEmbedded && <Text style={s.subtitle}>Nakit ve banka hesap takibi</Text>}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setAddAccountOpen(true)} activeOpacity={0.85}>
          <AppIcon name={'plus' as any} size={16} color="#fff" />
          <Text style={s.addBtnText}>Hesap Ekle</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 64 }} color="#2563EB" />
      ) : (
        <View style={[s.body, isDesktop && { flexDirection: 'row' }]}>

          {/* ── Sol panel: KPI + Hesap listesi ── */}
          <View style={[s.leftPanel, { paddingHorizontal: isDesktop ? 0 : px }]}>

            {/* KPI özet */}
            <View style={[s.kpiRow, isDesktop && { paddingHorizontal: px }]}>
              <KpiBox label="Toplam Bakiye" value={fmtMoney(totalBalance)}
                color="#2563EB" icon="cash-multiple" />
              <KpiBox label="Kasa" value={fmtMoney(totalKasa)}
                color="#047857" icon="safe" />
              <KpiBox label="Banka" value={fmtMoney(totalBanka)}
                color="#7C3AED" icon="bank-outline" />
            </View>

            {/* Hesap kartları */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[s.accountList, isDesktop && { paddingHorizontal: px }]}
              showsVerticalScrollIndicator={false}
            >
              {accounts.length === 0 ? (
                <View style={s.empty}>
                  <AppIcon name={'safe' as any} size={40} color="#CBD5E1" />
                  <Text style={s.emptyText}>Henüz hesap yok</Text>
                  <Text style={s.emptyHint}>+ Hesap Ekle butonuyla başlayın</Text>
                </View>
              ) : accounts.map(acc => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  selected={acc.id === (activeAccountId)}
                  onPress={() => setSelectedId(acc.id)}
                  onEdit={() => setEditAccount(acc)}
                  onDelete={() => handleDeleteAccount(acc)}
                />
              ))}
            </ScrollView>
          </View>

          {/* ── Sağ panel: Hareket listesi ── */}
          {activeAccountId && (
            <View style={[s.rightPanel, isDesktop && { borderLeftWidth: 1, borderLeftColor: '#F1F5F9' }]}>
              <View style={[s.movHeader, { paddingHorizontal: isDesktop ? px : px }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.movTitle}>{selectedAccount?.name} Hareketleri</Text>
                  <Text style={s.movSub}>Bakiye: {fmtMoney(selectedAccount?.balance)}</Text>
                </View>
                <TouchableOpacity
                  style={s.addMovBtn}
                  onPress={() => setAddMovementOpen(true)}
                  activeOpacity={0.85}
                >
                  <AppIcon name={'plus' as any} size={14} color="#2563EB" />
                  <Text style={s.addMovBtnText}>Hareket Ekle</Text>
                </TouchableOpacity>
              </View>

              {movLoading ? (
                <ActivityIndicator style={{ marginTop: 32 }} color="#2563EB" />
              ) : (
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: isDesktop ? px : px, paddingBottom: 48, gap: 8 }}
                  showsVerticalScrollIndicator={false}
                >
                  {movements.length === 0 ? (
                    <View style={s.empty}>
                      <AppIcon name={'transfer' as any} size={36} color="#CBD5E1" />
                      <Text style={s.emptyText}>Hareket yok</Text>
                    </View>
                  ) : movements.map(mv => (
                    <MovementRow
                      key={mv.id}
                      movement={mv}
                      onDelete={() => handleDeleteMovement(mv.id)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      )}

      {/* Hesap ekle/düzenle modal */}
      <AccountModal
        visible={addAccountOpen || !!editAccount}
        account={editAccount}
        onClose={() => { setAddAccountOpen(false); setEditAccount(null); }}
        onSaved={() => { setAddAccountOpen(false); setEditAccount(null); refetch(); }}
      />

      {/* Hareket ekle modal */}
      {activeAccountId && (
        <MovementModal
          visible={addMovementOpen}
          accountId={activeAccountId}
          accountName={selectedAccount?.name ?? ''}
          onClose={() => setAddMovementOpen(false)}
          onSaved={() => { setAddMovementOpen(false); refetchMov(); refetch(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── KPI Box ─────────────────────────────────────────────────────────────────
function KpiBox({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <View style={[kpi.card, { flex: 1 }]}>
      <View style={[kpi.icon, { backgroundColor: color + '18' }]}>
        <AppIcon name={icon as any} size={16} color={color} />
      </View>
      <Text style={kpi.label}>{label}</Text>
      <Text style={[kpi.value, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({
  account, selected, onPress, onEdit, onDelete,
}: {
  account: CashAccount; selected: boolean;
  onPress: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const isKasa = account.account_type === 'kasa';
  const color = isKasa ? '#047857' : '#7C3AED';
  const bg    = isKasa ? '#ECFDF5' : '#F5F3FF';
  const bal   = Number(account.balance ?? 0);

  return (
    <TouchableOpacity
      style={[ac.card, selected && ac.cardActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[ac.iconWrap, { backgroundColor: bg }]}>
        <AppIcon name={ACCOUNT_TYPE_ICONS[account.account_type] as any} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ac.name}>{account.name}</Text>
        {account.bank_name && <Text style={ac.bank}>{account.bank_name}</Text>}
        <Text style={[ac.type, { color }]}>{ACCOUNT_TYPE_LABELS[account.account_type]}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[ac.balance, { color: bal >= 0 ? '#0F172A' : '#EF4444' }]}>
          {fmtMoney(bal)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={onEdit} style={ac.iconBtn}>
            <AppIcon name={'pencil-outline' as any} size={14} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={ac.iconBtn}>
            <AppIcon name={'trash-can-outline' as any} size={14} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Movement Row ─────────────────────────────────────────────────────────────
function MovementRow({ movement: mv, onDelete }: { movement: any; onDelete: () => void }) {
  const isIn   = mv.direction === 'giris';
  const color  = isIn ? DIRECTION_COLORS.giris : DIRECTION_COLORS.cikis;
  const catIcon = MOVEMENT_CATEGORY_ICONS[mv.category as MovementCategory] ?? 'dots-horizontal';

  return (
    <View style={mr.wrap}>
      <View style={[mr.iconWrap, { backgroundColor: color + '18' }]}>
        <AppIcon name={catIcon as any} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={mr.desc}>{mv.description}</Text>
        <Text style={mr.meta}>
          {MOVEMENT_CATEGORY_LABELS[mv.category as MovementCategory]} · {fmtDate(mv.movement_date)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[mr.amount, { color }]}>
          {isIn ? '+' : '−'}{fmtMoney(mv.amount)}
        </Text>
        <TouchableOpacity onPress={onDelete} style={mr.delBtn}>
          <AppIcon name={'trash-can-outline' as any} size={13} color="#CBD5E1" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Account Modal ────────────────────────────────────────────────────────────
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
      <View style={fm.overlay}>
        <View style={fm.card}>
          <View style={fm.header}>
            <Text style={fm.title}>{account ? 'Hesabı Düzenle' : 'Yeni Hesap'}</Text>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body}>
            {/* Hesap türü */}
            <Text style={fm.label}>Hesap Türü</Text>
            <View style={fm.chipRow}>
              {(['kasa', 'banka'] as AccountType[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[fm.chip, type === t && fm.chipActive]}
                  onPress={() => setType(t)}
                >
                  <AppIcon
                    name={ACCOUNT_TYPE_ICONS[t] as any}
                    size={14}
                    color={type === t ? '#2563EB' : '#94A3B8'}
                  />
                  <Text style={[fm.chipText, type === t && fm.chipTextActive]}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={fm.label}>Hesap Adı *</Text>
            <TextInput style={fm.input} value={name} onChangeText={setName}
              placeholder="Örn: Ana Kasa, İş Bankası Hesabı" placeholderTextColor="#94A3B8" />

            {type === 'banka' && (
              <>
                <Text style={fm.label}>Banka Adı</Text>
                <TextInput style={fm.input} value={bankName} onChangeText={setBankName}
                  placeholder="Örn: İş Bankası" placeholderTextColor="#94A3B8" />
                <Text style={fm.label}>IBAN</Text>
                <TextInput style={fm.input} value={iban} onChangeText={setIban}
                  placeholder="TR00 0000 0000 0000 0000 0000 00" placeholderTextColor="#94A3B8"
                  autoCapitalize="characters" />
              </>
            )}

            <Text style={fm.label}>Açılış Bakiyesi (₺)</Text>
            <TextInput style={fm.input} value={opening} onChangeText={setOpening}
              placeholder="0,00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
          </ScrollView>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>{account ? 'Güncelle' : 'Oluştur'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Movement Modal ───────────────────────────────────────────────────────────
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

  // Yönle uyumlu kategori varsayılanı
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
      <View style={fm.overlay}>
        <View style={fm.card}>
          <View style={fm.header}>
            <Text style={fm.title}>Hareket Ekle</Text>
            <Text style={fm.headerSub}>{accountName}</Text>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body}>
            {/* Giriş / Çıkış */}
            <Text style={fm.label}>Hareket Türü</Text>
            <View style={fm.dirRow}>
              <TouchableOpacity
                style={[fm.dirBtn, direction === 'giris' && fm.dirBtnIn]}
                onPress={() => setDirection('giris')}
              >
                <AppIcon name={'arrow-down-circle-outline' as any} size={16}
                  color={direction === 'giris' ? '#047857' : '#94A3B8'} />
                <Text style={[fm.dirText, direction === 'giris' && { color: '#047857', fontWeight: '700' }]}>
                  Para Girişi
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[fm.dirBtn, direction === 'cikis' && fm.dirBtnOut]}
                onPress={() => setDirection('cikis')}
              >
                <AppIcon name={'arrow-up-circle-outline' as any} size={16}
                  color={direction === 'cikis' ? '#EF4444' : '#94A3B8'} />
                <Text style={[fm.dirText, direction === 'cikis' && { color: '#EF4444', fontWeight: '700' }]}>
                  Para Çıkışı
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tutar */}
            <Text style={fm.label}>Tutar (₺)</Text>
            <TextInput style={fm.input} value={amount} onChangeText={setAmount}
              placeholder="0,00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />

            {/* Kategori */}
            <Text style={fm.label}>Kategori</Text>
            <View style={fm.chipRow}>
              {catOptions.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[fm.chip, category === cat && fm.chipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <AppIcon
                    name={MOVEMENT_CATEGORY_ICONS[cat] as any} size={12}
                    color={category === cat ? '#2563EB' : '#94A3B8'}
                  />
                  <Text style={[fm.chipText, category === cat && fm.chipTextActive]}>
                    {MOVEMENT_CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Açıklama */}
            <Text style={fm.label}>Açıklama *</Text>
            <TextInput style={fm.input} value={desc} onChangeText={setDesc}
              placeholder="Kısa not…" placeholderTextColor="#94A3B8" />

            {/* Tarih */}
            <Text style={fm.label}>Tarih</Text>
            <TextInput style={fm.input} value={date} onChangeText={setDate}
              placeholder="YYYY-AA-GG" placeholderTextColor="#94A3B8" />
          </ScrollView>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fm.saveBtn, saving && { opacity: 0.5 },
                direction === 'cikis' && { backgroundColor: '#EF4444' }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Kaydet</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: CardSpec.pageBg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 12 },
  title:   { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle:{ fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn:  {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#2563EB',
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  body:    { flex: 1 },
  leftPanel:  { flex: 1 },
  rightPanel: { flex: 1.2, backgroundColor: '#FAFAFA' },
  kpiRow:  { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  accountList: { gap: 10, paddingBottom: 48 },
  movHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  movTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  movSub:   { fontSize: 12, color: '#64748B', marginTop: 1 },
  addMovBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  addMovBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  emptyHint: { fontSize: 12, color: '#CBD5E1' },
});

const kpi = StyleSheet.create({
  card:  { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, padding: 14, borderWidth: 1, borderColor: CardSpec.border, gap: 6, ...Shadows.card },
  icon:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
});

const ac = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, padding: 14,
    borderWidth: 1, borderColor: CardSpec.border,
    ...Shadows.card,
  },
  cardActive: { borderColor: '#2563EB', backgroundColor: '#F0F7FF' },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  bank:    { fontSize: 11, color: '#64748B', marginTop: 1 },
  type:    { fontSize: 10, fontWeight: '700', marginTop: 2 },
  balance: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  iconBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
});

const mr = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  desc:   { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  meta:   { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  delBtn: { padding: 4 },
});

const fm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:    { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90%', overflow: 'hidden' },
  header:  {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:    { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
  headerSub:{ fontSize: 11, color: '#64748B', marginRight: 8 },
  closeBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body:     { padding: 20, gap: 4 },
  label:    { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input:    {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#fff',
  },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText:   { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  chipTextActive: { color: '#2563EB', fontWeight: '700' },
  dirRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  dirBtnIn:  { borderColor: '#047857', backgroundColor: '#ECFDF5' },
  dirBtnOut: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  dirText:   { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  footer:    {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText:{ fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn:   { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText:  { fontSize: 14, fontWeight: '700', color: '#fff' },
});
