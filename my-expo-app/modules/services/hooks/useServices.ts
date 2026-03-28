import { useState, useEffect } from 'react';
import { fetchAllLabServices } from '../api';
import { LabService } from '../types';

export function useServices() {
  const [services, setServices] = useState<LabService[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchAllLabServices();
    setServices((data as LabService[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return { services, loading, refetch: load };
}
