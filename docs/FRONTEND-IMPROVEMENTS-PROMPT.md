# MapScrape v2 — Prompt de Implementação Frontend

**Agentes responsáveis:** `@frontend/frontend-coordinator` e `@design/design-coordinator`  
**Objetivo:** Melhorar as páginas existentes do MapScrape v2, sem redesenho geral. Priorizar simplicidade, legibilidade e consistência visual. Usar contratos reais da API.

---

## Regras Gerais (OBRIGATÓRIAS)

1. **Trabalhe sobre as páginas existentes**, sem duplicar telas ou menus. Ajustar layouts e estados já existentes.
2. **Priorizar simplicidade, legibilidade e consistência visual.** Usar a paleta zinc/emerald definida nos componentes atuais.
3. **Melhorar primeiro Resultados e Diretório**, seguidos por Histórico, Exportação e Logs. Esta é a ordem de prioridade fixa.
4. **Usar os contratos reais da API** — consultar `docs/API.md` e `docs/openapi.yaml` antes de solicitar mudanças de backend.
5. **Preservar resultados da rodada atual separados do histórico persistido.** O estado da coleta em andamento não deve se misturar com o histórico de coletas concluídas/no banco.
6. **Implementar projetos, categorias e exclusão** conforme o modelo real de persistência (jobs + places no SQLite). Não simular persistência.
7. **Evitar dados fictícios, progresso inventado e funcionalidades apenas visuais.** Todo dado deve vir da API ou estado local comprovado.
8. **Testar fluxos pela interface e pelas APIs.** Validar que estados de loading, vazio, erro e conclusão funcionam corretamente.
9. **Preservar alterações concorrentes** e trabalhar na branch `main`. Não usar force-push nem descartar alterações locais sem avaliar.
10. **Corrigir falhas encontradas** em vez de encerrar com auditoria ou planejamento. Reportar o que foi consertado.

---

## Critérios de Aceite Verificáveis por Página

### ✅ Resultados (ResultsScreen) — PRIMEIRA PRIORIDADE

**O que deve funcionar:**

- [ ] Lista de estabelecimentos renderiza corretamente em modo **Cards** e modo **Tabela**
- [ ] Filtro de busca textual funciona (nome, categoria, endereço, telefone, website)
- [ ] Seletor de job filtra places pelo job_id correto
- [ ] Mudança de view mode (cards ⇄ tabela) persiste estado e re-renderiza
- [ ] Paginação (Anterior/Próxima) navega corretamente entre pages
- [ ] Contadores totais exibidos no header correspondem ao `totalPlaces`
- [ ] Campo `booking_url` está disponível para exibição ou logged quando presente
- [ ] Campo `plus_code` está disponível quando presente
- [ ] Seleção individual/coletiva de estabelecimentos atualiza `selectedPlaceIds`
- [ ] Botão "Exportar Selecionados" está visível quando `selectedPlaceIds.size > 0`
- [ ] Modal de detalhes completos abre ao clicar em "Ver detalhes" ou no card
- [ ] Modal contém todos os fields de `detailFields` (39 fields definidas no componente)
- [ ] Estados de loading, vazio, erro são tratados e exibidos corretamente
- [ ] Cobertura de campos (`field-coverage`) busca da API e exibe percentuais por field

**Limitações reais a reportar:**

- O campo `booking_url` pode estar vazio para muitos registros (dados não coletados nessa rodada)
- A modal de detalhes tem 39 fields; em telas estreitas algumas podem ser cortadas
- A tabela mode não quebra bem em < 360px sem overflow horizontal
- O campo `services_attributes` é exibido como JSON string; non-JSON content aparece como texto

---

### ✅ Diretório (Directory — integrada ao ResultsScreen/History) — SEGUNDA PRIORIDADE

**O que deve funcionar:**

