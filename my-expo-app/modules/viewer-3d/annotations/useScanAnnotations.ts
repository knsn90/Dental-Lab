/**
 * useScanAnnotations — notların yükleme + iyimser mutasyon kabuğu.
 *
 * Web (ThreeScene) ve native (WebView köprüsü) AYNI hook'u kullanır: nokta
 * verisi ve yetki kuralları tek yerde kalsın.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addScanAnnotation, deleteScanAnnotation, fetchScanAnnotations, updateScanAnnotation,
} from './api';
import type { NewScanAnnotation, ScanAnnotation } from './types';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';

export interface ScanAnnotationsApi {
  annotations: ScanAnnotation[];
  loading: boolean;
  /** Notlar katmanı görünür mü (katman panelindeki satır) */
  visible: boolean;
  setVisible: (v: boolean) => void;
  add: (input: Omit<NewScanAnnotation, 'orderId'>) => Promise<ScanAnnotation | null>;
  remove: (id: string) => Promise<void>;
  editText: (id: string, text: string) => Promise<void>;
  reload: () => void;
  /** orderId yoksa özellik kapalıdır (viewer sipariş dışından açılmış) */
  enabled: boolean;
}

export function useScanAnnotations(orderId?: string | null, active = true): ScanAnnotationsApi {
  const enabled = !!orderId && active;
  const [annotations, setAnnotations] = useState<ScanAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [tick, setTick] = useState(0);
  // Kapanmış viewer'ın geç gelen yanıtı state'i geri getirmesin
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  useEffect(() => {
    if (!enabled) { setAnnotations([]); return; }
    let cancelled = false;
    setLoading(true);
    fetchScanAnnotations(orderId!)
      .then((rows) => { if (!cancelled) setAnnotations(rows); })
      .catch((e) => { console.warn('[scan-annotations] load', e?.message ?? e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  const add = useCallback<ScanAnnotationsApi['add']>(async (input) => {
    if (!orderId) return null;
    // İYİMSER: çizim parmağı kaldırınca ANINDA kalıcı nesneye dönüşmeli.
    // Önce RPC beklenip sonra eklendiğinde önizleme silinip yeni nesne
    // gelene kadar (~300 ms) çizim ekrandan kayboluyordu → "yavaş/takılıyor".
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const row: ScanAnnotation = {
      id: tempId,
      workOrderId: orderId,
      fileName: input.fileName ?? null,
      kind: input.kind,
      color: input.color ?? '#DC2626',
      width: input.width ?? 0.35,
      points: input.points,
      text: input.text ?? null,
      camera: input.camera ?? null,
      authorId: null,
      authorName: null,
      authorSide: 'clinic',
      createdAt: new Date().toISOString(),
    };
    if (aliveRef.current) setAnnotations((prev) => [...prev, row]);
    try {
      const id = await addScanAnnotation({ ...input, orderId });
      if (aliveRef.current) {
        setAnnotations((prev) => prev.map((a) => (a.id === tempId ? { ...a, id } : a)));
      }
      return { ...row, id };
    } catch (e: any) {
      // Kaydedilemeyen çizimi ekranda BIRAKMA: kullanıcı kaydedildi sanır.
      if (aliveRef.current) setAnnotations((prev) => prev.filter((a) => a.id !== tempId));
      toast.error(e?.message ?? autoT('Not kaydedilemedi'));
      return null;
    }
  }, [orderId]);

  const remove = useCallback(async (id: string) => {
    const prev = annotations;
    setAnnotations((list) => list.filter((a) => a.id !== id));
    try {
      await deleteScanAnnotation(id);
    } catch (e: any) {
      setAnnotations(prev); // geri al
      toast.error(e?.message ?? autoT('Not silinemedi'));
    }
  }, [annotations]);

  const editText = useCallback(async (id: string, text: string) => {
    const prev = annotations;
    setAnnotations((list) => list.map((a) => (a.id === id ? { ...a, text } : a)));
    try {
      await updateScanAnnotation(id, { text });
    } catch (e: any) {
      setAnnotations(prev);
      toast.error(e?.message ?? autoT('Not güncellenemedi'));
    }
  }, [annotations]);

  return { annotations, loading, visible, setVisible, add, remove, editText, reload, enabled };
}
