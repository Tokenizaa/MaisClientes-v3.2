# Mapeamento detalhado da ficha do Google Maps — Bearzil Barber Shop Jardins

- **Projeto:** MapScrape v2
- **Ficha de referência:** Barbearia Bearzil Barber Shop Jardins — Barbearia por Assinatura SP
- **URL da fonte:** https://www.google.com/maps/place/Barbearia+Bearzil+Barber+Shop+Jardins+-+Barbearia+por+Assinatura+SP/@-23.5744293,-46.6592389,17z/data=!4m7!3m6!1s0x94ce59e8ef43b0db:0x50225dda5a2046ee!8m2!3d-23.5744293!4d-46.6592389!10e1!16s%2Fg%2F11g0455p73
- **Escopo deste documento:** inventário/mapeamento da informação visível, ícones, controles e relações entre elementos da ficha. Este documento **não implementa nem delega correções no scraper**.
- **Limite da evidência:** os valores abaixo foram transcritos da ficha fornecida pelo usuário. A disponibilidade de cada elemento pode variar conforme sessão, idioma, dispositivo, permissões e conteúdo carregado dinamicamente. Não se presume que todos os dados estejam sempre acessíveis por HTML estático.

## 1. Identificação e dados principais

| Elemento visível | Valor observado | Campo lógico sugerido | Tratamento |
|---|---|---|---|
| Título principal | Barbearia Bearzil Barber Shop Jardins - Barbearia por Assinatura SP | `name` | Texto principal do estabelecimento |
| Categoria junto ao título (ícone de categoria) | Barbearia | `category` | Categoria do negócio; não confundir com tópico de avaliação |
| Nota agregada (estrelas) | 4,9 | `rating` | Número decimal; manter escala da fonte se disponível |
| Contagem junto à nota | (278) | `review_count` | Inteiro 278, distinto da nota |
| Categoria visual | Barbearia | `primary_category` ou categoria normalizada | Preservar também o texto original |
| URL da ficha | URL Google Maps acima | `source_url` | URL canônica capturada na coleta |
| Identificador presente na URL | Segmento de lugar `0x94ce59e8ef43b0db:0x50225dda5a2046ee` | `source_place_id` / identificador da fonte | Guardar como string, se extraído; não inventar ID interno |

## 2. Ações e ícones da faixa superior

Os itens abaixo são controles de interface, não atributos do estabelecimento. O scraper deve reconhecer seus rótulos/ícones para navegar até informação relevante, mas não os salvar como serviços, tópicos ou atributos do negócio.

| Ícone / rótulo visível | Significado na interface | Classificação | Uso potencial na coleta |
|---|---|---|---|
| “Visão geral” | Aba da ficha | Navegação/UI | Ignorar como dado comercial |
| “Avaliações” | Aba/seção de avaliações | Navegação/UI | Abrir ou localizar avaliação e tópicos |
| “Sobre” | Aba/seção de informações | Navegação/UI | Localizar atributos, serviços e acessibilidade |
| Ícone de rota + “Rotas” | Ação de direções | Ação/UI | Não é serviço oferecido pelo estabelecimento |
| Ícone de marcador/salvar + “Salvar” | Ação de salvar lugar | Ação/UI | Ignorar como dado comercial |
| Ícone de seta + “Próximo” | Ação de navegação/rota | Ação/UI | Ignorar |
| Ícone de telefone/dispositivo + “Enviar para o smartphone” | Compartilhamento com dispositivo | Ação/UI | Ignorar |
| Ícone de calendário + “Agendar on-line” | Link de agendamento | Ação com possível URL comercial | Capturar URL de destino se acessível; preservar rótulo e origem |
| Ícone de menu/expansão junto a horários | Expandir horários | Controle de UI | Acionar/inspecionar para obter a semana completa |
| Ícone de link externo junto a “wa.me” | Link externo de WhatsApp | Link comercial | Capturar URL de destino, não apenas o texto do botão |
| Ícone de link externo junto ao website | Link externo do site | Link comercial | Capturar href real |
| Ícone de copiar junto a endereço/telefone/Plus Code | Copiar informação | Ação/UI | Usar o texto associado como dado; ignorar a ação de copiar |
| “Sugerir mudança” com ícone de edição | Ação do Google Maps | UI | Ignorar |
| “Adicionar marcador” | Ação pessoal do usuário | UI | Ignorar |
| “Seu histórico do Google Maps” | Conteúdo personalizado da sessão | UI/pessoal | Não coletar nem persistir como dado do negócio |

