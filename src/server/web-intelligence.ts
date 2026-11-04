import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import type {
  PlaceRecord,
  WebEvidence,
  WebIntelligenceRecord,
  WebIntelligenceStatus,
  WebScoreBreakdown,
  EvidenceConfidence,
} from '../shared/types.js';

// Social networks, directories, and marketplaces that must not be treated as institutional websites
const NON_INSTITUTIONAL_DOMAINS = [
  'instagram.com',
  'facebook.com',
  'fb.com',
  'linkedin.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'wa.me',
  'api.whatsapp.com',
  'chat.whatsapp.com',
  't.me',
  'telegram.me',
  'mercadolivre.com.br',
  'mercadolibre.com',
  'ifood.com.br',
  'rappi.com.br',
  'shopee.com.br',
  'americanas.com.br',
  'magazineluiza.com.br',
  'guiafacil.com',
  'apontador.com.br',
  'telelistas.net',
  'google.com',
  'linktr.ee',
  'beacons.ai',
  'bio.link',
  'allmylinks.com',
  'maps.google.com',
];

export function isSocialOrDirectoryUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return true;
  try {
    const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    const host = parsed.hostname.toLowerCase();
    return NON_INSTITUTIONAL_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

export function normalizeWebsiteUrl(rawUrl: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes('.')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export interface ExtractedPageContent {
  url: string;
  title: string;
  description: string;
  headings: string[];
  mainText: string;
  detectedTech: string[];
  hasEcommerce: boolean;
  hasOnlineBooking: boolean;
  supportChannels: string[];
  subLinks: string[];
}

export interface WebsiteScrapeResult {
  isAccessible: boolean;
  status: WebIntelligenceStatus;
  statusMessage: string;
  resolvedUrl?: string;
  homePage?: ExtractedPageContent;
  subPages?: ExtractedPageContent[];
}

const COMMON_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

async function fetchPage(targetUrl: string, timeoutMs = 8000): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: COMMON_BROWSER_HEADERS,
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const html = await response.text();
    return { html, finalUrl: response.url || targetUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parsePageHtml(url: string, html: string): ExtractedPageContent {
  const $ = cheerio.load(html);

  // Remove noise
  $('script, style, noscript, svg, iframe, canvas, form[action*="login"]').remove();

  const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';

  const headings: string[] = [];
  $('h1, h2, h3').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 2 && text.length < 140 && !headings.includes(text)) {
      headings.push(text);
    }
  });

  // Extract clean visible text
  const bodyText = $('body')
    .text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 7000);

  // Detect tech / platforms
  const htmlLower = html.toLowerCase();
  const detectedTech: string[] = [];
  if (htmlLower.includes('woocommerce') || htmlLower.includes('wp-content')) detectedTech.push('WordPress/WooCommerce');
  if (htmlLower.includes('shopify') || htmlLower.includes('cdn.shopify.com')) detectedTech.push('Shopify');
  if (htmlLower.includes('vtex')) detectedTech.push('VTEX');
  if (htmlLower.includes('nuvemshop')) detectedTech.push('Nuvemshop');
  if (htmlLower.includes('tray.com.br') || htmlLower.includes('traycorp')) detectedTech.push('Tray Commerce');
  if (htmlLower.includes('rdstation') || htmlLower.includes('rd station')) detectedTech.push('RD Station');
  if (htmlLower.includes('hubspot')) detectedTech.push('HubSpot');
  if (htmlLower.includes('jivochat')) detectedTech.push('JivoChat');
  if (htmlLower.includes('zendesk')) detectedTech.push('Zendesk');
  if (htmlLower.includes('google-analytics') || htmlLower.includes('gtag') || htmlLower.includes('googletagmanager')) {
    detectedTech.push('Google Analytics/Tag Manager');
  }
  if (htmlLower.includes('mercadopago')) detectedTech.push('Mercado Pago');
  if (htmlLower.includes('pagseguro')) detectedTech.push('PagSeguro');

  // Detect e-commerce indicators
  const hasEcommerce =
    detectedTech.some((t) => ['Shopify', 'WooCommerce', 'VTEX', 'Nuvemshop', 'Tray Commerce'].includes(t)) ||
    $('a[href*="carrinho"], a[href*="cart"], a[href*="checkout"], button:contains("Comprar"), .preco, .price').length > 0;

  // Detect online booking / ordering
  const hasOnlineBooking =
    $('a[href*="agendar"], a[href*="reserva"], a[href*="booking"], a[href*="pedir"], a[href*="delivery"]').length > 0 ||
    /agende online|fazer reserva|faça sua reserva|peça online|faça seu pedido/i.test(bodyText);

  // Support channels
  const supportChannels: string[] = [];
  if (/whatsapp|wa\.me|api\.whatsapp/i.test(htmlLower)) supportChannels.push('WhatsApp');
  if (/mailto:/i.test(htmlLower)) supportChannels.push('E-mail Comercial');
  if (/tel:/i.test(htmlLower) || /\(\d{2}\)\s*\d{4,5}-\d{4}/.test(bodyText)) supportChannels.push('Telefone / Central');
  if (htmlLower.includes('jivo') || htmlLower.includes('chat') || htmlLower.includes('tawk')) supportChannels.push('Chat Online');
  if ($('form').length > 0 && /fale conosco|contato|mensagem/i.test(bodyText)) supportChannels.push('Formulário de Contato');

  // Extract internal links of interest
  const parsedHost = new URL(url).hostname;
  const subLinks: string[] = [];
  const linkKeywords = ['sobre', 'quem-somos', 'a-empresa', 'servicos', 'produtos', 'solucoes', 'unidades', 'lojas', 'cardapio', 'catalogo', 'contato'];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      const fullUrl = new URL(href, url);
      if (fullUrl.hostname === parsedHost && fullUrl.pathname !== '/') {
        const pathLower = fullUrl.pathname.toLowerCase();
        if (linkKeywords.some((k) => pathLower.includes(k))) {
          const normalized = `${fullUrl.origin}${fullUrl.pathname}`;
          if (!subLinks.includes(normalized) && subLinks.length < 4) {
            subLinks.push(normalized);
          }
        }
      }
    } catch {}
  });

  return {
    url,
    title,
    description,
    headings: headings.slice(0, 12),
    mainText: bodyText.slice(0, 4000),
    detectedTech,
    hasEcommerce,
    hasOnlineBooking,
    supportChannels,
    subLinks,
  };
}

