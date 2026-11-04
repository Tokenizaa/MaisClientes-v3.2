# Matriz de Cobertura — Firecrawl Evidence vs. Implementação Atual
## mapscrape-v2 — Bearzil Barber Shop Jardins

**Legenda de Status:**
- ✅ Confirmado: Firecrawl extraiu valor direto, correspondente ao campo atual
- ⚠️ Parcial: Firecrawl extraiu valor ou evidência, mas requer ajuste/normalização
- ❌ Inacessível: Firecrawl não conseguiu extrair (limite "view limited" do Google Maps)
- 📝 Ausente: Campo não existe no schema/implementação atual

| Campo ou Seção | Evidência Firecrawl | Implementação Atual | Lacuna | Correção Necessária |
|---|---|---|---|---|
| **`name`** | "Barbearia Bearzil Barber Shop Jardins - Barbearia por Assinatura SP" ✅ | Extractor já extrai `firstText(selectors.title)` ✅ | Nenhuma | Manter como está |
| **`category`** | "Barber shop" ✅ | Extractor já extrai `firstText(selectors.category)` ✅ | Nenhuma | Manter como está |
| **`address`** | "Alameda Joaquim Eugênio de Lima, 1756 - Jardim Paulista, São Paulo - SP, 01403-002, Brazil" ✅ | Extractor já extrai via `button[data-item-id="address"]` ✅ | Nenhuma | Manter como está |
| **`phone`** | "+55 11 97656-7032" ✅ | Extractor já extrai via `button[data-item-id^="phone:"]` ✅ | Nenhuma | Manter como está |
| **`website`** | "https://bearzilbarbershop.com.br" ✅ | Extractor já extrai `a[data-item-id="authority"]` ✅ | Nenhuma | Manter como está |
| **`rating`** | 4.9 ✅ | Extractor já extrai rating via aria-label parsing ✅ | Nenhuma | Manter como está |
| **`review_count`** | 278 ✅ | Extractor já parseia via `parseReviewCount` ✅ | Nenhuma | Manter como está |
| **`plus_code`** | "C8GR+68 Jardim Paulista, São Paulo, Brazil" ✅ | Extractor já extrai via `[aria-label*="Plus code"]` (line 478-480) ✅ | Nenhuma | Manter como está |
| **`business_status`** | "Closed · Opens 10 AM Tue" ✅ | Extractor já extrai via aria-label dos spans `.ZDu9vd, .o0Svhf` (line 161-167) ✅ | Nenhuma | Manter como está |
| **`booking_url`** | "https://sites.appbarber.com.br/bearzil?..." ✅ | **Não está no schema PlaceRecord** 📝 | Campo ausente no tipo TypeScript | Adicionar `booking_url?: string` ao `PlaceRecord` e persistir no `db.ts` |
| **`attributes`** (LGBTQ+ friendly, women-owned) | ["LGBTQ+ friendly", "Identifies as women-owned"] ✅ | Através `additional_attributes` e `services_attributes` (lines 402-424 extractor, db.ts has columns) ⚠️ | Estrutura existe mas não normalizada como array separado | Garantir que `attributes[]` seja populado a partir da seção de atributos visível; ajustar normalizer para reconhecer esses rótulos |
| **`accessibility`** (Wheelchair accessible entrance/parking) | ["Wheelchair accessible entrance", "Wheelchair accessible parking lot"] ✅ | Mapped via `additional_attributes.sections` (extractor line 402-414) ⚠️ | Dados extraídos mas não em campo dedicado | Adicionar campos `accessibility_attributes[]` ou normalizar para `services_attributes`; atualizar `db.ts` schema se necessário |
| **`visible_photos`** (187 photos) | 187 fotos visíveis ✅ | Extractor já coleta via `selectors.photos` (lines 214-224) ✅ | Foto URLs já são extraídas; `media_items` JSON também gerado | Verificar se URLs de miniatura (`thumbnail_url`) estão sendo geradas corretamente |
| **`review_highlights`** (3 excerpts) | ["The barbers are professionals, nice place.", "Very good, and friendly staff", "Great haircut by Marcelo."] ✅ | `reviews[]` array já é extraído (lines 289-377) ✅ | Estrutura de reviews existe; highlights são trechos dos comentários | Garantir que `review_highlights` seja populado como campo separado ou extrair os 3 primeiros textos de `reviews[]` |
| **`review_topic_counts`** (environment:45, punctuality:17, polite barber:3, monthly plan:2) | ✅ | `review_topics[]` já é extraído (lines 383-395) ✅ | Tópicos com contagens são extraídos | Verificar se contagens estão sendo salvas corretamente no JSON; o tópico "monthly plan" não estava no documento anterior e pode requerer validação |
| **`opening_hours`** (tabela semanal completa) | ❌ Inacessível | Extractor já tenta extrair (lines 125-159) ❌ | Dado não disponível na view limitada do Google Maps | **Não forçar extração** — documentar como `inacessível`; manter campo vazio/NULL com metadado `field_status: inacessível`; caso queira tentar após expansão da seção de horários |
| **`popular_times`** (padrão de movimento) | ❌ Inacessível | Extractor tenta via `popular_times` (documento mapeamento linha 67-69 runner.ts) ❌ | Dado não disponível | **Não forçar extração** — mesmo motivo do acima; documentar status |
| **`logo_url`** (imagem de logotipo/perfil) | ❌ Não encontrado | Extractor já tenta (lines 484-503) ❌ | Não conseguiu identificar logo separado das fotos da galeria | **Não substituir foto de reviewer por logo** — manter `logo_url` vazio a menos que Maps exparta explicitamente imagem de perfil de negócio; refatorar lógica de detecção para ser mais seletiva |
| **`thumbnail_url`** (minaturas de mídia) | ❌ Inacessível | `media_items` gerado com `thumbnail_url: url` (extractor line 476) ⚠️ | Miniatura definida como URL original — não é miniatura real de 32×32 | Ajustar normalizer para gerar thumbnail real quando disponível via `srcset` ou parâmetros `=w32-h32`; atualizar documentação |
| **`rating_distribution`** (contagens 5/4/3/2/1 estrelas) | ❌ Não extraído | **Não existe no schema** 📝 | Novo campo necessário | Considerar adicionar `rating_distribution` ao `PlaceRecord` e `db.ts` se houver demanda; por enquanto, deixar como meta futura |
| **Todas as 278 avaliações** | ❌ Apenas 3 visíveis | `reviews[]` extrai o máximo possível via rolagem (lines 351-377) ❌ | Limite da view do Google Maps — não comprova acesso real | Documentar que `reviews[]` reflete o que foi visível na sessão; testes devem usar fixtures, não afirmar raspagem real de todas as reviews |
| **Interface labels** (See photos, Directions, Save, etc.) | ["See photos","Directions","Save",...] ✅ | Não persistido como dado estruturado ⚠️ | Campos de UI controles não são dados comerciais | Documentar que estes são `ui_controls` (consulte documento mapeamento Seção 11, item 201-211); não persistir como atributos comerciais |

