# MapScrape v2 — Documentação de Páginas Frontend

Este documento descreve cada página da interface do MapScrape v2, seus fluxos, integrações e estado atual. Separe-se claramente o que já existe, o que está incompleto e o que será implementado futuramente.

---

## Legend

- ✅ **Implementado** — funcionalidade completamente operacional na branch `main`
- 🔄 **Parcial** — funcionalidade existindo mas com limitações ou estados edge não tratados
- 📋 **Planeado** — descrito em `docs/FRONTEND-IMPROVEMENTS-PROMPT.md` como próximo passo
- ❓ **Gap** — funcionalidade ainda não iniciada ou com dúvidas de implementação

---

## 1. Pesquisa (SearchScreen)

### Responsáveis
- `src/components/SearchScreen.tsx`
- `src/components/Sidebar.tsx` (link ativo)
- `src/shared/brazilLocations.ts` (dados de estados/cidades)
- `src/server/db.ts` (criação de jobs via API)

### Objetivo e Responsabilidade
Tela de entrada para iniciar uma nova raspagem no Google Maps. Captura segmento, localização e limite, então dispara o trabalho de coleta assíncrona via Puppeteer.

### Arquivos e Componentes
- **SearchScreen.tsx** — formulário completo com validação, seletor de categorias populares, seletor de localização (Brasil ou digitação livre), campo de limite e botão de iniciar/parar.
- **BRAZILIAN_STATES/POPULAR_CATEGORIES** — dados estáticos de estados brasileiros e grupos de categorias.
- **Sidebar.tsx** — navegação ativa destacada quando na aba 'search'.

### Rotas e Integrações
- **Rota da página**: `/` (raiz, carregado pelo Vite em desenvolvimento ou `dist` em produção)
- **API interna**: `POST /api/scrape/start` — inicia coleta com `{segment, location, limit}`
- **API interna**: `GET /api/scrape/status/:id` — consulta status da coleta
- **API interna**: `GET /api/scrape/stream/:id` — SSE para atualizações em tempo real
- **API interna**: `GET /api/history` — lista histórico de coletas (atualiza a Live Status Widget no Sidebar)

### Dados Exibidos e Fontes
- **Campos do formulário**: segmento (texto), localização (UF + cidade + bairro opcional ou digitação livre), limite (1-100, presets 10/20/50/100)
- **Estado da coleta** (lido do banco via `getJob`): status (`running`/`completed`/`partial`/`stopped`/`failed`), contadores (`total_found`, `total_collected`, `total_duplicates`, `total_errors`), `current_step`, `status_message`
- **Progresso**: barra de progresso percentual, 4 contadores grandes (Encontrados, Coletados, Duplicados, Erros)

### Estados
- ⅏ **Carregando** — antes do formulário ser preenchido ou durante a inicialização
- ⅏ **Vazio** — formulário pronto, agurando o usuário preencher e submeter
- ⅏ **Em andamento** — coleta ativa, painel de progresso visível, botão "Interromper" disponível
- ⅏ **Concluída** — coleta finalizada, botão "Ver {total_collected} resultados" aparece, navegação para ResultsScreen
- ⅏ **Falha** — status `failed` exibido com triângulo de aviso, mensagem `status_message`

### Ações e Efeitos Persistidos
- **Iniciar coleta** → cria job no banco (`createJob`), dispara `runScraperJob`, abre SSE stream
- **Interromper** → `POST /api/scrape/stop/:id` → `stopScrapeJob`
- **Ir para resultados** → define `onGoToResults`, navega passando `currentJob.id`

### Filtros, Seleção e Paginação
- Não se aplica (formulário de entrada)
- A paginação e filtros são da ResultsScreen, não da SearchScreen

### Lacunas Funcionais e Melhorias Planejadas
- ❓ **Estado "partial"** — atualmente tratado visualmente como erro ou andamento, pode precisar de tratamento distinto
- ❓ **Persistência de escolha de categoria** — ao recarregar a página, o grupo/items selecionados são perdidos (estado local apenas)
- ⅏ **Melhoria planejada** — salvamento de preferências de localização no `localStorage` ou contexto
- 📋 **Próximo passo** — conforme prompt de melhorias: preservar resultados da rodada atual separados do histórico persistido

---

