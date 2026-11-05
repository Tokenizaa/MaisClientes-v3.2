# Plano de Negócios: MaisClientes/MapScrape

**Meta**: R$10.000/mês MRR em 12 meses  
**Data**: 2025-11-05  
**Versão**: 1.0

---

## 1. Resumo Executivo

**Produto**: MaisClientes (MapScrape) — SaaS vertical de geração de leads via scraping do Google Maps/Places, feito para o mercado brasileiro.

**Proposta de Valor**: *"Único gerador de leads locais do Google Maps feito para o Brasil — LGPD, PIX, suporte PT-BR, zero configuração."*

**Meta**: R$10.000 MRR em 12 meses (≈ 50 clientes pagantes com ticket médio R$200).

**Diferenciais Competitivos**:
- Vertical (lead gen local) vs. horizontal (PhantomBuster, Apify)
- Source-native (dados frescos do Maps) vs. DBs estáticas (Lusha, Apollo)
- No-code SaaS vs. dev-tools (Octoparse, BrightData)
- **Moat**: Localização brasileira completa (LGPD, PIX, Boleto, PT-BR, suporte local)

---

## 2. Estratégia de Pricing & Packaging

| Plano | Preço Mensal | Preço Anual (20% off) | Leads/Mês | Projetos | Features-chave |
|-------|--------------|----------------------|-----------|----------|----------------|
| **Free** | R$0 | — | 500 (one-time) | 1 | Ativação, teste real |
| **Starter** | R$197 | R$1.891 | 10.000 | 5 | Export CSV/Excel, histórico |
| **Growth** | R$497 | R$4.771 | 50.000 | 20 | **API access**, webhooks, filtros avançados |
| **Pro** | R$997 | R$9.571 | 200.000 | ∞ | **White-label**, prioridade, 2-way CRM sync, AI scoring |

**Lógica de Upgrade**:
- Free → Starter: quota esgotada (500 leads)
- Starter → Growth: precisa API/webhooks ou >10k leads/mês
- Growth → Pro: white-label para agências, volume alto, CRM sync

**Unit Economics alvo**:
- LTV: R$2.500 (2,5 anos média)
- CAC blended: < R$150
- Payback: < 3 meses
- Margem líquida a R$10k MRR: ~65%

---

## 3. Go-to-Market Strategy (Product-Led Growth)

### Fase 1: Validação & Beta (Mês 1-2)
- **Waitlist**: 50 usuários (agências marketing, imobiliárias, franquias)
- **Onboarding manual**: calls de 30min, feedback direto
- **Métrica**: 40% ativação (cria projeto), 20% conversão free→paid

### Fase 2: Launch Público (Mês 3-4)
- **Product Hunt Brazil** + **Indie Hackers BR** + **BetaList**
- **Content SEO**: 20 artigos alvo ("como captar leads Google Maps", "scraping leads imobiliárias", "prospecção B2B local")
- **Lead magnets**: templates de outreach, calculadora ROI leads

### Fase 3: Escala & Parcerias (Mês 5-8)
- **Programa Agências**: 30% rev share vitalício, portal parceiro, white-label Pro
- **Integrações nativas**: RD Station, Pipedrive, HubSpot, Nectar CRM
- **Paid Acquisition**: Meta/Google Ads (keywords: "gestão leads", "prospecção B2B", "leads imobiliárias")

### Fase 4: Otimização & Expansão (Mês 9-12)
- **AI Lead Scoring** (GenAI enrichment): diferencial vs. scrapers puros
- **CRM Sync 2-way**: retenção máxima
- **Expansão vertical**: nichos (franquias, saúde, educação, construção)

---

## 4. Funil de Aquisição & Canais

```
Visitor (Orgânico/Pago/Indicação)
    ↓  (Landing page: demo interativa, cases, LGPD badge)
Free Tier Signup (500 leads grátis)
    ↓  (Onboarding: wizard 3 passos — segmento, localização, limite)
Activated User (cria 1º projeto)
    ↓  (Engajamento: usa 80%+ da quota, exporta, retorna semanal)
PQL (Product Qualified Lead)
    ↓  (In-app upgrade prompt contextual + email drip)
Paid Customer
```

### Mix de Canais & CAC Targets

| Canal | % Mix | CAC Target | Estratégia |
|-------|-------|------------|------------|
| **SEO/Content** | 60% | < R$50 | 20 artigos/mês, cluster tópico "leads locais", link building guest posts |
| **Parcerias Agências** | 20% | < R$100 | Programa 30% rev share, co-marketing, certificação |
| **Paid Social** | 15% | < R$200 | Meta/Google ads, lookalike de clientes, retargeting free users |
| **Cold Email/Outbound** | 5% | < R$300 | Apolo/Instantly, 50/dia, sequência 5 toque, nicho imobiliário/franquias |

### Métricas de Funil (Targets Mês 12)
- Visitantes/mês: 15.000
- Free signups/semana: 50 (200/mês)
- Taxa ativação (projeto criado): 40%
- Taxa PQL (usa 80%+ quota): 25% dos ativados
- Conversão Free→Paid: 20% dos PQLs
- **Clientes pagantes/mês: 50** (R$10k MRR)
- Churn mensal: < 5%