## 3. Endereço, localização e contato

| Elemento | Valor observado | Campo lógico sugerido | Observações |
|---|---|---|---|
| Ícone de pin + endereço | Alameda Joaquim Eugênio de Lima, 1756 - Jardim Paulista, São Paulo - SP, 01403-002 | `address` | Preservar texto original completo |
| Complemento geográfico | Brasil | `country` | Separar quando a extração permitir |
| Bairro | Jardim Paulista | `neighborhood` | Normalização derivada deve manter rastreabilidade |
| Cidade | São Paulo | `city` | Campo estruturado |
| Estado | SP | `state` | Campo estruturado |
| CEP | 01403-002 | `postal_code` | Preservar zero inicial |
| Ícone de Plus Code/localização | C8GR+68 Jardim Paulista, São Paulo - SP | `plus_code` | Campo separado do endereço postal |
| Coordenadas mostradas na URL | Latitude -23.5744293; longitude -46.6592389 | `latitude`, `longitude` | Fonte: URL fornecida; não confundir com precisão garantida do endereço |
| Ícone de telefone | (11) 97656-7032 | `phone` | Preservar valor exibido e, opcionalmente, versão normalizada |
| Link de WhatsApp (“wa.me”) | Link presente na ficha; URL previamente observada: https://wa.me/11976567032 | `whatsapp_url` | Capturar href efetivo; não construir URL a partir do telefone se não houver link observado |
| Ícone de website + domínio | bearzilbarbershop.com.br | `website` | URL previamente observada: https://bearzilbarbershop.com.br/ |
| Link “Agendar on-line” | Rótulo presente | `booking_url` | O destino exato não está no texto fornecido; não inferir que é o website ou WhatsApp |

## 4. Estado de funcionamento e horários

| Elemento visível | Valor observado | Campo lógico sugerido | Regra de interpretação |
|---|---|---|---|
| Ícone de relógio | Fechado · Abre ter. às 10:00 | `business_status`, `next_opening_text` | Estado contextual no momento exibido; não é horário semanal completo |
| Dia seguinte mencionado | terça-feira | `next_open_day` | Texto contextual; normalizar somente com proveniência |
| Horário mencionado | 10:00 | `next_open_time` | Não substituir a tabela semanal |
| Seção “Horários de pico” | Presente | `popular_times` | Separar de horários de funcionamento |
| Rótulo “Segundas-feiras” na seção de pico | Segundas-feiras | `popular_times.selected_day` | É o dia selecionado para o gráfico, não prova que a empresa abre somente na segunda |
| Gráfico de horários de pico | Eixo/horários 06, 09, 12, 15, 18, 21 | `popular_times` | Os números são marcações do eixo; não representam, sozinhos, volume de movimento |
| Ícone de expansão junto ao horário | Controle para ver mais horários | UI que revela `opening_hours` | Abrir e extrair todas as linhas visíveis, se permitido |
| Horário semanal completo | Não transcrito na evidência fornecida | `opening_hours` | Marcar como não capturado; não deduzir horários dos outros dias |

**Distinção obrigatória:** `business_status` é o estado momentâneo; `opening_hours` é a agenda semanal; `next_opening_text` é a mensagem contextual; `popular_times` é o padrão de movimento. São entidades semânticas distintas.

## 5. Serviços, atributos e acessibilidade

| Elemento | Valor observado | Campo lógico sugerido | Observações |
|---|---|---|---|
| Seção “Serviços” | Presente | `services` / seção de serviços | O texto fornecido não lista serviços individuais; não inventar cortes, barba ou outros serviços |
| Link “wa.me” na área de serviços | Presente | `service_links[]` ou link relacionado | Confirmar o destino e a associação com a seção antes de classificar |
| Texto “Empresa que acolhe a comunidade LGBTQ+” | Presente | `attributes[]` | Atributo público da empresa; preservar rótulo original |
| Texto “Se identifica como uma empresa de empreendedoras” | Presente | `attributes[]` | Atributo público da empresa; preservar rótulo original |
| Atributos de acessibilidade informados em coleta anterior | Entrada acessível a cadeirantes; estacionamento acessível a cadeirantes | `accessibility_attributes[]` | Evidência anterior associada à ficha; confirmar se ainda está visível/estruturada na sessão atual |
| Ícones associados aos atributos | Não detalhados individualmente no texto transcrito | `attribute.icon` / metadados de origem, se identificáveis | Não inferir significado de um ícone sem rótulo, tooltip ou associação inequívoca |