## 2. Resultados (ResultsScreen)

### Responsáveis
- `src/components/ResultsScreen.tsx`
- `src/components/Sidebar.tsx` (link ativo, totalPlaces badge)
- `src/server/db.ts` (`getPlaces`, `getAllPlaces`, `getPlacesByIds`)
- `src/server/server.ts` (`/api/places`, `/api/places/all`, `/api/v1/jobs/:id/results`)

### Objetivo e Responsabilidade
Tela principal de exibição dos estabelecimentos coletados. Lista os registros com paginação, filtros, ordenação e view mode (cards ou tabela). Permite seleção individual/coletiva, visualização de detalhes e exportação.

### Arquivos e Componentes
- **ResultsScreen.tsx** — componente principal com lógica de estado (viewMode, selectedPlace, selectedPlaceIds, coverage, etc.)
- **EXPORTABLE_FIELDS** — lista definida de campos disponíveis para exportação
- **Sidebar.tsx** — badge `totalPlaces`, estado de scraping ativo
- **FieldCoverageStrip** — cálculo de cobertura de campos a partir dos dados persistidos

### Rotas e Integrações
- **API interna**: `GET /api/places` — consulta paginada com query, sortBy, sortOrder, offset, limit; aplica isolamento por `consumerProject`
- **API interna**: `GET /api/places/all` — todos os records de um job (ou geral)
- **API interna**: `GET /api/field-coverage` — calcula percentual de preenchimento por campo
- **API v1**: `GET /api/v1/jobs/:id/results` — resultados com isolamento de consumidor
- **API v1**: `GET /api/v1/leads` — consulta pública com paginação e filtro

### Dados Exibidos e Fontes
- **Lista de estabelecimentos**: vinda de `getPlaces()` ou `getAllPlaces()`, cada um com `PlaceRecord` completo
- **Contagem total**: `totalPlaces` vinda do estado pai ou da API
- **Cobertura de campos**: chamada a `/api/field-coverage?jobId=` com job selecionado
- **Filtros**: busca textual (nome, categoria, endereço, telefone, website), seletor de job, view mode (cards/table), ordenação (nome/rating/collected_at)

### Estados
- ⅏ **Loading** — spinner "Carregando estabelecimentos..."
- ⅏ **Vazio** — mensagem "Nenhum estabelecimento encontrado" com sugestão de nova coleta
- ⅏ **Dados disponíveis** — lista de places em modo cards ou tabela
- ⅏ **Cobertura carregando** — spinner interno enquanto `/api/field-coverage` busca
- ⅏ **Cobertura com erro** — mensagem de erro capturada no estado

### Ações e Efeitos Persistidos
- **Seleção de linhas** (checkbox) → atualiza `selectedPlaceIds` no estado
- **Seleção única** → abre modal de detalhes do estabelecimento (`selectedPlace`)
- **Ordenação** → altera `sortBy`/`sortOrder` e recarrega a página (onPageChange(1))
- **Mudança de página** → `onPageChange`, busca nova página via API
- **Exportar** → `onGoToExport` → navega para ExportScreen com escopo/registros selecionados
- **Ver detalhes** → seta `selectedPlace`, abre modal sobreposto

### Filtros, Seleção e Paginação
- **Busca**: `searchQuery` filtra por nome/categoria/endereço/telefone/website (client + server)
- **Job selector**: dropdown `selectedJobId` filtra places por coleta específica
- **Paginação**: `currentPage`/`pageSize`, links Anterior/Próxima, total de pages = `ceil(totalPlaces / pageSize)`
- **Selecionar todos da página**: checkbox que seleciona/deselecciona todos os ids da página atual

### Lacunas Funcionais e Melhorias Planejadas
- ⅏ **Field coverage** — já calculado a partir de dados persistidos, mas só reflete o job selecionado; could also show overall coverage
- ❓ **Modo table responsivo** — tabela atualmente não quebra bem em telas muito estreitas; colunas podem overflow
- ❓ **Indicador de job em andamento** — quando uma coleta nova é iniciada, a ResultsScreen pode não atualizar imediatamente o badge totalPlaces
- 📋 **Próximo passo** — conforme prompt: priorizar Resultados e Diretório como primeiras melhorias

---

