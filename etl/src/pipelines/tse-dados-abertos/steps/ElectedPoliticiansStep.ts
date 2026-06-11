import type Database from 'better-sqlite3';
import { PoliticianRepository } from '../../../repositories/PoliticianRepository';
import { PoliticianRole } from '../../../types/PoliticianRole';
import { TSECargo } from '../../../types/TSECargo';
import {
  TSEElectionResultStatus,
  tseElectionResultStatusFromValue,
  type TSEElectionResultStatusKey,
} from '../../../types/TSEElectionResultStatus';
import { normalizeCPF, isValidCPF } from '../../../util/cpf.util';
import { normalizeId } from '../../../util/normalization.util';
import type { TSECandidate } from '../../../types/TSECandidate';

export class ElectedPoliticiansStep {
  private readonly repo: PoliticianRepository;

  constructor(db: Database.Database) {
    this.repo = new PoliticianRepository(db);
  }

  run(candidates: TSECandidate[]): void {
    const elected = this.filterElected(candidates);
    console.log('ElectedPoliticiansStep.run - elected length:', elected.length);
    this.storePoliticians(elected);
  }

  private filterElected(candidates: TSECandidate[]): TSECandidate[] {
    const validCargos = [TSECargo.DEPUTADO_FEDERAL, TSECargo.SENADOR];
    const validStatuses = [
      TSEElectionResultStatus.ELEITO,
      TSEElectionResultStatus.ELEITO_POR_QP,
      TSEElectionResultStatus.ELEITO_POR_MEDIA,
      TSEElectionResultStatus.SUPLENTE,
    ];

    return candidates.filter(
      c =>
        (validCargos as string[]).includes(c.DS_CARGO) &&
        (validStatuses as string[]).includes(c.DS_SIT_TOT_TURNO),
    );
  }

  private storePoliticians(candidates: TSECandidate[]): void {
    const rows = candidates
      .filter(c => isValidCPF(c.NR_CPF_CANDIDATO))
      .map(c => ({
        cpf: normalizeCPF(c.NR_CPF_CANDIDATO),
        sourceApiId: null,
        name: c.NM_URNA_CANDIDATO,
        uf: c.SG_UF,
        partyId: normalizeId(c.SG_PARTIDO),
        role:
          c.DS_CARGO === (TSECargo.DEPUTADO_FEDERAL as string)
            ? PoliticianRole.DEPUTY
            : PoliticianRole.SENATOR,
        photoUrl: null,
        electedAs: tseElectionResultStatusFromValue(
          c.DS_SIT_TOT_TURNO,
        ) as TSEElectionResultStatusKey,
      }));

    this.repo.insertBatch(rows);
  }
}
