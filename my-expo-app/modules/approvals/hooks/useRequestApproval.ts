import { useRef, useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { requestApproval as apiRequest } from '../api';

export function useRequestApproval() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inFlight = useRef(false); // çift tıklama koruması — state'ten bağımsız kilit

  const request = async (workOrderId: string, stepName: string): Promise<boolean> => {
    if (inFlight.current) return false; // istek zaten uçuşta
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      await apiRequest(workOrderId, stepName, profile.id);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return { request, loading, error };
}
