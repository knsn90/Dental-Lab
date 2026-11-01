// Kasadan bankaya yatırma: kasadan tek adımda çıkış (elle hareket, kategori "transfer").
import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { DatePicker } from '../../../core/ui/DatePicker';
import { depositToBank, type Drawer } from '../api';
import { parseAmount } from '../drawerModel';
import { CashModalShell, CashNote, CashField, cashErrorText, fmtCash, todayISO } from './CashModalShell';

export function DepositModal({ visible, drawer, onClose, onDone }: {
  visible: boolean;
  drawer: Drawer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const U = useInkUI();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setAmount(''); setDate(todayISO()); setNote(''); setError(null); setBusy(false); }
  }, [visible]);

  const cur = drawer?.currency ?? 'TRY';
  const balance = Number(drawer?.balance) || 0;
  const n = parseAmount(amount);
  const over = Number.isFinite(n) && n > balance;

  const save = async () => {
    if (!drawer) return;
    if (!Number.isFinite(n) || n <= 0) { setError(autoT('Geçerli bir tutar girin')); return; }
    setBusy(true); setError(null);
    const { error: e } = await depositToBank(drawer.id, Math.round(n * 100) / 100, date, note);
    setBusy(false);
    if (e) { setError(cashErrorText(e)); return; }
    onDone();
  };

  return (
    <CashModalShell
      visible={visible}
      title={autoT('Bankaya yatır')}
      subtitle={`${drawer?.name ?? ''} · ${autoT('Beklenen')} ${fmtCash(balance, cur)}`}
      onClose={onClose}
      primaryLabel={autoT('Kaydet')}
      primaryHint={autoT('Tutarı kasadan çıkış olarak kaydeder')}
      onPrimary={save}
      busy={busy}
      disabled={!amount.trim()}
      error={error}
    >
      <CashField label={`${autoT('Tutar')} (${cur})`}>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v); setError(null); }}
          placeholder="0,00"
          placeholderTextColor={U.ink[400]}
          keyboardType="decimal-pad"
          autoFocus
          style={U.inputStyle}
        />
      </CashField>
      <CashField label={autoT('Tarih')}>
        <DatePicker compact value={date} onChange={setDate} accent={U.ink[900]} />
      </CashField>
      <CashField label={autoT('Açıklama')}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={autoT('Bankaya yatırıldı')}
          placeholderTextColor={U.ink[400]}
          style={U.inputStyle}
        />
      </CashField>
      {over ? <CashNote tone="warning">{autoT('Tutar beklenen bakiyeden fazla')}</CashNote> : null}
    </CashModalShell>
  );
}