- [ ] Filtrar places por job selecionado no dropdown `selectedJobId`
- [ ] Alternar entre jobs mostra os places respectivos do banco
- [ ] Exportar CSV escopo `current_job` usa o job selecionado
- [ ] Exportar CSV escopo `all` traz todos os records do SQLite (sem filtro de job)
- [ ] Exportar CSV escopo `selected` usa `selectedPlaceIds` (apenas da página atual)
- [ ] Campo `booking_url` está disponível nos fields de exportação (via `EXPORTABLE_FIELDS`)
- [ ] Proteção CSV Injection já está implementada (aspas simples + cabeçalho UTF-8 BOM)
- [ ] Excluir job da HistoryScreen remove job + places associados do banco
- [ ] Badge `totalPlaces` no Sidebar reflete o total de records em todos os jobs ativos

**Limitações reais a reportar:**

- Não existe seletor visual de categoria (como o da SearchScreen); apenas busca textual
- `selectedPlaceIds` refere-se apenas à página atual; exportar "selected" de todas as páginas requer coleta adicional
- O campo `plus_code` não é exibido em nenhuma tela de resultados (apenas no banco/export)
- Não há mecanismo de "mover" um place de um job para outro (would need novo endpoint)

---

### 🔄 Histórico (HistoryScreen) — TERCEIRA PRIORIDADE

**O que deve funcionar:**

- [ ] Lista de jobs exibe `segment`, `location`, `total_collected`, `status`, `created_at`
- [ ] Badge de status tem cor correta conforme estado (green=completed, amber=pulsing=running, etc.)
- [ ] Botão "Ver Resultados" navega para ResultsScreen com o job correto
- [ ] Botão "Exportar CSV" navega para ExportScreen com escopo `current_job`
- [ ] Exclusão de job confirma e remove do banco (job + places)
- [ ] Job "partial" tem badge distinto de "Falha" (ambos usam amber hoje; pode precisar de diferenciamento)
- [ ] Ao excluir, a lista atualiza sem recarregar a página (uso de mutateAsync ou efeito colateral)

**Limitações reais a reportar:**

- Não há paginação; se houver muitos jobs, a lista pode ficar longa
- O campo `booking_url` não é exibido na lista de jobs (apenas segment/location/métricas)
- Não há política de retenção/limpeza automática de jobs antigos
- O estado "partial" visualmente parece o mesmo que "erro" para alguns usuários

---

### 📤 Exportação (ExportScreen) — QUARTA PRIORIDADE

**O que deve funcionar:**

- [ ] Step 1: Escopo (selected/current_job/all) radio buttons funcionam e badge reflete escolha
- [ ] Step 2: Checkboxes de camposEXPORTABLE_FIELDS selecionam/deselecionam colunas
- [ ] Step 2: Contador "X de Y campos selecionados" atualiza em tempo real
- [ ] Step 3: Input de nome do arquivo é editável e afeta o filename do download
- [ ] Step 3: Botão "Baixar Arquivo CSV" dispara fetch `/api/export/csv` e começa download
- [ ] Step 3: Durante exportação, botão mostra spinner "Gerando arquivo CSV..."
- [ ] Step 4: Preview das primeiras 3 places reflete os campos selecionados
- [ ] Step 4: Preview usa `font-mono` e truncate para celular
- [ ] Proteção CSV Injection: células que começam com `=`, `+`, `-`, `@` são neutralizadas com aspas simples
- [ ] Cabeçalho UTF-8 BOM está presente no CSV gerado
- [ ] Mensagem de sucesso "Download concluído com sucesso!" aparece e some após 5s
- [ ] Alert de erro mostra a mensagem real do backend quando exportação falha

**Limitações reais a reportar:**

- `selectedPlaceIds` só abrange a página atual do ResultsScreen; "selected" não inclui pages navegadas
- Os 95+ campos EXPORTABLE_FIELDS incluem muitos que podem estar vazios na maioria dos registros
- O campo `booking_url` está em `EXPORTABLE_FIELDS` mas pode estar vazio na maioria dos places
- Não há suporte a formatos além de CSV (Excel nativo, JSON, XML)

---

