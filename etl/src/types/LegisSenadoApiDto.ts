// SPDX-License-Identifier: AGPL-3.0-or-later

export interface SenadorDetailResponse {
  DetalheParlamentar: {
    Parlamentar: {
      IdentificacaoParlamentar: {
        CodigoParlamentar: string;
        NomeParlamentar: string;
        NomeCompletoParlamentar: string;
        SiglaPartidoParlamentar: string;
      };
      DadosBasicosParlamentar: {
        DataNascimento: string;
        Naturalidade: string;
        UfNaturalidade: string;
      };
    };
  };
}

export interface MandatoItem {
  CodigoMandato: string;
  UfParlamentar: string;
}

export interface SenadorMandatosResponse {
  MandatoParlamentar: {
    Parlamentar: {
      Codigo: string;
      Nome: string;
      Mandatos: {
        Mandato: MandatoItem | MandatoItem[];
      };
    };
  };
}
