declare module 'react-native-sqlite-storage' {
  export type ResultSet = {
    rows: {
      length: number;
      item(index: number): any;
    };
  };

  export type SQLiteDatabase = {
    executeSql(sql: string, params?: any[]): Promise<[ResultSet]>;
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
