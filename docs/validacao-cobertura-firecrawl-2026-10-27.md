# Validação de Cobertura Firecrawl × MapScrape — 27/10/2026

## Objetivo e regra de aprovação

Este documento reconcilia os campos descritos em `docs/mapeamento-verificado-firecrawl-bearzil.md` e `docs/matriz-cobertura-firecrawl-implantacao.md` com o código atualmente em `main`.

**Regra:** um campo vazio NÃO significa que o dado não existe no Google Maps. Sem evidência observada da página e rastreamento da coleta, o único resultado correto é “não capturado / causa ainda não comprovada”. Não atribuir “indisponível na fonte” somente porque a coluna está vazia.

## Correções de código feitas nesta rodada

- `d776df13da8a8ab6c6daa6041e0cb001261a557b`: corrigido escaping de regex na detecção de links de agendamento. A versão anterior usava `\\s` e `\\b` em regex literals, fazendo-os procurar barras invertidas literais em vez de whitespace/limites de palavra.
- `d8cfe34afe568a4501842493218d37cd2698a3a8`: corrigido o split do `srcset` para separar candidato de URL e descritor de largura corretamente.

Esses commits corrigem defeitos reais, mas **não equivalem a aprovação verde**: ainda é necessária execução automatizada e coleta visual real após deployment.

## Matriz honesta de implementação

| Campo documentado | Implementação encontrada em `main` | Conclusão atual |
|---|---|---|
| `name`, `category`, `address`, `phone`, `website` | Campos no tipo, extração no `extractor.ts`, persistência no `db.ts` | Implementação presente; sem execução real recente não aprovar a exatidão |
| `rating`, `review_count` | Extração e normalização presentes | Implementação presente; valor precisa ser comparado à ficha observada |
| `latitude`, `longitude`, `maps_url`, `plus_code` | Coordenadas derivadas da URL e Plus Code por atributos DOM; colunas existentes | Implementação presente; não comprova captura em toda variação de interface |
| `business_status` | Extração por labels e classes da ficha | Implementação presente; precisa validar idiomas/layouts |
| `price_range` | Seletores presentes; documentação Firecrawl informa que preço não apareceu na sessão limitada | Campo vazio não permite distinguir limite da sessão de falha de seletor |
| `opening_hours` | Expande o controle de horários e lê linhas/tabelas visíveis; agora também extrai `next_opening_text`, `next_open_day` e `next_open_time` separadamente | Parcial por depender do que o Maps renderiza; status de próxima abertura não substitui a tabela semanal completa |
| `popular_times` | Campo no tipo, migração de banco, extração de rótulos/valores visíveis, merge e contrato OpenAPI | Implementado para conteúdo exposto no DOM; não garante gráfico completo nem cobertura de todos os dias |
| `booking_url` | Tipo, banco e extrator existem; detecção de rótulos corrigida nesta rodada | Implementado, mas ainda sem validação real pós-correção |
| `photos` / `media_items` | Captura DOM, lazy loading e scroll; gera `thumbnail_url` transformado apenas para variantes Google reconhecidas e deixa vazio quando não consegue transformar | Parcial: galeria continua limitada ao conteúdo carregado/renderizado; não assumir que URLs capturadas equivalem ao total anunciado |
| `thumbnail_url` | Campo gerado para `media_items`; URL original é mantida quando não transformável | Parcial: URL diferente não garante que a miniatura exista ou carregue; validar HTTP/UI |
| `videos` | Seletores e coleta presentes | Parcial: pode capturar URL ou label de vídeo; validar que os resultados são mídia reproduzível |
| `logo_url` | Detecta imagens com rótulos de perfil/logo | Parcial: heurística conservadora; vazio significa “não identificada pelo extrator”, não prova de inexistência |
| `social_links` | Coleta links sociais explícitos no DOM da página | Implementado; sem comprovação de que todos os links estão expostos |
| `reviews` | Abre painel, tenta expandir e rolar; persiste JSON | Parcial: quantidade visível depende da interface e do acesso permitido; não prometer coletar todas as avaliações |
| `attributes` / `accessibility_attributes` | Campos dedicados, extraídos de itens da aba Sobre e persistidos em JSON | Implementados; valores só são produzidos a partir de linhas observadas, não de inferências |
| `next_opening_text/day/time` | Campos dedicados derivados do texto de status da ficha | Implementados quando o texto explicita próxima abertura; não substituem horário semanal |
| `visible_photos_count` | Captura apenas contagem textual explícita de fotos/fotos na interface | Implementado; fica vazio se a interface não exibe contagem, não usa quantidade de URLs como substituto |
| `review_highlights` | Campo dedicado no tipo/banco; extrator procura elementos de resumo explícitos e persiste array JSON | Implementado de forma conservadora; ausência permanece `not_observed_in_session` |
| `review_topics` / contagens | Coleta chips/contagens explícitas e persiste JSON | Parcial: seletor pode perder chips ou contagens; validar contra evidência Firecrawl |
| `additional_attributes` / acessibilidade | Mantém JSON completo da aba Sobre e também normaliza `attributes` e `accessibility_attributes` em arrays separados | Implementado; cobertura depende das seções que a página expõe na sessão |
| `rating_distribution` | Campo dedicado no tipo/banco; extrator só aceita rótulos acessíveis que explicitam estrelas e contagens | Implementado com critério conservador; fixture de persistência cobre o campo, mas layout real ainda requer validação visual |
| `postal_code`, `country`, `city`, `state`, `source_url`, `source_place_id` | Campos dedicados no tipo/banco; parsing isolado e coberto por testes com os endereços Bearzil/Retrô; ID/URL derivados da URL da ficha | Implementados; componentes de endereço só são preenchidos quando o formato exibido permite identificar com segurança |
| Rótulos de interface (`ui_controls`) | Não persistidos como dados de negócio | Correto não os tratar como atributos comerciais; só implementar se houver requisito explícito |
| `collected_at` | Definido no extrator e persistido | Implementação presente |