Os atributos devem conservar, no mínimo, texto original, categoria semântica, fonte/seção e evidência de extração. Não misturar atributos com a categoria principal do estabelecimento nem com tópicos de avaliações.

## 6. Fotos e vídeos

| Elemento visível | Campo lógico sugerido | Regras |
|---|---|---|
| Seção “Fotos e vídeos” | `media[]` | Registrar que a seção existe, sem assumir que todo o conteúdo foi carregado |
| Filtro “Tudo” | Filtro de UI | Não é categoria de mídia |
| Filtro “Exterior” | Filtro de UI / possível categoria de mídia | Usar como filtro de navegação; atribuir categoria somente a mídias efetivamente identificadas |
| Filtro “Vídeos” | Filtro de UI | Pode abrir a coleção de vídeos; não é um vídeo em si |
| Filtro “Interior” | Filtro de UI / possível categoria de mídia | Não classificar uma imagem sem evidência |
| Filtro “Penteado” | Filtro de UI / possível categoria de mídia | Preservar a categoria quando vinculada a mídia |
| Filtro “Do proprietário” | Filtro de UI / proveniência | Distinguir conteúdo do proprietário de conteúdo enviado por usuários |
| Filtro “Street View e 360°” | Filtro de UI / tipo de mídia | Separar Street View e imagens 360° de fotografias comuns |
| “Adicionar fotos e vídeos” | Ação de UI | Ignorar como dado do negócio |
| URL de imagem previamente observada | https://lh3.googleusercontent.com/grass-cs/AABkmLcwsWM_EIJsCxFHR4NvheqU4h8-f-318uWgbq5MX2acJifeZqjNiGae5jb6us14cvIOMwODPcexBOy_8Fi_p2etBkPaBxcz_gY9BVw4huCIQxreRMwOFI1ATpzXiAQSANdmCBg=w408-h272-k-no | `media[].url` | URL vista em registro anterior; confirmar na execução atual |
| URL de miniatura previamente observada | Mesmo caminho com sufixo `=w32-h32-p-k-no` | `media[].thumbnail_url` ou variante | Não tratar miniatura de 32×32 como fotografia principal |
| Logo/perfil | Não comprovado como logo separado | `logo_url` | Não atribuir automaticamente a primeira foto da galeria como logotipo |

Campos úteis por mídia, quando disponíveis: URL original, URL de miniatura, tipo (foto/vídeo/Street View/360°), categoria, autor/proveniência exibida, dimensões, texto alternativo, ordem e seção de origem. Não contornar controles de acesso nem inventar URL de mídia.

## 7. Avaliação agregada, resumo e comentários

