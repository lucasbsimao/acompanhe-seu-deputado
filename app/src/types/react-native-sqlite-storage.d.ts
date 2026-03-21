declare module 'react-native-sqlite-storage' {
  export type ResultSet = {
    rows: {
      length: number;
      item(index: number): any;
    };
  };

  export type SQLiteTransaction = {
    executeSql(sql: string, params?: any[]): void;
  };

  export type SQLiteDatabase = {
    executeSql(sql: string, params?: any[]): Promise<[ResultSet]>;
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
