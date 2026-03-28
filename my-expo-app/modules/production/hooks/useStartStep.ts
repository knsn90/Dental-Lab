import { useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { startStep as apiStartStep } from '../api';

export function useStartStep() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const startStep = async (stepId: string): Promise<boolean> => {
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    setLoading(true);
    setError(null);
    try {
      await apiStartStep(stepId, profile.id);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { startStep, loading, error };
}
