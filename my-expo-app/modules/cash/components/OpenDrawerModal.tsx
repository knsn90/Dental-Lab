// Nakit kasa açılışı: kasadaki nakit sayılır, kasa o tutarla ve o ANDA başlar.
// Bu andan önce girilmiş nakit tahsilat/gider kasaya yazılmaz (sayılan tutar onları kapsar).
import React, { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { openDrawer } from '../api';
import { parseAmount, type DrawerCurrency } from '../drawerModel';
import { CashModalShell, CashNote, CashField, cashErrorText, fmtCash } from './CashModalShell';

export function OpenDrawerModal({ visible, currency, onClose, onDone }: {
  visible: boolean;
  currency: DrawerCurrency | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const U = useInkUI();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible) { setAmount(''); setError(null); setBusy(false); } }, [visible]);

  const save = async () => {
    if (!currency) return;
    const n = parseAmount(amount);
    if (!Number.isFinite(n) || n < 0) { setError(autoT('Geçerli bir tutar girin')); return; }
    setBusy(true); setError(null);
    const { error: e } = await openDrawer(currency, n);
    setBusy(false);
    if (e) { setError(cashErrorText(e)); return; }
    onDone();
  };

  return (
    <CashModalShell
      visible={visible}
      title={currency === 'EUR' ? autoT('EUR kasasını aç') : autoT('TL kasasını aç')}
      subtitle={autoT('Kasadaki nakdi sayıp girin')}
      onClose={onClose}
      primaryLabel={autoT('Kasayı aç')}
      primaryHint={autoT('Sayılan tutarla kasayı başlatır')}
      onPrimary={save}
      busy={busy}
      disabled={!amount.trim()}
      error={error}
    >
      <CashField label={`${autoT('Sayılan tutar')} (${currency ?? ''})`}>
        <TextInput
          value={amount}
          onChangeText={(v) => { setAmount(v); setError(null); }}
          placeholder="0,00"
          placeholderTextColor={U.ink[400]}
          keyboardType="decimal-pad"
          autoFocus
          onSubmitEditing={save}
          style={U.inputStyle}
        />
        {(() => {
          // Okunan tutarı göster: "1.250" / "1,250.50" gibi girişlerin nasıl anlaşıldığı görünsün
          const n = parseAmount(amount);
          return currency && Number.isFinite(n) && n >= 0 ? (
            <Text style={{ fontSize: 12, color: U.ink[500] }}>{autoT('Kasa bu tutarla açılacak')}: {fmtCash(n, currency)}</Text>
          ) : null;
        })()}
      </CashField>
      <CashNote>{autoT('Bu andan önce girilmiş nakit tahsilat ve giderler kasaya yazılmaz; sayılan tutar onları kapsar.')}</CashNote>
    </CashModalShell>
  );
}
