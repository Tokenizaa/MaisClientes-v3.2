export interface PlaceRecord {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  /** Neighborhood explicitly present in the displayed address, when separable. */
  neighborhood?: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  price_range: string;
  opening_hours: string;
  business_status: string;
  latitude: string;
  longitude: string;
  maps_url: string;
  description: string;
  services_attributes: string;
  photos?: string;
  videos?: string;
  logo_url?: string;
  booking_url?: string;
  /** Social profile URLs explicitly present in the Google Maps place sheet, separated by |. */
  social_links?: string;
  /** JSON array of publicly visible reviews captured from the place's Reviews panel. */
  reviews?: string;
  /** JSON array of review topic/category chips and counts. */
  review_topics?: string;
  /** JSON object of additional public attributes from the About panel. */
  additional_attributes?: string;
  /** JSON array of typed media objects for image/video preview rendering. */
  media_items?: string;
  /** Plus code shown on the public place sheet, when present. */
  plus_code?: string;
  /** Structured address components; empty when not explicitly parseable from the displayed address. */
  postal_code?: string;
  country?: string;
  city?: string;
  state?: string;
  /** Stable Maps source identifier extracted from the Maps URL when present. */
  source_place_id?: string;
  /** Original URL used to identify the source listing. */
  source_url?: string;
  /** JSON array of normalized public business attributes. */
  attributes?: string;
  /** JSON array of public accessibility attributes. */
  accessibility_attributes?: string;
  /** Visible next-opening phrase, e.g. "Abre às 10h na terça". */
  next_opening_text?: string;
  /** Normalized next opening weekday when explicitly shown. */
  next_open_day?: string;
  /** Normalized next opening time when explicitly shown. */
  next_open_time?: string;
  /** Explicit total photo count displayed by Maps, not the number captured by the scraper. */
  visible_photos_count?: string;
  /** JSON object of popular-times data actually exposed in the rendered page. */
  popular_times?: string;
  /** JSON object mapping star levels (1-5) to counts when displayed. */
  rating_distribution?: string;
  /** JSON array of review summary/highlight snippets shown by Maps. */
  review_highlights?: string;
  /** JSON object recording per-field capture state; empty does not mean source absence. */
  field_status?: string;
  collected_at: string;
  web_intelligence_status?: WebIntelligenceStatus;
  web_intelligence_score?: number;
  web_intelligence?: WebIntelligenceRecord;
}

export type JobStatus = 'running' | 'completed' | 'partial' | 'stopped' | 'failed';

export type ScrapeCompletionReason = 'target_reached' | 'feed_exhausted' | 'access_restricted' | 'user_stopped' | 'fatal_error' | 'feed_stagnation';