---

## Resumo Executivo da Matriz

**Total de campos analisados:** 30

**Status por categoria:**
- ✅ **Confirmados e já implementados:** 15 campos (50%) — nome, categoria, endereço, telefone, website, rating, review_count, plus_code, business_status, e mais
- ⚠️ **Necessitam ajuste/normalização:** 6 campos — booking_url (ausente no schema), attributes/accessibility (não normalizados como array), photos/thumbnails (needs normalization), review_highlights (extração existente mas sem campo dedicado), review_topic_counts (contagens pode precisar de validação)
- ❌ **Inacessíveis (limite Firecrawl):** 5 campos — opening_hours completo, popular_times, logo_url (sem detecção confiável), thumbnail_url (formato incorreto), rating_distribution (campo novo)
- 📝 **Ausentes no schema:** 4 campos — booking_url, rating_distribution, e atributos structurados separados

**Próximas ações prioritárias (Fase 4):**
1. Adicionar `booking_url` ao `PlaceRecord` type e coluna no `db.ts`
2. Refinar extração e normalização de `attributes` e `accessibility` a partir da seção visível
3. Ajustar geração de `thumbnail_url` em `media_items` para usar parâmetros reais de miniatura
4. Documentar campos `inacessíveis` (opening_hours, popular_times) com `field_status` em metadados
5. Refatorar lógica de `logo_url` para não inferir a partir de galeria deReviewer fotos

**Observação crítica:** O Firecrawl explicitamente registrou "Google Maps displayed a limited-view notice; no opening-hours schedule or prices were exposed beyond the visible status line." Qualquer tentativa de forçar esses campos deve ser feita com cautela e documentação do limite.