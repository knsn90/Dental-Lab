/**
 * Resmi e-fatura PDF'ini aç (Luca'dan; `efatura-luca` action 'pdf').
 * Lab da klinik/hekim de kullanır — sunucu yetkiyi faturayı RLS ile görebilmeye bağlar.
 *
 * Web: sekme TIKLAMA ANINDA boş açılır (await'ten sonra window.open açılır-pencere
 * engelleyicisine takılır), PDF gelince oraya yüklenir; engellenirse indirilir.
 * Native: önbelleğe yazılır, paylaş sayfası açılır.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../core/api/supabase';
import { edgeErrorMessage } from '../../core/api/edgeError';

export async function openEFaturaPdf(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const win = Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
  const fail = (error: string) => { try { win?.close(); } catch { /* yok */ } return { ok: false, error }; };

  const { data, error } = await supabase.functions.invoke('efatura-luca', { body: { action: 'pdf', invoice_id: invoiceId } });
  if (error) return fail(await edgeErrorMessage(error, 'e-Fatura sunucusuna ulaşılamadı'));
  const b64 = typeof data?.pdf_base64 === 'string' ? data.pdf_base64 : '';
  if (data?.ok !== true || !b64) return fail(data?.error ?? 'e-Fatura PDF\'i alınamadı');
  const name = `${String(data.number || 'e-fatura').replace(/[^\w.-]+/g, '_')}.pdf`;

  if (Platform.OS === 'web') {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true };
    } catch (e: any) {
      return fail(e?.message ?? 'PDF açılamadı');
    }
  }

  try {
    const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
    const uri = dir + name;
    await FileSystem.writeAsStringAsync(uri, b64, { encoding: 'base64' as any });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'PDF açılamadı' };
  }
}
