import { useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { completeStep as apiCompleteStep } from '../api';

export function useCompleteStep() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const completeStep = async (stepId: string, notes?: string): Promise<boolean> => {
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    setLoading(true);
    setError(null);
    try {
      await apiCompleteStep(stepId, profile.id, notes);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { completeStep, loading, error };
}
