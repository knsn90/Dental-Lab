/**
 * Screen Recording — desktop web için getDisplayMedia tabanlı ekran kaydı.
 *
 * Kullanıcı "Ekran kaydı al" butonuna basar → tarayıcı paylaşım dialog'u açılır →
 * MediaRecorder webm formatında kaydeder → kayıt durdurulunca Blob döner.
 *
 * Bu Blob composer tarafından AttachmentUploader üzerinden support-attachments
 * bucket'ına yüklenir.
 */

export interface ActiveRecording {
  stop: () => Promise<Blob>;
  /** Kayıt başlangıç ts (UI'da süre göstermek için) */
  startedAt: number;
}

export function isScreenRecordingSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  // @ts-ignore — getDisplayMedia tipi her ortamda yok
  return !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';
}

export async function startScreenRecording(): Promise<ActiveRecording> {
  if (!isScreenRecordingSupported()) throw new Error('Bu tarayıcıda ekran kaydı desteklenmiyor.');

  // @ts-ignore
  const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 15 },
    audio: false,
  });

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(1000);

  // Kullanıcı paylaşımı browser üzerinden durdurursa stream sona erer — yine de kaydı durduralım
  stream.getVideoTracks()[0].addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop();
  });

  return {
    startedAt: Date.now(),
    stop: () => new Promise<Blob>((resolve) => {
      const finalize = () => {
        stream.getTracks().forEach(t => t.stop());
        resolve(new Blob(chunks, { type: mime }));
      };
      if (recorder.state === 'inactive') {
        finalize();
      } else {
        recorder.onstop = finalize;
        recorder.stop();
      }
    }),
  };
}
