// Denty — tip tanımları (Faz 0+1)

/** Claude mesaj formatı (edge function'a aynen gider). */
export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/** Claude'a tanıtılan araç şeması. */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/** Bir aracı çalıştıran fonksiyon — sonuç metni döner. */
export type ToolExecutor = (input: any) => Promise<string> | string;

export interface ToolKit {
  defs: ToolDef[];
  execute: (name: string, input: any) => Promise<string>;
}

/** UI'da gösterilen sohbet baloncuğu (veya onay kartı). */
export interface DentyMessage {
  id: string;
  role: 'user' | 'denty' | 'card';
  text: string;
  pending?: boolean;
  card?: ActionCard;
  /** Kart için: kullanıcı kararı verildi mi ve neyle sonuçlandı. */
  decided?: 'confirmed' | 'cancelled';
}

/** Onay kartı — yazma aksiyonu öncesi kullanıcıya gösterilir. */
export interface ActionCard {
  toolName: string;
  title: string;
  rows: { label: string; value: string }[];
}

/** Onay bekleyen aksiyon (yazma aracı tetiklendiğinde). */
export interface PendingAction {
  blocks: { id: string; name: string; input: any }[];
  presetResults: ContentBlock[];   // aynı turdaki salt-okunur araçların sonuçları
  raw: ClaudeMessage[];            // assistant tool_use turunu da içeren geçmiş
  system: string;
}

/** Bir kullanıcı turunun sonucu: ya nihai cevap ya onay gereken aksiyon. */
export type DentyOutcome =
  | { kind: 'final'; text: string; raw: ClaudeMessage[] }
  | { kind: 'confirm'; text: string; pending: PendingAction; cards: ActionCard[] };

/** Edge function yanıtı. */
export interface BrainResponse {
  ok: boolean;
  stop_reason?: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  content?: ContentBlock[];
  usage?: { input_tokens: number; output_tokens: number } | null;
  error?: string;
}
