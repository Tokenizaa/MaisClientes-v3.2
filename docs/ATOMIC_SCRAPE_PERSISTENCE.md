# Persistência atômica da coleta

## Objetivo

Descartar duplicados antes de abrir a ficha e garantir que somente estabelecimentos inéditos sejam gravados. A inserção e os contadores de coleta são confirmados na mesma transação.

## Fluxo

1. O job reivindica uma lease exclusiva diretamente em scrape_jobs.
2. Ao encontrar uma URL no feed, o servidor chama is_scrape_place_duplicate com Place ID e URL normalizada.
3. Se a ficha já existir, o servidor chama persist_scraped_place com payload nulo para registrar o duplicado e segue sem abrir a ficha.
4. Se for inédita, o worker abre a ficha e executa a extração.
5. persist_scraped_place faz a verificação final por Place ID, URL e combinação nome/endereço. Locks transacionais serializam identidades concorrentes; o insert e os contadores são atualizados atomicamente.
6. Se a segunda verificação encontrar uma ficha inserida por outra execução, o resultado é contado como duplicado. Nenhum registro é sobrescrito.
7. Se a extração falhar, record_scrape_place_error registra a falha e os contadores. O worker segue para a próxima ficha.
8. Falhas de consulta, lease ou persistência encerram o job; não são tratadas como erro isolado de extração.

## RPCs

| RPC | Responsabilidade |
|---|---|
| claim_scrape_job_lease | Reivindicar um job em execução com token e geração |
| renew_scrape_job_lease | Renovar a lease do job |
| release_scrape_job_lease | Liberar a lease do job |
| is_scrape_place_duplicate | Verificação rápida por Place ID e URL antes de abrir a ficha |
| persist_scraped_place | Deduplicação final, insert e contadores em uma transação |
| record_scrape_place_error | Registrar erro isolado de extração e atualizar contadores |

As RPCs de gravação validam o token e a geração da lease. As funções são executáveis somente por service_role; não são expostas a anon ou authenticated.

## Regra dos contadores

- total_found: resultados processados pelo fluxo (salvos, duplicados ou com falha de extração).
- total_collected: aumenta somente quando uma nova linha é inserida em public.places.
- total_duplicates: aumenta quando a verificação rápida ou a verificação atômica final descarta uma ficha.
- total_errors: aumenta quando uma ficha não pode ser extraída ou quando a execução registra uma falha geral.

Duplicados não consomem a meta de novos estabelecimentos.

## Retomada e histórico

O fluxo novo não usa checkpoint, cursor, fila durável de candidatos nem sessão compartilhada. Cada pesquisa cria um job independente e começa do início do feed. Os registros antigos em scrape_candidates e scrape_search_sessions foram preservados; as estruturas não recebem novas gravações do fluxo atual e não foram apagadas nesta etapa.

## Arquivos

- supabase/migrations/20261101080912_simplify_scrape_job_persistence.sql: lease por job e RPCs de deduplicação/persistência.
- supabase/migrations/20261101080953_fix_scraped_place_required_defaults.sql: defaults para campos obrigatórios de places.
- supabase/tests/scrape_job_atomic_persistence.sql: teste transacional com rollback.
- server.ts: orquestração sequencial, verificação rápida e gravação atômica.

## Estado do Supabase remoto

As duas migrations novas foram aplicadas ao projeto MaisClientes-v2. O teste supabase/tests/scrape_job_atomic_persistence.sql foi executado no banco remoto com sucesso. Nenhuma tabela ou linha histórica foi removida.