## 3. Diretório (Directory — ainda não uma tela separada, funcional integrada)

> **Nota**: Não existe um componente `DirectoryScreen.tsx` isolado. A funcionalidade de organização por projeto/categoria está dispersa entre ResultsScreen (seleção e associação), ExportScreen (escopo) e Sidebar (navigação). Este documento registra o estado atual e as áreas que precisam de atenção.

### Responsáveis (Áreas relacionadas)
- `src/components/ResultsScreen.tsx` — seleção de places, view mode, filtros por job
- `src/components/ExportScreen.tsx` — escopo (selected/current_job/all), campos de exportação
- `src/components/Sidebar.tsx` — navegação, badges
- `src/server/db.ts` — `getPlaces` com filtro `consumerProject`, `getAllPlaces`, `deletePlace`

### Objetivo e Responsabilidade
Organizar estabelecimentos por projeto e categoria de segmento, permitir associação de estabelecimentos a coletas, e proporcionar filtros e exclusão segura. Esta é uma área de crescente necessidade conforme mais coletas são realizadas.

### Arquivos e Componentes (referenciados)
- **Resultado da busca/coleta** — cada place pertence a um job (coleta). O job identifica o projeto/localização.
- **ExportScreen** — permite exportar "current_job" ou "all" registros, com seleção de campos.
- **HistoryScreen** — lista jobs passados, permite "Ver Resultados" ou "Exportar CSV" por job.

### Rotas e Integrações
- **API interna**: `GET /api/places?jobId=` — filtra places por coleta/job
- **API interna**: `DELETE /api/history/:id` — remove job e seus places do banco
- **API v1**: `DELETE /api/v1/provisioning/credentials/:id` — revoga credencial (nível administrativo)

### Dados Exibidos e Fontes
- **Organização por job** — cada place tem `job_id` que liga a `searches` table; o usuário pode alternar entre jobs via dropdown no ResultsScreen
- **Filtro por categoria** — o campo `category` em `PlaceRecord` é exibido e pode ser usado para filtragem textual
- **Seleção para export** — `selectedPlaceIds` determina quais records são incluídos

### Estados
- ⅏ **Job sem places** — histórico mostra job mas ResultsScreen diz "Nenhum estabelecimento encontrado"
- ⅏ **Múltiplos jobs** — usuário pode alternar entre jobs e ver places de cada um
- ❓ **Exclusão de places individuais** — `deletePlace` existe no backend mas não é acionado pela UI atualmente (exceto via HistoryScreen delete job)

### Ações e Efeitos Persistidos
- **Filtrar por job** → dropdown `selectedJobId` no ResultsScreen
- **Excluir job** → HistoryScreen confirma e chama `onDeleteJob` → remove job + seus places do banco
- **Exportar por job** → ExportScreen scope `current_job` usa `selectedJobId`

### Lacunas Funcionais e Melhorias Planejadas
- ❓ **Tela de diretório dedicada** — não existe componente próprio; funcionalidade pode ser unida ao ResultsScreen ou HistoryScreen no futuro
- ❓ **Filtro por categoria/segmento** — existe no ResultsScreen busca textual, mas não há seletor visual de categoria como na SearchScreen
- ❓ **Associação de estabelecimentos entre jobs** — não há mecanismo de "mover" um place de um job para outro; would require new backend endpoint
- 📋 **Próximo passo** — conforme prompt: implementar projetos, categorias e exclusão conforme modelo real de persistência

---

## 4. Histórico (HistoryScreen)

### Responsáveis
- `src/components/HistoryScreen.tsx`
- `src/components/Sidebar.tsx` (link, totalPlaces badge reagindo a jobs)
- `src/server/db.ts` (`listJobs`, `deleteJob`)

### Objetivo e Responsabilidade
Registro completo de todas as coletas realizadas no Google Maps, com contadores de estabelecimentos encontrados, coletados e persistidos no SQLite. Permite visualizar, navegar para resultados, exportar CSV de um job específico e excluir coletas.

### Arquivos e Componentes
- **HistoryScreen.tsx** — lista de jobs com métricas, badges de status, ações de ver resultados, exportar CSV e excluir
- **Sidebar.tsx** — badge `totalPlaces` reflete total de records em todas as coletas ativas

