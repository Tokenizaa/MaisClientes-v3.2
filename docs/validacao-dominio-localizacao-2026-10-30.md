# Validação do domínio de localização — 2026-10-30

## Escopo

Esta etapa cobre somente os campos de identidade/localização da ficha Google Maps:
- endereço completo; bairro; cidade; estado/UF; CEP/código postal; país;
- latitude e longitude; Plus Code;
- ID estável da ficha (source_place_id);
- URL original e URL final do Maps (source_url / maps_url);
- proveniência/status dos campos de localização.

## Correções implementadas

1. O parser reconhece CEP brasileiro, UF e cidade sem promover o bairro a cidade.
2. O bairro passa a ter campo próprio (neighborhood), incluído em PlaceRecord, EXPORTABLE_FIELDS, detalhes do estabelecimento e sincronização com public.places.
3. O fallback da localização da pesquisa só preenche cidade/UF em formatos inequívocos: Cidade, UF; Bairro, Cidade, UF; ou Cidade, UF, Brasil. Um único termo ou frase ambígua não é convertido em cidade.
4. Quando o fallback é usado, field_status.city/state registra enriched_from_search_location e a origem scrape_job.location; não se apresenta como dado observado na ficha.
5. Coordenadas extraídas da URL são validadas contra os limites geográficos de latitude e longitude.
6. O reconhecimento de Plus Code aceita rótulos em inglês e português.

## Banco de dados

Foi adicionada a coluna nullable public.places.neighborhood por migração aditiva.
Migração: 20261030184927_add_neighborhood_to_places.sql.
Verificação no Supabase: a coluna existe, é text e aceita NULL. Nenhum dado existente foi alterado.

## Testes automatizados

Comando: bun run test.
Resultado: 13 testes aprovados, 0 falhas. Cobrem endereço brasileiro com bairro/cidade/UF/CEP, bairro separado por vírgula, zeros à esquerda no CEP, país/cidade explícitos, não inferência de componentes ausentes, fallback seguro, coordenadas válidas/inválidas e ID da ficha.
Build: bun run build concluído.

Typecheck: bun run lint continua bloqueado por um erro preexistente em server.ts no uso de $eval(...).map(...): Puppeteer $eval retorna um único elemento, não uma coleção. Esse erro está fora do domínio de localização e foi deixado intocado para manter o escopo isolado.

## Limitações que ainda exigem validação real

- Não foi executada uma raspagem autenticada/ao vivo de uma ficha Google Maps nesta etapa.
- O seletor de Plus Code foi ampliado, mas precisa ser confirmado contra DOM real em português e inglês.
- A extração de bairro só preenche quando a estrutura do endereço contém um separador explícito reconhecível; em formatos ambíguos, permanece vazia.
- A apresentação do bairro foi adicionada ao painel de detalhes e à lista de campos exportáveis; validação visual e do CSV com uma coleta real ainda está pendente.

## Critério de aceite

O domínio só deve ser considerado aprovado depois de uma coleta real de teste confirmar, para cada campo, o valor no DOM, o objeto extraído, o registro no Supabase, a resposta da API, o painel de detalhes e o CSV. Não marcar campos ausentes como zero ou como observados.