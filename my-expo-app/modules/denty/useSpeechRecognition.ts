/**
 * useSpeechRecognition — gerçek ses tanıma (Web Speech API).
 *
 * Yalnızca WEB/PWA'da çalışır (Chrome/Edge/Android Chrome). iOS Safari kısıtlı;
 * desteklenmiyorsa `supported=false` döner. Native (telefon derlemesi) için ek
 * modül gerekir — orada `supported=false`.
 *
 * Mikrofon izni recognition.start() ile tarayıcı tarafından istenir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type SR = any;

function getSR(): SR | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export interface UseSpeechRecognition {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(opts?: {
  lang?: string;
  onFinal?: (text: string) => void;
  onNoInput?: () => void;
}): UseSpeechRecognition {
  const SRClass = getSR();
  const supported = !!SRClass;
  const recRef = useRef<SR | null>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const onFinalRef = useRef(opts?.onFinal);
  const onNoInputRef = useRef(opts?.onNoInput);
  onFinalRef.current = opts?.onFinal;
  onNoInputRef.current = opts?.onNoInput;

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Zamanlayıcılar: sessizlik (konuşma bitince otomatik gönder) + max süre.
  const silenceTimer = useRef<any>(null);
  const maxTimer = useRef<any>(null);
  const SILENCE_MS = 1800; // son kelimeden bu kadar sonra sessizlik → bitir
  const MAX_MS = 9000;     // hiç konuşulmazsa / çok uzunsa kes

  const clearTimers = useCallback(() => {
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }
    if (maxTimer.current) { clearTimeout(maxTimer.current); maxTimer.current = null; }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    try { recRef.current?.stop(); } catch { /* */ }
  }, [clearTimers]);

  const reset = useCallback(() => {
    finalRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setError(null);
  }, []);

  const start = useCallback(() => {
    if (!SRClass) { setError('unsupported'); return; }
    clearTimers();
    try { recRef.current?.abort(); } catch { /* */ }
    finalRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setError(null);

    const rec: SR = new SRClass();
    rec.lang = opts?.lang ?? 'tr-TR';
    rec.interimResults = true;
    rec.continuous = true;     // erken kesilmeyi engelle — cümle boyunca dinle
    rec.maxAlternatives = 1;

    const armSilence = () => {
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      silenceTimer.current = setTimeout(() => {
        try { rec.stop(); } catch { /* */ }  // konuşma bitti → finalize → onend
      }, SILENCE_MS);
    };

    rec.onresult = (e: any) => {
      // ilk ses geldi → max timer'ı bırak, sessizlik sayacını başlat
      if (maxTimer.current) { clearTimeout(maxTimer.current); maxTimer.current = null; }
      let interim = '';
      let final = '';
      for (let idx = e.resultIndex; idx < e.results.length; idx++) {
        const r = e.results[idx];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) finalRef.current += final;
      interimRef.current = interim;
      setTranscript((finalRef.current + interim).trim());
      armSilence();
    };
    rec.onerror = (e: any) => {
      if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') setError(e.error);
    };
    rec.onend = () => {
      clearTimers();
      setListening(false);
      const text = (finalRef.current.trim() || interimRef.current.trim());
      if (text) onFinalRef.current?.(text);
      else onNoInputRef.current?.();
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
      // hiç sonuç gelmezse koruma
      maxTimer.current = setTimeout(() => { try { rec.stop(); } catch { /* */ } }, MAX_MS);
    } catch (e: any) {
      setError(e?.message || 'start-failed');
      setListening(false);
    }
  }, [SRClass, opts?.lang, clearTimers]);

  // Temizlik
  useEffect(() => () => { clearTimers(); try { recRef.current?.abort(); } catch { /* */ } }, [clearTimers]);

  return { supported, listening, transcript, error, start, stop, reset };
}