export async function crawlCompanyWebsite(websiteUrl: string): Promise<WebsiteScrapeResult> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) {
    return {
      isAccessible: false,
      status: 'site_unavailable',
      statusMessage: 'Endereço de website inválido ou não informado na ficha.',
    };
  }

  if (isSocialOrDirectoryUrl(normalized)) {
    return {
      isAccessible: false,
      status: 'site_unavailable',
      statusMessage: 'O endereço informado pertence a rede social ou diretório, não a um site institucional oficial.',
      resolvedUrl: normalized,
    };
  }

  // Fetch Homepage
  const homeResult = await fetchPage(normalized, 8500);
  if (!homeResult) {
    return {
      isAccessible: false,
      status: 'site_unavailable',
      statusMessage: 'Site institucional não respondeu no tempo limite ou bloqueou o acesso.',
      resolvedUrl: normalized,
    };
  }

  const homePage = parsePageHtml(homeResult.finalUrl, homeResult.html);

  // Fetch up to 2 high-value subpages (e.g. About, Services, Products)
  const subPages: ExtractedPageContent[] = [];
  const targetSubLinks = homePage.subLinks.slice(0, 2);

  for (const subLink of targetSubLinks) {
    const subRes = await fetchPage(subLink, 4500);
    if (subRes) {
      subPages.push(parsePageHtml(subRes.finalUrl, subRes.html));
    }
  }

  return {
    isAccessible: true,
    status: subPages.length > 0 ? 'completed' : 'partial',
    statusMessage: `Site acessado com sucesso (${homePage.title || 'Página inicial'}${subPages.length > 0 ? ` + ${subPages.length} subpáginas` : ''}).`,
    resolvedUrl: homeResult.finalUrl,
    homePage,
    subPages,
  };
}

// ============================================================================
// GEMINI / COMMERCIAL ANALYSIS ENGINE
// ============================================================================