| Elemento visível | Valor observado | Campo lógico sugerido | Regra |
|---|---|---|---|
| Título “Resumo de avaliações” | Presente | Seção de resumo | Rótulo de seção, não tópico |
| Gráfico de distribuição 5/4/3/2/1 estrelas | Distribuição visual presente; valores numéricos por faixa não transcritos | `rating_distribution` | Extrair contagens por estrela apenas quando os valores forem realmente legíveis/estruturados |
| Nota no resumo | 4,9 | `rating` | Deve corresponder à nota agregada, sem duplicar como campo independente incompatível |
| Total no resumo | 278 avaliações | `review_count` | Deve corresponder à contagem agregada observada |
| Trecho de resumo 1 | “Pessoal simpático, profissional, música boa, ambiente agradável e cerveja.” | `review_highlights[]` | Trecho agregado; não atribuir autor individual sem evidência |
| Trecho de resumo 2 | “Sou cliente assinante, um ótimo custo-benefício e excelente localização.” | `review_highlights[]` | Trecho agregado |
| Trecho de resumo 3 | “Excelente serviço de corte e barba em minha visita a São Paulo!” | `review_highlights[]` | Trecho agregado |
| Ação “Avaliar” | Botão de UI | UI | Ignorar |
| Seção “Avaliações” | Presente | `reviews` | Abrir para obter os comentários disponíveis |
| Controles de pesquisa/ordenação | Ícones e rótulos “Ordenar” | UI | Ignorar como dado de avaliação |
| Filtro “Tudo” | Controle de UI | UI | Não é tópico |
| Tópico “ambiente” | 35 | `review_topics[]` | Rótulo e contagem associados |
| Tópico “corte” | 13 | `review_topics[]` | Rótulo e contagem associados |
| Tópico “equipe” | 11 | `review_topics[]` | Rótulo e contagem associados |
| Tópico “recepção” | 8 | `review_topics[]` | Rótulo e contagem associados |
| Controle “+6” | Mais tópicos | UI/indicador de expansão | Expandir para tentar capturar os demais tópicos; não salvar “+6” como tópico |
| Avaliação de Ivan Prado de Andrade | Nome exibido; 6 avaliações; 5 estrelas; “5 meses atrás”; trecho de texto truncado; 1 curtida | `reviews[]` | Preservar texto exatamente como acessível; marcar se truncado |
| Avaliação de Sergio Machado | Local Guide; 15 avaliações; 5 estrelas; “5 meses atrás”; trecho de texto truncado; reação “Gostei” sem contagem numérica | `reviews[]` | “Local Guide” é distintivo do autor, não atributo da barbearia |
| Avaliação de antonio luis | 8 avaliações; 4 fotos; 5 estrelas; “5 meses atrás”; trecho de texto truncado; reação “Gostei” | `reviews[]` | Preservar grafia do nome como exibida |
| “Mais avaliações (275)” | Indicador de avaliações adicionais | UI/contagem contextual | Não somar automaticamente 275 a 278; a relação exata entre contagens depende da interface |
| “Gostei” / ícone de polegar | Reação de usuário | `reviews[].helpful_count` somente se contagem explícita | Sem número, registrar ausência, não zero |
| Ícone de compartilhar em cada avaliação | Ação de UI | UI | Ignorar como dado |
| Texto “Mais” / reticências em avaliação | Expansão de comentário | UI que revela texto | Expandir quando possível; guardar indicador de texto truncado se não for possível |

### Modelo mínimo recomendado para comentário individual

- `author_name`
- `author_badges[]` (ex.: Local Guide)
- `author_review_count`, se exibido
- `author_photo_count`, se exibido
- `rating`
- `relative_date` e data absoluta somente se efetivamente disponível
- `text`
- `text_is_truncated`
- `helpful_count` somente se numérico e explícito
- `source_url` / permalink, se disponível
- `collected_at`
- `source_section`

Não inferir o texto integral a partir de um trecho, nem a data absoluta a partir de “5 meses atrás” sem uma referência temporal confiável. Não interpretar a ausência de comentários retornados como ausência de avaliações na fonte.

## 8. Tópicos de avaliações versus controles da interface

A ficha mostra palavras que parecem etiquetas, mas têm significados diferentes.

**Tópicos de avaliação observados:** ambiente (35), corte (13), equipe (11), recepção (8), além de mais seis tópicos indicados por “+6”.

**Controles/rótulos de interface que não devem virar tópicos:** Visão geral, Avaliações, Sobre, Rotas, Salvar, Próximo, Enviar para o smartphone, Tudo, Ordenar, Mais avaliações, Mais, Compartilhar, Street View e 360°, Satélite, Padrão, Marcadores e outros controles do mapa.

Regra de mapeamento: um tópico só deve ser aceito quando estiver vinculado à seção de avaliações e houver evidência de que é um tópico/categoria de comentário. A presença isolada de texto ou de um elemento com contagem em qualquer região da página não basta.

## 9. “Lugares também pesquisados” e resultados relacionados

A ficha apresenta estabelecimentos relacionados, que não pertencem ao registro principal:

| Nome | Nota | Total de avaliações | Categoria |
|---|---:|---:|---|
| Ronny Barber Beer | 4,2 | 6 | Barbearia |
| Barbearia Rock 'n' Roll Clecio Cabeças & Music Store | 4,7 | 144 | Barbearia |
| ISONEL BARBEARIA | 4,5 | 346 | Barbearia |
| Barbearia Black Zone Consolação | 4,9 | 1.923 | Barbearia |
| Barbearia AeroBarba | Barbearia por assinatura em São Paulo | 4,9 | 283 | Barbearia |

Classificação: recomendações/resultados relacionados da interface. **Não incorporar esses estabelecimentos, avaliações, telefones, imagens ou atributos ao registro da Bearzil.** Se um produto futuro coletar lugares relacionados, eles precisam ser entidades independentes, com identificadores e URLs próprios.