### 📝 Logs e Auditoria (LogsScreen) — QUINTA PRIORIDADE

**O que deve funcionar:**

- [ ] Filtro por nível (error/warn/info/debug) atualiza a lista de logs
- [ ] Filtro por categoria (scraper/server/api) funciona
- [ ] Filtro por query (busca livre na mensagem/evento) filtra results
- [ ] Filtro por jobId traz apenas logs daquele job
- [ ] Botão "Atualizar" recarrega os logs do servidor
- [ ] Botão "Baixar JSONL" navega para `/api/logs/export` e força download
- [ ] Ao preencher `jobId` e clicar em "Baixar JSON", navega para `/api/reports/{jobId}`
- [ ] Ao preencher `jobId` e clicar em "Baixar PDF", navega para `/api/reports/{jobId}/pdf`
- [ ] Expansão/colapso de evento funciona (ChevronUp/Down)
- [ ] Metadados técnicos JSON são exibidos ao expandir evento
- [ ] Total de eventos e "Exibindo até 100 mais recentes" são exibidos corretamente

**Limitações reais a reportar:**

- Limite de 100 logs mais recentes; offset não é exposto na UI para paginação avançada
- `metadata` é texto livre; não há busca estruturada dentro dos campos JSON
- O download JSONL gera 500 eventos; se o banco tiver mais, os mais antigos são cortados
- Não há indicador visual de quais logs são "errors" críticos vs informacionais beyond o color coding

---

### 🧭 Navegação Global (Sidebar) — QUARTA-FORA PRIORIDADE

**O que deve funcionar:**

- [ ] Aba ativa tem fundo destacada (zinc-900 com border Emerald) e texto zinc-100
- [ ] Outras abas têm texto zinc-400, hover para zinc-200/bg-zinc-900/50
- [ ] Badge "Ativo" na aba Search aparece quando `isScrapingActive=true`
- [ ] Badge `totalPlaces` na aba Results reflete total de records no SQLite
- [ ] Badge `selectedCount` na aba Export reflete número de places selecionados (formato "N sel.")
- [ ] Widget de status da coleta mostra ícone animate-ping quando running, CheckCircle quando completed
- [ ] Widget mostra razão `total_collected/limit_requested` numericamente
- [ ] Widget mostra segment+location do job corrente
- [ ] Botão "Interromper coleta" aparece apenas quando coleta está ativa
- [ ] Sidebar mobile (`isOpenMobile`) desliza corretamente e backdrop fecha ao clicar
- [ ] Link "API & Documentação" abre `/docs/` em nova aba/ contexto adequado
- [ ] Responsividade: desktop w-72 visível, mobile `translate-x-full` oculto com toggle

**Limitações reais a reportar:**

- A transição mobile ↔ desktop ao redimensionar window pode causar "flash" de estado
- O badge `totalPlaces` soma todos os jobs; pode ser enganoso se o usuário espera apenas um job
- Não há atalho direto para reports no sidebar; usuário navega até HistoryScreen

---

## Fluxo de Trabalho Esperado

1. **Coletar** → Tela Search → preencher segmento/local/limit → clicar "Iniciar Coleta" → job criado no banco → SSE stream atualiza progresso → ao concluir, botão "Ver resultados" ativa
2. **Examinar** → Tela Results → filtrar, ordenar, selecionar places → view mode cards/table → exportar CSV ou abrir modal detalhes
3. **Registrar** → Histórico mostra coletas passadas → ver resultados, exportar job específico ou excluir
4. **Audit** → LogsScreen filtra eventos → download JSONL para auditoria técnica
5. **Configurar** → Sidebar status widget reflete estado vivo; navegação entre abas fluida

---

## Endpoints da API que Serão Usados (já conferidos em `docs/API.md` e `docs/openapi.yaml`)

