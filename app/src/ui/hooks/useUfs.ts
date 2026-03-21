import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../../shared/db/DbProvider';
import { UfService } from '../../modules/ufs/services/ufService';
import { UfRepository } from '../../modules/ufs/repositories/ufRepository';
import type { Uf } from '../../modules/ufs/domain/uf';

export function useUfs() {
  const { db, initializing, error: dbError } = useDb();
  const [ufs, setUfs] = useState<Uf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => {
    if (!db) return null;
    return new UfService(new UfRepository(db));
  }, [db]);

  useEffect(() => {
    if (initializing) {
      setLoading(true);
      return;
    }
    if (dbError) {
      setLoading(false);
      setError(dbError.message);
      return;
    }
    if (!service) {
      return;
    }

    let isActive = true;
    setLoading(true);
    service
      .list()
      .then((data: Uf[]) => {
        if (isActive) {
          setUfs(data);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (isActive) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [dbError, initializing, service]);

  return { ufs, loading, error };
}
