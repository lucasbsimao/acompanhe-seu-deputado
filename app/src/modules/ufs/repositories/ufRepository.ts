import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import type { Uf } from '../domain/uf';

export class UfRepository {
  constructor(private db: SQLiteDatabase) {}

  async list(): Promise<Uf[]> {
    const [result] = await this.db.executeSql('SELECT uf, name FROM ufs ORDER BY uf');
    const rows: Uf[] = [];
    for (let i = 0; i < result.rows.length; i += 1) {
      rows.push(result.rows.item(i) as Uf);
    }
    return rows;
  }

  async getByUf(uf: string): Promise<Uf | null> {
    const [result] = await this.db.executeSql('SELECT uf, name FROM ufs WHERE uf = ?', [uf]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows.item(0) as Uf;
  }
}
