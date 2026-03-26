import { Migration } from '../migrations';

export const migration004: Migration = {
  version: '004',
  sql: `
    CREATE TABLE IF NOT EXISTS emendas_parlamentares (
      codigo_emenda    TEXT PRIMARY KEY,
      ano              INTEGER NOT NULL,
      tipo_emenda      TEXT,
      autor            TEXT,
      nome_autor       TEXT,
      numero_emenda    TEXT,
      localidade_gasto TEXT,
      funcao           TEXT,
      subfuncao        TEXT,
      valor_empenhado  TEXT,
      valor_liquidado  TEXT,
      valor_pago       TEXT,
      valor_resto_inscrito   TEXT,
      valor_resto_cancelado  TEXT,
      valor_resto_pago       TEXT
    );
  `,
};
