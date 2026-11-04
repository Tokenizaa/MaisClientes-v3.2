# Mapeamento Verificado da Ficha Google Maps — Bearzil Barber Shop Jardins
## Dados extraídos via Firecrawl (Fase 2)

**URL da ficha:** https://www.google.com/maps/place/Barbearia+Bearzil+Barber+Shop+Jardins+-+Barbearia+por+Assinatura+SP/@-23.5744293,-46.6592389,17z/data=!4m7!3m6!1s0x94ce59e8ef43b0db:0x50225dda5a2046ee!8m2!3d-23.5744293!4d-46.6592389!10e1!16s%2Fg%2F11g0455p73

**Extração realizada em:** Mon Oct 26 2026

**Status da extração:** Concluída com sucesso. O Firecrawl extraiu dados visíveis da ficha, mas identificou limitação de visibilidade de alguns campos (como a tabela completa de horários).

---

## 1. Dados de Identificação e Localização

| Campo | Valor Extraído Firecrawl | Documento Mapeamento Anterior | Correspondência | Observações |
|---|---|---|---|---|
| `name` | "Barbearia Bearzil Barber Shop Jardins - Barbearia por Assinatura SP" | `name` (Título principal) | ✅ Confirmado | Texto principal do estabelecimento |
| `category` | "Barber shop" | `category` (Ícone junto ao título) | ✅ Confirmado | Categoria do negócio |
| `address` | "Alameda Joaquim Eugênio de Lima, 1756 - Jardim Paulista, São Paulo - SP, 01403-002, Brazil" | `address` (Endereço) | ✅ Confirmado | Texto original preservado |
| `postal_code` | "01403-002" | `postal_code` (CEP) | ✅ Confirmado | Zero inicial preservado |
| `country` | "Brazil" | `country` (Complemento geográfico) | ✅ Confirmado | Separado quando a extração permitir |
| `city` | "São Paulo" | `city` | ✅ Confirmado | Campo estruturado |
| `state` | "SP" | `state` | ✅ Confirmado | Campo estruturado |
| `plus_code` | "C8GR+68 Jardim Paulista, São Paulo, Brazil" | `plus_code` | ✅ Confirmado | Campo separado do endereço postal |
| `latitude`/`longitude` | (implied from URL: -23.5744293, -46.6592389) | `latitude`, `longitude` | ✅ Confirmado | Fonte: URL fornecida |
| `phone` | "+55 11 97656-7032" | `phone` | ✅ Confirmado | Preservar valor exibido |
| `website` | "https://bearzilbarbershop.com.br" | `website` | ✅ Confirmado | URL previamente observada |
| `source_url` | URL completa da ficha | `source_url` | ✅ Confirmado | URL canônica capturada |
| `source_place_id` | "0x94ce59e8ef43b0db:0x50225dda5a2046ee" | `source_place_id` | ✅ Confirmado | Identificador da fonte |

---

## 2. Ações e Controles de Interface

| Campo | Valor Extraído Firecrawl | Documento Mapeamento Anterior | Correspondência | Observações |
|---|---|---|---|---|
| `booking_url` | "https://sites.appbarber.com.br/bearzil?source=google_reserve&rwg_token=..." | `booking_url` (Agendar on-line) | ✅ Confirmado | URL de destino capturada |
| `status` | "Closed · Opens 10 AM Tue" | `business_status`, `next_opening_text` | ✅ Confirmado | Estado momentâneo + próximo horário de abertura |
| `attributes` | ["LGBTQ+ friendly", "Identifies as women-owned"] | `attributes[]` (Seção serviços) | ✅ Confirmado | Atributos públicos da empresa |
| `accessibility` | ["Wheelchair accessible entrance", "Wheelchair accessible parking lot"] | `accessibility_attributes[]` | ✅ Confirmado | Atributos de acessibilidade |
| `visible_interface_labels` | ["See photos","Directions","Save","Nearby","Send to phone","Share","Book online","Photos","Review summary","Write a review","Reviews","More reviews (275)","Suggest an edit","You're seeing a limited view of Google Maps"] | UI controles (Seção 2) | ✅ Documentado | Rótulos de navegação — não são dados comerciais |

---

## 3. Avaliações e Tópicos

| Campo | Valor Extraído Firecrawl | Documento Mapeamento Anterior | Correspondência | Observações |
|---|---|---|---|---|
| `rating` | 4.9 | `rating` (Nota agregada) | ✅ Confirmado | Must match aggregated rating |
| `review_count` | 278 | `review_count` (Contagem) | ✅ Confirmado | Must match aggregated count |
| `visible_photos` | 187 | `media[]` (Seção fotos/vídeos) | ✅ Confirmado | Número de fotos visíveis |
| `review_highlights` | ["The barbers are professionals, nice place.", "Very good, and friendly staff", "Great haircut by Marcelo."] | `review_highlights[]` (Trechos resumo) | ✅ Confirmado | Trechos agregados de avaliações |
| `review_topic_counts` | {"environment": 45, "punctuality": 17, "polite barber": 3, "monthly plan": 2} | `review_topics[]` (Tópicos com contagem) | ✅ Confirmado | Tópicos com contagens numéricas |
| `visible_reviews` | 3 reviews completas (autor, texto, rating, data) | `reviews[]` (Comentários individuais) | ✅ Confirmado | Apenas 3 das 278 disponíveis visíveis |
| `review_topics` | environment (45), punctuality (17), polite barber (3), monthly plan (2) | `review_topics[]` | ✅ Confirmado | Tópicos vinculados à seção de avaliações |