const COMMERCIAL_SOFTWARE_CONTEXT = `
Soluções de gestão comercial e empresarial completas no Brasil, com foco em:
1. ERP Integrado (Gestão Empresarial Completa):
   - Módulos: Financeiro (contas a pagar/receber, conciliação bancária, fluxo de caixa diário e projetado), Compras, Controle de Estoque centralizado/multidepósito, Emissão Fiscal completa (NF-e, NFS-e, MDF-e, SPED Fiscal), DRE Gerencial.
   - Ideal para: Empresas de médio/pequeno porte com operação administrativa, comércio geral, distribuidoras, indústrias leves.
2. Varejo & PDV (Frente de Caixa Rápido):
   - Módulos: PDV rápido e blindado, emissão de NFC-e/SAT, TEF integrado, controle de grade (cor/tamanho), etiquetas com código de barras, promoções, crediário próprio, fidelidade, integração com e-commerce e catálogo online.
   - Ideal para: Lojas de roupas, calçados, autopeças, materiais de construção, mercados, conveniências.
3. Food Service (Alimentação & Bares/Restaurantes):
   - Módulos: Comanda eletrônica mobile/tablet para garçons, Gestão de Mesas em tempo real, KDS (Kitchen Display System), impressão de pedidos por setor (cozinha/bar), delivery integrado (WhatsApp/iFood), totem de autoatendimento, controle de insumos e ficha técnica com baixa de estoque automática.
   - Ideal para: Restaurantes (à la carte e buffet/kg), bares, pubs, lanchonetes, pizzarias, hamburguerias, cafeterias.
4. Atacado & Distribuição:
   - Módulos: Força de vendas externa para representantes, tabelas de preço por perfil de cliente/região, separação de pedidos/WMS básico, romaneio e expedição, controle de lotes e validade.
   - Ideal para: Distribuidoras, atacadistas, fabricantes com entrega direta.
5. Serviços & Ordens de Serviço (OS):
   - Módulos: Abertura e acompanhamento de OS, agendamento de atendimentos/técnicos, controle de peças e serviços aplicados, comissionamento de profissionais, contratos de manutenção recorrente.
   - Ideal para: Oficinas mecânicas, centros automotivos, assistência técnica, pet shops/clínicas, empresas de instalação.
6. Turismo, Parques & Lazer / Controle de Acesso:
   - Módulos: Venda de ingressos/bilheteria, controle de catracas e acesso, consumo cashless por pulseira RFID, reservas e hospedagem.
   - Ideal para: Parques, pousadas, hotéis, atrações turísticas, clubes de lazer.
`;

