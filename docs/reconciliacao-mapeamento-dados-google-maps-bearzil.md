# Documento de Reconciliação — mapscrape-v2: Dados Google Maps Bearzil

## 1. Estado Inicial e Final do Git

### Estado Inicial
- **Branch:** `main`
- **Commit atual:** f5a81e3f5a147a7d6a8d08750f48677d74fbcdda
- **Mensagem do commit:** "docs: mapear dados, ícones e controles da ficha Google Maps"
- **Status:** Branch estava 'up to date with 'origin/main''

### Estado Final (após correções)
- **Branch:** `main` (commited)
- **Commits novos:** 
  - "feat: add booking_url field to PlaceRecord and extractor"
- **Arquivos modificados:**
  - src/shared/types.ts — adicionado `booking_url?: string` ao `PlaceRecord`
  - src/server/db.ts — adicionada coluna `booking_url TEXT DEFAULT ''` à tabela `places`; atualizado `insertPlace()` para incluir o novo campo
  - src/server/scraper/extractor.ts — lógica de extração de "Agendar on-line"/"Book online" links adicionada
- **Arquivos novos:**
  - docs/mapeamento-verificado-firecrawl-bearzil.md — mapeamento verificado com evidências
  - docs/matriz-cobertura-firecrawl-implantacao.md — matriz de cobertura 30×4

## 2. Evidências Coletas pelo Firecrawl e Limitações

### URL da Ficha Mapeada
https://www.google.com/maps/place/Barbearia+Bearzil+Barber+Shop+Jardins+-+Barbearia+por+Assinatura+SP/@-23.5744293,-46.6592389,17z/data=!4m7!3m6!1s0x94ce59e8ef43b0db:0x50225dda5a2046ee!8m2!3d-23.5744293!4d-46.6592389!10e1!16s%2Fg%2F11g0455p73

### Dados Extraídos com Sucesso
- name, category, address, phone, website, rating 4.9, review_count 278, plus_code, status "Closed · Opens 10 AM Tue", booking_url, attributes ["LGBTQ+ friendly", "Identifies as women-owned"], accessibility ["Wheelchair accessible entrance", "Wheelchair accessible parking lot"], 187 fotos visíveis, 3 highlights de avaliação, tópicos (environment:45, punctuality:17, polite barber:3, monthly plan:2)

### Campos Inacessíveis
- opening_hours (tabela semanal completa) — Google Maps view limited notice
- popular_times — não disponível sem expansão da seção de horários
- logo_url (logo separado das fotos de reviewer)
- thumbnail_url — miniatura não extraída
- rating_distribution — campo novo, não existente no schema
- Todas as 278 avaliações — apenas 3 visíveis na view limitada

O agente Firecrawl explicitamente anotou: "Google Maps displayed a limited-view notice; no opening-hours schedule or prices were exposed beyond the visible status line."

## 3. Referências

1. docs/mapeamento-detalhado-ficha-google-maps-bearzil.md — mapeamento inicial
2. docs/mapeamento-verificado-firecrawl-bearzil.md — mapeamento verificado com evidências
3. docs/matriz-cobertura-firecrawl-implantacao.md — matriz de cobertura 30×4

## 4. Alterações no Código

### src/shared/types.ts
- +1 linha: `booking_url?: string;` no `PlaceRecord`

### src/server/db.ts
- +1 linha: `booking_url TEXT DEFAULT ''` na CREATE TABLE
- +1 linha: `place.booking_url || ''` nos args do INSERT OR REPLACE

### src/server/scraper/extractor.ts
- +17 linhas: lógica de extração de bookingUrl (captura links "Agendar on-line"/"Book online"/"reserve")
- +1 linha: `bookingUrl` no retorno raw do page.evaluate
- +1 linha: `booking_url: cleanText(raw.bookingUrl)` no retorno final

## 5. Resultados dos Testes

- TypeScript compilation: passou para os arquivos modificados
- Tipos de erro pre-existentes: 7 erros em runner.ts e tests/db.test.ts (não relacionados)
- git diff --check: sem erros de whitespace

## 6. Campos Pendentes / Limitações

- opening_hours — inacessível (Google Maps view limited)
- popular_times — inacessível
- logo_url — inacessível (não distinguir de fotos de reviewer)
- thumbnail_url — inacessível
- rating_distribution — ausente no schema (campo novo)
- Todas as 278 avaliações — apenas 3 visíveis (limite da interface)

## 7. Execução Realizada

- Fase 1: Reconciliado repositório local (branch main, confirmado com origin/main)
- Fase 2: Mapeamento Firecrawl executado — dados extraídos + limitações identificadas
- Fase 3: Matriz de cobertura produzida (30 campos analisados)
- Fase 4: Correções implementadas (booking_url field em types, db, extractor)
- Fase 5: Documentação de reconciliação criada
- Fase 6: TypeScript validado, commit em main, git fetch origin executado