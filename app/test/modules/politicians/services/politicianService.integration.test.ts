import { PoliticianService } from '../../../../src/modules/politicians/services/politicianService';
import { PoliticianRepository } from '../../../../src/modules/politicians/repositories/politicianRepository';
import type { Politician } from '../../../../src/modules/politicians/domain/politician';
import { useTestDatabase } from '../../../db/setup';
import { PoliticianTestRepository } from '../repositories/politicianTestRepository';

describe('PoliticianService Integration Tests', () => {
  const { getDb } = useTestDatabase();
  let service: PoliticianService;
  let repository: PoliticianRepository;
  let testRepository: PoliticianTestRepository;


  beforeEach(() => {
    repository = new PoliticianRepository(getDb().db);
    service = new PoliticianService(repository);
    testRepository = new PoliticianTestRepository(getDb().db);
  });

  afterEach(async () => {
    await testRepository.deleteAll();
  });

  describe('insertBatch', () => {
    it('should insert a single politician successfully', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: 'https://example.com/photo.jpg',
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toContain('dep-001');
      expect(ids.length).toBe(1);
    });

    it('should insert multiple politicians in a single batch', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: 'https://example.com/photo1.jpg',
        },
        {
          id: 'dep-002',
          name: 'Maria Santos',
          uf: 'RJ',
          partyId: 'PSDB',
          role: 'DEPUTY',
          photoUrl: 'https://example.com/photo2.jpg',
        },
        {
          id: 'dep-003',
          name: 'Carlos Oliveira',
          uf: 'MG',
          partyId: 'PL',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('dep-001');
      expect(ids).toContain('dep-002');
      expect(ids).toContain('dep-003');
    });

    it('should insert a large batch of politicians (> 100)', async () => {
      const politicians: Politician[] = Array.from({ length: 250 }, (_, i) => ({
        id: `dep-${String(i + 1).padStart(4, '0')}`,
        name: `Politician ${i + 1}`,
        uf: ['SP', 'RJ', 'MG', 'BA', 'RS'][i % 5] as string,
        partyId: ['PT', 'PSDB', 'PL', 'MDB', 'PDT'][i % 5] as string,
        role: 'DEPUTY',
        photoUrl: i % 3 === 0 ? null : `https://example.com/photo${i}.jpg`,
      }));

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(250);
    });

    it('should handle politicians with null photoUrl', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toContain('dep-001');
    });

    it('should handle multiple parties correctly', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
        {
          id: 'dep-002',
          name: 'Maria Santos',
          uf: 'RJ',
          partyId: 'PSDB',
          role: 'DEPUTY',
          photoUrl: null,
        },
        {
          id: 'dep-003',
          name: 'Carlos Oliveira',
          uf: 'MG',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(3);
    });

    it('should throw error when inserting with invalid data', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'XX',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await expect(service.insertBatch(politicians)).rejects.toThrow();
    });

    it('should handle empty batch gracefully', async () => {
      const politicians: Politician[] = [];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(0);
    });

    it('should reuse existing parties when inserting new politicians', async () => {
      const firstBatch: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      const secondBatch: Politician[] = [
        {
          id: 'dep-002',
          name: 'Maria Santos',
          uf: 'RJ',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(firstBatch);
      await service.insertBatch(secondBatch);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(2);
    });
  });

  describe('getAllIds', () => {
    it('should return empty array when no politicians exist', async () => {
      const ids = await service.getAllIds();
      expect(ids).toEqual([]);
    });

    it('should return all politician IDs in order', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-003',
          name: 'Carlos',
          uf: 'MG',
          partyId: 'PL',
          role: 'DEPUTY',
          photoUrl: null,
        },
        {
          id: 'dep-001',
          name: 'João',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
        {
          id: 'dep-002',
          name: 'Maria',
          uf: 'RJ',
          partyId: 'PSDB',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toEqual(['dep-001', 'dep-002', 'dep-003']);
    });

    it('should return correct count of politicians', async () => {
      const politicians: Politician[] = Array.from({ length: 50 }, (_, i) => ({
        id: `dep-${String(i + 1).padStart(4, '0')}`,
        name: `Politician ${i + 1}`,
        uf: 'SP',
        partyId: 'PT',
        role: 'DEPUTY',
        photoUrl: null,
      }));

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(50);
    });

    it('should return IDs after multiple insertions', async () => {
      const batch1: Politician[] = [
        {
          id: 'dep-001',
          name: 'João',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      const batch2: Politician[] = [
        {
          id: 'dep-002',
          name: 'Maria',
          uf: 'RJ',
          partyId: 'PSDB',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(batch1);
      let ids = await service.getAllIds();
      expect(ids).toHaveLength(1);

      await service.insertBatch(batch2);
      ids = await service.getAllIds();
      expect(ids).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should throw error with descriptive message on insertion failure', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'INVALID',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      try {
        await service.insertBatch(politicians);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to insert politicians');
      }
    });

    it('should throw error with descriptive message on retrieval failure', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: 'João Silva',
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      getDb().close();

      try {
        await service.getAllIds();
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to retrieve politician IDs');
      }
    });
  });

  describe('Data Integrity', () => {
    it('should handle special characters in names', async () => {
      const politicians: Politician[] = [
        {
          id: 'dep-001',
          name: "João da Silva O'Brien",
          uf: 'SP',
          partyId: 'PT',
          role: 'DEPUTY',
          photoUrl: null,
        },
        {
          id: 'dep-002',
          name: 'José "Zé" Santos',
          uf: 'RJ',
          partyId: 'PSDB',
          role: 'DEPUTY',
          photoUrl: null,
        },
      ];

      await service.insertBatch(politicians);

      const ids = await service.getAllIds();
      expect(ids).toHaveLength(2);
    });
  });
});