## 10. Metadados da coleta e proveniência

Uma execução deve permitir responder de onde veio cada campo e se foi efetivamente observado.

Campos sugeridos:
- `collected_at`: timestamp da coleta, preferencialmente ISO 8601 UTC.
- `source_url`: URL da ficha.
- `source_place_id`: identificador de lugar se extraído da fonte.
- `scraper_version` / versão do extrator.
- `collection_method`: estratégia usada, sem incluir segredos.
- `field_provenance`: fonte/seção de cada grupo de campos.
- `field_status`: observado, não encontrado, inacessível, não tentado ou falha de extração.
- `partial_failure`: erro e etapa afetada, sem tokens ou dados sensíveis.
- `raw_evidence`: somente conteúdo necessário para auditoria, respeitando privacidade, termos de uso e minimização de dados.

Em uma coleta anterior foi informado o timestamp `2026-10-27T01:28:22.841Z`. Ele é metadado daquela coleta e não deve ser reutilizado como timestamp de uma execução futura.

## 11. Dicionário lógico consolidado

O inventário completo da ficha pode ser organizado nos grupos abaixo. Os nomes são sugestões sem exigir alteração imediata do esquema:

- `identity`: name, category, source_place_id, source_url.
- `rating_summary`: rating, review_count, rating_distribution, review_highlights.
- `location`: address, neighborhood, city, state, postal_code, country, plus_code, latitude, longitude.
- `contact`: phone, website, whatsapp_url, booking_url.
- `business_status`: current_status, next_opening_text, next_open_day, next_open_time.
- `opening_hours`: horários por dia, intervalos, fechado/aberto 24 horas e texto original.
- `popular_times`: dia selecionado, dados de movimento e evidência efetivamente capturada.
- `services`: serviços textualmente listados e links associados.
- `attributes`: atributos gerais, acessibilidade e respectivos rótulos originais.
- `review_topics`: label, count e proveniência.
- `reviews`: autor, distintivos, nota, data exibida, texto, truncamento e reações explicitamente numéricas.
- `media`: URL, tipo, categoria, resolução, autor/proveniência e miniatura.
- `related_places`: entidades separadas, nunca mescladas à ficha principal.
- `collection_metadata`: timestamp, versão, status por campo e falhas parciais.
- `ui_controls`: inventário transitório usado para navegar, nunca persistido como atributos do estabelecimento.

## 12. Lacunas específicas que este mapeamento deixa explícitas

1. O texto da ficha informa nota 4,9 e 278 avaliações; o extrator precisa mapear ambos separadamente.
2. Os tópicos ambiente/corte/equipe/recepção possuem contagens; “+6” indica conteúdo adicional que precisa ser expandido quando acessível.
3. O estado “Fechado · Abre ter. às 10:00” não substitui a tabela semanal.
4. “Horários de pico” é um gráfico de movimento, separado dos horários de abertura.
5. A ficha contém atributos públicos LGBTQ+ e de identificação como empresa de empreendedoras.
6. Há trechos agregados de avaliações e comentários individuais, que devem permanecer em estruturas separadas.
7. A seção de mídia possui filtros de categoria e proveniência; esses filtros não são imagens.
8. “Agendar on-line” está visível, mas seu destino não foi fornecido na transcrição.
9. Os estabelecimentos em “Lugares também pesquisados” são dados de outras entidades.
10. Elementos personalizados, como “Seu histórico do Google Maps”, não fazem parte dos dados públicos do negócio.
11. O texto fornecido não mostra todos os horários semanais, todos os tópicos, a distribuição numérica por estrela, nem o conteúdo integral dos comentários. Esses campos devem permanecer como não capturados até que haja evidência.
12. O mapa de campos é uma especificação de observação, não uma declaração de que o scraper já captura esses valores.

## 13. Critério de completude do mapeamento

Considerar o mapeamento concluído quando cada elemento visível estiver classificado em uma destas classes: dado do estabelecimento, dado agregado de avaliações, comentário individual, mídia, localização/contato, horário, atributo, entidade relacionada, controle de navegação/UI ou metadado de coleta. Cada dado persistível deve ter um campo lógico, regra de interpretação e distinção clara entre valor observado e valor ausente. Este documento, por si só, não afirma que a implementação ou a produção foi corrigida.