## Evidência Firecrawl e limites

O documento de 26/10/2026 registra para a Bearzil: rating 4.9, 278 avaliações, 187 fotos visíveis, três avaliações completas, tópicos e atributos; também registra que a sessão estava em “limited view”. Essa evidência é recente, mas descreve aquela sessão, não todas as sessões atuais do scraper.

- Horário semanal e popular times: não observados na sessão Firecrawl descrita; isso não prova indisponibilidade universal.
- Logo separado e miniaturas: não extraídos pelo Firecrawl; o código tem heurísticas, mas não há prova de captura.
- Distribuição por estrelas: não estruturada no schema atual.
- Avaliações: três visíveis naquela sessão, não as 278 completas.

## Implementação adicional nesta rodada

- `src/shared/types.ts`: novos campos estruturados para CEP, país, cidade, estado, ID/URL da fonte, popular times, distribuição de estrelas, destaques e status por campo.
- `src/server/db.ts`: colunas e migrações compatíveis com bancos existentes; inclusão dos campos em insert e update.
- `src/server/scraper/extractor.ts`: captura conservadora de popular-times, contagem por estrelas e destaques visíveis; parsing de componentes do endereço; extração de source place ID; status por campo.
- `src/server/scraper/runner.ts`: merge de enriquecimento sem sobrescrever dados antigos por valores vazios.
- `public/openapi.yaml`, `docs/openapi.yaml` e `docs/API.md`: contrato documenta os novos campos e explica que ausência observada não prova inexistência na fonte.

`field_status` usa `captured` ou `not_observed_in_session`. Esse status é intencionalmente honesto: sem instrumentação do DOM e evidência da sessão não é possível distinguir universalmente uma mudança de seletor de um campo não exposto pelo Google Maps. Essa limitação deve ser resolvida por evidência real, não por valores inventados.

## Critérios para selo verde

Só aprovar quando todos os itens abaixo forem comprovados:

1. `npm test`, `npm run lint` e `npm run build` passam no commit atual.
2. Coleta real da Bearzil e da Barbearia Retrô em browser, sem criar registros artificialmente no banco.
3. Para cada campo, evidência da página e resultado coletado, persistido e devolvido pela API comparados.
4. A ficha visual e exportação apresentam os campos persistidos corretamente.
5. Cada ausência recebe um status verificável: `captured`, `not_visible_in_session`, `selector_miss`, `persistence_error` ou `not_implemented`; nunca inferir “não existe” de string vazia.
6. Deployment de produção concluído com sucesso e reteste na URL pública.

## Status desta revisão

**AMARELO — campos, migrações, extração conservadora, merge, exportação, visualização e contrato da API implementados; aprovação verde ainda depende de CI final e coleta real de produção.** Testes automatizados cobrem parsing de endereços e persistência dos novos campos, mas não substituem a comparação visual da ficha Bearzil/Retrô após deployment.
