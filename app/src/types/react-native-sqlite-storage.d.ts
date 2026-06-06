declare module 'react-native-sqlite-storage' {
  export type ResultSet = {
    rows: {
      length: number;
      item(index: number): unknown;
    };
  };

  export type SQLiteTransaction = {
    executeSql(sql: string, params?: unknown[]): void;
  };

  export type SQLiteDatabase = {
    executeSql(sql: string, params?: unknown[]): Promise<[ResultSet]>;
    transaction(fn: (tx: SQLiteTransaction) => void): Promise<void>;
  };

  export type SQLiteOpenDatabaseParams = {
    name: string;
    location?: string;
  };

  const SQLite: {
    enablePromise(enabled: boolean): void;
    openDatabase(params: SQLiteOpenDatabaseParams): Promise<SQLiteDatabase>;
  };

  export default SQLite;
}