---

## 5. Roadmap de Features (6 Meses)

### Mês 1-2: Fundação (Revenue Unlock)
| Feature | Esforço | Impacto | Status |
|---------|---------|---------|--------|
| LGPD Compliance Dashboard | M | Alto (trust, legal) | ⬜ |
| PIX/Boleto Billing (Mercado Pago/Asaas) | M | **Crítico** (conversão BR) | ⬜ |
| Email Notifications (progresso, quota, resultados) | S | Médio (engajamento) | ⬜ |
| Usage Analytics (dashboard quotas, projetos ativos) | S | Médio (PQL detection) | ⬜ |

### Mês 3-4: Crescimento (Stickiness & Expansion)
| Feature | Esforço | Impacto | Status |
|---------|---------|---------|--------|
| API Access (Growth+) | M | Alto (devs, agências) | ⬜ |
| Webhooks (RD Station, Pipedrive, HubSpot, Nectar) | M | **Alto** (workflow integration) | ⬜ |
| Team Collaboration (multi-user, roles) | M | Médio (expansão conta) | ⬜ |
| Advanced Filters (rating ≥, reviews ≥, tem telefone, horário) | S | Médio (qualidade lead) | ⬜ |

### Mês 5-6: Escala (Channel & Differentiation)
| Feature | Esforço | Impacto | Status |
|---------|---------|---------|--------|
| White-label (Pro) | M | **Muito Alto** (agências) | ⬜ |
| Bulk Export Scheduling (cron, email/Drive) | S | Médio (power users) | ⬜ |
| CRM Sync 2-way (atualiza status no CRM) | G | **Muito Alto** (retenção) | ⬜ |
| Agency Partner Portal (gestão clientes, faturamento) | M | Alto (canal) | ⬜ |
| AI Lead Scoring (GenAI: enriquecimento, score, icp match) | G | **Diferencial** (vs concorrentes) | ⬜ |

---

## 6. Análise Competitiva & Posicionamento

| Concorrente | Tipo | Preço | Fraqueza | Nossa Vantagem |
|-------------|------|-------|----------|----------------|
| **PhantomBuster** | Horizontal automation | $56-900/mo | Complexo, dev-focused, não BR | Vertical, no-code, PT-BR, LGPD |
| **Apify** | Marketplace scrapers | $49-499/mo | Marketplace, curva aprendizado | Produto único, ready-to-use |
| **Lusha/Apollo** | Contact DB | $99-999/mo | Dados estáticos, caros, não local | **Source-native** (Maps = fresco), pay-per-lead |
| **Octoparse/BrightData** | Dev tools | $89-5000/mo | Precisa codificar, manutenção | **SaaS gerenciado**, zero manutenção |
| **Scrapers BR genéricos** | Scripts/ferramentas | R$50-300/mo | Instáveis, sem suporte, legal gray | **Compliance**, suporte, SLA |

**Posicionamento**: *"O único gerador de leads locais do Google Maps feito para o Brasil — LGPD compliant, PIX/Boleto, suporte em português, zero configuração."*

**Moats Defensíveis**:
1. **Localização profunda**: LGPD, PIX, Boleto, NFe, suporte PT-BR, fuso horário
2. **Verticalização**: UX feita para lead gen (não automação genérica)
3. **Data freshness**: Source-native vs. DBs envelhecidas
4. **Channel lock-in**: Programa agências 30% rev share + white-label
5. **AI differentiation**: Lead scoring + enriquecimento (não só raw data)

---

## 7. Projeção Financeira (12 Meses)

### Receita (MRR)

| Mês | Free Users | Paid Users | MRR | Acumulado |
|-----|------------|------------|-----|-----------|
| 1-3 | 100 | 5 | R$1.000 | R$3.000 |
| 4-6 | 300 | 20 | R$4.000 | R$15.000 |
| 7-9 | 500 | 35 | R$7.000 | R$36.000 |
| 10-12 | 800 | 55 | R$11.000 | R$69.000 |

**Blend ticket médio**: R$200 (mix Starter/Growth/Pro)

### Custos Mensais (Estimados)

| Item | Mês 1-3 | Mês 4-6 | Mês 7-9 | Mês 10-12 |
|------|---------|---------|---------|-----------|
| **Supabase** (auth + DB) | R$200 | R$300 | R$500 | R$800 |
| **Cloudflare Workers/Pages** | R$50 | R$100 | R$150 | R$200 |
| **Browserless/Scraping infra** | R$500 | R$1.000 | R$2.000 | R$3.500 |
| **Google GenAI API** | R$100 | R$300 | R$800 | R$1.500 |
| **Ads (Meta/Google)** | R$1.000 | R$2.000 | R$3.000 | R$4.000 |
| **Ferramentas (email, analytics, etc)** | R$300 | R$500 | R$800 | R$1.000 |
| **Total Custos** | **R$2.150** | **R$4.200** | **R$7.250** | **R$11.000** |