export async function generateWebIntelligence(
  place: PlaceRecord,
  scrapeResult: WebsiteScrapeResult
): Promise<WebIntelligenceRecord> {
  const now = new Date().toISOString();
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  // Build text context from scrape result
  const hasSite = scrapeResult.isAccessible && Boolean(scrapeResult.homePage);
  const siteSummary = hasSite
    ? `
DADOS EXTRAÍDOS DO SITE OFICIAL (${scrapeResult.resolvedUrl}):
- Título da Página: ${scrapeResult.homePage?.title || 'N/A'}
- Meta Descrição: ${scrapeResult.homePage?.description || 'N/A'}
- Cabeçalhos Principais: ${scrapeResult.homePage?.headings.join(' | ') || 'N/A'}
- Tecnologias e Plataformas Detectadas: ${scrapeResult.homePage?.detectedTech.join(', ') || 'Nenhuma detectada abertamente'}
- Recursos de E-commerce: ${scrapeResult.homePage?.hasEcommerce ? 'Sim, possui loja/carrinho' : 'Não identificado'}
- Recursos de Agendamento/Reservas: ${scrapeResult.homePage?.hasOnlineBooking ? 'Sim, possui agendamento/pedidos online' : 'Não identificado'}
- Canais de Atendimento: ${scrapeResult.homePage?.supportChannels.join(', ') || 'Não especificados'}
- Trecho do Conteúdo Institucional:
${scrapeResult.homePage?.mainText.slice(0, 1800)}

${(scrapeResult.subPages || [])
  .map(
    (sub) => `
SUBPÁGINA CONSULTADA (${sub.url}):
- Título: ${sub.title}
- Cabeçalhos: ${sub.headings.join(' | ')}
- Conteúdo: ${sub.mainText.slice(0, 1200)}
`
  )
  .join('\n')}
`
    : `
SITE INSTITUCIONAL: ${scrapeResult.statusMessage}
Observação: A qualificação deve ser realizada exclusivamente a partir dos dados consolidados da ficha do Google Maps, registrando explicitamente as limitações.
`;

  const mapsSummary = `
DADOS DA COLETA ORIGINAL (GOOGLE MAPS):
- Nome da Empresa: ${place.name}
- Categoria Principal: ${place.category || 'N/A'}
- Endereço Completo: ${place.address || 'N/A'}
- Cidade/Estado: ${place.city || 'N/A'} - ${place.state || 'N/A'} (Bairro: ${place.neighborhood || 'N/A'})
- Telefone: ${place.phone || 'N/A'}
- Website Informado: ${place.website || 'Nenhum'}
- Nota / Avaliações: ${place.rating || 'Sem nota'} (${place.review_count || '0'} avaliações)
- Faixa de Preço: ${place.price_range || 'N/A'}
- Status de Funcionamento: ${place.business_status || 'N/A'}
- Horários: ${place.opening_hours || 'N/A'}
- Serviços e Atributos: ${place.services_attributes || 'N/A'}
- Atributos Adicionais: ${place.additional_attributes || 'N/A'}
- Descrição da Ficha: ${place.description || 'N/A'}
- Redes Sociais na Ficha: ${place.social_links || 'Nenhuma'}
- Link de Agendamento na Ficha: ${place.booking_url || 'Nenhum'}
- Destaques de Avaliações / Comentários: ${place.review_highlights || place.reviews?.slice(0, 600) || 'N/A'}
`;

  // Attempt Gemini API call if key is present
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `
Você é o especialista sênior em inteligência comercial, qualificação de vendas e diagnóstico de gestão empresarial.
Analise detalhadamente a empresa abaixo cruzando os dados da coleta no Google Maps, as informações extraídas do site institucional (quando houver) e o portfólio de soluções de gestão empresarial.

${COMMERCIAL_SOFTWARE_CONTEXT}

${mapsSummary}

${siteSummary}

REGRAS DE CONFIABILIDADE E RIGOR:
- NUNCA invente faturamento, quantidade exata de funcionários, dificuldades financeiras internas ou intenção explícita de compra.
- Baseie suas afirmações em evidências reais extraídas do site ou da ficha do Maps.
- Toda informação deve ser rastreável.
- Se o site não estiver disponível, faça a qualificação usando os dados da coleta, indicando as lacunas com transparência.
- Gere a resposta em formato JSON estrito conforme o schema.
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              business_identity: {
                type: Type.OBJECT,
                properties: {
                  company_name: { type: Type.STRING },
                  presentation: { type: Type.STRING },
                  primary_activity: { type: Type.STRING },
                  segment: { type: Type.STRING },
                  subsegment: { type: Type.STRING },
                  products_services: { type: Type.ARRAY, items: { type: Type.STRING } },
                  target_audience: { type: Type.STRING },
                  geographic_reach: { type: Type.STRING },
                },
                required: ['company_name', 'presentation', 'primary_activity', 'segment', 'products_services', 'target_audience', 'geographic_reach'],
              },
              operational_structure: {
                type: Type.OBJECT,
                properties: {
                  unit_count_estimate: { type: Type.STRING },
                  has_ecommerce: { type: Type.BOOLEAN },
                  ecommerce_platform: { type: Type.STRING },
                  has_online_catalog: { type: Type.BOOLEAN },
                  has_booking_or_orders: { type: Type.BOOLEAN },
                  support_channels: { type: Type.ARRAY, items: { type: Type.STRING } },
                  is_multichannel: { type: Type.BOOLEAN },
                  operational_details: { type: Type.STRING },
                },
                required: ['has_ecommerce', 'has_online_catalog', 'has_booking_or_orders', 'support_channels', 'is_multichannel', 'operational_details'],
              },
              digital_maturity: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.STRING },
                  detected_technologies: { type: Type.ARRAY, items: { type: Type.STRING } },
                  online_sales_capabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  public_integrations: { type: Type.ARRAY, items: { type: Type.STRING } },
                  digital_processes_summary: { type: Type.STRING },
                },
                required: ['level', 'detected_technologies', 'online_sales_capabilities', 'public_integrations', 'digital_processes_summary'],
              },
              opportunity_signals: {
                type: Type.OBJECT,
                properties: {
                  large_catalog: { type: Type.BOOLEAN },
                  multiple_units: { type: Type.BOOLEAN },
                  diversified_operation: { type: Type.BOOLEAN },
                  integration_demand: { type: Type.BOOLEAN },
                  administrative_control_need: { type: Type.BOOLEAN },
                  opportunity_areas: { type: Type.ARRAY, items: { type: Type.STRING } },
                  observations: { type: Type.STRING },
                },
                required: ['large_catalog', 'multiple_units', 'diversified_operation', 'integration_demand', 'administrative_control_need', 'opportunity_areas', 'observations'],
              },
              commercial_analysis: {
                type: Type.OBJECT,
                properties: {
                  executive_summary: { type: Type.STRING },
                  key_operational_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                  digital_maturity_summary: { type: Type.STRING },
                  fit_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                  limber_fit_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                  commercial_opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  information_gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                  seller_discovery_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommended_solution: { type: Type.STRING },
                  recommended_limber_solution: { type: Type.STRING },
                  solution_justification: { type: Type.STRING },
                },
                required: ['executive_summary', 'key_operational_traits', 'digital_maturity_summary', 'commercial_opportunities', 'information_gaps', 'seller_discovery_questions', 'solution_justification'],
              },
              scores: {
                type: Type.OBJECT,
                properties: {
                  adherence_segment: { type: Type.NUMBER },
                  management_compatibility: { type: Type.NUMBER },
                  operational_complexity: { type: Type.NUMBER },
                  digital_maturity: { type: Type.NUMBER },
                  commercial_potential: { type: Type.NUMBER },
                  evidence_reliability: { type: Type.NUMBER },
                  overall_score: { type: Type.NUMBER },
                  qualification_tier: { type: Type.STRING },
                  score_explanation: { type: Type.STRING },
                },
                required: ['adherence_segment', 'management_compatibility', 'operational_complexity', 'digital_maturity', 'commercial_potential', 'evidence_reliability', 'overall_score', 'qualification_tier', 'score_explanation'],
              },
              evidences: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    url: { type: Type.STRING },
                    info: { type: Type.STRING },
                    evidence_type: { type: Type.STRING },
                    confidence: { type: Type.STRING },
                  },
                  required: ['info', 'evidence_type', 'confidence'],
                },
              },
            },
            required: ['business_identity', 'operational_structure', 'digital_maturity', 'opportunity_signals', 'commercial_analysis', 'scores', 'evidences'],
          },
        },
      });

      const parsedJson = JSON.parse(response.text || '{}');
      if (parsedJson && parsedJson.business_identity && parsedJson.scores) {
        // Normalize evidences
        const normalizedEvidences: WebEvidence[] = (parsedJson.evidences || []).map((e: any) => ({
          url: e.url || scrapeResult.resolvedUrl || place.maps_url,
          info: String(e.info || ''),
          evidence_type: String(e.evidence_type || 'Geral'),
          confidence: (['confirmado_no_site', 'dados_coleta', 'inferencia_comercial', 'nao_identificado'].includes(e.confidence)
            ? e.confidence
            : hasSite
            ? 'confirmado_no_site'
            : 'dados_coleta') as EvidenceConfidence,
          extracted_at: now,
        }));

        // Normalize tier
        const overallScore = Math.min(100, Math.max(0, Math.round(Number(parsedJson.scores.overall_score) || 70)));
        const tier: 'A+' | 'A' | 'B' | 'C' =
          overallScore >= 85 ? 'A+' : overallScore >= 70 ? 'A' : overallScore >= 50 ? 'B' : 'C';

        const finalStatus: WebIntelligenceStatus = !hasSite
          ? 'site_unavailable'
          : scrapeResult.status === 'completed'
          ? 'completed'
          : 'partial';

        return {
          place_id: place.id,
          place_name: place.name,
          website_url: place.website || undefined,
          resolved_url: scrapeResult.resolvedUrl,
          status: finalStatus,
          status_message: scrapeResult.statusMessage,
          is_official_website: hasSite,
          business_identity: parsedJson.business_identity,
          operational_structure: parsedJson.operational_structure,
          digital_maturity: {
            ...parsedJson.digital_maturity,
            level: (['Baixa', 'Média', 'Alta'].includes(parsedJson.digital_maturity?.level)
              ? parsedJson.digital_maturity.level
              : 'Média') as 'Baixa' | 'Média' | 'Alta',
          },
          opportunity_signals: parsedJson.opportunity_signals,
          commercial_analysis: {
            ...parsedJson.commercial_analysis,
            fit_points: parsedJson.commercial_analysis?.fit_points || parsedJson.commercial_analysis?.limber_fit_points || [],
            limber_fit_points: parsedJson.commercial_analysis?.fit_points || parsedJson.commercial_analysis?.limber_fit_points || [],
            recommended_solution: parsedJson.commercial_analysis?.recommended_solution || parsedJson.commercial_analysis?.recommended_limber_solution || 'ERP Integrado de Gestão Comercial',
            recommended_limber_solution: parsedJson.commercial_analysis?.recommended_solution || parsedJson.commercial_analysis?.recommended_limber_solution || 'ERP Integrado de Gestão Comercial',
          },
          scores: {
            ...parsedJson.scores,
            overall_score: overallScore,
            qualification_tier: tier,
          },
          evidences: normalizedEvidences,
          analyzed_at: now,
        };
      }
    } catch (genAiError) {
      console.warn('[WebIntelligence] Falha ao processar com Gemini SDK, acionando motor heurístico:', genAiError);
    }
  }

  // ==========================================================================
  // HEURISTIC INTELLIGENCE ENGINE (Fallback resiliente e sem falha)
  // ==========================================================================
  return generateHeuristicIntelligence(place, scrapeResult, now);
}

function generateHeuristicIntelligence(
  place: PlaceRecord,
  scrapeResult: WebsiteScrapeResult,
  now: string
): WebIntelligenceRecord {
  const hasSite = scrapeResult.isAccessible && Boolean(scrapeResult.homePage);
  const cat = (place.category || '').toLowerCase();
  const name = place.name;
  const home = scrapeResult.homePage;

  // Segment identification
  let segment = 'Comércio e Serviços';
  let recommendedSolution = 'ERP Integrado (Gestão Empresarial Completa)';
  let primaryFit = 'Controle financeiro, fluxo de caixa e gestão de estoque centralizada';
  const questions: string[] = [];

  const isFood = /restaurante|bar|pizzaria|hamburgueria|café|lanchonete|bistrô|churrascaria|pastelaria|padaria|gastronomia/i.test(cat);
  const isRetail = /loja|roupas|calçados|vestuário|óptica|materiais de construção|conveniência|supermercado|mercado|comércio/i.test(cat);
  const isService = /oficina|mecânica|auto|clínica|veterinária|pet shop|assistência|manutenção|estética|salão/i.test(cat);
  const isWholesale = /distribuidora|atacado|atacadista|fabricante|indústria/i.test(cat);
  const isTourism = /hotel|pousada|parque|turismo|passeio|atração|resort/i.test(cat);

  if (isFood) {
    segment = 'Alimentação & Food Service';
    recommendedSolution = 'Food Service (Gestão de Restaurantes, Bares e Delivery)';
    primaryFit = 'Comanda eletrônica móvel, gestão de mesas, KDS na cozinha e baixa automática de estoque por ficha técnica';
    questions.push('Como é feito o envio dos pedidos do salão para a cozinha hoje? Há comanda eletrônica ou papel?');
    questions.push('Vocês operam com delivery próprio ou iFood? O estoque de insumos dá baixa automática a cada prato vendido?');
    questions.push('Existe gargalo de fechamento de conta nos horários de pico?');
  } else if (isRetail) {
    segment = 'Varejo & Comércio';
    recommendedSolution = 'Varejo & PDV (Frente de Caixa Rápido e Gestão Multiloja)';
    primaryFit = 'PDV blindado com emissão fiscal (NFC-e/SAT), TEF integrado, controle de grade e etiquetas';
    questions.push('Como vocês controlam a grade de produtos (tamanhos/cores) e o estoque físico?');
    questions.push('As vendas com cartão passam por maquininhas avulsas ou TEF integrado diretamente no caixa?');
    questions.push('Vocês possuem planos de expansão ou integração com vendas online e crediário próprio?');
  } else if (isService) {
    segment = 'Serviços & Atendimento Técnico';
    recommendedSolution = 'Serviços & Ordens de Serviço (OS)';
    primaryFit = 'Abertura e fluxo de OS, agendamento de técnicos, controle de peças e comissões automáticas';
    questions.push('Como vocês acompanham o status de cada ordem de serviço desde a entrada até a entrega?');
    questions.push('As peças utilizadas nos serviços são baixadas do estoque no mesmo momento?');
    questions.push('Como é calculado o comissionamento dos profissionais e o controle de garantias?');
  } else if (isWholesale) {
    segment = 'Atacado & Distribuição';
    recommendedSolution = 'Atacado & Distribuição + Força de Vendas';
    primaryFit = 'Força de vendas externa, tabelas de preços diferenciadas, separação de pedidos e faturamento NF-e em lote';
    questions.push('Os vendedores externos tiram pedidos pelo celular com política de preços e limite de crédito em tempo real?');
    questions.push('Como é feita a conferência de carga e expedição para evitar erros de entrega?');
  } else if (isTourism) {
    segment = 'Turismo, Parques & Lazer';
    recommendedSolution = 'Turismo & Controle de Acesso / Catracas';
    primaryFit = 'Bilheteria física e online, catracas integradas, consumo por pulseira cashless';
    questions.push('A venda de ingressos ou diárias é integrada ao controle de catracas ou check-in?');
  } else {
    questions.push('Qual é o maior desafio atual na consolidação das contas a pagar/receber e no fechamento do mês?');
    questions.push('Vocês utilizam sistemas diferentes para emitir notas fiscais e controlar o estoque?');
  }

  // Operational complexity & maturity
  const hasEcommerce = Boolean(home?.hasEcommerce);
  const hasBooking = Boolean(home?.hasOnlineBooking || place.booking_url);
  const detectedTech = home?.detectedTech || [];
  const digitalLevel: 'Baixa' | 'Média' | 'Alta' = hasEcommerce || detectedTech.length >= 3
    ? 'Alta'
    : hasSite || hasBooking
    ? 'Média'
    : 'Baixa';

  // Scoring
  const adherence = isFood || isRetail || isService || isWholesale || isTourism ? 92 : 75;
  const compatibility = 88;
  const complexity = hasEcommerce || (place.review_count && parseInt(place.review_count, 10) > 80) ? 85 : 65;
  const maturity = digitalLevel === 'Alta' ? 90 : digitalLevel === 'Média' ? 70 : 45;
  const commercialPotential = Math.round((adherence * 0.35 + compatibility * 0.3 + complexity * 0.2 + maturity * 0.15));
  const reliability = hasSite ? 90 : 60;
  const overallScore = Math.round((adherence + compatibility + complexity + maturity + commercialPotential) / 5);
  const tier: 'A+' | 'A' | 'B' | 'C' = overallScore >= 85 ? 'A+' : overallScore >= 70 ? 'A' : overallScore >= 50 ? 'B' : 'C';

  // Evidences
  const evidences: WebEvidence[] = [];
  if (hasSite && home) {
    evidences.push({
      url: home.url,
      info: `Site institucional ativo com título: "${home.title}" e meta descrição contextualizada.`,
      evidence_type: 'Cabeçalho e Metadados do Site',
      confidence: 'confirmado_no_site',
      extracted_at: now,
    });
    if (home.headings.length > 0) {
      evidences.push({
        url: home.url,
        info: `Seções e ofertas em destaque no site: ${home.headings.slice(0, 4).join(', ')}`,
        evidence_type: 'Estrutura de Conteúdo / Headings',
        confidence: 'confirmado_no_site',
        extracted_at: now,
      });
    }
    if (home.detectedTech.length > 0) {
      evidences.push({
        url: home.url,
        info: `Tecnologias públicas identificadas: ${home.detectedTech.join(', ')}`,
        evidence_type: 'Stack Digital Pública',
        confidence: 'confirmado_no_site',
        extracted_at: now,
      });
    }
  }

  evidences.push({
    url: place.maps_url,
    info: `Ficha Google Maps ativa com nota ${place.rating || 'N/A'} e ${place.review_count || '0'} avaliações públicas registradas.`,
    evidence_type: 'Presença no Google Maps',
    confidence: 'dados_coleta',
    extracted_at: now,
  });

  if (place.address) {
    evidences.push({
      url: place.maps_url,
      info: `Endereço comercial verificado: ${place.address} (${place.city || ''} - ${place.state || ''})`,
      evidence_type: 'Localização Física',
      confidence: 'dados_coleta',
      extracted_at: now,
    });
  }

  evidences.push({
    info: `Perfil do negócio compatível com soluções de gestão para a vertical ${segment}.`,
    evidence_type: 'Análise de Fit Comercial',
    confidence: 'inferencia_comercial',
    extracted_at: now,
  });

  const finalStatus: WebIntelligenceStatus = !hasSite
    ? 'site_unavailable'
    : scrapeResult.status === 'completed'
    ? 'completed'
    : 'partial';

  return {
    place_id: place.id,
    place_name: name,
    website_url: place.website || undefined,
    resolved_url: scrapeResult.resolvedUrl,
    status: finalStatus,
    status_message: scrapeResult.statusMessage,
    is_official_website: hasSite,
    business_identity: {
      company_name: name,
      presentation: home?.description || `${name} é um estabelecimento atuante no segmento de ${place.category || 'comércio/serviços'} em ${place.city || 'região metropolitana'}.`,
      primary_activity: place.category || 'Comércio e Serviços Especializados',
      segment,
      subsegment: place.category,
      products_services: home?.headings.slice(0, 5) || ['Atendimento presencial', 'Produtos e serviços comerciais'],
      target_audience: isWholesale ? 'Pessoas jurídicas (B2B / Atacado)' : 'Consumidor final e empresas locais',
      geographic_reach: place.city ? `Atuação concentrada em ${place.city} e região adjacente` : 'Regional',
    },
    operational_structure: {
      unit_count_estimate: 'Unidade comercial identificada (verificar filiais no contato)',
      has_ecommerce: hasEcommerce,
      ecommerce_platform: detectedTech.find((t) => t.includes('Commerce') || t.includes('Shopify') || t.includes('VTEX')),
      has_online_catalog: Boolean(home?.headings.some((h) => /cardápio|catálogo|produtos|loja/i.test(h))),
      has_booking_or_orders: hasBooking,
      support_channels: home?.supportChannels || ['Telefone Comercial', 'Atendimento Presencial'],
      is_multichannel: hasEcommerce || hasBooking,
      operational_details: `Operação com atendimento comercial estabelecido e canais de contato ativos (${home?.supportChannels.join(', ') || 'Telefone'}).`,
    },
    digital_maturity: {
      level: digitalLevel,
      detected_technologies: detectedTech,
      online_sales_capabilities: hasEcommerce ? ['Catálogo online', 'Carrinho de compras'] : ['Canais de atendimento direto'],
      public_integrations: home?.detectedTech.filter((t) => t.includes('Analytics') || t.includes('Pago') || t.includes('Seguro')) || [],
      digital_processes_summary: hasSite
        ? `Presença web institucional consolidada com navegação estruturada e canais integrados.`
        : `Presença digital focada prioritariamente no Google Maps e canais diretos (telefone/WhatsApp).`,
    },
    opportunity_signals: {
      large_catalog: isRetail || isWholesale,
      multiple_units: false,
      diversified_operation: hasEcommerce || hasBooking,
      integration_demand: hasEcommerce || hasBooking,
      administrative_control_need: true,
      opportunity_areas: [
        'Controle Financeiro & Fluxo de Caixa',
        'Faturamento & Emissão Fiscal',
        'Controle de Estoque',
        ...(isFood ? ['Comanda Eletrônica & Cozinha'] : []),
        ...(isRetail ? ['Frente de Caixa / PDV Rápido'] : []),
        ...(isService ? ['Ordens de Serviço & Agendamento'] : []),
      ],
      observations: `Estabelecimento possui volume de atendimento que demanda agilidade no caixa, controle fiscal rigoroso e relatórios gerenciais para tomada de decisão.`,
    },
    commercial_analysis: {
      executive_summary: `${name} opera no segmento de ${segment}. Apresenta score de aderência comercial de ${overallScore}/100 para modernização e controle de processos, com forte sinergia em ${primaryFit}.`,
      key_operational_traits: [
        `Segmento prioritário: ${segment}`,
        `Volume de avaliações públicas: ${place.review_count || '0'} registros`,
        hasSite ? `Site institucional oficial ativo (${scrapeResult.resolvedUrl})` : `Sem site próprio (oportunidade de centralização de canais)`,
      ],
      digital_maturity_summary: `Maturidade digital classificada como ${digitalLevel}. ${hasSite ? 'Possui endereço web próprio e canais digitais de atendimento.' : 'Canal digital primário via Google Maps.'}`,
      fit_points: [
        primaryFit,
        'Emissão descomplicada de notas fiscais (NFC-e / NF-e / NFS-e)',
        'Conciliação financeira e controle de fluxo de caixa em tempo real',
      ],
      limber_fit_points: [
        primaryFit,
        'Emissão descomplicada de notas fiscais (NFC-e / NF-e / NFS-e)',
        'Conciliação financeira e controle de fluxo de caixa em tempo real',
      ],
      commercial_opportunities: [
        `Implantação de ${recommendedSolution}`,
        'Substituição de controles manuais ou planilhas por sistema integrado',
        'Agilização do atendimento e fechamento de vendas/contas',
      ],
      information_gaps: [
        'Sistema de gestão ou emissor fiscal atualmente em uso',
        'Quantidade média de funcionários e faturamento mensal estimado',
        'Nível de insatisfação com o suporte do software atual',
      ],
      seller_discovery_questions: questions,
      recommended_solution: recommendedSolution,
      recommended_limber_solution: recommendedSolution,
      solution_justification: `A solução ${recommendedSolution} endereça diretamente os desafios operacionais de ${segment}, unificando controle de estoque, faturamento fiscal e financeiro com robustez e suporte dedicado.`,
    },
    scores: {
      adherence_segment: adherence,
      management_compatibility: compatibility,
      operational_complexity: complexity,
      digital_maturity: maturity,
      commercial_potential: commercialPotential,
      evidence_reliability: reliability,
      overall_score: overallScore,
      qualification_tier: tier,
      score_explanation: `Score de ${overallScore}/100 baseado na compatibilidade com soluções de gestão (${segment}), complexidade de atendimento e canais comerciais observados.`,
    },
    evidences,
    analyzed_at: now,
  };
}
