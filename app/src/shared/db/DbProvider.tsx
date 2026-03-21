import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { openDb } from './openDb';
import { runMigrations } from './migrate';

type DbState = {
  db: SQLiteDatabase | null;
  initializing: boolean;
  error: Error | null;
};

const DbContext = createContext<DbState>({
  db: null,
  initializing: true,
  error: null,
});

export function DbProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DbState>({
    db: null,
    initializing: true,
    error: null,
  });

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const db = await openDb();
        await runMigrations(db);
        if (isActive) {
          setState({ db, initializing: false, error: null });
        }
      } catch (error) {
        if (isActive) {
          setState({ db: null, initializing: false, error: error as Error });
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbState {
  return useContext(DbContext);
}
