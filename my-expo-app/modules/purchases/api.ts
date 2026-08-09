/**
 * Purchase invoices API.
 *
 * Bir purchase_invoice = fatura header + N stock_movement (IN) satırı.
 * RPC create_purchase_invoice ile atomic insert.
 */

import { Platform, Linking } from 'react-native';
import { supabase } from '../../core/api/supabase';
import type { Currency } from '../../core/money/currency';

export type PurchasePaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'open_account';

export interface PurchaseLineInput {
  item_id?: string | null;     // mevcut stock_items.id (null = yeni ürün)
  item_name: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  vat_rate?: number | null;    // satır bazlı KDV (%); null → header default
  brand?: string | null;       // RPC: yoksa brands tablosuna otomatik insert + stock_item.brand
  category?: string | null;    // RPC: yoksa categories tablosuna otomatik insert + stock_item.category
  /**
   * Satır stoğa girecek mi:
   *   consumable → stok kalemi · equipment → demirbaş
   *   service / shipping / other_nonstock → stok dışı, yalnız fatura satırı
   */
  item_kind?: 'consumable' | 'equipment' | 'service' | 'shipping' | 'other_nonstock'; // 'equipment' → demirbaş kaydı, sarf değil
  model?: string | null;       // sadece equipment için
  equipment_category?: 'cad_cam' | 'scanner' | 'furnace' | 'milling' | 'printer' | 'sintering' | 'polishing' | 'articulator' | 'compressor' | 'other' | null;
  lot_no?: string | null;      // opsiyonel: lot/seri no → stock_movements.lot_no
  expiry_date?: string | null; // opsiyonel: son kullanma (YYYY-MM-DD) → stock_movements.expiry_date
}

export interface CreatePurchaseInput {
  labId: string;
  supplierId: string | null;
  supplierName: string;
  invoiceNumber?: string | null;
  invoiceDate: string;          // YYYY-MM-DD
  dueDate?: string | null;
  currency: Currency;
  vatRate: number;              // %
  exchangeRate?: number | null; // fatura kuru (1 [currency] = X TRY). Verilirse RPC bu kuru kullanır.
  paymentMethod?: PurchasePaymentMethod;
  invoiceFileUrl?: string | null;
  notes?: string | null;
  lines: PurchaseLineInput[];
}

export interface PurchaseInvoice {
  id: string;
  lab_id: string | null;
  supplier_id: string | null;
  supplier_name: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string | null;
  invoice_file_url: string | null;
  notes: string | null;
  currency: Currency;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  rate_at_time: number;
  base_currency_at_time: Currency;
  subtotal_base: number;
  total_base: number;
  payment_method: PurchasePaymentMethod | null;
  created_at: string;
  updated_at: string;
}

export async function createPurchaseInvoice(
  input: CreatePurchaseInput,
): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  if (!input.lines.length) return { ok: false, error: 'En az 1 ürün satırı eklenmeli' };
  for (const line of input.lines) {
    if (!line.item_name?.trim()) return { ok: false, error: 'Tüm satırlarda ürün adı zorunlu' };
    if (!line.quantity || line.quantity <= 0) return { ok: false, error: 'Tüm satırlarda miktar > 0 olmalı' };
    if (line.unit_price < 0) return { ok: false, error: 'Birim fiyat negatif olamaz' };
  }

  const { data, error } = await supabase.rpc('create_purchase_invoice', {
    p_lab_id: input.labId,
    p_supplier_id: input.supplierId,
    p_supplier_name: input.supplierName,
    p_invoice_number: input.invoiceNumber ?? null,
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate ?? null,
    p_currency: input.currency,
    p_vat_rate: input.vatRate,
    p_payment_method: input.paymentMethod ?? null,
    p_invoice_file_url: input.invoiceFileUrl ?? null,
    p_notes: input.notes ?? null,
    p_lines: input.lines,
    p_exchange_rate: input.exchangeRate ?? null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, invoiceId: data as string };
}

export async function listPurchaseInvoices(limit = 100): Promise<{ data: PurchaseInvoice[] | null; error: any }> {
  const { data, error } = await supabase
    .from('purchase_invoices')
    .select('*')
    .order('invoice_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data as PurchaseInvoice[] | null, error };
}

export async function getPurchaseInvoice(id: string): Promise<{ data: PurchaseInvoice | null; error: any }> {
  const { data, error } = await supabase.from('purchase_invoices').select('*').eq('id', id).single();
  return { data: data as PurchaseInvoice | null, error };
}

export interface PurchaseInvoiceLine {
  id: string;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit: string | null;
  unit_cost_at_time: number | null;
  note: string | null;
}

/** purchase_invoice_id'ye bağlı stock_movements (IN) — fatura kalemleri */
export async function getPurchaseInvoiceLines(
  purchaseInvoiceId: string,
): Promise<{ data: PurchaseInvoiceLine[] | null; error: any }> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('id, item_id, item_name, quantity, unit, unit_cost_at_time, note')
    .eq('purchase_invoice_id', purchaseInvoiceId)
    .eq('type', 'IN')
    .order('created_at', { ascending: true });
  return { data: data as PurchaseInvoiceLine[] | null, error };
}