---

## 4. Mídia (Fotos e Vídeos)

| Campo | Valor Extraído Firecrawl | Documento Mapeamento Anterior | Correspondência | Observações |
|---|---|---|---|---|
| `visible_photos` | 187 | `media[]` (Contagem/section) | ✅ Confirmado | Número de fotos visíveis na galeria |
| `logo_url` | *Não extraído* (dados limitados) | `logo_url` (Logotipo/perfil) | ⚠️ Não encontrado | Extração observou limitação: "Google Maps displayed a limited-view notice" |
| URLs de miniatura/thumbnails | *Não disponíveis no extração* | `media[].thumbnail_url` | ⚠️ Inacessível | Requer acessão à galeria completa |

---

## 5. Horários de Funcionamento

| Campo | Valor Extraído Firecrawl | Documento Mapeamento Anterior | Correspondência | Observações |
|---|---|---|---|---|
| `business_status` / `status` | "Closed · Opens 10 AM Tue" | `business_status`, `next_opening_text`, `next_open_day`, `next_open_time` | ✅ Confirmado | Estado contextual + próximo horário de abertura |
| `opening_hours` (tabela semanal) | *Não extraído* | `opening_hours` (horário semanal completo) | ❌ Inacessível | O documento observa: "Google Maps displayed a limited-view notice; no opening-hours schedule or prices were exposed beyond the visible status line." |
| `popular_times` | *Não extraído* (dado limitado) | `popular_times` (padrão de movimento) | ❌ Inacessível | Requer expansão da seção de horários |

---

## 6. Campos Não Acessíveis / Limitações da Extração

A extração Firecrawl identificou explicitamente estas limitações no documento:

1. **`opening_hours`** — Tabela semanal completa não foi exposta além do status momentâneo "Closed · Opens 10 AM Tue"
2. **`popular_times`** — Padrão de movimento não acessível sem expansão dos horários
3. **`logo_url`** — Não foi possível identificar imagem de logotipo separada das fotos da galera
4. **Thumbnail URLs** — URLs de miniatura de mídia não disponíveis no extração simplificada
5. **Distribuição de estrelas por faixa** (`rating_distribution`) — Contagens por estrela (5/4/3/2/1) não estruturadas na extração
6. **Comentários completos das 278 avaliações** — Apenas 3 reviews foram visíveis na view limitada

**Motivação:** O Google Maps exibiu um aviso de "view limited" durante a extração, restringindo o acesso a dados completos da ficha.

---

## 7. Evidência Técnica e Seletores

A extração utilizou os recursos do Firecrawl agent para navegar e extrair dados da página do Google Maps. Os principais dados foram obtidos através de:

- **Extração de rótulos visíveis** (aria-label, innerText) dos elementos da ficha
- **Identificação de atributos** pela seção de informações da empresa
- **Captura de reviews** visíveis no painel de avaliações
- **Extração de URLs** de website, booking e outros links comerciais

A evidência completa está no arquivo JSON gerado: `/tmp/bearzil-firecrawl.json`

---

## 8. Distinção de Dados da Bearzil vs. Estabelecimentos próximos

O mapeamento separou corretamente os dados da Bearzil Barber Shop Jardins dos estabelecimentos "Lugares também pesquisados" listados no documento original:

- Ronny Barber Beer
- Barbearia Rock 'n' Roll Clecio Cabeças & Music Store
- ISONEL BARBEARIA
- Barbearia Black Zone Consolação
- Barbearia AeroBarba

**Regra:** Estes estabelecimentos são entidades diferentes e **não devem ser incorporados** ao registro da Bearzil. Cada um precisa de seus próprios identificadores e URLs.

---

## 9. Critério de Status por Campo

| Status | Definição |
|---|---|
| `confirmado` | Campo extraído com valor direto da extração Firecrawl, correspondente ao documento de mapeamento anterior |
| `parcialmente confirmado` | Campo extraído com valor parcial ou requere interpretação adicional (ex: status "Closed · Opens 10 AM Tue") |
| `inacessível` | Campo não disponível na view limitada do Google Maps (ex: opening_hours completo, logo_url, popular_times) |
| `não encontrado` | Campo que não se aplica ou não foi procurado |

---

## Próximos Passos (Fase 3 e 4)

1. **Fase 3:** Comparar este mapeamento verificado com o código existente (extractor.ts, db.ts, runner.ts) para identificar lacunas e correções necessárias.
2. **Fase 4:** Implementar correções no extrator baseadas nas evidências obtidas, priorizando campos confirmados e planejando fallback para campos inacessíveis.
3. **Fase 5:** Criar documento de reconciliação `docs/reconciliacao-mapeamento-dados-google-maps-bearzil.md`.
4. **Fase 6:** Validar, commitar e sincronizar.

---

**Referência:** Este documento deve ser lido em conjunto com `docs/mapeamento-detalhado-ficha-google-maps-bearzil.md` (mapeamento inicial de observação) e `docs/reconciliacao-mapeamento-dados-google-maps-bearzil.md` (documento de reconciliação final).