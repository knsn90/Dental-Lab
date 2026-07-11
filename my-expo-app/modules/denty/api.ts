/**
 * Denty istemci ajan döngüsü (Faz 2 — onay kapılı yazma aksiyonları).
 *
 * Akış:
 *   1. Kullanıcı mesajı edge function'a (denty-brain) gider
 *   2. Claude SALT-OKUNUR araç çağırırsa → client'ta çalıştırılır, sonuç geri beslenir
 *   3. Claude YAZMA aracı çağırırsa (siparisOlustur/destekTalebiAc/mesajGonder)
 *      → döngü DURUR, onay kartı(ları) döner. Kullanıcı onaylayınca resumeDentyTurn
 *        aracı gerçekten çalıştırır.
 *
 * Edge function sadece güvenli Claude proxy'si; araçlar client'ta (kullanıcının
 * kendi oturumu + RLS + izinleriyle) çalışır.
 */
import { supabase } from '../../core/api/supabase';
import type {
  BrainResponse, ClaudeMessage, ContentBlock, ToolKit, DentyOutcome, PendingAction,
} from './types';
import { WRITE_TOOLS, describeAction } from './tools';

// Faz 0+1/2: kanıtlanmış model. Maliyet optimizasyonu (Haiku) sonraki fazda.
const DENTY_MODEL = 'claude-sonnet-4-5';
const MAX_TOOL_LOOPS = 6;

async function callBrain(args: {
  system: string;
  messages: ClaudeMessage[];
  tools?: ToolKit['defs'];
}): Promise<BrainResponse> {
  const { data, error } = await supabase.functions.invoke('denty-brain', {
    body: {
      system: args.system,
      messages: args.messages,
      tools: args.tools,
      model: DENTY_MODEL,
      max_tokens: 1024,
    },
  });
  if (error) return { ok: false, error: error.message };
  return data as BrainResponse;
}

function extractText(content: ContentBlock[]): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Ortak motor: nihai cevap veya onay gereken yazma aksiyonuna kadar döner.
 */
async function runLoop(system: string, messages: ClaudeMessage[], toolkit: ToolKit): Promise<DentyOutcome> {
  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const res = await callBrain({ system, messages, tools: toolkit.defs });
    if (!res.ok || !res.content) throw new Error(res.error || 'Simanty yanıt veremedi.');

    messages.push({ role: 'assistant', content: res.content });
    const text = extractText(res.content);

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      const writes = toolUses.filter((b) => WRITE_TOOLS.has(b.name));
      const reads = toolUses.filter((b) => !WRITE_TOOLS.has(b.name));

      // Salt-okunur araçları hemen çalıştır
      const readResults: ContentBlock[] = [];
      for (const r of reads) {
        let out = '';
        try { out = await toolkit.execute(r.name, r.input); }
        catch (e: any) { out = `Araç hatası: ${e?.message ?? String(e)}`; }
        readResults.push({ type: 'tool_result', tool_use_id: r.id, content: out });
      }

      // Yazma aracı varsa → DUR, onay iste
      if (writes.length > 0) {
        const pending: PendingAction = {
          blocks: writes.map((w) => ({ id: w.id, name: w.name, input: w.input })),
          presetResults: readResults,
          raw: messages,
          system,
        };
        return {
          kind: 'confirm',
          text: text || 'Onayını bekliyorum.',
          pending,
          cards: writes.map((w) => describeAction(w.name, w.input)),
        };
      }

      // Sadece okuma → sonuçları besle, devam et
      messages.push({ role: 'user', content: readResults });
      continue;
    }

    return { kind: 'final', text: text || '…', raw: messages };
  }
  throw new Error('Simanty araç döngüsü sınırına ulaştı.');
}

/** Yeni kullanıcı mesajını işler. */
export async function runDentyTurn(opts: {
  system: string;
  history: ClaudeMessage[];
  userText: string;
  toolkit: ToolKit;
}): Promise<DentyOutcome> {
  const messages: ClaudeMessage[] = [...opts.history, { role: 'user', content: opts.userText }];
  return runLoop(opts.system, messages, opts.toolkit);
}

/** Onay kartından sonra: kullanıcının kararına göre yazma aracını çalıştırır. */
export async function resumeDentyTurn(
  pending: PendingAction,
  confirmed: boolean,
  toolkit: ToolKit,
): Promise<DentyOutcome> {
  const writeResults: ContentBlock[] = [];
  for (const b of pending.blocks) {
    let out: string;
    if (confirmed) {
      try { out = await toolkit.execute(b.name, b.input); }
      catch (e: any) { out = `İşlem hatası: ${e?.message ?? String(e)}`; }
    } else {
      out = 'Kullanıcı bu işlemi ONAYLAMADI / iptal etti. İşlem yapılmadı.';
    }
    writeResults.push({ type: 'tool_result', tool_use_id: b.id, content: out });
  }

  const messages: ClaudeMessage[] = [
    ...pending.raw,
    { role: 'user', content: [...pending.presetResults, ...writeResults] },
  ];
  return runLoop(pending.system, messages, toolkit);
}