### Resultado Líquido

| Mês | MRR | Custos | Lucro Líquido | Margem |
|-----|-----|--------|---------------|--------|
| 3 | R$2.000 | R$2.150 | -R$150 | -7% |
| 6 | R$4.500 | R$4.200 | R$300 | 7% |
| 9 | R$7.500 | R$7.250 | R$250 | 3% |
| 12 | R$11.000 | R$11.000 | R$0 | 0%* |

*No mês 12 atinge break-even operacional. **Margem bruta ~65%**, mas reinvestimento em ads acelera crescimento. A partir do mês 13, redução % ads → margem 40%+.

**Caixa necessário até break-even**: ~R$15.000 (3-4 meses custos)

---

## 8. Riscos & Mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **Google Maps blocking/scraping changes** | Alta | Crítico | Browserless pool rotativo, user-agent rotation, rate limiting respeitoso, fallback APIs |
| **LGPD/ANPD fiscalização** | Média | Alto | DPO nomeado, DPIA, consentimento legítimo documentado, opt-out fácil, retenção mínima |
| **Concorrente grande entra no BR** | Baixa | Médio | Moats: verticalização, channel partnerships, white-label, AI scoring |
| **CAC sobe (ads saturam)** | Média | Médio | Diversificar canais: SEO compounding, referral program, parcerias |
| **Churn alto (>10%)** | Média | Alto | Onboarding guided, health scores, proactive success, CRM sync lock-in |
| **Dependência Browserless** | Baixa | Médio | Multi-provider (ScrapingBee, ZenRows, self-hosted Playwright) |

---

## 9. Próximos Passos Imediatos (Semana 1-2)

### Técnico (Revenue Unlock)
1. [ ] **LGPD Dashboard**: página `/privacy` com consentimento, exportação dados, exclusão
2. [ ] **PIX/Boleto Integration**: Mercado Pago ou Asaas webhook → supabase subscription status
3. [ ] **Email Notifications**: Resend/SendGrid → progresso job, quota 80%, resultados prontos
4. [ ] **Usage Analytics**: dashboard `/usage` com gráficos quota, projetos ativos, leads/hora

### Produto/Marketing
5. [ ] **Landing Page v2**: demo interativa (iframe do app), cases reais, badge LGPD, calculadora ROI
6. [ ] **Waitlist Form**: tipo + segmento + volume esperado → segmentar beta
7. [ ] **Onboarding Wizard**: 3 passos (segmento → localização → limite) → primeiro job auto
8. [ ] **Content Pipeline**: 5 artigos SEO prontos para launch (keyword research feito)

### Go-to-Market
9. [ ] **Lista 50 Beta Users**: LinkedIn search "gestor marketing imobiliária", "franqueador", "agência leads"
10. [ ] **Cold Email Sequence**: 5 emails, foco dor (tempo prospecção, leads frios, planilhas manuais)
11. [ ] **Agency Partner Deck**: 1-pager benefícios (30% rev share, white-label, suporte prioritário)

---

## 10. Métricas de Acompanhamento (Dashboard Semanal)

| Categoria | Métrica | Target Semanal | Ferramenta |
|-----------|---------|----------------|------------|
| **Aquisição** | Visitantes únicos | +10% WoW | Plausible/GA4 |
| **Aquisição** | Free signups | 10/semana | Supabase Auth |
| **Ativação** | Taxa ativação (projeto criado) | >40% | Mixpanel/PostHog |
| **Engajamento** | Projetos ativos/mês | 50 (mês 12) | Dashboard interno |
| **Engajamento** | Quota utilization médio | >60% | Dashboard interno |
| **Conversão** | Free → PQL (80% quota) | >25% | Dashboard interno |
| **Conversão** | PQL → Paid | >20% | Stripe/Asaas |
| **Receita** | MRR | R$10k (mês 12) | Stripe/Asaas |
| **Retenção** | Churn mensal | <5% | Stripe/Asaas |
| **Unit Econ** | CAC blended | <R$150 | Planilha |
| **Unit Econ** | LTV | >R$2.500 | Planilha |
| **Unit Econ** | Payback | <3 meses | Planilha |

---

## 11. Conclusão

**MaisClientes tem produto, tecnologia e timing certos para capturar o mercado brasileiro de lead gen local.**

**O caminho para R$10k MRR é claro:**
1. **Mês 1-2**: Unlock revenue (LGPD, PIX, emails, analytics) + Beta 50 users
2. **Mês 3-4**: Launch público + SEO + primeiras vendas orgânicas
3. **Mês 5-8**: Programa agências + integrações CRM + paid ads escalando
4. **Mês 9-12**: White-label + AI scoring + CRM 2-way → R$10k MRR

**Investimento necessário**: ~R$15k caixa (3-4 meses) + seu tempo full-time.

**Diferencial decisivo**: Execução consistente no **canal agências** (30% rev share) + **SEO compounding** + **produto que entrega valor no primeiro uso** (500 leads grátis → aha! moment).

---

*Documento vivo — revisar quinzenalmente, ajustar targets baseados em dados reais.*