| Finalidade | Método | Endpoint | Observações |
|---|---|---|---|
| Iniciar coleta | `POST` | `/api/scrape/start` | `{segment, location, limit}` |
| Status da coleta | `GET` | `/api/scrape/status/:id` | Retorna job completo + `isRunning` |
| SSE progresso | `GET` | `/api/scrape/stream/:id` | Conexão keep-alive, `data: JSON\n\n` |
| Listar places | `GET` | `/api/places` | query, sortBy, sortOrder, offset, limit; `consumerProject` isolation |
| Todos places do job | `GET` | `/api/places/all` | `jobId` query param |
| Field coverage | `GET` | `/api/field-coverage` | `jobId` query param opcional |
| Histórico de jobs | `GET` | `/api/history` | lista todos jobs (searches table) |
| Excluir job | `DELETE` | `/api/history/:id` | remove job + places |
| Exportar CSV | `POST` | `/api/export/csv` | `{jobId, placeIds, fields, filename}` |
| Logs da API | `GET` | `/api/logs` | limit, offset, level, category, query, jobId |
| Exportar logs | `GET` | `/api/logs/export` | últimos 500 logs como JSONL |
| Report JSON | `GET` | `/api/reports/:jobId` | se existir no banco |
| Report PDF | `GET` | `/api/reports/:jobId/pdf` | se existir no banco |
| API v1 health | `GET` | `/api/v1/health` | sem autenticação |
| API v1 leads | `GET` | `/api/v1/leads` | auth Bearer; paginated, filtered |
| API v1 jobs | `GET` | `/api/v1/jobs/:id` | auth Bearer; status + counters |
| API v1 jobs results | `GET` | `/api/v1/jobs/:id/results` | auth Bearer; paginated leads |

---

## O Que NÃO Deverá Ser Feito

- ❌ **Não criar novas telas** que duplicem funcionalidades existentes. Ajustar as que já existem.
- ❌ **Não inventar dados fictícios** ou progresso que não vem da API/ banco. Se não há dados, exibir estado "vazio" adequado.
- ❌ **Não remover campos** já presentes no `PlaceRecord` (`booking_url`, `plus_code`, `services_attributes`, etc.) sem necessidade concreta.
- ❌ **Não alterar a estrutura do banco** ou criar novos endpoints sem documentar e testar.
- ❌ **Não usar `MAPSCRAPE_PROVISIONING_TOKEN`** no frontend ou expor chaves em lugar algum.
- ❌ **Não fazer force-push** ou descartar alterações locais. Trabalhar na branch `main` e preservar o estado Git.
- ❌ **Não assumir que um endpoint existe** apenas porque há um botão na interface ou na documentação. Verificar o código real (`server.ts`, `db.ts`) primeiro.

---

## Entrega Esperada

Ao final desta missão, cada agente deverá reportar:

1. **Arquivos alterados** — caminho de cada arquivo editado (`.tsx`, `.ts`, `*.md`, `*.yaml`)
2. **Testes executados** — quais fluxos foram testados pela interface e quais resultados obteve (PASS/FAIL com evidência)
3. **Limitações reais** — gaps encontrados, campos que estão vazios, comportamento edge não tratado
4. **Estado de sincronização** — `git status`, commits realizados, se a branch `main` está limpa vs divergente de `origin/main`
5. **Falhas corrigidas** — lista de bugs encontrados e corrigidos durante a execução

---

## Estrutura de Pastas Esperada (após conclusão)

```
docs/
  API.md                      ← já atualizada (booking_url + consistência)
  openapi.yaml                ← já atualizada (booking_url + plus_code)
  INTEGRATION-FOR-LLMS.md     ← referência para consumidores externos
  FRONTEND-PAGES.md           ← nova (documentação completa de páginas)
  FRONTEND-IMPROVEMENTS-PROMPT.md ← este arquivo (prompt operacional)
  DEVELOPMENT-LOGS.md         ← logs de desenvolvimento (já existe)
```

---
*Pronto para execução por agente local. Não depende de informações implícitas desta conversa. Todos os endpoints, tipos e schemas foram cruzados com o código em `src/` e `server.ts`.*