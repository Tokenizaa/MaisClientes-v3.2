# Execução sequencial do scraper Google Maps

## Objetivo

Pesquisar estabelecimentos no Google Maps, abrir somente fichas inéditas, extrair os campos do contrato Firecrawl e salvar cada novo estabelecimento no Supabase. A quantidade configurada representa a meta de novos registros efetivamente salvos.

## Fluxo único por execução

1. POST /api/v1/jobs cria um job novo, com contadores zerados. Não reutiliza pesquisa, sessão, URL ou posição de execução anterior.
2. O backend reivindica uma lease exclusiva do próprio job em scrape_jobs e abre uma sessão Chromium nova.
3. O worker abre a pesquisa no Google Maps e percorre o feed normalmente.
4. Para cada URL ainda não vista nesta execução, consulta is_scrape_place_duplicate usando Place ID e URL normalizada. Se já existir, registra o resultado como duplicado e segue sem abrir a ficha.
5. Se for inédita, abre a ficha e executa extractPlaceDetails().
6. persist_scraped_place repete a deduplicação no banco e insere o estabelecimento e atualiza os contadores na mesma transação. Essa segunda verificação protege contra duas execuções que encontrem a mesma ficha ao mesmo tempo.
7. O worker segue até atingir a meta de novos registros ou confirmar o fim do feed.

Uma nova solicitação sempre começa do início do feed. Os registros já salvos são descartados pela deduplicação; não existe retomada automática nem fila intermediária de candidatos.

## Tratamento de falhas

- **Falha isolada de extração:** record_scrape_place_error registra a falha e os contadores atomicamente. O worker descarta aquela ficha e segue para a próxima.
- **Falha ao consultar duplicidade, registrar erro ou persistir:** encerra o job. Não continua coletando sem garantia de gravação.
- **Falha de lease:** encerra a execução para impedir gravações por um worker que perdeu a propriedade do job.
- **Desconexão do Chromium, frame ou página:** encerra a coleta. Não reconstrói navegador, feed ou posição.
- **Timeout esperando novos resultados:** é tratado como ausência momentânea de avanço, não como desconexão. O worker tenta avançar novamente; depois de oito ciclos sem novos resultados, finaliza como parcial se não houver confirmação explícita de fim.

Erros reais de comunicação com a página não são convertidos em listas vazias ou em falsos sinais de fim do feed.

## Lease e concorrência

- A lease é vinculada diretamente ao job, usando worker_locked_until, worker_lease_token e worker_lease_generation. Não há fila Cloudflare, consumidor separado, ordinal ou registro intermediário de candidatos.
- Apenas uma instância pode reivindicar um job em execução.
- Renovação e gravações validam token e geração; uma instância antiga não pode gravar depois que perde a lease.
- A deduplicação final usa locks transacionais por Place ID, URL e nome/endereço, além das restrições únicas existentes.

## Compatibilidade com dados históricos

As tabelas scrape_candidates e scrape_search_sessions, os campos antigos de checkpoint e os registros existentes foram mantidos para não apagar histórico. O fluxo novo não cria sessões, não registra candidatos e não atualiza checkpoints. A remoção física dessas estruturas fica para uma migração posterior, depois de confirmar que nenhum job histórico ou consumidor antigo depende delas.

## Monitoramento

- GET /api/v1/jobs/:id apenas consulta o estado persistido.
- A interface continua fazendo polling do progresso.
- Não existe etapa manual /step; o backend executa a coleta continuamente até o estado terminal.
- total_collected conta somente inserts inéditos confirmados.
- total_duplicates conta fichas descartadas como duplicadas.
- total_errors conta falhas isoladas de extração e falhas gerais registradas.

## Contrato de dados preservado

O fluxo usa o extrator existente e mantém os campos de PlaceRecord documentados em:

- docs/mapeamento-detalhado-ficha-google-maps-bearzil.md
- docs/mapeamento-verificado-firecrawl-bearzil.md
- docs/matriz-cobertura-firecrawl-implantacao.md
- docs/validacao-cobertura-firecrawl-2026-10-27.md

Não inventa valores para campos ausentes e preserva field_status para diferenciar o que foi capturado do que não foi observado.

## Arquivos principais

- server.ts: job, lease, leitura do feed, deduplicação e persistência.
- src/server/scraper/browser.ts: conexão com Chromium.
- src/server/scraper/extractor.ts: extração da ficha.
- src/server/scraper/normalizer.ts: normalização de URL, Place ID e endereço.
- supabase/migrations/20261101080912_simplify_scrape_job_persistence.sql: lease por job e RPCs de persistência.
- supabase/migrations/20261101080953_fix_scraped_place_required_defaults.sql: defaults dos campos obrigatórios da tabela places.
- supabase/tests/scrape_job_atomic_persistence.sql: teste transacional de lease, deduplicação, gravação e contadores.

## Validação

O teste SQL foi executado no Supabase remoto e passou. Ainda é necessário validar o build/TypeScript e fazer uma coleta pequena em produção para conferir o comportamento real do Google Maps e do Chromium.