### Rotas e Integrações
- **API interna**: `GET /api/history` — lista todos os jobs (searches table)
- **API interna**: `DELETE /api/history/:id` — remove job e places associados
- **API interna**: `GET /api/scrape/status/:id` — status detalhado de um job
- **API interna**: `GET /api/v1/jobs/:id/results` — resultados de um job (com autenticação v1)

### Dados Exibidos e Fontes
- **Lista de jobs**: `jobs` prop vinda do pai, cada um com `id`, `segment`, `location`, `total_collected`, `total_duplicates`, `total_errors`, `status`, `created_at`, `limit_requested`
- **Metricas por job**: meta solicitada (`limit_requestados`), salvos no SQLite (`total_collected`), duplicados, erros
- **Status badge**: `completed`/`running`/`partial`/`stopped`/`failed`

### Estados
- ⅏ **Histórico vazio** — `jobs.length === 0`, mostra mensagem "Nenhuma pesquisa no histórico"
- ⅏ **Jobs listados** — cada job exibido com badge de status e ações disponíveis
- ⅏ **Job em andamento** — badge animado "Em andamento", ações de interrupção e ver resultados disponíveis

### Ações e Efeitos Persistidos
- **Ver resultados** → `onViewResults(job.id)` → navega para ResultsScreen com esse job
- **Exportar CSV de um job** → `onGoToExportWithJob(job.id)` → navega para ExportScreen com escopo current_job
- **Excluir job** → confirmação `confirm(...)` → `onDeleteJob(job.id)` → remove do banco (job + places)

### Filtros, Seleção e Paginação
- Não se aplica (lista simples de jobs)
- A paginação seria necessária se o histórico crescer muito (não implementada ainda)

### Lacunas Funcionais e Melhorias Planejadas
- ⅏ **Job "partial"** — exibido com badge "Parcial", mas a UI pode não diferenciar claramente de "Falha"
- ❓ **Paginação do histórico** — não implementada; expected quando muitos jobs forem acumulados
- ❓ **Retenção de jobs** — atualmente não há política de limpeza automática; jobs persistem indefinidamente
- 📋 **Próximo passo** — conforme prompt: preservar alterações concorrentes e trabalhar na branch `main`

---

## 5. Exportação (ExportScreen)

### Responsáveis
- `src/components/ExportScreen.tsx`
- `src/server/db.ts` (`getPlaces`, `getPlacesByIds`, `generateCsv`)
- `src/server/server.ts` (`/api/export/csv`)

### Objetivo e Responsabilidade
Gerar arquivo CSV com os estabelecimentos coletidos. Define escopo (registros selecionados, job atual ou todos), campos/colunas a incluir, nome do arquivo e gera download. Inclui proteção contra CSV Injection (cabeçalho UTF-8 BOM, neutralização de células perigosas com aspas simples).

### Arquivos e Componentes
- **ExportScreen.tsx** — componente completo com 4 steps: escopo, campos, nome do arquivo, preview + download
- **EXPORTABLE_FIELDS** — lista mapeada de `keyof PlaceRecord` com labels e descriptions
- **placePreview** — primeiras 3 places renderizadas como preview da planilha

### Rotas e Integrações
- **API interna**: `POST /api/export/csv` — recebe `{jobId, placeIds, fields, filename}` e retorna CSV
- **API interna**: Busca de places via `getPlacesByIds` ou `getAllPlaces`

### Dados Exibidos e Fontes
- **Escopo**: radio buttons `selected` (dos markedos naResultsScreen), `current_job` (do job selecionado no dropdown), `all` (todo banco)
- **Campos**: checkboxes com os 95+ campos definidos em `EXPORTABLE_FIELDS`; defaults to all selected
- **Preview**: primeiras 3 places com as colunas selecionadas, renderizada como tabela HTML com font-mono
- **Nome do arquivo**: sugestão baseada em `segment + location + today`, editável pelo usuário

### Estados
- ⅏ **Pronto para exportar** — todos os steps visíveis, botão ativo
- ⅏ **Exportando** — botão desabilitado, spinner "Gerando arquivo CSV..."
- ⅏ **Sucesso** — `exportSuccess` true, mensagem "Download concluído com sucesso!"
- ⅏ **Erro** — `alert(`Erro ao exportar CSV: ${err.message}`)` em catch

