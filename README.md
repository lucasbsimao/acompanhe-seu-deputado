# Acompanhe Seu Deputado

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

A mobile app and ETL pipeline for tracking the spending, votes, and parliamentary activity of Brazilian federal deputies and senators.

## Structure

| Sub-project             | Path             | Stack                                |
| ----------------------- | ---------------- | ------------------------------------ |
| React Native mobile app | `app/`           | React Native 0.81                    |
| ETL pipeline            | `etl/`           | Node.js 20+, TypeScript              |
| Shared database         | `seed.db` (root) | SQLite — written by ETL, read by app |

## Getting Started

### Prerequisites

- Node.js >= 20
- React Native environment set up — see the [official guide](https://reactnative.dev/docs/set-up-your-environment)

### Mobile app (Android)

```sh
npm start          # start Metro bundler
npm run android    # build and run on Android emulator/device
```

### Mobile app (iOS)

```sh
bundle install             # first time only
bundle exec pod install    # after updating native deps
npm run ios
```

### ETL pipeline

```sh
cd etl
npm run build    # compile TypeScript
npm start        # run all pipelines
npm test         # build + run all tests
```

## Data Sources

- [Dados Abertos da Câmara](https://dadosabertos.camara.leg.br/) — deputies, expenses, parties
- [Dados Abertos do Senado](https://legis.senado.leg.br/dadosabertos) — senators
- [Portal da Transparência](https://portaldatransparencia.gov.br/) — parliamentary amendments
- [TSE Dados Abertos](https://dadosabertos.tse.jus.br/) — election results
- [Receita Federal](https://www.gov.br/receitafederal/) — CNPJ company data

## License

Copyright (C) 2025 Lucas Simão

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU Affero General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU Affero General Public License](LICENSE) for more details.
