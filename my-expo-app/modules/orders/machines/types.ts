// modules/orders/machines/types.ts
// Makine adapter sözleşmesi — gerçek makine entegrasyonu (Zirkonzahn,
// Medit, Exocad vs.) bu interface'i implement etmek zorunda.

export type MachineKind =
  | 'mock'              // Geliştirme — fake adapter
  | 'medit'             // Medit Link tarayıcılar
  | 'exocad'            // Exocad CAD entegrasyonu
  | 'zirkonzahn_m5'     // Zirkonzahn M-series milling
  | '3shape'            // 3Shape Trios/CAD
  | 'generic_ocr'       // OCR ile makine ekran okuma
  | 'imes_icore'        // imes-icore frezeleme
  | 'roland_dgshape'    // Roland DGShape
  | 'formlabs'          // Formlabs 3D printer
  | 'asiga'             // Asiga 3D printer
  | 'vita_furnace'      // VITA fırın
  | 'programat';        // Ivoclar Programat fırın

export interface MachineStatus {
  state:                'idle' | 'running' | 'error' | 'maintenance' | 'offline' | 'unknown';
  message?:             string;
  currentJobId?:        string;
  estimateSeconds?:     number;
  startedAt?:           string;     // ISO
  lastHeartbeatAt?:     string;
}

export interface JobConfig {
  stageId:        string;
  /** Adapter'a özgü payload — örn. milling: { material_disc_id, nesting, sprue_pos } */
  options?:       Record<string, any>;
  /** Tahmini süre (saniye) — UI ETA için */
  estimateSeconds?: number;
}

export interface MachineAdapter {
  kind:       MachineKind;
  /** Cihazın canlı durumunu sorgular (heartbeat). */
  getStatus():            Promise<MachineStatus>;
  /** İşi makineye gönder. Server'a `record_machine_event('job_started')` yazar. */
  startJob(cfg: JobConfig): Promise<{ ok: boolean; jobId?: string; error?: string }>;
  /** İşi iptal et. */
  cancelJob?():           Promise<{ ok: boolean; error?: string }>;
  /** Olay polling — periyodik olarak machine_events üretir. */
  pollEvents?():          Promise<void>;
  /** Bağlantıyı kapat. */
  disconnect?():          Promise<void>;
}

export interface AdapterConstructorArgs {
  equipmentId:    string;
  endpointUrl?:   string | null;
  credentialsRef?:string | null;
}