### Ações e Efeitos Persistidos
- **Toggle campo** → `toggleField(key)` adiciona/remove do `selectedFields`
- **Selecionar/todos limpar** → `selectAllFields`/`deselectAllFields`
- **Confirmar exportação** → `handleExport` → `fetch('/api/export/csv', POST)` → download de blob
- **Definir nome** → input `filename` altera o default

### Filtros, Seleção e Paginação
- Não se aplica (exportação estática dos dados atuais)
- O escopo `selected` reflete `selectedPlaceIds` da ResultsScreen (página atual)

### Lacunas Funcionais e Melhorias Planejadas
- ⅏ **Proteção CSV Injection** — já implementada (aspas simples em células perigosas, cabeçalho UTF-8 BOM)
- ❓ **Seleção across pages** — `selectedPlaceIds` refere-se apenas à página atual; exportar "selected" de todas as páginas exigiria coleta adicional
- ❓ **Formatos adicionais** (Excel, JSON, XML) — atualmente apenas CSV suportado
- 📋 **Próximo passo** — conforme prompt: preservar resultados da rodada atual separados do histórico persistido

---

## 6. Logs e Auditoria (LogsScreen)

### Responsáveis
- `src/components/LogsScreen.tsx`
- `src/server/db.ts` (`listAuditLogs`)
- `src/server/server.ts` (`/api/logs`, `/api/logs/export`)

### Objetivo e Responsabilidade
Exibir eventos persistidos no banco SQLite para auditoria detalhada de cada ciclo de coleta do Google Maps. Permite filtrar por nível, categoria, query e ID da pesquisa; exportar logs como JSONL (newline-delimited JSON).

### Arquivos e Componentes
- **LogsScreen.tsx** — filtros (level, category, query, jobId), lista de eventos expandíveis, botão download JSONL
- **levelClasses / levelLabels / iconForLevel** — mapeamento visual por nível (debug/info/warn/error)

### Rotas e Integrações
- **API interna**: `GET /api/logs` — lista logs com paginação (limit default 100), filtros opicionais (level, category, query, jobId, offset)
- **API interna**: `GET /api/logs/export` — exporta os 500 logs mais recentes como JSONL

### Dados Exibidos e Fontes
- **Eventos**: cada log tem `id`, `created_at`, `level`, `category`, `event`, `message`, `job_id`, `metadata` (JSON string)
- **Filtros aplicados**: level (debug/info/warn/error), category (scraper/server/api), query (texto livre), jobId (ID específico)
- **Metadados técnicos**: JSON stringificado exibido ao expandir o evento

### Estados
- ⅏ **Nenhum evento** — `logs.length === 0` com mensagem "Nenhum evento encontrado para estes filtros."
- ⅏ **Carregando** — `loading === true` enquanto `loadLogs()` busca do servidor
- ⅏ **Eventos listados** — cada evento com nível, evento, mensagem, data, job_id e metadados
- ⅏ **Expansão detalhada** — clicar em evento expande/colapsa mostrando metadados completos

### Ações e Efeitos Persistidos
- **Atualizar** → `button onClick` recarrega `loadLogs()`
- **Download JSONL** → `downloadLogs()` → `window.location.href = /api/logs/export?params`
- **Filtrar por job** → preencher `jobId` input → navegar para `/api/reports/{jobId}` ou `/api/reports/{jobId}/pdf`
- **Baixar JSON/PDF do report** → buttons que navegam para `/api/reports/{jobId}` ou `.../pdf`

### Filtros, Seleção e Paginação
- **Filtros nivel/categoria/query/jobId** — inputs de seleção que atualizam o estado e recarregam logs
- **Limite** — exibe "até 100 mais recentes"; a API tem limit default 100 e parâmetro offset

### Lacunas Funcionais e Melhorias Planejadas
- ⅏ **Filtro job → report** — ao preencher jobId, botões aparecem para baixar JSON/PDF do relatório de execução
- ❓ **Paginação offset** — currently limited to 100 logs; would need offset parameter for larger databases
- ❓ **Busca avançada nos metadados** — `metadata` é texto livre; não há busca estruturada dentro dos campos JSON
- 📋 **Próximo passo** — conforme prompt: testar fluxos pela interface e pelas APIs

