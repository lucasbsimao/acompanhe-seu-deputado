// SPDX-License-Identifier: AGPL-3.0-or-later

import * as assert from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import nock from 'nock';
import { PoliticianLookupService } from '../../src/services/PoliticianLookupService';
import { HttpClient } from '../../src/core/HttpClient';
import { PoliticianRole } from '../../src/types/PoliticianRole';

describe('PoliticianLookupService', () => {
  let politicianRepoMock: any;
  let service: PoliticianLookupService;
  let httpClient: HttpClient;

  beforeEach(() => {
    politicianRepoMock = {
      getAllForLookup: () => [
        { name: 'Senator Name', uf: 'SP', role: PoliticianRole.SENATOR, cpf: '12345678901' },
        { name: 'Senator Name', uf: 'RJ', role: PoliticianRole.SENATOR, cpf: '98765432100' },
      ],
    };
    service = new PoliticianLookupService(politicianRepoMock as any);
    httpClient = new HttpClient({
      maxRetries: 3,
      retryWaitMin: 100,
      retryWaitMax: 1000,
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should pick the UF from the mandate with the highest CodigoMandato', async () => {
    const code = '5672';

    // Mock senator detail
    nock('https://legis.senado.leg.br')
      .get(`/dadosabertos/senador/${code}`)
      .reply(200, {
        DetalheParlamentar: {
          Parlamentar: {
            IdentificacaoParlamentar: {
              NomeCompletoParlamentar: 'Senator Name',
              NomeParlamentar: 'Senator Name',
            },
          },
        },
      });

    // Mock mandates with multiple entries
    nock('https://legis.senado.leg.br')
      .get(`/dadosabertos/senador/${code}/mandatos`)
      .reply(200, {
        MandatoParlamentar: {
          Parlamentar: {
            Codigo: code,
            Mandatos: {
              Mandato: [
                { CodigoMandato: '10', UfParlamentar: 'SP' },
                { CodigoMandato: '20', UfParlamentar: 'RJ' }, // Higher code
                { CodigoMandato: '5', UfParlamentar: 'MG' },
              ],
            },
          },
        },
      });

    const result = await service.findCpfBySenatorCode(code, httpClient);

    assert.ok(result);
    assert.strictEqual(result.uf, 'RJ', 'Should pick UF from mandate 20');
    assert.strictEqual(result.cpf, '98765432100', 'Should pick CPF corresponding to RJ');
  });

  it('should handle numeric string comparison correctly', async () => {
    const code = '5672';

    nock('https://legis.senado.leg.br')
      .get(`/dadosabertos/senador/${code}`)
      .reply(200, {
        DetalheParlamentar: {
          Parlamentar: {
            IdentificacaoParlamentar: {
              NomeCompletoParlamentar: 'Senator Name',
              NomeParlamentar: 'Senator Name',
            },
          },
        },
      });

    nock('https://legis.senado.leg.br')
      .get(`/dadosabertos/senador/${code}/mandatos`)
      .reply(200, {
        MandatoParlamentar: {
          Parlamentar: {
            Codigo: code,
            Mandatos: {
              Mandato: [
                { CodigoMandato: '9', UfParlamentar: 'SP' },
                { CodigoMandato: '11', UfParlamentar: 'RJ' }, // 11 > 9
              ],
            },
          },
        },
      });

    const result = await service.findCpfBySenatorCode(code, httpClient);

    assert.ok(result);
    assert.strictEqual(result.uf, 'RJ', 'Should pick UF from mandate 11 (numeric comparison)');
  });
});
