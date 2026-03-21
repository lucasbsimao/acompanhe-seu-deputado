import type { SQLiteDatabase } from '../../../db/setup';

export class PoliticianTestRepository {
  constructor(private db: SQLiteDatabase) {}

  async deleteAll(): Promise<void> {
    try {
      await this.db.executeSql('DELETE FROM politicians');
      await this.db.executeSql('DELETE FROM parties');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Database is closed')) {
        return;
      }
      throw error;
    }
  }
}