export interface ScrapeJob {
  id: string;
  user_id: string;
  segment: string;
  project_name?: string;
  project_id?: string;
  category_id?: string;
  location: string;
  limit_requested: number;
  status: JobStatus;
  /** Set while the worker is finishing its current ficha after a stop request. */
  cancel_requested?: boolean;
  status_message: string;
  /** Why the scraper stopped; stored in app_state for backwards-compatible persistence. */
  completion_reason?: ScrapeCompletionReason;
  total_found: number;
  total_collected: number;
  total_duplicates: number;
  total_errors: number;
  current_step?: string;
  /** @deprecated Historical jobs only. New jobs do not use search sessions. */
  search_session_id?: string;
  /** @deprecated Historical phase marker; new jobs do not use phases. */
  phase?: 'discovering' | 'processing';
  /** @deprecated Historical checkpoint; new jobs never resume from it. */
  discovery_checkpoint?: {
    version?: number;
    scroll_round?: number;
    last_seen_source_key?: string;
    last_seen_url?: string;
    last_processed_url?: string;
    last_processed_source_key?: string;
    last_processed_name?: string;
    last_processed_outcome?: 'saved' | 'duplicate';
    last_processed_at?: string;
    processed_count?: number;
    migrated_from_candidate_queue_at?: string;
    last_checkpoint_at?: string;
    stagnant_rounds?: number;
    [key: string]: unknown;
  };
  /** @deprecated Historical candidate queue state; new jobs do not populate it. */
  candidate_urls?: string[];
  /** @deprecated Historical candidate cursor; new jobs do not populate it. */
  candidate_cursor?: number;
  /** @deprecated Historical retry counter; new jobs do not populate it. */
  retry_count?: number;
  heartbeat_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface ScrapeStartPayload {
  segment: string;
  location: string;
  limit: number;
}

export interface ExportCsvPayload {
  jobId?: string;
  placeIds?: string[];
  fields: (keyof PlaceRecord)[];
  filename?: string;
}

export const EXPORTABLE_FIELDS: { key: keyof PlaceRecord; label: string; description: string }[] = [
  { key: 'name', label: 'Nome do estabelecimento', description: 'Nome exibido na ficha' },
  { key: 'category', label: 'Categoria', description: 'Categoria exibida' },
  { key: 'address', label: 'Endereço', description: 'Endereço completo exibido na ficha' },
  { key: 'neighborhood', label: 'Bairro', description: 'Bairro separado do endereço quando explicitamente identificável' },
  { key: 'phone', label: 'Telefone', description: 'Telefone exibido' },
  { key: 'website', label: 'Site', description: 'URL apresentada na ficha' },
  { key: 'rating', label: 'Nota', description: 'Avaliação exibida' },
  { key: 'review_count', label: 'Quantidade de avaliações', description: 'Número exibido' },
  { key: 'price_range', label: 'Faixa de preço', description: 'Quando exibida' },
  { key: 'opening_hours', label: 'Horários de funcionamento', description: 'Horários apresentados na ficha' },
  { key: 'business_status', label: 'Status de funcionamento', description: 'Aberto, fechado, etc.' },
  { key: 'latitude', label: 'Latitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'longitude', label: 'Longitude', description: 'Extraída diretamente dos dados da URL/página' },
  { key: 'maps_url', label: 'Link do Google Maps', description: 'URL da ficha' },
  { key: 'description', label: 'Descrição', description: 'Descrição apresentada, se houver' },
  { key: 'services_attributes', label: 'Serviços e atributos', description: 'Informações exibidas na ficha' },
  { key: 'photos', label: 'Fotos (URLs)', description: 'URLs das fotos visíveis na ficha' },
  { key: 'videos', label: 'Vídeos (URLs)', description: 'URLs ou fontes de vídeos visíveis na ficha' },
  { key: 'logo_url', label: 'Logo / Foto de perfil', description: 'Imagem ou avatar exibido na ficha' },
  { key: 'social_links', label: 'Redes sociais (URLs)', description: 'Links sociais explicitamente exibidos na ficha do Google Maps' },
  { key: 'reviews', label: 'Avaliações individuais', description: 'Comentários, nota, autor, data, resposta do proprietário e mídia quando visíveis' },
  { key: 'review_topics', label: 'Categorias dos comentários', description: 'Tópicos sugeridos pelo Google Maps e suas contagens' },
  { key: 'additional_attributes', label: 'Atributos adicionais', description: 'Informações públicas da aba Sobre, incluindo facilidades e serviços' },
  { key: 'media_items', label: 'Mídia estruturada', description: 'Itens de mídia com tipo, URL, texto alternativo e miniatura' },
  { key: 'booking_url', label: 'URL de Agendamento', description: 'Link "Agendar on-line" ou "Book online" da ficha' },
  { key: 'plus_code', label: 'Plus Code', description: 'Código geográfico apresentado na ficha' },
  { key: 'postal_code', label: 'CEP / código postal', description: 'Quando explícito no endereço público' },
  { key: 'country', label: 'País', description: 'Componente do endereço quando identificável' },
  { key: 'city', label: 'Cidade', description: 'Componente do endereço quando identificável' },
  { key: 'state', label: 'Estado / região', description: 'Componente do endereço quando identificável' },
  { key: 'source_place_id', label: 'ID da ficha na fonte', description: 'Identificador extraído da URL do Google Maps' },
  { key: 'source_url', label: 'URL original da fonte', description: 'URL da ficha usada na coleta' },
  { key: 'attributes', label: 'Atributos do estabelecimento', description: 'Atributos públicos normalizados' },
  { key: 'accessibility_attributes', label: 'Acessibilidade', description: 'Atributos públicos de acessibilidade' },
  { key: 'next_opening_text', label: 'Próxima abertura (texto)', description: 'Texto de próxima abertura exibido pelo Maps' },
  { key: 'next_open_day', label: 'Próximo dia de abertura', description: 'Dia explicitamente identificável no status' },
  { key: 'next_open_time', label: 'Próximo horário de abertura', description: 'Horário explicitamente identificável no status' },
  { key: 'visible_photos_count', label: 'Total de fotos informado', description: 'Contagem textual explícita do Maps, não contagem inferida' },
  { key: 'popular_times', label: 'Horários de movimento', description: 'JSON de dados exibidos publicamente, quando disponíveis' },
  { key: 'rating_distribution', label: 'Distribuição de avaliações', description: 'Contagens por estrelas quando exibidas' },
  { key: 'review_highlights', label: 'Destaques de avaliações', description: 'Trechos de resumo exibidos pelo Maps' },
  { key: 'field_status', label: 'Estado de captura dos campos', description: 'JSON com status de observação por campo' },
  { key: 'collected_at', label: 'Data e hora da coleta', description: 'Registrada pelo aplicativo' },
];

export type WebIntelligenceStatus =
  | 'idle'
  | 'analyzing'
  | 'completed'
  | 'site_unavailable'
  | 'partial';

export type EvidenceConfidence =
  | 'confirmado_no_site'
  | 'dados_coleta'
  | 'inferencia_comercial'
  | 'nao_identificado';

export interface WebEvidence {
  url?: string;
  info: string;
  evidence_type: string;
  confidence: EvidenceConfidence;
  extracted_at: string;
}

export interface WebScoreBreakdown {
  adherence_segment: number; // 0 - 100
  management_compatibility: number; // 0 - 100
  operational_complexity: number; // 0 - 100
  digital_maturity: number; // 0 - 100
  commercial_potential: number; // 0 - 100
  evidence_reliability: number; // 0 - 100
  overall_score: number; // 0 - 100
  qualification_tier: 'A+' | 'A' | 'B' | 'C';
  score_explanation: string;
}

export interface WebIntelligenceRecord {
  place_id: string;
  place_name: string;
  website_url?: string;
  resolved_url?: string;
  status: WebIntelligenceStatus;
  status_message?: string;
  is_official_website: boolean;
  
  // Identidade Comercial
  business_identity: {
    company_name: string;
    presentation: string;
    primary_activity: string;
    segment: string;
    subsegment?: string;
    products_services: string[];
    target_audience: string;
    geographic_reach: string;
  };

  // Estrutura Operacional
  operational_structure: {
    unit_count_estimate?: string;
    has_ecommerce: boolean;
    ecommerce_platform?: string;
    has_online_catalog: boolean;
    has_booking_or_orders: boolean;
    support_channels: string[];
    is_multichannel: boolean;
    operational_details: string;
  };

  // Maturidade Digital
  digital_maturity: {
    level: 'Baixa' | 'Média' | 'Alta';
    detected_technologies: string[];
    online_sales_capabilities: string[];
    public_integrations: string[];
    digital_processes_summary: string;
  };

  // Sinais de Oportunidade
  opportunity_signals: {
    large_catalog: boolean;
    multiple_units: boolean;
    diversified_operation: boolean;
    integration_demand: boolean;
    administrative_control_need: boolean;
    opportunity_areas: string[];
    observations: string;
  };

  // Análise Comercial Contextualizada de Gestão Empresarial
  commercial_analysis: {
    executive_summary: string;
    key_operational_traits: string[];
    digital_maturity_summary: string;
    fit_points?: string[];
    limber_fit_points?: string[];
    commercial_opportunities: string[];
    information_gaps: string[];
    seller_discovery_questions: string[];
    recommended_solution?: string;
    recommended_limber_solution?: string;
    solution_justification: string;
  };

  scores: WebScoreBreakdown;
  evidences: WebEvidence[];
  analyzed_at: string;
  last_error?: string;
}

export type OpportunityStage =
  | 'lead'
  | 'qualificacao'
  | 'apresentacao'
  | 'proposta'
  | 'fechado'
  | 'perdido';

export type ContactInteractionType = 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'outro';

export type ContactInteractionOutcome = 'sucesso' | 'sem_resposta' | 'reagendado' | 'recusado';

export interface ContactInteraction {
  id: string;
  type: ContactInteractionType;
  notes: string;
  outcome?: ContactInteractionOutcome;
  performed_by?: string;
  next_contact_at?: string;
  created_at: string;
}

export interface OpportunityRecord {
  id: string;
  user_id: string;
  place_id: string;
  place_name: string;
  category: string;
  phone?: string;
  website?: string;
  city?: string;
  stage: OpportunityStage;
  deal_value?: number;
  contact_name?: string;
  assigned_to?: string;
  next_action?: string;
  notes?: string;
  score?: number;
  qualification_tier?: string;
  last_contact_at?: string;
  next_contact_at?: string;
  contact_history?: ContactInteraction[];
  web_intelligence?: WebIntelligenceRecord;
  created_at: string;
  updated_at: string;
}