---

## 7. Navegação Global (Sidebar)

### Responsáveis
- `src/components/Sidebar.tsx`
- `src/App.tsx` (provê `currentTab`, `onTabChange`, etc.)
- `src/main.tsx` (renderização raiz)

### Objetivo e Responsabilidade
Menu lateral fixo com acesso a todas as telas, exibição de status vivo da coleta e contagem de registros no SQLite. Responsivo: em mobile (`isOpenMobile`), o sidebar desliza de cima; em desktop, permanece fixo à esquerda.

### Arquivos e Componentes
- **Sidebar.tsx** — componente principal com navegação, widget de status da coleta, barra de status do SQLite
- **App.tsx** — fornece `currentTab`, `onTabChange`, `totalPlaces`, `selectedCount`, `isScrapingActive`, `currentJob`
- **main.tsx** — renderiza `<Sidebar>` e `<currentScreen>` em layout de 2 colunas (desktop) ou empilhado (mobile)

### Rotas e Integrações
- **Navegação interna** — `onTabChange(item.id)` altera `currentTab` no estado global, mostra tela correspondente
- **API health** — sidebar widget lê `currentJob` para exibir status "Coleta em andamento" etc.

### Dados Exibidos e Fontes
- **Aba ativa** — `currentTab` ('search'|'results'|'export'|'history'|'logs'), botão com fundo destacada quando ativa
- **Badges** — `isScrapingActive` (search), `totalPlaces` (results), `selectedCount` (export), contadores de jobs no histórico
- **Status da coleta** — widget inferior: ícone de status, razão `total_collected/limit_requested`, segment+location
- **Total de registros** — barra inferior: `totalPlaces` registros no SQLite, mensagem "Persistência local direta sem dependência externa"

### Estados
- ⅏ **Desktop** — sidebar `w-72`, `translate-x-0` (visível), transição suave ao abrir/fechar
- ⅏ **Mobile** — sidebar `translate-x-full` (oculto), `isOpenMobile` toggle, backdrop clicável para fechar
- ⅏ **Sem jobs** — badges desaparecem ou mostram "0"
- ⅏ **Coleta ativa** — widget superior mostra ícone animate-ping, totais atuais

### Ações e Efeitos Persistidos
- **Trocar aba** → `onTabChange` → esconde sidebar mobile, mostra tela correspondente
- **Fechar mobile** → `onCloseMobile` → `isOpenMobile = false`
- **Interromper coleta** → `onStopScrape` → `POST /api/scrape/stop/:currentJob.id`

### Filtros, Seleção e Paginação
- Não se aplica (navegação global)

### Lacunas Funcionais e Melhorias Planejadas
- ⅏ **Responsividade** — já funciona (mobile vs desktop), mas a transição poderia ser mais suave
- ❓ **Acesso direto a reports** — sidebar não tem atalho para `/api/reports/{jobId}`; usuário precisa navegar até HistoryScreen ou usar URL direta
- 📋 **Próximo passo** — conforme prompt: corrigir falhas encontradas em vez de encerrar com auditoria ou planejamento

---

## Resumo Geral de Lacunas

| Área | Status | Próximo Passo |
|------|--------|---------------|
| `booking_url` no tipo/DB e UI | ✅ Implementado (types.ts line 22, db places table + display em ResultsScreen cards e table) | — |
| Tela de Diretório dedicada | ❓ Não existe componente próprio | 📋 Integrar ao prompt de melhorias |
| Filtro visual por categoria no ResultsScreen | ❓ Apenas busca textual | 📋 Conforme prompt de implementação |
| Paginação do Histórico | ❓ Limitado a lista completa | 📋 Implementar quando jobs aumentarem |
| Exportação "selected" across pages | ❓ Só da página atual | 📋 Melhorar seleção global no futuro |
| Proteção CSV Injection | ✅ Implementada (as BOM + aspas simples) | — |
| Field coverage calculation | ✅ Implementada a partir de dados persistidos | — |
| Responsividade do Sidebar | ✅ Desktop + Mobile | — |

---
*Documento gerado a partir da inspeção codificada em Mon Oct 26 2026. Para atualizações futuras, consultar `docs/FRONTEND-IMPROVEMENTS-PROMPT.md`.*