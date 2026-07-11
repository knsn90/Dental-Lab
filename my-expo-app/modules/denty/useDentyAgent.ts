/**
 * useDentyAgent — Denty agent'ına mesaj gönderme (sohbet + sesli komut ortak yolu).
 *
 * Mevcut DentyPanel.send mantığının paylaşılabilir hali: kullanıcı metnini
 * store'a ekler, runDentyTurn ile edge function'a gider, sonucu (final veya
 * onay-kartlı pending) store'a yansıtır. Böylece sesli komut da SOHBETE düşer
 * ve aynı onay akışını kullanır.
 *
 * DentyPanel kendi inline send'ini korur (kırılma riski sıfır); bu hook yeni
 * giriş noktaları (sesli mod) içindir.
 */
import { useCallback } from 'react';
import { useDentyStore } from './store/dentyStore';
import { useDentyContext } from './context';
import { useDentyToolkit } from './tools';
import { runDentyTurn } from './api';

export interface DentySendResult {
  text: string;
  needsConfirm: boolean;
}

export function useDentyAgent() {
  const ctx = useDentyContext();
  const toolkit = useDentyToolkit(ctx);

  const send = useCallback(
    async (raw: string): Promise<DentySendResult | null> => {
      const text = raw.trim();
      const store = useDentyStore.getState();
      if (!text || store.busy || store.pending) return null;
      store.pushDisplay('user', text);
      store.setBusy(true);
      const pendingId = store.pushDisplay('denty', '', { pending: true });
      try {
        const outcome = await runDentyTurn({
          system: ctx.systemPrompt,
          history: store.raw,
          userText: text,
          toolkit,
        });
        if (outcome.kind === 'final') {
          store.setRaw(outcome.raw);
          store.updateDisplay(pendingId, { text: outcome.text, pending: false });
          return { text: outcome.text, needsConfirm: false };
        }
        store.setRaw(outcome.pending.raw);
        store.updateDisplay(pendingId, { text: outcome.text, pending: false });
        store.setPending(outcome.pending);
        outcome.cards.forEach((card) => store.pushCard(card));
        return { text: outcome.text, needsConfirm: true };
      } catch (e: any) {
        const msg = `Üzgünüm, şu an yanıt veremedim. ${e?.message ?? ''}`.trim();
        store.updateDisplay(pendingId, { text: msg, pending: false });
        return { text: msg, needsConfirm: false };
      } finally {
        store.setBusy(false);
      }
    },
    [ctx.systemPrompt, toolkit],
  );

  return { send };
}
