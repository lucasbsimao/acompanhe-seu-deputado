import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import type { Politician } from '../domain/politician';

export class PoliticianRepository {
  constructor(private db: SQLiteDatabase) {}

  async insertBatch(politicians: Politician[]): Promise<void> {
    const distinctPartyIds = [...new Set(politicians.map(p => p.partyId))];

    const [existingPartiesResult] = await this.db.executeSql(
      `SELECT id FROM parties WHERE id IN (${distinctPartyIds.map(() => '?').join(',')})`,
      distinctPartyIds
    );

    const existingPartyIds = new Set<string>();
    for (let i = 0; i < existingPartiesResult.rows.length; i += 1) {
      existingPartyIds.add(existingPartiesResult.rows.item(i).id as string);
    }

    const newPartyIds = distinctPartyIds.filter(id => !existingPartyIds.has(id));

    await this.db.transaction(tx => {
      for (const partyId of newPartyIds) {
        tx.executeSql(
          'INSERT INTO parties (id, name, acronym) VALUES (?, ?, ?)',
          [partyId, partyId, partyId]
        );
      }

      for (const p of politicians) {
        tx.executeSql(
          'INSERT INTO politicians (id, name, uf, party_id, role, photo_url) VALUES (?, ?, ?, ?, ?, ?)',
          [p.id, p.name, p.uf, p.partyId, p.role, p.photoUrl ?? null]
        );
      }
    });
  }

  async findAllIds(): Promise<string[]> {
    const [result] = await this.db.executeSql('SELECT id FROM politicians ORDER BY id');
    const ids: string[] = [];
    for (let i = 0; i < result.rows.length; i += 1) {
      ids.push(result.rows.item(i).id as string);
    }
    return ids;
  }
}