/** Invoice number + supplier ile fatura UUID'sini bul (legacy fallback) */
export async function findPurchaseInvoiceByNumber(
  invoiceNumber: string,
  supplierId?: string | null,
): Promise<{ data: string | null; error: any }> {
  let q = supabase
    .from('purchase_invoices')
    .select('id')
    .eq('invoice_number', invoiceNumber)
    .limit(1);
  if (supplierId) q = q.eq('supplier_id', supplierId);
  const { data, error } = await q.maybeSingle();
  return { data: (data as any)?.id ?? null, error };
}

// ── Stok dışı fatura kalemleri (cihaz/demirbaş, hizmet, kargo) ──────────────

export type PurchaseExtraKind = 'equipment' | 'service' | 'shipping' | 'other';

export const PURCHASE_EXTRA_LABELS: Record<PurchaseExtraKind, string> = {
  equipment: 'Cihaz / Demirbaş',
  service:   'Hizmet / İşçilik',
  shipping:  'Kargo / Nakliye',
  other:     'Diğer',
};

export interface PurchaseInvoiceExtra {
  id: string;
  purchase_invoice_id: string;
  kind: PurchaseExtraKind;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  equipment_id: string | null;
  note: string | null;
  sort_order: number;
}

/**
 * Faturanın stok dışı satırları. Stok satırları stock_movements'ta kalır —
 * bu ikisi fatura görünümünde birleştirilir.
 */
export async function getPurchaseInvoiceExtras(
  purchaseInvoiceId: string,
): Promise<{ data: PurchaseInvoiceExtra[] | null; error: any }> {
  const { data, error } = await supabase
    .from('purchase_invoice_extras')
    .select('id, purchase_invoice_id, kind, description, quantity, unit, unit_price, equipment_id, note, sort_order')
    .eq('purchase_invoice_id', purchaseInvoiceId)
    .order('sort_order')
    .order('created_at');
  return { data: data as PurchaseInvoiceExtra[] | null, error };
}

export async function addPurchaseInvoiceExtra(input: {
  purchaseInvoiceId: string;
  kind: PurchaseExtraKind;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  equipmentId?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('purchase_invoice_extras').insert({
    purchase_invoice_id: input.purchaseInvoiceId,
    kind: input.kind,
    description: input.description.trim(),
    quantity: input.quantity,
    unit: input.unit ?? null,
    unit_price: input.unitPrice,
    equipment_id: input.equipmentId ?? null,
    note: input.note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePurchaseInvoiceExtra(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('purchase_invoice_extras').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Faturaya bağlanabilecek demirbaşlar — cihaz satırı eklerken seçilir */
export async function listEquipmentOptions(): Promise<{
  data: { id: string; name: string; brand: string | null; purchase_date: string | null }[];
}> {
  const { data } = await supabase
    .from('equipment')
    .select('id, name, brand, purchase_date')
    .order('name');
  return { data: (data ?? []) as any };
}

/** Arşivlenmiş fatura dosyasını açar.
 *
 *  `invoice_file_url` iki biçimde olabilir:
 *   • Storage YOLU  → bucket özel, açarken imzalanır (yeni kayıtlar).
 *   • Tam URL       → bucket özelleşmeden önce yazılmış eski kayıtlar.
 *  İki ekran (detay + önizleme) aynı mantığı kopyalamasın diye burada.
 *
 *  Hata mesajı döndürür (null = başarılı), çağıran tarafta gösterilebilsin.
 */
export async function openPurchaseInvoiceFile(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return 'Arşivlenmiş dosya yok.';
  const open = (u: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(u, '_blank');
    else Linking.openURL(u).catch(() => {});
  };
  if (/^https?:\/\//.test(ref)) { open(ref); return null; }
  const { data, error } = await supabase.storage
    .from('purchase-invoices')
    .createSignedUrl(ref, 300);
  if (error || !data?.signedUrl) return 'Dosya açılamadı: ' + (error?.message ?? 'imzalı bağlantı alınamadı');
  open(data.signedUrl);
  return null;
}
