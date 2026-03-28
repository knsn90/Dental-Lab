import { useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { approveApproval as apiApprove, rejectApproval as apiReject } from '../api';

export function useApprove() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const approve = async (approvalId: string): Promise<boolean> => {
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    setLoading(true);
    setError(null);
    try {
      await apiApprove(approvalId, profile.id, profile.user_type);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reject = async (approvalId: string, reason: string): Promise<boolean> => {
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    setLoading(true);
    setError(null);
    try {
      await apiReject(approvalId, profile.id, profile.user_type, reason);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { approve, reject, loading, error };
}
