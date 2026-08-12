import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type FounderAvailability = {
  founders_taken: number;
  founders_max: number;
  founders_remaining: number;
  founder_open: boolean;
};

const DEFAULT_AVAILABILITY: FounderAvailability = {
  founders_taken: 0,
  founders_max: 500,
  founders_remaining: 500,
  founder_open: true,
};

export function useFounderAvailability() {
  const [availability, setAvailability] =
    useState<FounderAvailability>(DEFAULT_AVAILABILITY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_founder_availability');
    if (error || !data || typeof data !== 'object') {
      setAvailability(DEFAULT_AVAILABILITY);
      setLoading(false);
      return;
    }
    const d = data as Record<string, unknown>;
    const max =
      typeof d.founders_max === 'number' ? d.founders_max : 500;
    const remaining =
      typeof d.founders_remaining === 'number' ? d.founders_remaining : max;
    const taken =
      typeof d.founders_taken === 'number' ? d.founders_taken : max - remaining;
    setAvailability({
      founders_max: max,
      founders_remaining: remaining,
      founders_taken: taken,
      founder_open: d.founder_open === true || remaining > 0,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { availability, loading, refresh };
}
