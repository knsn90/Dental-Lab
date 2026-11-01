// Kasa sayımı: yönetici kasadaki gerçek tutarı girer; beklenenden farkı "Sayım farkı" hareketi olur.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { countDrawer, type Drawer } from '../api';
import { countDiff, parseAmount } from '../drawerModel';
import { CashModalShell, CashNote, CashField, cashErrorText, fmtCash } from './CashModalShell';

export function CountDrawerModal({ visible, drawer, onClose, onDone }: {
  visible: boolean;
  drawer: Drawer | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const U = useInkUI();
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (visible) { setCounted(''); setError(null); setBusy(false); } }, [visible]);

  const cur = drawer?.currency ?? 'TRY';
  const expected = Number(drawer?.balance) || 0;
  const n = parseAmount(counted);
  const preview = Number.isFinite(n) && n >= 0 ? countDiff(n, expected) : null;

  const save = async () => {
    if (!drawer) return;
    if (!Number.isFinite(n) || n < 0) { setError(autoT('Geçerli bir tutar girin')); return; }
    setBusy(true); setError(null);
    const { error: e } = await countDrawer(drawer.id, n);
    setBusy(false);
    if (e) { setError(cashErrorText(e)); return; }
    onDone();
  };

  const diffTone = !preview || preview.direction == null ? U.chipTones.neutral
    : preview.direction === 'giris' ? U.chipTones.success : U.chipTones.danger;

  return (
    <CashModalShell
      visible={visible}
      title={autoT('Sayım yap')}
      subtitle={drawer?.name}
      onClose={onClose}
      primaryLabel={autoT('Sayımı kaydet')}
      primaryHint={autoT('Fark varsa sayım farkı hareketi yazar')}
      onPrimary={save}
      busy={busy}
      disabled={!counted.trim()}
      error={error}
    >
      <CashNote tone="warning">{autoT('Sayımdan önce bugünkü nakit tahsilat ve giderlerin girildiğinden emin olun')}</CashNote>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>{autoT('Beklenen')}</Text>
        <Text style={{ fontSize: 18, fontWeight: '600', color: U.ink[900] }}>{fmtCash(expected, cur)}</Text>
      </View>
      <CashField label={`${autoT('Sayılan tutar')} (${cur})`}>
        <TextInput
          value={counted}
          onChangeText={(v) => { setCounted(v); setError(null); }}
          placeholder="0,00"
          placeholderTextColor={U.ink[400]}
          keyboardType="decimal-pad"
          autoFocus
          onSubmitEditing={save}
          style={U.inputStyle}
        />
      </CashField>
      {preview ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: diffTone.bg }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: diffTone.fg }}>
            {preview.direction == null ? autoT('Fark yok') : autoT('Sayım farkı')}
          </Text>
          {preview.direction != null ? (
            <Text style={{ fontSize: 14, fontWeight: '700', color: diffTone.fg }}>
              {preview.diff > 0 ? '+' : '−'}{fmtCash(Math.abs(preview.diff), cur)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </CashModalShell>
  );
}
