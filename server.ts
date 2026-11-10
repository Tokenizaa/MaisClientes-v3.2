import express, { type Request, type Response, type NextFunction } from 'express';
import { waitUntil } from '@vercel/functions';
// Load Vite only in development. Importing it at module scope loads Rolldown's native binding,
// which is not required by production serverless API functions.

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { EXPORTABLE_FIELDS, type PlaceRecord, type ScrapeJob, type WebIntelligenceRecord, type OpportunityRecord } from './src/shared/types.js';
import { BRAZILIAN_STATES, POPULAR_CATEGORIES } from './src/shared/brazilLocations.js';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Browser, Page } from 'puppeteer-core';
import { extractPlaceDetails } from './src/server/scraper/extractor.ts';
import { parseSearchLocationFallback, extractSourcePlaceId } from './src/server/scraper/normalizer.ts';
import { connectScraperBrowser } from './src/server/scraper/browser.ts';
import { writeAuditLog, listAuditLogs } from './src/server/audit-log.ts';
import { crawlCompanyWebsite, generateWebIntelligence } from './src/server/web-intelligence.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data persistence path
const DATA_DIR = path.resolve(__dirname, '.data');
const STORE_FILE = path.join(DATA_DIR, 'mapscrape_store.json');

if (process.env.VERCEL !== '1' && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
type PlanTier = 'free' | 'starter' | 'growth' | 'pro';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
  plan?: PlanTier;
  planExpiresAt?: string; // ISO date for annual plans
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

const PLAN_LIMITS: Record<PlanTier, { leadsPerMonth: number; projects: number; apiAccess: boolean; webhooks: boolean; whiteLabel: boolean }> = {
  free: { leadsPerMonth: 500, projects: 1, apiAccess: false, webhooks: false, whiteLabel: false },
  starter: { leadsPerMonth: 10000, projects: 5, apiAccess: false, webhooks: false, whiteLabel: false },
  growth: { leadsPerMonth: 50000, projects: 20, apiAccess: true, webhooks: true, whiteLabel: false },
  pro: { leadsPerMonth: 200000, projects: -1, apiAccess: true, webhooks: true, whiteLabel: true }, // -1 = unlimited
};

// Extended Plan Config for Billing
// ============================================================================

interface PlanConfig {
  leadsPerMonth: number;
  projects: number;
  apiAccess: boolean;
  webhooks: boolean;
  whiteLabel: boolean;
  priceMonthly: number; // in cents
  priceAnnual: number; // in cents
  pagbankPlanId?: string; // PagBank subscription plan ID
}

const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  free: { leadsPerMonth: 500, projects: 1, apiAccess: false, webhooks: false, whiteLabel: false, priceMonthly: 0, priceAnnual: 0 },
  starter: { leadsPerMonth: 10000, projects: 5, apiAccess: false, webhooks: false, whiteLabel: false, priceMonthly: 19700, priceAnnual: 189120, pagbankPlanId: process.env.PAGBANK_PLAN_STARTER },
  growth: { leadsPerMonth: 50000, projects: 20, apiAccess: true, webhooks: true, whiteLabel: false, priceMonthly: 49700, priceAnnual: 477120, pagbankPlanId: process.env.PAGBANK_PLAN_GROWTH },
  pro: { leadsPerMonth: 200000, projects: -1, apiAccess: true, webhooks: true, whiteLabel: true, priceMonthly: 99700, priceAnnual: 957120, pagbankPlanId: process.env.PAGBANK_PLAN_PRO },
};

function getPlanConfig(plan: PlanTier): PlanConfig {
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.free;
}

function getUserPlan(user: UserProfile): PlanTier {
  return user.plan || 'free';
}

function getPlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan];
}

function isPlanActive(user: UserProfile): boolean {
  if (!user.planExpiresAt) return true;
  return new Date(user.planExpiresAt) > new Date();
}

function getEffectivePlan(user: UserProfile): PlanTier {
  if (!isPlanActive(user)) return 'free';
  return getUserPlan(user);
}
// PagBank Configuration
// ============================================================================

interface PagBankConfig {
  token: string;
  baseUrl: string;
  webhookSecret: string;
}

function getPagBankConfig(): PagBankConfig {
  const isSandbox = process.env.PAGBANK_ENV === 'sandbox';
  return {
    token: isSandbox ? process.env.PAGBANK_SANDBOX_TOKEN || '' : process.env.PAGBANK_PRODUCTION_TOKEN || '',
    baseUrl: isSandbox ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com',
    webhookSecret: process.env.PAGBANK_WEBHOOK_SECRET || '',
  };
}

// Create PagBank order for subscription
async function createPagBankOrder(params: {
  planTier: PlanTier;
  billingCycle: 'monthly' | 'annual';
  customerEmail: string;
  customerName: string;
  customerId: string; // our user ID
  referenceId: string; // our subscription reference
}): Promise<{ id: string; checkoutUrl: string; status: string } | null> {
  const config = getPagBankConfig();
  if (!config.token) {
    console.error('[PagBank] Token not configured');
    return null;
  }

  const planConfig = getPlanConfig(params.planTier);
  const amount = params.billingCycle === 'annual' ? planConfig.priceAnnual : planConfig.priceMonthly;

  const orderData = {
    reference_id: params.referenceId,
    customer: {
      name: params.customerName,
      email: params.customerEmail,
      tax_id: '', // optional CPF/CNPJ
      phones: [],
    },
    items: [
      {
        reference_id: `plan_${params.planTier}_${params.billingCycle}`,
        name: `Plano ${params.planTier.charAt(0).toUpperCase() + params.planTier.slice(1)} (${params.billingCycle === 'annual' ? 'Anual' : 'Mensal'})`,
        quantity: 1,
        unit_amount: amount,
      },
    ],
    shipping: null,
    notification_urls: [`${process.env.APP_URL || 'https://mapscrape.com'}/api/v1/billing/webhook`],
    metadata: {
      user_id: params.customerId,
      plan_tier: params.planTier,
      billing_cycle: params.billingCycle,
    },
  };

  try {
    const response = await fetch(`${config.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': params.referenceId,
      },
      body: JSON.stringify(orderData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[PagBank] Create order failed:', data);
      return null;
    }

    // For PagBank, the order response includes a checkout URL or QR code for payment
    // The actual payment is handled on PagBank's checkout page
    const checkoutUrl = data.charges?.[0]?.links?.find((l: any) => l.rel === 'PAY')?.href ||
                       data.links?.find((l: any) => l.rel === 'PAY')?.href ||
                       data.checkout_url;

    return {
      id: data.id,
      checkoutUrl: checkoutUrl || `${config.baseUrl}/checkout/${data.id}`,
      status: data.status,
    };
  } catch (error) {
    console.error('[PagBank] Create order error:', error);
    return null;
  }
}

// Get order status from PagBank
async function getPagBankOrder(orderId: string): Promise<any | null> {
  const config = getPagBankConfig();
  if (!config.token) return null;

  try {
    const response = await fetch(`${config.baseUrl}/orders/${orderId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[PagBank] Get order error:', error);
    return null;
  }
}

// Get charge/payment status from PagBank
async function getPagBankCharge(chargeId: string): Promise<any | null> {
  const config = getPagBankConfig();
  if (!config.token) return null;

  try {
    const response = await fetch(`${config.baseUrl}/charges/${chargeId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('[PagBank] Get charge error:', error);
    return null;
  }
}

// Verify webhook signature
function verifyPagBankWebhook(req: Request, secret: string): boolean {
  const signature = req.header('x-signature') || req.header('X-Signature');
  if (!signature || !secret) return false;

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Handle successful payment - upgrade user plan
async function handleSuccessfulPayment(state: any, userId: string, planTier: PlanTier, billingCycle: 'monthly' | 'annual', pagbankOrderId: string, pagbankChargeId: string): Promise<boolean> {
  const user = state.users.find((u: UserProfile) => u.id === userId);
  if (!user) {
    console.error('[Billing] User not found:', userId);
    return false;
  }

  const now = new Date();
  const expiresAt = new Date(now);
  if (billingCycle === 'annual') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 1);
  }

  user.plan = planTier;
  user.planExpiresAt = expiresAt.toISOString();
  // Store PagBank references for future webhook handling
  (user as any).pagbankCustomerId = (user as any).pagbankCustomerId || pagbankOrderId;
  (user as any).pagbankSubscriptionId = pagbankChargeId;

  state.persist();
  await state.flush();

  // Log the upgrade
  state.logs.unshift({
    id: `log_${Date.now()}_billing`,
    created_at: new Date().toISOString(),
    level: 'info',
    category: 'billing',
    event: 'subscription_activated',
    message: `Plano ${planTier} (${billingCycle}) ativado para ${user.email} via PagBank.`,
    job_id: 'billing',
    metadata: JSON.stringify({
      user_id: userId,
      plan_tier: planTier,
      billing_cycle: billingCycle,
      pagbank_order_id: pagbankOrderId,
      pagbank_charge_id: pagbankChargeId,
    }),
    user_id: userId,
  });

  return true;
}

// Handle failed/expired payment - downgrade to free
async function handleFailedPayment(state: any, userId: string): Promise<boolean> {
  const user = state.users.find((u: UserProfile) => u.id === userId);
  if (!user) return false;

  user.plan = 'free';
  user.planExpiresAt = undefined;

  state.persist();
  await state.flush();

  state.logs.unshift({
    id: `log_${Date.now()}_billing`,
    created_at: new Date().toISOString(),
    level: 'warn',
    category: 'billing',
    event: 'subscription_failed',
    message: `Pagamento falhou/expirou para ${user.email}. Plano rebaixado para free.`,
    job_id: 'billing',
    metadata: JSON.stringify({ user_id: userId }),
    user_id: userId,
  });

  return true;
}


interface ProjectRecord {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
}

interface CategoryRecord {
  id: string;
  name: string;
  user_id: string;
  project_id: string;
  created_at: string;
}

interface ApiCredentialRecord {
  id: string;
  consumer_name: string;
  consumer_project: string;
  api_key_hash: string;
  status: 'active' | 'revoked';
  created_at: string;
}

interface AuditLogRecord {
  id: string;
  created_at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
  user_id?: string;
}

interface ScraperSettings {
  browserWsEndpoint?: string;
  preferredEngine?: 'local' | 'cloudflare';
}

interface StoreState {
  users: UserProfile[];
  jobs: ScrapeJob[];
  places: PlaceRecord[];
  projects: ProjectRecord[];
  categories: CategoryRecord[];
  credentials: ApiCredentialRecord[];
  logs: AuditLogRecord[];
  settings?: ScraperSettings;
  web_intelligence?: Record<string, WebIntelligenceRecord>;
  opportunities?: OpportunityRecord[];
}

function hashPassword(pass: string): string {
  return crypto.createHash('sha256').update(pass + '_mapscrape_salt').digest('hex');
}

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

function isProvisioningTokenValid(req: Request): boolean {
  const expected = process.env.MAPSCRAPE_PROVISIONING_TOKEN?.trim();
  const supplied = req.header('X-MapScrape-Provisioning-Token')?.trim();
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function isProvisioningAuthorized(req: Request): boolean {
  // The in-app credential manager is restricted to authenticated platform admins.
  return resolveUserFromRequest(req)?.role === 'admin' || isProvisioningTokenValid(req);
}

// Generate realistic Brazilian sample places
function generateInitialPlaces(jobId: string, segment: string, location: string): PlaceRecord[] {
  const samples = [
    {
      name: 'Clínica Médica Santa Helena',
      category: 'Clínica Médica e Diagnóstico',
      address: 'Av. Paulista, 1842 - Torre Norte, Bela Vista, São Paulo - SP, 01310-200',
      phone: '(11) 3254-8900',
      website: 'https://www.clinicasantahelena.com.br',
      rating: '4.8',
      review_count: '342',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 07:00-19:00 | Sáb: 08:00-13:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5592',
      longitude: '-46.6587',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01310-200',
      description: 'Centro integrado de especialidades médicas, consultas preventivas e exames laboratoriais de última geração.',
      photos: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80|https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/clinicasantahelena',
    },
    {
      name: 'Hospital & Centro Médico Aliança',
      category: 'Hospital Geral e Especialidades',
      address: 'R. Vergueiro, 2200, Vila Mariana, São Paulo - SP, 04101-000',
      phone: '(11) 5080-6000',
      website: 'https://www.centromedicoalianca.com.br',
      rating: '4.9',
      review_count: '1280',
      price_range: '$$$$',
      opening_hours: 'Atendimento 24 horas',
      business_status: 'OPERATIONAL',
      latitude: '-23.5855',
      longitude: '-46.6389',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '04101-000',
      description: 'Excelência em atendimento médico-hospitalar, corpo clínico renomado e pronto atendimento humanizado.',
      photos: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?auto=format&fit=crop&w=600&q=80|https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/hospitalalianca_sp',
    },
    {
      name: 'Instituto Dermatológico Avançado DermaPrime',
      category: 'Clínica Dermatológica',
      address: 'R. Oscar Freire, 1105 - Cj 81, Jardins, São Paulo - SP, 01426-001',
      phone: '(11) 3062-4411',
      website: 'https://www.dermaprimeinstituto.com.br',
      rating: '4.7',
      review_count: '198',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 08:30-18:30',
      business_status: 'OPERATIONAL',
      latitude: '-23.5639',
      longitude: '-46.6698',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01426-001',
      description: 'Tratamentos dermatológicos clínicos, estéticos e cirúrgicos com tecnologia laser de alta precisão.',
      photos: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/dermaprimesp',
    },
    {
      name: 'Centro Odontológico Sorrir Mais',
      category: 'Odontologia e Ortodontia',
      address: 'R. Domingos de Morais, 1450, Vila Mariana, São Paulo - SP, 04010-200',
      phone: '(11) 2389-1020',
      website: 'https://www.sorrirmaisodonto.com.br',
      rating: '4.6',
      review_count: '415',
      price_range: '$$',
      opening_hours: 'Seg-Sex: 08:00-20:00 | Sáb: 08:00-14:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5898',
      longitude: '-46.6375',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '04010-200',
      description: 'Implantes, ortodontia invisível e odontologia estética com equipe multidisciplinar.',
      photos: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/sorrirmais_odonto',
    },
    {
      name: 'Laboratório e Medicina Diagnóstica Fleury - Unidade Jardins',
      category: 'Laboratório de Análises Clínicas',
      address: 'R. Caconde, 224, Jardim Paulista, São Paulo - SP, 01425-010',
      phone: '(11) 3179-0822',
      website: 'https://www.fleury.com.br',
      rating: '4.9',
      review_count: '890',
      price_range: '$$$$',
      opening_hours: 'Seg-Sáb: 06:00-18:00 | Dom: 07:00-13:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5752',
      longitude: '-46.6568',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01425-010',
      description: 'Pioneirismo em diagnósticos genéticos, biologia molecular e exames laboratoriais completos.',
      photos: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/fleury',
    },
    {
      name: 'Clínica de Fisioterapia e Reabilitação Movimento',
      category: 'Fisioterapia e RPG',
      address: 'R. Pamplona, 1005, Jardim Paulista, São Paulo - SP, 01405-001',
      phone: '(11) 3885-3320',
      website: 'https://www.movimentofisio.com.br',
      rating: '4.8',
      review_count: '164',
      price_range: '$$',
      opening_hours: 'Seg-Sex: 07:00-20:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5671',
      longitude: '-46.6552',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01405-001',
      description: 'Fisioterapia traumato-ortopédica, pilates terapêutico e reabilitação postural global.',
      photos: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/movimentofisiosp',
    },
    {
      name: 'Centro Cardiológico do Coração SP',
      category: 'Cardiologia',
      address: 'Av. Brigadeiro Luís Antônio, 3421, Jardim Paulista, São Paulo - SP, 01401-001',
      phone: '(11) 3887-2299',
      website: 'https://www.cardiologiasp.com.br',
      rating: '4.9',
      review_count: '512',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 07:30-19:30',
      business_status: 'OPERATIONAL',
      latitude: '-23.5783',
      longitude: '-46.6541',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '01401-001',
      description: 'Ecocardiograma, teste ergométrico, MAPA, Holter e acompanhamento cardiológico de precisão.',
      photos: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/cardiologiasp',
    },
    {
      name: 'Clínica Oftalmológica Visão Total',
      category: 'Oftalmologia',
      address: 'R. Fradique Coutinho, 580, Pinheiros, São Paulo - SP, 05416-000',
      phone: '(11) 3031-7755',
      website: 'https://www.visaototaloftalmo.com.br',
      rating: '4.7',
      review_count: '280',
      price_range: '$$$',
      opening_hours: 'Seg-Sex: 08:00-18:00 | Sáb: 08:00-12:00',
      business_status: 'OPERATIONAL',
      latitude: '-23.5601',
      longitude: '-46.6890',
      city: 'São Paulo',
      state: 'SP',
      postal_code: '05416-000',
      description: 'Cirurgia refrativa a laser, tratamento de glaucoma, catarata e exames oftalmológicos completos.',
      photos: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=600&q=80',
      instagram: 'https://instagram.com/visaototaloftalmo',
    },
  ];

  const now = new Date().toISOString();
  return samples.map((s, idx) => {
    const id = `plc_${jobId.replace('job_', '')}_${idx + 1}`;
    const cleanMapsName = encodeURIComponent(`${s.name} ${s.city}`);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${cleanMapsName}`;
    return {
      id,
      job_id: jobId,
      name: s.name,
      category: s.category || segment,
      address: s.address,
      phone: s.phone,
      website: s.website,
      rating: s.rating,
      review_count: s.review_count,
      price_range: s.price_range,
      opening_hours: s.opening_hours,
      business_status: s.business_status,
      latitude: s.latitude,
      longitude: s.longitude,
      maps_url: mapsUrl,
      description: s.description,
      services_attributes: 'Estacionamento no local, Wi-Fi gratuito, Acesso para deficientes, Atende convênios e particular',
      photos: s.photos,
      videos: '',
      logo_url: s.photos.split('|')[0] || '',
      booking_url: `${s.website}/agendamento`,
      social_links: s.instagram,
      reviews: JSON.stringify([
        { author: 'Mariana Silva', rating: 5, date: 'Há 2 semanas', text: 'Atendimento impecável! Pontualidade britânica e profissionais muito atenciosos.' },
        { author: 'Carlos Eduardo Santos', rating: 5, date: 'Há 1 mês', text: 'Excelente estrutura física, exames rápidos e laudos disponibilizados no mesmo dia pelo portal.' },
        { author: 'Ana Beatriz Souza', rating: 4, date: 'Há 3 meses', text: 'Ótima clínica, médicos de alto nível. Recomendo agendar com antecedência.' }
      ]),
      review_topics: JSON.stringify([
        { topic: 'Atendimento', count: 184 },
        { topic: 'Estrutura', count: 142 },
        { topic: 'Pontualidade', count: 96 },
        { topic: 'Convênios', count: 78 }
      ]),
      additional_attributes: JSON.stringify({
        acessibilidade: ['Entrada acessível para cadeira de rodas', 'Banheiro adaptado', 'Elevador acessível'],
        pagamentos: ['Cartões de crédito', 'Cartões de débito', 'Pix', 'Dinheiro'],
        comodidades: ['Wi-Fi gratuito', 'Ar condicionado', 'Sala de espera com café']
      }),
      media_items: JSON.stringify([
        { type: 'photo', url: s.photos.split('|')[0] || '', alt: s.name }
      ]),
      plus_code: `85FM+9V São Paulo, SP`,
      postal_code: s.postal_code,
      country: 'Brasil',
      city: s.city,
      state: s.state,
      source_place_id: `ChIJ${crypto.randomBytes(8).toString('hex')}`,
      source_url: mapsUrl,
      attributes: JSON.stringify(['Atende presencial', 'Telemedicina disponível', 'Aceita cartão e Pix']),
      accessibility_attributes: JSON.stringify(['Rampa de acesso', 'Vaga reservada', 'Banheiro adaptado']),
      next_opening_text: 'Abre amanhã às 08:00',
      next_open_day: 'Segunda-feira',
      next_open_time: '08:00',
      visible_photos_count: '48',
      popular_times: JSON.stringify({ 'Segunda': 'Pico às 10h e às 15h', 'Quarta': 'Fluxo moderado' }),
      rating_distribution: JSON.stringify({ '5': 260, '4': 58, '3': 15, '2': 5, '1': 4 }),
      review_highlights: JSON.stringify(['Profissionais muito atenciosos', 'Excelente estrutura física', 'Ótima localização']),
      field_status: JSON.stringify({ complete: 38, partial: 4 }),
      collected_at: now,
    };
  });
}

// Initial Data Seed
function getInitialStore(): StoreState {
  const initialJobId = 'job_initial_seed';
  const initialUserId = 'usr_admin_default';
  const initialJob: ScrapeJob = {
    id: initialJobId,
    user_id: initialUserId,
    segment: 'Clínica Médica',
    project_name: 'Prospecção Médica Sudeste',
    project_id: 'prj_medica_sp',
    category_id: 'cat_saude',
    location: 'São Paulo - SP',
    limit_requested: 10,
    status: 'completed',
    status_message: 'Coleta concluída com sucesso. 8 estabelecimentos capturados.',
    total_found: 8,
    total_collected: 8,
    total_duplicates: 0,
    total_errors: 0,
    current_step: 'Concluído',
    created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
    completed_at: new Date(Date.now() - 3600 * 1000 * 24 + 12000).toISOString(),
  };

  const initialPlaces = generateInitialPlaces(initialJobId, 'Clínica Médica', 'São Paulo - SP');

  return {
    users: [
      {
        id: initialUserId,
        email: 'olfnetto@gmail.com',
        name: 'Administrador Geral',
        passwordHash: hashPassword('Netto@964212$'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_admin_demo',
        email: 'admin@mapscrape.com',
        name: 'Equipe MapScrape',
        passwordHash: hashPassword('admin12345678'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    ],
    jobs: [initialJob],
    places: initialPlaces,
    projects: [
      { id: 'prj_medica_sp', name: 'Prospecção Médica Sudeste', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'prj_gastronomia_rj', name: 'Restaurantes & Gastronomia RJ', user_id: initialUserId, created_at: new Date().toISOString() },
      { id: 'prj_imobiliarias_sul', name: 'Imobiliárias & Corretores Sul', user_id: initialUserId, created_at: new Date().toISOString() },
    ],
    categories: [
      { id: 'cat_saude', name: 'Clínicas & Saúde', user_id: initialUserId, project_id: 'prj_medica_sp', created_at: new Date().toISOString() },
      { id: 'cat_odontologia', name: 'Odontologia & Ortodontia', user_id: initialUserId, project_id: 'prj_medica_sp', created_at: new Date().toISOString() },
      { id: 'cat_gastronomia', name: 'Restaurantes & Gastronomia', user_id: initialUserId, project_id: 'prj_gastronomia_rj', created_at: new Date().toISOString() },
      { id: 'cat_imobiliario', name: 'Imobiliárias & Corretores', user_id: initialUserId, project_id: 'prj_imobiliarias_sul', created_at: new Date().toISOString() },
      { id: 'cat_estetica', name: 'Estética & Beleza', user_id: initialUserId, project_id: 'prj_medica_sp', created_at: new Date().toISOString() },
    ],
    credentials: [
      {
        id: 'cred_prod_live_01',
        consumer_name: 'Pipeline CRM Hubspot',
        consumer_project: 'integração-vendas',
        api_key_hash: hashApiKey('msk_live_demo_crm_sync_key_998877'),
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ],
    logs: [
      {
        id: 'log_01',
        created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
        level: 'info',
        category: 'scraper',
        event: 'job_started',
        message: 'Pesquisa inicial iniciada para "Clínica Médica" em "São Paulo - SP".',
        job_id: initialJobId,
        metadata: JSON.stringify({ segment: 'Clínica Médica', location: 'São Paulo - SP', limit: 10 }),
        user_id: initialUserId,
      },
      {
        id: 'log_02',
        created_at: new Date(Date.now() - 3600 * 1000 * 24 + 12000).toISOString(),
        level: 'info',
        category: 'scraper',
        event: 'job_completed',
        message: 'Coleta concluída com sucesso. 8 estabelecimentos enriquecidos e salvos.',
        job_id: initialJobId,
        metadata: JSON.stringify({ total_found: 8, total_collected: 8 }),
        user_id: initialUserId,
      },
    ],
    web_intelligence: {},
    opportunities: [],
  };
}

function normalizeMapsPlaceUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(value).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  }
}

function normalizePlaceTextKey(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const INVALID_MAPS_PLACE_NAMES = new Set([
  'horario', 'horarios', 'avaliacao', 'avaliacoes', 'sobre', 'fotos', 'foto',
  'menu', 'reviews', 'review', 'about', 'overview', 'directions', 'rotas',
  'como chegar', 'mais informacoes', 'informacoes', 'website', 'site',
]);

function isValidMapsBusinessName(value: string | null | undefined): boolean {
  const key = normalizePlaceTextKey(value);
  return key.length >= 3 && key.length <= 180 && !INVALID_MAPS_PLACE_NAMES.has(key) && !/^\d+$/.test(key);
}

function getPlaceIdentity(place: Partial<PlaceRecord>): { sourceId: string; urlKeys: string[]; nameAddressKey: string } {
  const sourceId =
    extractSourcePlaceId(place.maps_url) ||
    extractSourcePlaceId(place.source_url) ||
    String(place.source_place_id || '').trim().toLowerCase();
  const urlKeys = [place.maps_url, place.source_url]
    .map(normalizeMapsPlaceUrl)
    .filter(Boolean);
  const name = normalizePlaceTextKey(place.name);
  const address = normalizePlaceTextKey(place.address);
  return {
    sourceId,
    urlKeys,
    nameAddressKey: name && address ? `${name}|${address}` : '',
  };
}

function deduplicatePlaceSnapshot(places: PlaceRecord[]): PlaceRecord[] {
  const unique = new Map<string, PlaceRecord>();
  const score = (place: PlaceRecord): number => {
    const fields: (keyof PlaceRecord)[] = [
      'name', 'category', 'address', 'phone', 'website', 'rating', 'review_count',
      'maps_url', 'source_url', 'source_place_id', 'description', 'opening_hours',
    ];
    return fields.reduce((total, field) => {
      const value = place[field];
      return total + (value !== undefined && value !== null && String(value).trim() ? 1 : 0);
    }, isValidMapsBusinessName(place.name) ? 5 : -10);
  };

  for (const place of places) {
    const identity = getPlaceIdentity(place);
    const key = identity.sourceId
      ? `maps:${identity.sourceId}`
      : identity.urlKeys[0]
        ? `url:${identity.urlKeys[0]}`
        : `id:${place.id}`;
    const existing = unique.get(key);
    if (!existing || score(place) > score(existing)) unique.set(key, place);
  }
  return Array.from(unique.values());
}

function markStaleRunningJobs(state: StoreState, userId: string, now = Date.now()): boolean {
  // A running scrape can take several minutes. Only clean up jobs that have been
  // completely abandoned for more than 10 minutes without heartbeat.
  const staleAfterMs = 10 * 60 * 1000;
  let changed = false;
  for (const job of state.jobs) {
    if (job.user_id !== userId || job.status !== 'running') continue;
    const lastHeartbeat = Date.parse(job.heartbeat_at || job.created_at);
    if (!Number.isFinite(lastHeartbeat) || now - lastHeartbeat <= staleAfterMs) continue;
    job.status = 'failed';
    job.completion_reason = 'fatal_error';
    job.status_message = 'A execução expirou por inatividade.';
    job.current_step = 'Execução expirada';
    job.completed_at = new Date(now).toISOString();
    changed = true;
  }
  return changed;
}

class Store {
  private state: StoreState;
  private supabase: SupabaseClient | null = null;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor() {
    this.state = this.load();
  }

  async initialize(): Promise<void> {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
        throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
      }
      return;
    }

    this.supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await this.supabase
      .from('app_state')
      .select('state')
      .eq('id', 'main')
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar dados do Supabase: ${error.message}`);

    if (data?.state && typeof data.state === 'object') {
      this.state = { ...getInitialStore(), ...(data.state as StoreState) };
    } else {
      // A new production database starts empty; never publish demo accounts or fake lead records.
      this.state = {
        users: [],
        jobs: [],
        places: [],
        projects: [],
        categories: [],
        credentials: [],
        logs: [],
        settings: {},
      };
      // Do not write the global app_state snapshot during cold start.
      // The first real mutation will persist the initialized state.
    }

    // The relational places table is the source of truth. app_state is a
    // compatibility snapshot and can lag behind successful relational inserts.
    // Hydrate every page before serving leads or doing in-memory comparisons.
    const relationalPlaces: PlaceRecord[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: placeRows, error: placesError } = await this.supabase
        .from('places')
        .select('*')
        .order('collected_at', { ascending: false })
        .range(offset, offset + 499);
      if (placesError) throw new Error('Falha ao carregar estabelecimentos do banco: ' + placesError.message);
      relationalPlaces.push(...((placeRows || []) as unknown as PlaceRecord[]));
      if (!placeRows || placeRows.length < 500) break;
    }
    this.state.places = relationalPlaces;

    const currentPlaces = this.state.places || [];
    const deduplicatedPlaces = deduplicatePlaceSnapshot(currentPlaces);
    if (deduplicatedPlaces.length !== currentPlaces.length) {
      console.warn(`[Store] Removendo ${currentPlaces.length - deduplicatedPlaces.length} duplicidade(s) do snapshot local de estabelecimentos.`);
      this.state.places = deduplicatedPlaces;
      // Keep startup read-only. A cold-start deduplication must never enqueue
      // a full app_state + relational-table rewrite before API routes are ready.
    }
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  private load(): StoreState {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.users && parsed.jobs && parsed.places) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Store] Could not load stored data, initializing default seed:', e);
    }
    const initial = getInitialStore();
    this.save(initial);
    return initial;
  }

  private save(data: StoreState): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[Store] Failed to write store file:', e);
    }
  }

  getState(): StoreState {
    return this.state;
  }

  getWebIntelligence(placeId: string): WebIntelligenceRecord | undefined {
    return this.state.web_intelligence?.[placeId];
  }

  saveWebIntelligence(intelligence: WebIntelligenceRecord): void {
    if (!this.state.web_intelligence) {
      this.state.web_intelligence = {};
    }
    this.state.web_intelligence[intelligence.place_id] = intelligence;

    const place = this.state.places.find((p) => p.id === intelligence.place_id);
    if (place) {
      place.web_intelligence_status = intelligence.status;
      place.web_intelligence_score = intelligence.scores?.overall_score;
      place.web_intelligence = intelligence;
    }

    if (this.state.opportunities) {
      for (const opp of this.state.opportunities) {
        if (opp.place_id === intelligence.place_id) {
          opp.web_intelligence = intelligence;
          opp.score = intelligence.scores?.overall_score;
          opp.qualification_tier = intelligence.scores?.qualification_tier;
        }
      }
    }

    this.persist();
  }

  getOpportunities(userId: string): OpportunityRecord[] {
    if (!this.state.opportunities) this.state.opportunities = [];
    return this.state.opportunities.filter((opp) => opp.user_id === userId);
  }

  saveOpportunity(opp: OpportunityRecord): void {
    if (!this.state.opportunities) this.state.opportunities = [];
    const existingIndex = this.state.opportunities.findIndex(
      (o) => o.id === opp.id || (o.place_id === opp.place_id && o.user_id === opp.user_id)
    );
    if (existingIndex >= 0) {
      this.state.opportunities[existingIndex] = {
        ...this.state.opportunities[existingIndex],
        ...opp,
        updated_at: new Date().toISOString(),
      };
    } else {
      this.state.opportunities.unshift(opp);
    }
    this.persist();
  }

  updateOpportunity(id: string, updates: Partial<OpportunityRecord>, userId: string): OpportunityRecord | null {
    if (!this.state.opportunities) this.state.opportunities = [];
    const opp = this.state.opportunities.find((o) => o.id === id && o.user_id === userId);
    if (!opp) return null;
    Object.assign(opp, updates, { updated_at: new Date().toISOString() });
    this.persist();
    return opp;
  }

  deleteOpportunity(id: string, userId: string): boolean {
    if (!this.state.opportunities) return false;
    const initialLen = this.state.opportunities.length;
    this.state.opportunities = this.state.opportunities.filter((o) => !(o.id === id && o.user_id === userId));
    if (this.state.opportunities.length !== initialLen) {
      this.persist();
      return true;
    }
    return false;
  }

  /**
   * Read job progress from the relational source of truth first.
   * Serverless instances can hold stale in-memory snapshots.
   */
  async findJobForUser(id: string, userId: string): Promise<ScrapeJob | null> {
    await this.flush();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scrape_jobs')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('Falha ao consultar coleta no Supabase: ' + error.message);
      if (data) {
        const snapshotJob = this.state.jobs.find((job) => job.id === id && job.user_id === userId);
        if (!snapshotJob) return data as unknown as ScrapeJob;
        return {
          ...(data as unknown as ScrapeJob),
          search_session_id: (data as any).search_session_id ?? snapshotJob.search_session_id,
          phase: (data as any).phase ?? snapshotJob.phase,
          discovery_checkpoint: (data as any).discovery_checkpoint ?? snapshotJob.discovery_checkpoint,
          completion_reason: snapshotJob.completion_reason ?? (data as any).completion_reason,
          candidate_urls: snapshotJob.candidate_urls,
          candidate_cursor: (data as any).candidate_cursor ?? snapshotJob.candidate_cursor,
          retry_count: (data as any).retry_count ?? snapshotJob.retry_count,
          heartbeat_at: (data as any).heartbeat_at ?? snapshotJob.heartbeat_at,
        };
      }
    }
    return this.state.jobs.find((job) => job.id === id && job.user_id === userId) ?? null;
  }


  async isScrapePlaceDuplicate(sourcePlaceId: string | null, sourceUrl: string): Promise<boolean> {
    if (!this.supabase) {
      const normalizedUrl = normalizeMapsPlaceUrl(sourceUrl);
      return this.state.places.some((place) =>
        (sourcePlaceId && place.source_place_id?.toLowerCase() === sourcePlaceId.toLowerCase()) ||
        (normalizedUrl && [place.source_url, place.maps_url].some((url) => normalizeMapsPlaceUrl(url || '') === normalizedUrl))
      );
    }
    const { data, error } = await this.supabase.rpc('is_scrape_place_duplicate', {
      p_source_place_id: sourcePlaceId, p_source_url: normalizeMapsPlaceUrl(sourceUrl),
    });
    if (error) throw new Error('Falha ao verificar duplicidade no Supabase: ' + error.message);
    return data === true;
  }

  private applyScrapeCounters(job: ScrapeJob, data: any): void {
    job.total_found = Number(data.total_found ?? job.total_found);
    job.total_collected = Number(data.total_collected ?? job.total_collected);
    job.total_duplicates = Number(data.total_duplicates ?? job.total_duplicates);
    job.total_errors = Number(data.total_errors ?? job.total_errors);
    job.heartbeat_at = new Date().toISOString();
  }

  async getUserPlaceAssociations(userId: string): Promise<Array<{ place_id: string; job_id: string }> | null> {
    if (!this.supabase) return null;
    const { data, error } = await this.supabase
      .from('user_places')
      .select('place_id, job_id')
      .eq('user_id', userId);
    if (error) throw new Error('Falha ao carregar vínculos dos estabelecimentos: ' + error.message);
    return (data || []) as Array<{ place_id: string; job_id: string }>;
  }

  async persistScrapedPlace(
    job: ScrapeJob, place: PlaceRecord | null, sourcePlaceId: string | null,
    sourceUrl: string, lease: { token: string; generation: number }
  ): Promise<'saved' | 'duplicate'> {
    if (!this.supabase) {
      job.total_found += 1;
      if (!place) { job.total_duplicates += 1; this.save(this.state); return 'duplicate'; }
      const normalizedUrl = normalizeMapsPlaceUrl(sourceUrl);
      const duplicate = this.state.places.some((existing) =>
        (sourcePlaceId && existing.source_place_id?.toLowerCase() === sourcePlaceId.toLowerCase()) ||
        (normalizedUrl && [existing.source_url, existing.maps_url].some((url) => normalizeMapsPlaceUrl(url || '') === normalizedUrl)) ||
        (place.name && place.address && existing.name.trim().toLowerCase() === place.name.trim().toLowerCase()
          && existing.address.trim().toLowerCase() === place.address.trim().toLowerCase())
      );
      if (duplicate) { job.total_duplicates += 1; this.save(this.state); return 'duplicate'; }
      job.total_collected += 1;
      this.save(this.state);
      return 'saved';
    }
    const { data, error } = await this.supabase.rpc('persist_scraped_place', {
      p_job_id: job.id, p_user_id: job.user_id,
      p_place: place as unknown as Record<string, unknown> | null,
      p_source_place_id: sourcePlaceId, p_source_url: normalizeMapsPlaceUrl(sourceUrl),
      p_lease_token: lease.token, p_lease_generation: lease.generation,
    });
    if (error || !data) throw new Error('Falha ao persistir estabelecimento atomicamente: ' + (error?.message || 'resposta vazia'));
    this.applyScrapeCounters(job, data);
    return data.outcome === 'saved' ? 'saved' : 'duplicate';
  }

  async recordScrapePlaceError(job: ScrapeJob, lease: { token: string; generation: number }): Promise<void> {
    if (!this.supabase) {
      job.total_found += 1; job.total_errors += 1; this.save(this.state); return;
    }
    const { data, error } = await this.supabase.rpc('record_scrape_place_error', {
      p_job_id: job.id, p_user_id: job.user_id,
      p_lease_token: lease.token, p_lease_generation: lease.generation,
    });
    if (error || !data) throw new Error('Falha ao registrar erro de extração no Supabase: ' + (error?.message || 'resposta vazia'));
    this.applyScrapeCounters(job, data);
  }

  async isJobCancellationRequested(id: string, userId: string): Promise<boolean> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scrape_jobs')
        .select('cancel_requested')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('Falha ao verificar interrupção da coleta: ' + error.message);
      return data?.cancel_requested === true;
    }
    const job = this.state.jobs.find((item) => item.id === id && item.user_id === userId);
    return (job as any)?.cancel_requested === true || job?.status === 'stopped';
  }


  async requestJobCancellation(id: string, userId: string): Promise<ScrapeJob | null> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('scrape_jobs')
        .update({
          cancel_requested: true,
          status_message: 'Pedido de interrupção recebido; aguardando encerrar a ficha atual.',
          current_step: 'Interrompendo...',
        })
        .eq('id', id)
        .eq('user_id', userId)
        .select('*')
        .maybeSingle();
      if (error) throw new Error('Falha ao solicitar interrupção no banco: ' + error.message);
      if (!data) return null;
      const localJob = this.state.jobs.find((item) => item.id === id && item.user_id === userId);
      if (localJob) {
        localJob.status_message = 'Pedido de interrupção recebido; aguardando encerrar a ficha atual.';
        localJob.current_step = 'Interrompendo...';
        (localJob as any).cancel_requested = true;
      }
      return data as unknown as ScrapeJob;
    }

    const job = this.state.jobs.find((item) => item.id === id && item.user_id === userId);
    if (!job) return null;
    job.status_message = 'Pedido de interrupção recebido; aguardando encerrar a ficha atual.';
    job.current_step = 'Interrompendo...';
    (job as any).cancel_requested = true;
    store.persist();
    return job;
  }

  async deleteCategoryFromDatabase(categoryId: string): Promise<void> {
    await this.flush();
    if (!this.supabase) return;
    const { error } = await this.supabase.from('categories').delete().eq('id', categoryId);
    if (error) throw new Error(`Falha ao excluir categoria relacional: ${error.message}`);
  }

  async deleteProjectFromDatabase(projectId: string): Promise<void> {
    await this.flush();
    if (!this.supabase) return;
    try {
      await this.supabase.from('places').update({ project_id: null, category_id: null }).eq('project_id', projectId);
    } catch (e: any) {
      console.warn('[Store] Aviso ao desvincular places:', e?.message || e);
    }
    try {
      await this.supabase.from('scrape_jobs').update({ project_id: null, category_id: null }).eq('project_id', projectId);
    } catch (e: any) {
      console.warn('[Store] Aviso ao desvincular raspagens:', e?.message || e);
    }
    try {
      await this.supabase.from('categories').delete().eq('project_id', projectId);
    } catch (e: any) {
      console.warn('[Store] Aviso ao excluir categorias do projeto:', e?.message || e);
    }
    try {
      const { error: projectError } = await this.supabase.from('projects').delete().eq('id', projectId);
      if (projectError) console.warn('[Store] Aviso ao excluir projeto relacional:', projectError.message);
    } catch (e: any) {
      console.warn('[Store] Erro ao excluir projeto relacional:', e?.message || e);
    }
  }

  private async ensureRelationalUser(userId: string): Promise<void> {
    if (!this.supabase) return;
    const user = this.state.users.find((item) => item.id === userId);
    if (!user) throw new Error(`Usuário ${userId} não encontrado no estado da aplicação.`);
    const { error } = await this.supabase.from('app_users').upsert({
      id: user.id,
      email: user.email,
      name: user.name,
      password_hash: user.passwordHash,
      role: user.role,
      created_at: user.createdAt,
    }, { onConflict: 'id' });
    if (error) throw new Error(`Falha ao sincronizar usuário no Supabase: ${error.message}`);
  }

  async persistScrapeProgress(job: ScrapeJob, lease?: { token: string; generation: number }): Promise<boolean> {
    job.heartbeat_at = new Date().toISOString();
    if (!this.supabase) {
      this.save(this.state);
      return true;
    }

    // places is already persisted in the relational table and is reloaded from
    // there during initialization. Never serialize the entire lead database into
    // app_state on every per-place checkpoint.
    const snapshot = JSON.parse(JSON.stringify({
      ...this.state,
      places: [],
    })) as StoreState;
    // Legacy candidate URL arrays are excluded from the app_state snapshot.
    for (const snapshotJob of snapshot.jobs) delete snapshotJob.candidate_urls;
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      const client = this.supabase!;
      // scrape_jobs.user_id references app_users(id); synchronize the owner
      // before writing the job so newly registered accounts satisfy the FK.
      await this.ensureRelationalUser(job.user_id);
      if (lease) {
        const { data: renewed, error: leaseError } = await client.rpc('renew_scrape_job_lease', {
          p_job_id: job.id, p_user_id: job.user_id, p_lease_token: lease.token,
          p_generation: lease.generation, p_lease_seconds: 90,
        });
        if (leaseError || renewed !== true) throw new Error('Lease do job perdida; gravação bloqueada.');
      }
      const { error: stateError } = await client
        .from('app_state')
        .upsert({ id: 'main', state: snapshot, updated_at: new Date().toISOString() });
      if (stateError) throw new Error(`Falha ao persistir progresso da coleta: ${stateError.message}`);

      // Ensure project & category exist if job references them
      if (job.project_id) {
        const prj = this.state.projects.find((p) => p.id === job.project_id);
        if (prj) {
          try {
            await client.from('projects').upsert({
              id: prj.id,
              name: prj.name,
              user_id: prj.user_id,
              created_at: prj.created_at,
            }, { onConflict: 'id' });
          } catch {}
        }
      }
      if (job.category_id) {
        const cat = this.state.categories.find((c) => c.id === job.category_id);
        if (cat) {
          try {
            await client.from('categories').upsert({
              id: cat.id,
              name: cat.name,
              user_id: cat.user_id,
              project_id: cat.project_id || null,
              created_at: cat.created_at,
            }, { onConflict: 'id' });
          } catch {}
        }
      }

      let jobRow = {
        id: job.id, user_id: job.user_id, segment: job.segment,
        project_name: job.project_name ?? null, project_id: job.project_id ?? null,
        category_id: job.category_id ?? null, location: job.location,
        limit_requested: job.limit_requested, status: job.status,
        status_message: job.status_message, total_found: job.total_found,
        total_collected: job.total_collected, total_duplicates: job.total_duplicates,
        total_errors: job.total_errors, current_step: job.current_step ?? null,
        heartbeat_at: job.heartbeat_at ?? null,
        created_at: job.created_at, completed_at: job.completed_at ?? null,
      };

      let { error: jobError } = await client.from('scrape_jobs').upsert(jobRow, { onConflict: 'id' });
      if (jobError && /foreign key|fkey/i.test(jobError.message)) {
        jobRow = { ...jobRow, project_id: null, category_id: null };
        const retryResult = await client.from('scrape_jobs').upsert(jobRow, { onConflict: 'id' });
        jobError = retryResult.error;
      }
      if (jobError) throw new Error(`Falha ao sincronizar progresso da coleta: ${jobError.message}`);

    });

    await this.pendingWrite;
    return true;
  }

  persist(): void {
    if (!this.supabase) {
      this.save(this.state);
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(this.state)) as StoreState;
    // Historical candidate URL arrays are not used by new scrape jobs.
    for (const snapshotJob of snapshot.jobs) delete snapshotJob.candidate_urls;
    this.pendingWrite = this.pendingWrite.catch(() => undefined).then(async () => {
      const client = this.supabase!;
      // Keep the relational auth table aligned with the canonical app_state
      // before syncing projects, categories, or jobs that reference its users.
      if (snapshot.users.length) {
        const { error: usersError } = await client.from('app_users').upsert(
          snapshot.users.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            password_hash: user.passwordHash,
            role: user.role,
            created_at: user.createdAt,
          })),
          { onConflict: 'id' }
        );
        if (usersError) throw new Error(`Falha ao sincronizar usuários relacionais: ${usersError.message}`);
      }
      const { error: stateError } = await client
        .from('app_state')
        .upsert({ id: 'main', state: snapshot, updated_at: new Date().toISOString() });
      if (stateError) throw new Error(`Falha ao persistir dados no Supabase: ${stateError.message}`);

      // 1. Synchronize projects so relational foreign keys are satisfied
      if (snapshot.projects.length) {
        const { error: prjError } = await client.from('projects').upsert(
          snapshot.projects.map((p) => ({
            id: p.id,
            name: p.name,
            user_id: p.user_id,
            created_at: p.created_at,
          })),
          { onConflict: 'id' }
        );
        if (prjError) console.warn('[Store] Falha ao sincronizar projetos relacionais:', prjError.message);
      }

      // 2. Synchronize categories so relational foreign keys are satisfied
      if (snapshot.categories.length) {
        const projectIds = new Set(snapshot.projects.map((p) => p.id));
        const { error: catError } = await client.from('categories').upsert(
          snapshot.categories.map((c) => ({
            id: c.id,
            name: c.name,
            user_id: c.user_id,
            project_id: (c.project_id && projectIds.has(c.project_id)) ? c.project_id : null,
            created_at: c.created_at,
          })),
          { onConflict: 'id' }
        );
        if (catError) console.warn('[Store] Falha ao sincronizar categorias relacionais:', catError.message);
      }

      // 3. Synchronize scrape_jobs safely against foreign keys
      if (snapshot.jobs.length) {
        const validCategoryIds = new Set(snapshot.categories.map((c) => c.id));
        const validProjectIds = new Set(snapshot.projects.map((p) => p.id));

        const jobRows = snapshot.jobs.map((item) => ({
          id: item.id,
          user_id: item.user_id,
          segment: item.segment,
          project_name: item.project_name ?? null,
          project_id: (item.project_id && validProjectIds.has(item.project_id)) ? item.project_id : null,
          category_id: (item.category_id && validCategoryIds.has(item.category_id)) ? item.category_id : null,
          location: item.location,
          limit_requested: item.limit_requested,
          status: item.status,
          status_message: item.status_message,
          total_found: item.total_found,
          total_collected: item.total_collected,
          total_duplicates: item.total_duplicates,
          total_errors: item.total_errors,
          current_step: item.current_step ?? null,
          heartbeat_at: item.heartbeat_at ?? null,
          created_at: item.created_at,
          completed_at: item.completed_at ?? null,
        }));

        let { error } = await client.from('scrape_jobs').upsert(jobRows, { onConflict: 'id' });
        if (error && /foreign key|fkey/i.test(error.message)) {
          console.warn('[Store] Violação de chave estrangeira em scrape_jobs; sanitizando referências:', error.message);
          const sanitizedRows = jobRows.map((r) => ({ ...r, project_id: null, category_id: null }));
          const retryResult = await client.from('scrape_jobs').upsert(sanitizedRows, { onConflict: 'id' });
          error = retryResult.error;
        }
        if (error) throw new Error(`Falha ao sincronizar raspagens: ${error.message}`);
      }
      // Keep relational places synchronized with app_state; without this, the UI
      // showed leads from JSON while public.places stayed empty.
      if (snapshot.places.length) {
        // Deduplicate both natural keys and IDs before writing. The unique source_url
        // index is independent of the primary key, so onConflict:'id' alone is not enough.
        const uniquePlaces = new Map<string, PlaceRecord>();
        const seenIds = new Set<string>();
        for (const place of snapshot.places) {
          const sourceKey = (place.source_url || place.maps_url || '').trim();
          const key = sourceKey ? `source:${sourceKey}` : `id:${place.id}`;
          if (seenIds.has(place.id) || uniquePlaces.has(key)) continue;
          seenIds.add(place.id);
          uniquePlaces.set(key, place);
        }
        const rows = Array.from(uniquePlaces.values()).map((p) => ({
          id: p.id, job_id: p.job_id, name: p.name || '', category: p.category || '',
          address: p.address || '', neighborhood: p.neighborhood || null, phone: p.phone || '', website: p.website || '',
          rating: p.rating || '', review_count: p.review_count || '', price_range: p.price_range || '',
          opening_hours: p.opening_hours || '', business_status: p.business_status || '',
          latitude: p.latitude || '', longitude: p.longitude || '', maps_url: p.maps_url || '',
          description: p.description || '', services_attributes: p.services_attributes || '',
          photos: p.photos ?? null, videos: p.videos ?? null, logo_url: p.logo_url ?? null,
          booking_url: p.booking_url ?? null, social_links: p.social_links ?? null, reviews: p.reviews ?? null,
          review_topics: p.review_topics ?? null, additional_attributes: p.additional_attributes ?? null,
          media_items: p.media_items ?? null, plus_code: p.plus_code ?? null, postal_code: p.postal_code ?? null,
          country: p.country ?? null, city: p.city ?? null, state: p.state ?? null,
          source_place_id: p.source_place_id ?? null, source_url: p.source_url ?? null,
          attributes: p.attributes ?? null, accessibility_attributes: p.accessibility_attributes ?? null,
          next_opening_text: p.next_opening_text ?? null, next_open_day: p.next_open_day ?? null,
          next_open_time: p.next_open_time ?? null, visible_photos_count: p.visible_photos_count ?? null,
          popular_times: p.popular_times ?? null, rating_distribution: p.rating_distribution ?? null,
          review_highlights: p.review_highlights ?? null, field_status: p.field_status ?? null,
          collected_at: p.collected_at || new Date().toISOString(),
        }));
        const rowsWithSource = rows.filter((row) => typeof row.source_url === 'string' && row.source_url.trim());
        const rowsWithoutSource = rows.filter((row) => !row.source_url || !row.source_url.trim());

        // Reuse the database ID for an already-known source_url. This prevents a
        // different scrape/job ID for the same business from violating the unique index.
        if (rowsWithSource.length) {
          // Google Maps source URLs are long. Sending hundreds in one PostgREST
          // "in" filter can exceed request-line limits and return HTTP 400.
          // Resolve existing IDs in small batches, then upsert in bounded batches.
          const lookupBatchSize = 20;
          const writeBatchSize = 50;
          const existingIds = new Map<string, string>();

          for (let i = 0; i < rowsWithSource.length; i += lookupBatchSize) {
            const batchUrls = rowsWithSource
              .slice(i, i + lookupBatchSize)
              .map((row) => row.source_url as string);
            const { data: existingBySource, error: lookupError } = await client
              .from('places')
              .select('id, source_url')
              .in('source_url', batchUrls);
            if (lookupError) {
              throw new Error(`Falha ao consultar estabelecimentos existentes (lote ${Math.floor(i / lookupBatchSize) + 1}): ${lookupError.message}`);
            }
            for (const existing of existingBySource || []) {
              existingIds.set(existing.source_url, existing.id);
            }
          }

          const sourceRowsByUrl = new Map<string, typeof rowsWithSource[number]>();
          for (const row of rowsWithSource) {
            sourceRowsByUrl.set(row.source_url as string, {
              ...row,
              id: existingIds.get(row.source_url as string) || row.id,
            });
          }
          const sourceRows = Array.from(sourceRowsByUrl.values());

          // The database enforces source_url with a partial unique index.
          // We resolve existing IDs first and upsert by primary key.
          for (let i = 0; i < sourceRows.length; i += writeBatchSize) {
            const { error } = await client
              .from('places')
              .upsert(sourceRows.slice(i, i + writeBatchSize), { onConflict: 'id' });
            if (error) {
              throw new Error(`Falha ao sincronizar estabelecimentos por URL (lote ${Math.floor(i / writeBatchSize) + 1}): ${error.message}`);
            }
          }
        }
        if (rowsWithoutSource.length) {
          for (let i = 0; i < rowsWithoutSource.length; i += 50) {
            const { error } = await client
              .from('places')
              .upsert(rowsWithoutSource.slice(i, i + 50), { onConflict: 'id' });
            if (error) {
              throw new Error(`Falha ao sincronizar estabelecimentos por ID (lote ${Math.floor(i / 50) + 1}): ${error.message}`);
            }
          }
        }
      }


    });
  }
}

const store = new Store();

// Helper: Extract Auth Bearer Token
function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim();
  }
  return null;
}

// Helper: Resolve User from Token or Return Default Admin for local developer session
function resolveUserFromRequest(req: Request): UserProfile | null {
  const token = extractBearerToken(req);
  const state = store.getState();

  if (token) {
    // If token is an API key (starts with msk_ or matched by hash)
    const keyHash = hashApiKey(token);
    const cred = state.credentials.find((c) => c.status === 'active' && c.api_key_hash === keyHash);
    if (cred) {
      return {
        id: `consumer_${cred.id}`,
        email: `${cred.consumer_project}@api.mapscrape.com`,
        name: cred.consumer_name,
        passwordHash: '',
        role: 'user',
        createdAt: cred.created_at,
      };
    }

    // Check if token matches a registered user ID or JWT
    const directUser = state.users.find((u) => u.id === token || `sess_${u.id}` === token);
    if (directUser) return directUser;

    // Check by email in token if formatted as email:id
    if (token.includes('@')) {
      const emailUser = state.users.find((u) => u.email.toLowerCase() === token.toLowerCase());
      if (emailUser) return emailUser;
    }
  }

  // Only local development may use the seeded demo administrator.
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') return null;
  const admin = state.users.find((u) => u.role === 'admin') || state.users[0];
  return admin || null;
}

// =========================================================================
// REAL SCRAPING ENGINE (Google Maps DOM Extractor with Cloudflare Browser Support)
// =========================================================================

// CSV Builder with BOM & Formula Injection Defense
function buildCsvString(places: PlaceRecord[], fields: (keyof PlaceRecord)[]): string {
  const headerKeys = fields.length > 0 ? fields : (EXPORTABLE_FIELDS.map((f) => f.key) as (keyof PlaceRecord)[]);
  const fieldLabelMap = new Map(EXPORTABLE_FIELDS.map((f) => [f.key, f.label]));

  const headerRow = headerKeys.map((k) => `"${(fieldLabelMap.get(k) || k).replace(/"/g, '""')}"`).join(',');

  const rows = places.map((place) => {
    return headerKeys
      .map((k) => {
        let val = place[k];
        if (val === undefined || val === null) val = '';
        let str = String(val);

        // Sanitize formula injection (=, +, -, @, \t, \r)
        if (/^[=+\-@\t\r]/.test(str)) {
          str = `'` + str;
        }

        // Escape double quotes
        return `"${str.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  // UTF-8 BOM
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

const activeScrapeJobs = new Map<string, { cancel: () => void }>();
type ScrapeJobLease = { token: string; generation: number };
async function claimScrapeJobLease(job: ScrapeJob): Promise<ScrapeJobLease | null> {
  if (!(store as any).supabase) return { token: 'local', generation: 1 };
  const token = crypto.randomUUID();
  const { data, error } = await (store as any).supabase.rpc('claim_scrape_job_lease', {
    p_job_id: job.id, p_user_id: job.user_id, p_lease_token: token, p_lease_seconds: 90,
  });
  if (error) throw new Error('Falha ao reivindicar execução: ' + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.acquired ? { token, generation: Number(row.generation) } : null;
}
async function releaseScrapeJobLease(job: ScrapeJob, lease: ScrapeJobLease): Promise<void> {
  const client = (store as any).supabase;
  if (!client || lease.token === 'local') return;
  const { error } = await client.rpc('release_scrape_job_lease', {
    p_job_id: job.id, p_user_id: job.user_id, p_lease_token: lease.token, p_generation: lease.generation,
  });
  if (error) console.error('[Scraper] Falha ao liberar lease do job:', error.message);
}

async function executeScrapeJob(
  jobId: string,
  segment: string,
  location: string,
  limit: number,
  userId: string,
): Promise<void> {
  let browser: Browser | null = null;
  let cancelled = false;
  let pauseReason = '';
  let accessRestricted = false;
  let browserErrorDuringExtraction = false;
  const state = store.getState();
  const job = state.jobs.find((item) => item.id === jobId && item.user_id === userId);
  if (!job) return;
  let jobLease: ScrapeJobLease | null = null;
  let leaseLost = false;
  let leaseRenewal: ReturnType<typeof setInterval> | null = null;
  try {
    jobLease = await claimScrapeJobLease(job);
    if (!jobLease) {
      console.warn('[Scraper] Outra instância já está executando este job; esta invocação será descartada.');
      return;
    }
  } catch (error) {
    job.status = 'failed';
    job.completion_reason = 'fatal_error';
    job.status_message = error instanceof Error ? error.message : String(error);
    job.current_step = 'Falha ao adquirir lease';
    await store.persistScrapeProgress(job, jobLease || undefined).catch(() => {});
    return;
  }
  activeScrapeJobs.set(jobId, { cancel: () => { cancelled = true; } });
  leaseRenewal = setInterval(async () => {
    if (!jobLease || jobLease.token === 'local' || !(store as any).supabase) return;
    try {
      const { data, error } = await (store as any).supabase.rpc('renew_scrape_job_lease', {
        p_job_id: job.id, p_user_id: job.user_id,
        p_lease_token: jobLease.token, p_generation: jobLease.generation, p_lease_seconds: 90,
      });
      if (error || data !== true) { leaseLost = true; cancelled = true; pauseReason = 'Lease do job perdida; execução encerrada para proteger os dados.'; }
    } catch { leaseLost = true; cancelled = true; pauseReason = 'Falha ao renovar lease do job; execução encerrada por segurança.'; }
  }, 30000);
  leaseRenewal.unref?.();

  const audit = async (event: string, level: 'debug' | 'info' | 'warn' | 'error', message: string, metadata: Record<string, unknown> = {}) => {
    try {
      await writeAuditLog({ level, category: 'scraper', event, message, jobId, metadata });
    } catch (error) {
      console.error('[AuditLog] Não foi possível persistir evento:', error instanceof Error ? error.message : String(error));
    }
  };

  const updateProgress = async (message: string) => {
    job.current_step = message;
    job.heartbeat_at = new Date().toISOString();
    await store.persistScrapeProgress(job, jobLease || undefined);
  };

  let browserReconnectAttempts = 0;
  const MAX_BROWSER_RECONNECTS = 3;

  async function ensureBrowser(): Promise<Browser> {
    if (browser) return browser;
    if (browserReconnectAttempts >= MAX_BROWSER_RECONNECTS) {
      throw new Error('Orçamento de reconexão do navegador esgotado.');
    }
    browser = await connectScraperBrowser(state.settings?.browserWsEndpoint);
    browserReconnectAttempts += 1;
    return browser;
  }

  try {
    if (await store.isJobCancellationRequested(jobId, userId)) {
      cancelled = true;
      job.status = 'stopped';
      job.status_message = 'Coleta interrompida antes de iniciar o navegador.';
      job.current_step = 'Interrompida';
      job.completed_at = new Date().toISOString();
      await store.persistScrapeProgress(job, jobLease);
      return;
    }
    await audit('job_started', 'info', 'Coleta iniciada.', { segment, location });
    await updateProgress('Conectando ao navegador...');
    browser = await connectScraperBrowser(state.settings?.browserWsEndpoint);
    let page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });

    const searchQuery = `${segment} ${location}`.trim();
    await updateProgress('Abrindo pesquisa no Google Maps...');
    await page.goto('https://www.google.com/maps/search/' + encodeURIComponent(searchQuery), {
      waitUntil: 'domcontentloaded', timeout: 30000,
    });
    await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"]', { timeout: 15000 }).catch((error: any) => {
      if (error?.name !== 'TimeoutError') throw error;
    });

    let feedExhausted = false;
    let previousCount = 0;
    let stagnantRounds = 0;
    const seenThisRun = new Set<string>();
    const locationFallback = parseSearchLocationFallback(location);
    const feedSelector = 'div[role="feed"]';

    // Google may render terminal/restriction notices outside the feed element.
    // Inspect visible page text and the feed together so the wait condition and
    // the final decision use the same source of truth.
    const inspectFeedState = async (): Promise<{ endReached: boolean; accessRestricted: boolean }> =>
      page!.evaluate((selector) => {
        const feed = document.querySelector(selector) as HTMLElement | null;
        const visibleText = (document.body?.innerText || '').toLocaleLowerCase();
        const feedText = (feed?.innerText || '').toLocaleLowerCase();
        const combinedText = visibleText + '\\n' + feedText;
        const endReached = [
          'você chegou ao final da lista',
          'você chegou ao fim da lista',
          "you've reached the end of the list",
          'you have reached the end of the list',
        ].some((phrase) => combinedText.includes(phrase));
        const accessRestricted = [
          'tráfego incomum',
          'unusual traffic',
          'nossos sistemas detectaram tráfego',
          'our systems have detected unusual traffic',
          'automated queries',
          'consultas automatizadas',
          'não é um robô',
          'not a robot',
        ].some((phrase) => visibleText.includes(phrase))
          || Array.from(document.querySelectorAll('iframe')).some((frame) => {
            const src = frame.getAttribute('src') || '';
            const title = frame.getAttribute('title') || '';
            const rect = frame.getBoundingClientRect();
            return /recaptcha|captcha/i.test(src + ' ' + title)
              && rect.width > 0 && rect.height > 0;
          });
        return { endReached, accessRestricted };
      }, feedSelector);

    await audit('feed_scan_started', 'info', 'Iniciando leitura sequencial do feed.');
    const initialFeedState = await inspectFeedState();
    if (initialFeedState.accessRestricted) {
      pauseReason = 'O Google Maps apresentou uma verificação ou restrição de acesso; a coleta foi encerrada sem classificar isso como fim da lista.';
      accessRestricted = true;
    } else if (initialFeedState.endReached) {
      feedExhausted = true;
    }

    while (!cancelled && !pauseReason && !leaseLost && !feedExhausted && job.total_collected < limit) {
      if (await store.isJobCancellationRequested(jobId, userId)) { cancelled = true; break; }

      let links: string[];
      try {
        links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
            .map((element) => (element as HTMLAnchorElement).href)
            .filter((href): href is string => Boolean(href) && href.includes('/maps/place/'))
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
        const feedBrowserUnavailable = /connection closed|target closed|detached frame|session closed|websocket|browser.*disconnect|protocol error|cannot find context|execution context.*destroyed/i.test(message);
        if (feedBrowserUnavailable && browserReconnectAttempts < MAX_BROWSER_RECONNECTS) {
          browser = null;
          try {
            await ensureBrowser();
            page = await browser!.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
            await page.goto('https://www.google.com/maps/search/' + encodeURIComponent(searchQuery), { waitUntil: 'domcontentloaded', timeout: 30000 });
            await audit('feed_read_reconnected', 'info', 'Navegador reconectado após falha na leitura do feed; pesquisa reiniciada.', { segment, location });
            continue;
          } catch (reconnectError) {
            const reconnectMessage = reconnectError instanceof Error ? reconnectError.message : String(reconnectError ?? 'Erro desconhecido');
            await audit('feed_read_reconnect_failed', 'error', 'Falha ao reconectar o navegador após falha na leitura do feed.', { error_message: reconnectMessage.slice(0, 500) });
            throw error;
          }
        }
        await audit('feed_read_failed', 'error', 'Não foi possível continuar lendo o feed do Google Maps.', {
          error_message: message.slice(0, 500),
        });
        throw error;
      }
      const normalizedLinks = links.map((url) => ({ url, key: normalizeMapsPlaceUrl(url) }))
        .filter((item) => item.key);

      for (const item of normalizedLinks) {
        if (cancelled || pauseReason || leaseLost || job.total_collected >= limit) break;
        if (seenThisRun.has(item.key)) continue;
        seenThisRun.add(item.key);

        const sourcePlaceId = extractSourcePlaceId(item.url) || null;
        let detailPage: Page | null = null;
        let stage: 'precheck' | 'extraction' | 'persistence' = 'precheck';
        try {
          if (!jobLease) throw new Error('Lease do job ausente ao processar ficha.');
          const alreadyExists = await store.isScrapePlaceDuplicate(sourcePlaceId, item.key);
          if (alreadyExists) {
            const outcome = await store.persistScrapedPlace(job, null, sourcePlaceId, item.key, jobLease);
            await audit('duplicate_skipped', 'info', 'Duplicado identificado no feed e descartado sem abrir a ficha.', {
              url: item.key, duplicate_count: job.total_duplicates,
            });
            if (outcome !== 'duplicate') throw new Error('Resultado inconsistente ao registrar duplicado conhecido.');
            continue;
          }

          await updateProgress(`Analisando ficha ${job.total_found + 1}; ${job.total_collected}/${limit} novos contatos salvos...`);
          stage = 'extraction';
          await audit('extraction_started', 'debug', 'Abrindo ficha inédita para extração.', { url: item.key });
          detailPage = await browser!.newPage();
          await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise((resolve) => setTimeout(resolve, 800));
          const place = await extractPlaceDetails(detailPage, jobId, item.url);
          if (job.project_id) (place as any).project_id = job.project_id;
          if (job.category_id) (place as any).category_id = job.category_id;
          if (!place.city && locationFallback.city) place.city = locationFallback.city;
          if (!place.state && locationFallback.state) place.state = locationFallback.state;

          if (await store.isJobCancellationRequested(jobId, userId)) {
            cancelled = true;
            break;
          }
          stage = 'persistence';
          const outcome = await store.persistScrapedPlace(job, place, sourcePlaceId, item.key, jobLease);
          if (outcome === 'duplicate') {
            await audit('duplicate_skipped', 'info', 'Duplicado detectado na verificação atômica final; registro descartado.', {
              url: item.key, name: place.name, duplicate_count: job.total_duplicates, race_condition: true,
            });
            continue;
          }
          state.places.push(place);
          await audit('place_saved', 'info', 'Novo contato gravado atomicamente.', {
            url: item.key, name: place.name, collected: job.total_collected, target: limit,
          });
          await updateProgress(`Salvo: ${place.name || 'Estabelecimento sem nome'} (${job.total_collected}/${limit})`);
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
          const browserUnavailable = /connection closed|target closed|detached frame|session closed|websocket|browser.*disconnect|protocol error|cannot find context|execution context.*destroyed/i.test(message);
          if (stage !== 'extraction') throw error;
          if (await store.isJobCancellationRequested(jobId, userId)) {
            cancelled = true;
            break;
          }
          if (browserUnavailable && browserReconnectAttempts < MAX_BROWSER_RECONNECTS) {
            browser = null;
            await store.recordScrapePlaceError(job, jobLease!);
            await audit('browser_reconnecting', 'warn', 'Navegador desconectado durante extração; tentando reconectar e retryar a ficha.', {
              url: item.key, attempt: browserReconnectAttempts + 1,
            });
            try {
              await ensureBrowser();
              detailPage = await browser!.newPage();
              await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
              await new Promise((resolve) => setTimeout(resolve, 800));
              const retryPlace = await extractPlaceDetails(detailPage, jobId, item.url);
              if (job.project_id) (retryPlace as any).project_id = job.project_id;
              if (job.category_id) (retryPlace as any).category_id = job.category_id;
              if (!retryPlace.city && locationFallback.city) retryPlace.city = locationFallback.city;
              if (!retryPlace.state && locationFallback.state) retryPlace.state = locationFallback.state;

              if (await store.isJobCancellationRequested(jobId, userId)) {
                cancelled = true;
                break;
              }
              const outcome = await store.persistScrapedPlace(job, retryPlace, sourcePlaceId, item.key, jobLease);
              if (outcome === 'duplicate') {
                await audit('duplicate_skipped', 'info', 'Duplicado detectado na verificação atômica final; registro descartado.', {
                  url: item.key, name: retryPlace.name, duplicate_count: job.total_duplicates, race_condition: true,
                });
                continue;
              }
              state.places.push(retryPlace);
              await audit('place_saved', 'info', 'Novo contato gravado atomicamente.', {
                url: item.key, name: retryPlace.name, collected: job.total_collected, target: limit,
              });
              await updateProgress(`Salvo: ${retryPlace.name || 'Estabelecimento sem nome'} (${job.total_collected}/${limit})`);
              continue;
            } catch (retryError: any) {
              const retryMessage = retryError instanceof Error ? retryError.message : String(retryError ?? 'Erro desconhecido');
              const retryBrowserUnavailable = /connection closed|target closed|detached frame|session closed|websocket|browser.*disconnect|protocol error|cannot find context|execution context.*destroyed/i.test(retryMessage);
              await audit(browserUnavailable ? 'browser_disconnected' : 'place_extraction_failed', 'error', retryMessage, {
                url: item.key, retryable: false,
                error_name: retryError instanceof Error ? retryError.name : typeof retryError,
                error_message: retryMessage.slice(0, 500),
                error_stack: retryError instanceof Error ? retryError.stack?.split('\n').slice(0, 6).join('\n') : null,
              });
              console.error(`[Scraper] Falha na extração da ficha ${item.key} (retry):`, retryMessage);
              if (retryBrowserUnavailable) {
                browserErrorDuringExtraction = true;
                pauseReason = 'O navegador Chromium perdeu a conexão durante a extração; a coleta foi encerrada sem classificar isso como fim da lista.';
                await audit('browser_disconnected', 'error', pauseReason, { url: item.key });
                break;
              }
              await updateProgress(`Falha isolada na ficha (${job.total_errors}); seguindo para a próxima...`);
              continue;
            }
          }
          await store.recordScrapePlaceError(job, jobLease!);
          await audit(browserUnavailable ? 'browser_disconnected' : 'place_extraction_failed', 'error', message, {
            url: item.key, retryable: false,
            error_name: error instanceof Error ? error.name : typeof error,
            error_message: message.slice(0, 500),
            error_stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join('\n') : null,
          });
          console.error(`[Scraper] Falha na extração da ficha ${item.key}:`, message);
          if (browserUnavailable) {
            browserErrorDuringExtraction = true;
            pauseReason = 'O navegador Chromium perdeu a conexão durante a extração; a coleta foi encerrada sem classificar isso como fim da lista.';
            await audit('browser_disconnected', 'error', pauseReason, { url: item.key });
            break;
          }
          await updateProgress(`Falha isolada na ficha (${job.total_errors}); seguindo para a próxima...`);
        } finally {
          if (detailPage) await detailPage.close().catch(() => {});
        }
      }

      if (job.total_collected >= limit || cancelled || pauseReason) break;
      const beforeScroll = await page.evaluate((selector) => {
        const feed = document.querySelector(selector) as HTMLElement | null;
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];
        if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'instant' as ScrollBehavior });
        else window.scrollBy(0, 1100);
        return {
          scrollHeight: feed?.scrollHeight || document.documentElement.scrollHeight,
          scrollTop: feed?.scrollTop || window.scrollY,
          linkCount: links.length,
          lastHref: links.at(-1)?.href || '',
        };
      }, feedSelector);

      // Google Maps uses infinite scrolling. Wait for actual feed growth or a
      // changed tail result; a fixed sleep alone can miss delayed pagination.
      await page.waitForFunction((selector, previous) => {
        const feed = document.querySelector(selector) as HTMLElement | null;
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];
        const visibleText = (document.body?.innerText || '').toLocaleLowerCase();
        const feedText = (feed?.innerText || '').toLocaleLowerCase();
        const combinedText = visibleText + '\\n' + feedText;
        const terminalNotice = [
          'você chegou ao final da lista',
          'você chegou ao fim da lista',
          "you've reached the end of the list",
          'you have reached the end of the list',
          'tráfego incomum',
          'unusual traffic',
          'nossos sistemas detectaram tráfego',
          'our systems have detected unusual traffic',
          'not a robot',
          'não é um robô',
        ].some((phrase) => combinedText.includes(phrase));
        const height = feed?.scrollHeight || document.documentElement.scrollHeight;
        const tail = links.at(-1)?.href || '';
        return terminalNotice || height > previous.scrollHeight || links.length > previous.linkCount || (tail !== '' && tail !== previous.lastHref);
      }, { timeout: 7000 }, feedSelector, beforeScroll).catch((error: any) => {
        if (error?.name !== 'TimeoutError') throw error;
      });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const afterScroll = await page.evaluate((selector) => {
        const feed = document.querySelector(selector) as HTMLElement | null;
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];
        return {
          scrollHeight: feed?.scrollHeight || document.documentElement.scrollHeight,
          scrollTop: feed?.scrollTop || window.scrollY,
          linkCount: links.length,
          lastHref: links.at(-1)?.href || '',
        };
      }, feedSelector);
      const paginationAdvanced = afterScroll.scrollHeight > beforeScroll.scrollHeight
        || afterScroll.linkCount > beforeScroll.linkCount
        || (afterScroll.lastHref !== '' && afterScroll.lastHref !== beforeScroll.lastHref);
      if (paginationAdvanced) {
        await audit('feed_pagination_advanced', 'debug', 'Rolagem infinita carregou novos resultados no feed.', {
          before: beforeScroll, after: afterScroll,
        });
      } else {
        await audit('feed_pagination_waiting', 'debug', 'Rolagem executada; aguardando novos resultados ou confirmação explícita do fim do feed.', {
          before: beforeScroll, after: afterScroll,
        });
      }
      const currentCount = seenThisRun.size;
      stagnantRounds = currentCount === previousCount ? stagnantRounds + 1 : 0;
      previousCount = currentCount;
      const feedState = await inspectFeedState();
      if (feedState.accessRestricted) {
        accessRestricted = true;
        pauseReason = 'O Google Maps apresentou uma verificação ou restrição de acesso; a coleta foi encerrada sem classificar isso como fim da lista.';
        await audit('feed_access_restricted', 'warn', pauseReason, {
          discovered_this_run: seenThisRun.size,
          collected: job.total_collected,
        });
        break;
      }
      if (feedState.endReached) {
        feedExhausted = true;
        await audit('feed_exhausted_confirmed', 'info', 'O Google Maps confirmou explicitamente o fim dos resultados desta pesquisa.');
        break;
      }
      if (stagnantRounds >= 8) {
        pauseReason = 'O feed não apresentou novos resultados após oito tentativas de avanço.';
        await audit('feed_stagnation_finished', 'warn', pauseReason, {
          stagnant_rounds: stagnantRounds,
          discovered_this_run: seenThisRun.size,
        });
        break;
      }
    }

    if (cancelled) {
      job.completion_reason = 'user_stopped';
      job.status = 'stopped';
      job.status_message = 'Coleta interrompida pelo usuário.';
      job.current_step = 'Interrompida';
    } else if (pauseReason) {
      job.completion_reason = browserErrorDuringExtraction ? 'fatal_error' : accessRestricted ? 'access_restricted' : 'feed_stagnation';
      job.status = job.total_collected > 0 || job.total_duplicates > 0 ? 'partial' : 'failed';
      job.status_message = pauseReason;
      job.current_step = browserErrorDuringExtraction ? 'Falha no navegador Chromium' : accessRestricted ? 'Acesso limitado pelo Google Maps' : 'Finalizada sem confirmação do fim';
    } else if (job.total_collected >= limit) {
      job.completion_reason = 'target_reached';
      job.status = 'completed';
      job.status_message = `Meta atingida: ${job.total_collected} novos contatos salvos.`;
      job.current_step = 'Meta atingida';
    } else if (feedExhausted) {
      job.completion_reason = 'feed_exhausted';
      job.status = job.total_errors > 0 ? 'partial' : 'completed';
      job.status_message = job.total_errors > 0
        ? `Fim dos resultados disponíveis nesta pesquisa: ${job.total_collected} novos contatos salvos, ${job.total_duplicates} duplicados ignorados e ${job.total_errors} ficha(s) com falha individual de extração.`
        : `Fim dos resultados disponíveis nesta pesquisa: ${job.total_collected} novos contatos salvos e ${job.total_duplicates} duplicados ignorados.`;
      job.discovery_checkpoint = { ...(job.discovery_checkpoint || {}), exhausted: true };
      job.current_step = 'Fim da lista de resultados';
    } else {
      job.completion_reason = 'feed_stagnation';
      job.status = 'partial';
      job.status_message = 'Coleta finalizada sem confirmação de esgotamento do feed.';
      job.current_step = 'Finalizada parcialmente';
    }
    job.completed_at = new Date().toISOString();
    await store.persistScrapeProgress(job, jobLease || undefined);
    await audit('job_finished', job.status === 'failed' ? 'error' : 'info', job.status_message, {
      status: job.status, collected: job.total_collected, duplicates: job.total_duplicates,
      errors: job.total_errors,
      stop_reason: job.completion_reason,
      pause_reason: pauseReason || null, stagnant_rounds: stagnantRounds,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error ?? 'Erro desconhecido');
    const browserFailure = /connection closed|target closed|detached frame|session closed|websocket|browser.*disconnect|protocol error|cannot find context|execution context.*destroyed/i.test(message);
    job.status = job.total_collected > 0 ? 'partial' : 'failed';
    job.completion_reason = 'fatal_error';
    job.status_message = browserFailure
      ? 'Conexão do navegador encerrada. A coleta foi finalizada sem retomada automática.'
      : `Falha na coleta: ${message}`;
    job.current_step = 'Execução finalizada com falha';
    job.total_errors += 1;
    job.completed_at = new Date().toISOString();
    await audit(browserFailure ? 'browser_disconnected' : 'job_failed', 'error', message, {
      retryable: false,
    });
    console.error(`[Scraper] Falha geral no trabalho ${jobId}:`, message);
    await store.persistScrapeProgress(job, jobLease || undefined).catch(() => {});
  } finally {
    if (leaseRenewal) clearInterval(leaseRenewal);
    await browser?.close().catch(() => {});
    activeScrapeJobs.delete(jobId);
    if (jobLease) await releaseScrapeJobLease(job, jobLease);
  }
}


export async function createApp() {
  await store.initialize();
  const app = express();

  // Do not gate every HTTP response on the shared persistence queue.
  // A failed background write must not turn unrelated requests (including auth,
  // health and read-only calls) into 503s. Mutating routes explicitly await flush().
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logger for API calls
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      console.log(`[API ${req.method}] ${req.path}`);
    }
    next();
  });

  // =========================================================================
  // 1. AUTHENTICATION ROUTES (/api/auth/*)
  // =========================================================================

  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      }

      const state = store.getState();
      const existing = state.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Já existe uma conta cadastrada com este e-mail.' });
      }

      const newUser: UserProfile = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: String(email).trim().toLowerCase(),
        name: String(name || '').trim() || 'Usuário',
        passwordHash: hashPassword(password),
        role: state.users.length === 0 ? 'admin' : 'user',
        createdAt: new Date().toISOString(),
      };

      state.users.push(newUser);
      store.persist();
      // Registration must not return a session until the user is durable in the
      // shared Supabase app_state. Otherwise another Vercel instance can reject
      // the freshly issued token because its snapshot does not contain this user.
      await store.flush();

      const token = `sess_${newUser.id}`;
      return res.status(201).json({
        token,
        user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Informe e-mail e senha.' });
      }

      const state = store.getState();
      const user = state.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Conta não encontrada. Faça seu cadastro antes de entrar.' });
      }

      // Check password
      const pHash = hashPassword(password);
      if (!user.passwordHash || user.passwordHash !== pHash) {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }

      const token = `sess_${user.id}`;
      return res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      return res.setHeader('Cache-Control', 'no-store').json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const authenticated = resolveUserFromRequest(req);
      if (!authenticated) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      const user = store.getState().users.find((item) => item.id === authenticated.id);
      if (!user) return res.status(401).json({ error: 'Apenas contas da plataforma podem editar o perfil.' });
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'O nome deve ter entre 2 e 100 caracteres.' });
      user.name = name;
      store.persist();
      await store.flush();
      return res.setHeader('Cache-Control', 'no-store').json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt },
      });
    } catch (err: any) {
      console.error('[Auth] Falha ao atualizar perfil:', err);
      return res.status(500).json({ error: 'Não foi possível salvar as alterações do perfil.' });
    }
  });

  // DELETE /api/auth/me - LGPD: Direito à exclusão de dados pessoais
  app.delete('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const authenticated = resolveUserFromRequest(req);
      if (!authenticated) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      const state = store.getState();
      const userIndex = state.users.findIndex((item) => item.id === authenticated.id);
      if (userIndex === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const userId = authenticated.id;

      // Remove user's jobs, places, projects, categories, credentials, opportunities
      state.jobs = state.jobs.filter((job) => job.user_id !== userId);
      state.places = state.places.filter((place) => {
        const job = state.jobs.find((j) => j.id === place.job_id);
        return job !== undefined;
      });
      state.projects = state.projects.filter((p) => p.user_id !== userId);
      state.categories = state.categories.filter((c) => c.user_id !== userId);
      state.credentials = state.credentials.filter((c) => c.consumer_project !== userId);
      if (state.opportunities) {
        state.opportunities = state.opportunities.filter((o) => o.user_id !== userId);
      }
      if (state.web_intelligence) {
        // Web intelligence is tied to places, which are already filtered
      }

      // Remove the user
      state.users.splice(userIndex, 1);

      store.persist();
      await store.flush();

      // Clear session tokens
      return res.setHeader('Cache-Control', 'no-store').json({
        success: true,
        message: 'Conta e todos os dados associados foram excluídos permanentemente.',
      });
    } catch (err: any) {
      console.error('[Auth] Falha ao excluir conta:', err);
      return res.status(500).json({ error: 'Não foi possível excluir a conta.' });
    }
  });

  // GET /api/auth/export - LGPD: Direito à portabilidade de dados
  app.get('/api/auth/export', async (req: Request, res: Response) => {
    try {
      const authenticated = resolveUserFromRequest(req);
      if (!authenticated) return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      const state = store.getState();
      const userId = authenticated.id;

      const user = state.users.find((u) => u.id === userId);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const userJobs = state.jobs.filter((job) => job.user_id === userId);
      const userJobIds = new Set(userJobs.map((job) => job.id));
      const userPlaces = state.places.filter((place) => userJobIds.has(place.job_id));
      const userProjects = state.projects.filter((p) => p.user_id === userId);
      const userCategories = state.categories.filter((c) => c.user_id === userId);
      const userCredentials = state.credentials.filter((c) => c.consumer_project === userId);
      const userOpportunities = state.opportunities ? state.opportunities.filter((o) => o.user_id === userId) : [];
      const userWebIntelligence = state.web_intelligence ? Object.fromEntries(
        Object.entries(state.web_intelligence).filter(([_, intel]) =>
          userPlaces.some((p) => p.id === intel.place_id)
        )
      ) : {};

      const exportData = {
        exported_at: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
        jobs: userJobs,
        places: userPlaces,
        projects: userProjects,
        categories: userCategories,
        credentials: userCredentials.map((c) => ({
          ...c,
          api_key_hash: undefined, // Never export sensitive data
        })),
        opportunities: userOpportunities,
        web_intelligence: userWebIntelligence,
      };

      const filename = `mapscrape-export-${userId}-${Date.now()}.json`;

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(JSON.stringify(exportData, null, 2));
    } catch (err: any) {
      console.error('[Auth] Falha ao exportar dados:', err);
      return res.status(500).json({ error: 'Não foi possível exportar os dados.' });
    }
  });

  // Public liveness/readiness endpoint. Store initialization fails fast when Supabase is unavailable.
  app.get('/api/v1/health', async (_req: Request, res: Response) => {
    try {
      await store.flush();
      return res.setHeader('Cache-Control', 'no-store').status(200).json({
        status: 'ok',
        service: 'mapscrape-api',
        apiVersion: 'v1',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      return res.status(503).json({
        status: 'degraded',
        service: 'mapscrape-api',
        apiVersion: 'v1',
        database: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Protect all application endpoints. Auth and registration remain public.
  app.use('/api/v1', (req: Request, res: Response, next: NextFunction) => {
    const isProvisioningRoute = req.path.startsWith('/provisioning/credentials');
    if (!resolveUserFromRequest(req) && !(isProvisioningRoute && isProvisioningTokenValid(req))) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    next();
  });

  // =========================================================================
  // 2. SCRAPING JOBS (/api/v1/jobs)
  // =========================================================================

  app.get('/api/v1/jobs', async (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const staleCandidates = state.jobs.filter((job) =>
        job.user_id === user.id && job.status === 'running' &&
        Date.now() - Date.parse(job.heartbeat_at || job.created_at) > 2 * 60 * 1000
      );
      if (markStaleRunningJobs(state, user.id)) {
        for (const staleJob of staleCandidates) await store.persistScrapeProgress(staleJob);
      }
      const ownedJobs = state.jobs.filter((job) => job.user_id === user.id);
      const sorted = [...ownedJobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.setHeader('Cache-Control', 'no-store').json({ data: sorted, total: sorted.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/jobs', async (req: Request, res: Response) => {
    try {
      const { segment, location, limit, projectName, categoryName } = req.body;
      if (!segment || !location) {
        return res.status(400).json({ error: 'Segmento e Localização são campos obrigatórios.' });
      }

      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const userId = user.id;

      // Quota Enforcement: Check monthly lead limit
      const state = store.getState();
      const userProfile = state.users.find((u) => u.id === userId);

      let effectivePlan: PlanTier = 'free';
      let planLimits = PLAN_LIMITS.free;
      let remainingQuota = 500;
      let monthlyLeads = 0;

      if (userProfile) {
        effectivePlan = getEffectivePlan(userProfile);
        planLimits = getPlanLimits(effectivePlan);

        // Calculate leads collected this month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const userJobs = state.jobs.filter((job) => job.user_id === userId);
        const userJobIds = new Set(userJobs.map((job) => job.id));
        monthlyLeads = state.places
          .filter((place) => userJobIds.has(place.job_id) && place.collected_at >= monthStart)
          .length;

        remainingQuota = Math.max(0, planLimits.leadsPerMonth - monthlyLeads);

        if (remainingQuota <= 0) {
          return res.status(403).json({
            error: 'Limite mensal de leads atingido',
            code: 'QUOTA_EXCEEDED',
            plan: effectivePlan,
            limit: planLimits.leadsPerMonth,
            used: monthlyLeads,
            remaining: 0,
            message: `Seu plano ${effectivePlan} permite ${planLimits.leadsPerMonth.toLocaleString('pt-BR')} leads/mês. Você já utilizou ${monthlyLeads.toLocaleString('pt-BR')}. Faça upgrade ou aguarde o próximo mês.`,
          });
        }
      }

      const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
      const numLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 20;

      // Check if requested limit exceeds remaining quota
      if (numLimit > remainingQuota) {
        return res.status(400).json({
          error: 'Limite solicitado excede quota restante',
          code: 'QUOTA_EXCEEDED_REQUEST',
          requested: numLimit,
          remaining: remainingQuota,
          message: `Você só tem ${remainingQuota} leads restantes neste mês. Reduza o limite ou faça upgrade.`,
        });
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let activeJob: ScrapeJob | undefined;
      for (const j of state.jobs) {
        if (j.user_id !== userId || j.status !== 'running') continue;

        const locallyExecuting = activeScrapeJobs.has(j.id);
        let durableLeaseActive = false;
        if ((store as any).supabase) {
          const { data: leaseRow, error: leaseError } = await (store as any).supabase
            .from('scrape_jobs')
            .select('worker_locked_until')
            .eq('id', j.id)
            .eq('user_id', userId)
            .maybeSingle();
          if (leaseError) throw new Error('Falha ao verificar execução ativa: ' + leaseError.message);
          durableLeaseActive = Boolean(
            leaseRow?.worker_locked_until && Date.parse(leaseRow.worker_locked_until) > Date.now()
          );
        }

        const heartbeatFresh = Date.now() - Date.parse(j.heartbeat_at || j.created_at) <= 120_000;
        const isActive = locallyExecuting || durableLeaseActive || heartbeatFresh;
        if (isActive) {
          if (req.body.force) {
            await store.requestJobCancellation(j.id, userId);
            activeScrapeJobs.get(j.id)?.cancel();
          } else {
            activeJob ||= j;
          }
          continue;
        }

        // A stale job with no local worker and no live database lease is orphaned.
        j.status = 'stopped';
        j.status_message = 'Execução anterior encerrada por ausência de worker e lease ativa.';
        j.completed_at = new Date().toISOString();
        await store.persistScrapeProgress(j);
      }

      if (activeJob && !req.body.force) {
        return res.status(409).json({
          error: 'Já existe uma pesquisa em execução. Aguarde a conclusão ou interrompa-a antes de iniciar outra.',
          jobId: activeJob.id,
          data: activeJob,
        });
      }

      const normalizedProjectName = String(projectName || `${segment} · ${location}`).trim();
      let project = state.projects.find((item) =>
        item.user_id === userId && item.name.toLocaleLowerCase('pt-BR') === normalizedProjectName.toLocaleLowerCase('pt-BR')
      );
      if (!project) {
        project = {
          id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: normalizedProjectName, user_id: userId, created_at: new Date().toISOString(),
        };
        state.projects.unshift(project);
      }
      const normalizedCategoryName = String(categoryName || segment).trim();
      let category = state.categories.find((item) =>
        item.user_id === userId && item.project_id === project!.id &&
        item.name.toLocaleLowerCase('pt-BR') === normalizedCategoryName.toLocaleLowerCase('pt-BR')
      );
      if (!category) {
        category = {
          id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: normalizedCategoryName, user_id: userId, project_id: project.id,
          created_at: new Date().toISOString(),
        };
        state.categories.unshift(category);
      }
      const newJob: ScrapeJob = {
        id: jobId, user_id: userId,
        segment: String(segment).trim(), project_name: project.name,
        project_id: project.id, category_id: category.id,
        location: String(location).trim(), limit_requested: numLimit,
        status: 'running',
        status_message: `Meta de ${numLimit} novos contatos. Iniciando coleta...`,
        total_found: 0, total_collected: 0, total_duplicates: 0, total_errors: 0,
        current_step: 'Iniciando navegador...',
        heartbeat_at: new Date().toISOString(), created_at: new Date().toISOString(),
      };
      state.jobs.unshift(newJob);
      await store.persistScrapeProgress(newJob);

      // Start the direct scraping pipeline: scrape, deduplicate, save
      if (process.env.VERCEL === '1') {
        waitUntil(executeScrapeJob(jobId, String(segment).trim(), String(location).trim(), numLimit, userId));
      } else {
        void executeScrapeJob(jobId, String(segment).trim(), String(location).trim(), numLimit, userId);
      }

      return res.status(201).json({
        data: { jobId, job: newJob },
        jobId,
        message: 'Coleta agendada com sucesso.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/jobs/:id', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      // Read durable job state instead of trusting this function instance's snapshot.
      const state = store.getState();
      const staleCandidates = state.jobs.filter((job) =>
        job.user_id === user.id && job.status === 'running' &&
        Date.now() - Date.parse(job.heartbeat_at || job.created_at) > 2 * 60 * 1000
      );
      if (markStaleRunningJobs(state, user.id)) {
        for (const staleJob of staleCandidates) await store.persistScrapeProgress(staleJob);
      }
      const job = await store.findJobForUser(req.params.id, user.id);
      if (!job) {
        console.warn('[Jobs] Job lookup miss', { jobId: req.params.id, userId: user.id, snapshotContainsId: store.getState().jobs.some((item) => item.id === req.params.id) });
        return res.status(404).json({ error: 'Coleta não encontrada.' });
      }
      // GET is read-only: polling progress must never start browser work.
      return res.setHeader('Cache-Control', 'no-store').json({ data: job, ...job });
    } catch (err: any) {
      console.error('[Jobs] Failed to read job progress:', err?.message || err);
      return res.status(500).json({ error: 'Falha ao consultar progresso da coleta.' });
    }
  });

  app.post('/api/v1/jobs/:id/stop', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const job = await store.requestJobCancellation(req.params.id, user.id);
      if (!job) return res.status(404).json({ error: 'Coleta não encontrada.' });

      // Signal in-memory job handle
      activeScrapeJobs.get(req.params.id)?.cancel();
      return res.setHeader('Cache-Control', 'no-store').json({
        success: true,
        message: 'Pedido de interrupção recebido. A coleta está sendo encerrada.',
        data: job,
        job,
      });
    } catch (err: any) {
      console.error('[Jobs] Failed to stop job:', err?.message || err);
      return res.status(500).json({ error: 'Não foi possível interromper a coleta.' });
    }
  });

  app.delete('/api/v1/jobs/:id', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const index = state.jobs.findIndex((j) => j.id === req.params.id && j.user_id === user.id);
      if (index === -1) {
        return res.status(404).json({ error: 'Coleta não encontrada.' });
      }

      // Preserve the durable cursor while the candidate is still being processed.
      if (state.jobs[index].status === 'running') {
        return res.status(409).json({ error: 'Interrompa a coleta antes de excluir o histórico.' });
      }

      // Remove job & associated places
      state.jobs.splice(index, 1);
      state.places = state.places.filter((p) => p.job_id !== req.params.id);
      store.persist();

      return res.json({ success: true, message: 'Coleta e estabelecimentos associados removidos.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 3. LEADS / PLACES (/api/v1/leads)
  // =========================================================================

  app.get('/api/v1/leads', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const { jobId, query, category, sortBy = 'collected_at', sortOrder = 'desc', offset = '0', limit = '25' } = req.query;

      let visiblePlaces: PlaceRecord[];
      const associations = await store.getUserPlaceAssociations(user.id);
      if (associations) {
        const requestedJobId = typeof jobId === 'string' ? jobId.trim() : '';
        const visiblePlaceIds = new Set(
          associations
            .filter((link) => !requestedJobId || link.job_id === requestedJobId)
            .map((link) => link.place_id)
        );
        visiblePlaces = state.places.filter((place) => visiblePlaceIds.has(place.id));
      } else {
        const ownedJobIds = new Set(state.jobs.filter((job) => job.user_id === user.id).map((job) => job.id));
        visiblePlaces = state.places.filter((place) => ownedJobIds.has(place.job_id));
        if (jobId && typeof jobId === 'string' && jobId.trim()) {
          visiblePlaces = visiblePlaces.filter((place) => place.job_id === jobId.trim());
        }
      }

      let filtered = visiblePlaces;
      if (query && typeof query === 'string' && query.trim()) {
        const q = query.trim().toLowerCase();
        filtered = filtered.filter((p) =>
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q) ||
          p.website.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
        );
      }

      if (category && typeof category === 'string' && category.trim()) {
        const cat = category.trim().toLowerCase();
        filtered = filtered.filter((p) => p.category.toLowerCase().includes(cat));
      }

      const sortKey = String(sortBy) as keyof PlaceRecord;
      const asc = String(sortOrder).toLowerCase() === 'asc';
      filtered.sort((a, b) => {
        const valA = a[sortKey] || '';
        const valB = b[sortKey] || '';
        if (typeof valA === 'number' && typeof valB === 'number') return asc ? valA - valB : valB - valA;
        return asc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      });

      const numOffset = Math.max(0, parseInt(String(offset), 10) || 0);
      const numLimit = Math.max(1, Math.min(500, parseInt(String(limit), 10) || 25));
      const paginated = filtered.slice(numOffset, numOffset + numLimit);
      const enriched = paginated.map((p) => {
        const intel = store.getWebIntelligence(p.id);
        if (!intel) return p;
        return {
          ...p,
          web_intelligence_status: intel.status,
          web_intelligence_score: intel.scores?.overall_score,
          web_intelligence: intel,
        };
      });
      return res.json({
        data: enriched,
        places: enriched,
        pagination: { total: filtered.length, offset: numOffset, limit: numLimit, hasMore: numOffset + numLimit < filtered.length },
        total: filtered.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/leads/:id', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const place = state.places.find((p) => p.id === req.params.id);
      if (!place) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });
      const intel = store.getWebIntelligence(place.id);
      return res.json({
        data: intel ? {
          ...place,
          web_intelligence_status: intel.status,
          web_intelligence_score: intel.scores?.overall_score,
          web_intelligence: intel,
        } : place,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 3.1. WEB INTELLIGENCE (/api/v1/places/:id/analyze-website)
  // =========================================================================

  app.post(['/api/v1/places/:id/analyze-website', '/api/v1/leads/:id/analyze-website'], async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const { id } = req.params;
      const state = store.getState();
      const place = state.places.find((p) => p.id === id);
      if (!place) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });

      // 1. Crawl official company website
      const scrapeResult = await crawlCompanyWebsite(place.website);

      // 2. Generate comprehensive Web Intelligence (Gemini AI + Limber portfolio cross-reference + heuristic fallback)
      const intelligence = await generateWebIntelligence(place, scrapeResult);

      // 3. Persist intelligence in store
      store.saveWebIntelligence(intelligence);
      await store.flush();

      // 4. Audit Log
      state.logs.unshift({
        id: `log_${Date.now()}_intel`,
        created_at: new Date().toISOString(),
        level: 'info',
        category: 'web_intelligence',
        event: 'website_analyzed',
        message: `Análise de Web Intelligence concluída para "${place.name}" (Score: ${intelligence.scores.overall_score}/100 - ${intelligence.scores.qualification_tier}).`,
        job_id: place.job_id || 'web_intel',
        metadata: JSON.stringify({
          place_id: place.id,
          website: place.website,
          status: intelligence.status,
          score: intelligence.scores.overall_score,
          tier: intelligence.scores.qualification_tier,
          recommended: intelligence.commercial_analysis.recommended_limber_solution,
        }),
        user_id: user.id,
      });
      store.persist();

      return res.json({ data: intelligence });
    } catch (err: any) {
      console.error('[WebIntelligence] Erro ao analisar site:', err);
      return res.status(500).json({ error: err.message || 'Falha ao processar análise do site institucional.' });
    }
  });

  app.get(['/api/v1/places/:id/web-intelligence', '/api/v1/leads/:id/web-intelligence'], (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const { id } = req.params;
      const intel = store.getWebIntelligence(id);
      return res.json({ data: intel || null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 3.3. WHITE-LABEL API (/api/v1/analyze) - For ISV partners
  // =========================================================================
  //
  // This endpoint allows ISV partners to analyze a place using their API key
  // (provisioned via /api/v1/provisioning/credentials). It returns the full
  // WebIntelligenceRecord including commercial analysis, scores, and evidences.
  //
  // Authentication: Bearer token with API key (msk_live_...) or X-API-Key header
  // Rate limiting: Based on the consumer's plan (pro = higher limits)
  //

  // Helper: Resolve consumer from API key
  function resolveConsumerFromApiKey(req: Request): { consumerName: string; consumerProject: string; plan: PlanTier } | null {
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!apiKey) return null;

    const state = store.getState();
    const keyHash = hashApiKey(apiKey);
    const cred = state.credentials.find((c) => c.status === 'active' && c.api_key_hash === keyHash);
    if (!cred) return null;

    // Default to 'growth' for API consumers; could be extended with plan field on credentials
    return {
      consumerName: cred.consumer_name,
      consumerProject: cred.consumer_project,
      plan: 'growth',
    };
  }

  // POST /api/v1/analyze - White-label analysis endpoint
  app.post('/api/v1/analyze', async (req: Request, res: Response) => {
    try {
      // Authenticate via API key (not user session)
      const consumer = resolveConsumerFromApiKey(req);
      if (!consumer) {
        return res.status(401).json({
          error: 'Chave de API inválida ou revogada.',
          code: 'INVALID_API_KEY',
        });
      }

      const { place_id, force_refresh } = req.body;
      if (!place_id || typeof place_id !== 'string') {
        return res.status(400).json({
          error: 'place_id é obrigatório.',
          code: 'MISSING_PLACE_ID',
        });
      }

      const state = store.getState();
      const place = state.places.find((p) => p.id === place_id);
      if (!place) {
        return res.status(404).json({
          error: 'Estabelecimento não encontrado.',
          code: 'PLACE_NOT_FOUND',
        });
      }

      // Check if consumer has access to this place (data isolation)
      // For white-label, we allow access to any place in the system
      // but could be restricted to consumer's own data in the future

      // Return cached intelligence if available and not forcing refresh
      const cachedIntel = store.getWebIntelligence(place_id);
      if (cachedIntel && !force_refresh) {
        return res.json({
          data: cachedIntel,
          cached: true,
          consumer: consumer.consumerProject,
        });
      }

      // Generate fresh intelligence
      const scrapeResult = await crawlCompanyWebsite(place.website);
      const intelligence = await generateWebIntelligence(place, scrapeResult);

      // Persist intelligence
      store.saveWebIntelligence(intelligence);
      await store.flush();

      // Audit log
      state.logs.unshift({
        id: `log_${Date.now()}_whitelabel`,
        created_at: new Date().toISOString(),
        level: 'info',
        category: 'white_label',
        event: 'analysis_generated',
        message: `Análise white-label gerada para "${place.name}" por ${consumer.consumerProject} (Score: ${intelligence.scores.overall_score}/100).`,
        job_id: place.job_id || 'white_label',
        metadata: JSON.stringify({
          place_id: place.id,
          consumer_project: consumer.consumerProject,
          consumer_name: consumer.consumerName,
          status: intelligence.status,
          score: intelligence.scores.overall_score,
          tier: intelligence.scores.qualification_tier,
        }),
        user_id: `consumer_${consumer.consumerProject}`,
      });
      store.persist();

      return res.json({
        data: intelligence,
        cached: false,
        consumer: consumer.consumerProject,
      });
    } catch (err: any) {
      console.error('[WhiteLabel] Erro ao gerar análise:', err);
      return res.status(500).json({ error: err.message || 'Falha ao processar análise white-label.' });
    }
  });

  // GET /api/v1/analyze/:place_id - Retrieve cached analysis
  app.get('/api/v1/analyze/:place_id', async (req: Request, res: Response) => {
    try {
      const consumer = resolveConsumerFromApiKey(req);
      if (!consumer) {
        return res.status(401).json({
          error: 'Chave de API inválida ou revogada.',
          code: 'INVALID_API_KEY',
        });
      }

      const { place_id } = req.params;
      const state = store.getState();
      const place = state.places.find((p) => p.id === place_id);
      if (!place) {
        return res.status(404).json({
          error: 'Estabelecimento não encontrado.',
          code: 'PLACE_NOT_FOUND',
        });
      }

      const intel = store.getWebIntelligence(place_id);
      if (!intel) {
        return res.status(404).json({
          error: 'Análise não encontrada. Use POST /api/v1/analyze para gerar.',
          code: 'ANALYSIS_NOT_FOUND',
        });
      }

      return res.json({
        data: intel,
        cached: true,
        consumer: consumer.consumerProject,
      });
    } catch (err: any) {
      console.error('[WhiteLabel] Erro ao buscar análise:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 3.2. PIPELINE KANBAN DE OPORTUNIDADES (/api/v1/opportunities)
  // =========================================================================

  app.get('/api/v1/opportunities', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      let list = store.getOpportunities(user.id);
      if (req.query.place_id) {
        list = list.filter((o) => o.place_id === req.query.place_id);
      }
      return res.json({ data: list });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v1/opportunities/by-place/:placeId', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const list = store.getOpportunities(user.id);
      const opp = list.find((o) => o.place_id === req.params.placeId) || null;
      return res.json({ data: opp });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/opportunities', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const {
        placeId,
        stage,
        dealValue,
        nextAction = '',
        notes = '',
        contactName = '',
        assignedTo = '',
        lastContactAt,
        nextContactAt,
      } = req.body;
      if (!placeId) return res.status(400).json({ error: 'placeId é obrigatório.' });

      const state = store.getState();
      const place = state.places.find((p) => p.id === placeId);
      if (!place) return res.status(404).json({ error: 'Estabelecimento não encontrado.' });

      const existingOpportunities = store.getOpportunities(user.id);
      const existingOpp = existingOpportunities.find((o) => o.place_id === placeId);

      const intel = store.getWebIntelligence(placeId);

      if (existingOpp) {
        // POST repetido é idempotente: não deve reiniciar etapa nem zerar valor.
        // Alterações comerciais explícitas devem usar PATCH /opportunities/:id.
        const updates: Partial<OpportunityRecord> = {
          updated_at: new Date().toISOString(),
        };
        if (contactName) updates.contact_name = String(contactName).trim();
        if (assignedTo) updates.assigned_to = String(assignedTo).trim();
        if (nextAction) updates.next_action = String(nextAction).trim();
        if (notes) updates.notes = String(notes).trim();
        if (lastContactAt) updates.last_contact_at = String(lastContactAt).trim();
        if (nextContactAt) updates.next_contact_at = String(nextContactAt).trim();
        if (intel) {
          updates.web_intelligence = intel;
          updates.score = intel.scores.overall_score;
          updates.qualification_tier = intel.scores.qualification_tier;
        }

        const updated = store.updateOpportunity(existingOpp.id, updates, user.id);
        await store.flush();
        return res.status(200).json({ data: updated });
      }

      const opportunity: OpportunityRecord = {
        id: `opp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: user.id,
        place_id: place.id,
        place_name: place.name,
        category: place.category,
        phone: place.phone,
        website: place.website,
        city: place.city,
        stage: stage || 'qualificacao',
        deal_value: dealValue === undefined || dealValue === null || dealValue === '' ? 0 : Math.max(0, Number(dealValue) || 0),
        contact_name: String(contactName || '').trim(),
        assigned_to: String(assignedTo || '').trim(),
        next_action: String(
          nextAction ||
            (intel?.commercial_analysis?.seller_discovery_questions?.[0]
              ? `Perguntar: ${intel.commercial_analysis.seller_discovery_questions[0]}`
              : 'Fazer primeiro contato de qualificação')
        ).trim(),
        notes: String(notes || (intel?.commercial_analysis?.executive_summary || '')).trim(),
        score: intel?.scores?.overall_score || 70,
        qualification_tier: intel?.scores?.qualification_tier || 'A',
        last_contact_at: lastContactAt ? String(lastContactAt).trim() : undefined,
        next_contact_at: nextContactAt ? String(nextContactAt).trim() : undefined,
        contact_history: [],
        web_intelligence: intel,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      store.saveOpportunity(opportunity);
      await store.flush();

      state.logs.unshift({
        id: `log_${Date.now()}_opp`,
        created_at: new Date().toISOString(),
        level: 'info',
        category: 'kanban',
        event: 'opportunity_created',
        message: `Oportunidade criada no Kanban para "${place.name}" (Estágio: ${stage}).`,
        job_id: place.job_id || 'kanban',
        metadata: JSON.stringify({ opportunity_id: opportunity.id, place_id: place.id, stage }),
        user_id: user.id,
      });
      store.persist();

      return res.status(201).json({ data: opportunity });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/v1/opportunities/:id', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const {
        stage,
        deal_value,
        contact_name,
        assigned_to,
        next_action,
        notes,
        last_contact_at,
        next_contact_at,
        contact_history,
      } = req.body;

      const updates: Partial<OpportunityRecord> = {};
      if (stage !== undefined) updates.stage = stage;
      if (deal_value !== undefined) updates.deal_value = Number(deal_value) || 0;
      if (contact_name !== undefined) updates.contact_name = String(contact_name).trim();
      if (assigned_to !== undefined) updates.assigned_to = String(assigned_to).trim();
      if (next_action !== undefined) updates.next_action = String(next_action).trim();
      if (notes !== undefined) updates.notes = String(notes).trim();
      if (last_contact_at !== undefined) updates.last_contact_at = String(last_contact_at).trim();
      if (next_contact_at !== undefined) updates.next_contact_at = String(next_contact_at).trim();
      if (contact_history !== undefined && Array.isArray(contact_history)) {
        updates.contact_history = contact_history;
      }

      const updated = store.updateOpportunity(req.params.id, updates, user.id);
      if (!updated) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
      await store.flush();
      return res.json({ data: updated });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/opportunities/:id/interactions', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const opp = store.getOpportunities(user.id).find((o) => o.id === req.params.id);
      if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada.' });

      const { type = 'ligacao', notes = '', outcome = 'sucesso', performed_by, next_contact_at, next_action } = req.body;

      const now = new Date().toISOString();
      const interaction = {
        id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        notes: String(notes || '').trim(),
        outcome,
        performed_by: String(performed_by || user.name || user.email).trim(),
        next_contact_at: next_contact_at ? String(next_contact_at).trim() : undefined,
        created_at: now,
      };

      const history = Array.isArray(opp.contact_history) ? [...opp.contact_history] : [];
      history.unshift(interaction);

      const updates: Partial<OpportunityRecord> = {
        contact_history: history,
        last_contact_at: now,
      };

      if (next_contact_at) updates.next_contact_at = String(next_contact_at).trim();
      if (next_action) updates.next_action = String(next_action).trim();

      const updated = store.updateOpportunity(opp.id, updates, user.id);
      await store.flush();

      const state = store.getState();
      state.logs.unshift({
        id: `log_${Date.now()}_interaction`,
        created_at: now,
        level: 'info',
        category: 'kanban',
        event: 'contact_interaction_logged',
        message: `Contato registrado (${type}) para "${opp.place_name}".`,
        job_id: 'kanban',
        metadata: JSON.stringify({ opportunity_id: opp.id, type, outcome }),
        user_id: user.id,
      });
      store.persist();

      return res.status(201).json({ data: updated, interaction });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/opportunities/:id', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const ok = store.deleteOpportunity(req.params.id, user.id);
      if (!ok) return res.status(404).json({ error: 'Oportunidade não encontrada.' });
      await store.flush();
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 4. CATEGORIES (/api/v1/categories)
  // =========================================================================

  app.get('/api/v1/categories', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const userId = user.id;
      const userCategories = state.categories.filter((item) => item.user_id === userId);
      const userJobs = state.jobs.filter((item) => item.user_id === userId);
      const userJobIds = new Set(userJobs.map((item) => item.id));
      const placeCats = state.places.filter((place) => userJobIds.has(place.job_id)).map((place) => place.category).filter(Boolean);
      const savedCats = userCategories.map((item) => item.name);
      const allDistinct = Array.from(new Set([...savedCats, ...placeCats]));
      const extractedPlaceCategories = Array.from(new Set(placeCats));
      return res.json({
        data: userCategories,
        categories: allDistinct,
        placeCategories: extractedPlaceCategories,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/categories', async (req: Request, res: Response) => {
    try {
      const { name, projectId, projectName } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
      }
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const userId = user.id;
      const state = store.getState();
      let project = projectId
        ? state.projects.find((item) => item.id === String(projectId) && item.user_id === userId)
        : state.projects.find((item) => item.user_id === userId && item.name.toLocaleLowerCase('pt-BR') === String(projectName || '').trim().toLocaleLowerCase('pt-BR'));
      if (!project && projectName && String(projectName).trim()) {
        project = {
          id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: String(projectName).trim(), user_id: userId, created_at: new Date().toISOString(),
        };
        state.projects.unshift(project);
      }
      if (!project) return res.status(400).json({ error: 'Selecione ou crie um projeto antes de cadastrar a categoria.' });
      const normalizedName = String(name).trim();
      const existing = state.categories.find((item) =>
        item.user_id === userId && item.project_id === project!.id &&
        item.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR')
      );
      if (existing) return res.json({ data: existing, category: existing, project, reused: true });
      const newCat: CategoryRecord = {
        id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: normalizedName, user_id: userId, project_id: project.id,
        created_at: new Date().toISOString(),
      };
      state.categories.unshift(newCat);
      store.persist();
      await store.flush();
      return res.status(201).json({ data: newCat, category: newCat, project });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v1/categories/:id', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const { name } = req.body;
      const state = store.getState();
      const cat = state.categories.find((c) => c.id === req.params.id && c.user_id === user.id);
      if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });
      if (name && String(name).trim()) {
        cat.name = String(name).trim();
        store.persist();
      }
      return res.json({ data: cat });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/categories/:id', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const userId = user.id;
      const idx = state.categories.findIndex((c) => c.id === req.params.id && c.user_id === userId);
      if (idx === -1) return res.status(404).json({ error: 'Categoria não encontrada.' });
      const [removed] = state.categories.splice(idx, 1);
      for (const job of state.jobs) if (job.category_id === removed.id) job.category_id = undefined;
      store.persist();
      await store.deleteCategoryFromDatabase(removed.id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 5. PROJECTS (/api/v1/projects)
  // =========================================================================

  app.get('/api/v1/projects', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const userId = user.id;
      const projects = state.projects.filter((item) => item.user_id === userId);
      return res.json({ data: projects, projects });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/projects', async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Nome do projeto é obrigatório.' });
      }
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const userId = user.id;
      const state = store.getState();
      const normalizedName = String(name).trim();
      const existing = state.projects.find((item) => item.user_id === userId && item.name.toLocaleLowerCase('pt-BR') === normalizedName.toLocaleLowerCase('pt-BR'));
      if (existing) return res.json({ data: existing, project: existing, reused: true });
      const newProj: ProjectRecord = {
        id: `prj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: normalizedName,
        user_id: userId,
        created_at: new Date().toISOString(),
      };
      state.projects.unshift(newProj);
      store.persist();
      await store.flush();
      return res.status(201).json({ data: newProj, project: newProj });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/v1/projects/:id', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const { name } = req.body;
      const state = store.getState();
      const proj = state.projects.find((p) => p.id === req.params.id && p.user_id === user.id);
      if (!proj) return res.status(404).json({ error: 'Projeto não encontrado.' });
      if (name && String(name).trim()) {
        proj.name = String(name).trim();
        proj.updated_at = new Date().toISOString();
        store.persist();
      }
      return res.json({ data: proj });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/v1/projects/:id', async (req: Request, res: Response) => {
    try {
      const state = store.getState();
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const userId = user.id;
      const projectId = req.params.id;

      // Find only a project owned by the authenticated user.
      const idx = state.projects.findIndex((p) => p.id === projectId && p.user_id === userId);
      if (idx === -1) {
        return res.status(404).json({ error: 'Projeto não encontrado.' });
      }

      const [removed] = state.projects.splice(idx, 1);
      const removedCategoryIds = new Set(
        state.categories.filter((cat) => cat.project_id === removed.id).map((cat) => cat.id)
      );
      state.categories = state.categories.filter((cat) => cat.project_id !== removed.id);

      for (const job of state.jobs) {
        if (job.project_id === removed.id) {
          job.project_id = undefined;
          job.category_id = undefined;
        } else if (job.category_id && removedCategoryIds.has(job.category_id)) {
          job.category_id = undefined;
        }
      }

      for (const place of state.places) {
        if ((place as any).project_id === removed.id) {
          (place as any).project_id = undefined;
        }
      }

      store.persist();
      try {
        await store.deleteProjectFromDatabase(removed.id);
      } catch (dbErr: any) {
        console.warn('[API] Aviso ao excluir projeto do banco:', dbErr?.message || dbErr);
      }

      return res.json({ success: true, message: `Projeto “${removed.name}” excluído com sucesso.` });
    } catch (err: any) {
      console.error('[API] Erro ao excluir projeto:', err);
      return res.status(500).json({ error: err.message || 'Falha ao excluir projeto.' });
    }
  });

  // =========================================================================
  // 6. FIELD COVERAGE (/api/v1/field-coverage)
  // =========================================================================

  app.get('/api/v1/field-coverage', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const state = store.getState();
      const ownedJobIds = new Set(state.jobs.filter((job) => job.user_id === user.id).map((job) => job.id));
      const { jobId } = req.query;
      let targetPlaces = state.places.filter((place) => ownedJobIds.has(place.job_id));
      if (jobId && typeof jobId === 'string' && jobId.trim()) {
        targetPlaces = targetPlaces.filter((p) => p.job_id === jobId.trim());
      }

      const totalRecords = targetPlaces.length;
      const allFields = EXPORTABLE_FIELDS;

      const fieldsStats = allFields.map((field) => {
        let populated = 0;
        for (const place of targetPlaces) {
          const val = place[field.key];
          if (val !== undefined && val !== null && String(val).trim().length > 0) {
            populated++;
          }
        }
        const missing = totalRecords - populated;
        const percentage = totalRecords > 0 ? Math.round((populated / totalRecords) * 100) : 0;
        return {
          key: field.key,
          label: field.label,
          populated,
          missing,
          percentage,
        };
      });

      const avgCoverage = fieldsStats.length > 0
        ? Math.round(fieldsStats.reduce((acc, f) => acc + f.percentage, 0) / fieldsStats.length)
        : 0;

      return res.json({
        totalRecords,
        totalFields: allFields.length,
        averageCoverage: avgCoverage,
        fields: fieldsStats,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 7. EXPORT CSV (/api/v1/export/csv)
  // =========================================================================

  app.post('/api/v1/export/csv', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      const { fields = [], filename, placeIds, jobId, query, category } = req.body;
      const state = store.getState();
      const ownedJobIds = new Set(state.jobs.filter((job) => job.user_id === user.id).map((job) => job.id));
      let targetPlaces = state.places.filter((place) => ownedJobIds.has(place.job_id));

      if (Array.isArray(placeIds) && placeIds.length > 0) {
        const idSet = new Set(placeIds);
        targetPlaces = targetPlaces.filter((p) => idSet.has(p.id));
      } else if (jobId && typeof jobId === 'string' && jobId.trim()) {
        targetPlaces = targetPlaces.filter((p) => p.job_id === jobId.trim());
      }

      // Apply the same text/category filters used in Results. Filtering happens
      // server-side across the full matching dataset, not only the current page.
      if (typeof query === 'string' && query.trim()) {
        const q = query.trim().toLocaleLowerCase('pt-BR');
        targetPlaces = targetPlaces.filter((p) =>
          [p.name, p.category, p.address, p.phone, p.website, p.city, p.description]
            .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(q))
        );
      }
      if (typeof category === 'string' && category.trim()) {
        const cat = category.trim().toLocaleLowerCase('pt-BR');
        targetPlaces = targetPlaces.filter((p) => String(p.category || '').toLocaleLowerCase('pt-BR').includes(cat));
      }

      const csvContent = buildCsvString(targetPlaces, fields as (keyof PlaceRecord)[]);
      const safeFilename = (filename || `mapscrape_export_${Date.now()}`).replace(/[^a-zA-Z0-9_\-]/g, '_');

      // Record export in audit log
      state.logs.unshift({
        id: `log_${Date.now()}_export`,
        created_at: new Date().toISOString(),
        level: 'info',
        category: 'export',
        event: 'csv_generated',
        message: `Arquivo CSV exportado com ${targetPlaces.length} registros e ${fields.length || EXPORTABLE_FIELDS.length} colunas.`,
        job_id: jobId || 'bulk_export',
        metadata: JSON.stringify({ filename: safeFilename, count: targetPlaces.length }),
        user_id: user?.id,
      });
      store.persist();

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.csv"`);
      return res.send(Buffer.from(csvContent, 'utf-8'));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 8. AUDIT LOGS (/api/v1/logs)
  // =========================================================================

  app.get('/api/v1/logs', async (req: Request, res: Response) => {
    const viewer = resolveUserFromRequest(req);
    if (!viewer) return res.status(401).json({ error: 'authentication_required' });
    if (viewer.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    try {
      const { level, category, query, jobId, limit = '100', offset = '0' } = req.query;
      const result = await listAuditLogs({
        level: typeof level === 'string' ? level : undefined,
        category: typeof category === 'string' ? category : undefined,
        query: typeof query === 'string' ? query : undefined,
        jobId: typeof jobId === 'string' ? jobId : undefined,
        limit: Math.max(1, Math.min(500, Number(limit) || 100)),
        offset: Math.max(0, Number(offset) || 0),
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ logs: result.logs, total: result.total, limit: Math.max(1, Math.min(500, Number(limit) || 100)), offset: Math.max(0, Number(offset) || 0) });
    } catch (err: any) {
      console.error('[AuditLog] Falha ao consultar Supabase:', err?.message || err);
      return res.status(500).json({ error: 'audit_log_query_failed', message: err?.message || 'Falha ao consultar auditoria.' });
    }
  });

  app.get('/api/v1/logs/export', async (req: Request, res: Response) => {
    const viewer = resolveUserFromRequest(req);
    if (!viewer) return res.status(401).json({ error: 'authentication_required' });
    if (viewer.role !== 'admin') return res.status(403).json({ error: 'admin_required' });
    try {
      const { level, category, query, jobId } = req.query;
      const result = await listAuditLogs({
        level: typeof level === 'string' ? level : undefined,
        category: typeof category === 'string' ? category : undefined,
        query: typeof query === 'string' ? query : undefined,
        jobId: typeof jobId === 'string' ? jobId : undefined,
        limit: 500,
        offset: 0,
      });
      const lines = result.logs.map((log) => JSON.stringify(log)).join('\\n');
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="mapscrape-audit.jsonl"');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(lines ? lines + '\\n' : '');
    } catch (err: any) {
      console.error('[AuditLog] Falha ao exportar Supabase:', err?.message || err);
      return res.status(500).json({ error: 'audit_log_export_failed', message: err?.message || 'Falha ao exportar auditoria.' });
    }
  });


  // =========================================================================
  // 9. API CREDENTIALS PROVISIONING (/api/v1/provisioning/credentials)
  // =========================================================================

  app.get('/api/v1/provisioning/credentials', async (req: Request, res: Response) => {
    if (!isProvisioningAuthorized(req)) {
      return res.status(401).json({ error: 'provisioning_unauthorized' });
    }
    try {
      await store.flush();
      const data = store.getState().credentials.map(({ id, consumer_name, consumer_project, status, created_at }) => ({
        id, consumer_name, consumer_project, status, created_at,
      }));
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ data });
    } catch (err: any) {
      return res.status(500).json({ error: 'credential_query_failed', message: err.message });
    }
  });

  app.post('/api/v1/provisioning/credentials', async (req: Request, res: Response) => {
    if (!isProvisioningAuthorized(req)) {
      return res.status(401).json({ error: 'provisioning_unauthorized' });
    }
    try {
      const consumerName = typeof req.body?.consumerName === 'string' ? req.body.consumerName.trim() : '';
      const consumerProject = typeof req.body?.consumerProject === 'string' ? req.body.consumerProject.trim() : '';
      if (!consumerName || consumerName.length > 120 || !consumerProject || consumerProject.length > 200) {
        return res.status(422).json({ error: 'invalid_request' });
      }

      const state = store.getState();
      const existing = state.credentials.find((item) =>
        item.status === 'active' && item.consumer_project.toLowerCase() === consumerProject.toLowerCase());
      if (existing) return res.status(409).json({ error: 'credential_already_exists' });

      const credentialId = `cred_${crypto.randomUUID()}`;
      const apiKey = `msk_live_${crypto.randomBytes(32).toString('hex')}`;
      const credential: ApiCredentialRecord = {
        id: credentialId,
        consumer_name: consumerName,
        consumer_project: consumerProject,
        api_key_hash: hashApiKey(apiKey),
        status: 'active',
        created_at: new Date().toISOString(),
      };
      state.credentials.unshift(credential);
      store.persist();
      await store.flush();

      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ data: {
        credentialId, apiKey, consumerName, consumerProject, revealOnce: true,
      } });
    } catch (err: any) {
      return res.status(500).json({ error: 'credential_create_failed', message: err.message });
    }
  });

  app.delete('/api/v1/provisioning/credentials/:id', async (req: Request, res: Response) => {
    if (!isProvisioningAuthorized(req)) {
      return res.status(401).json({ error: 'provisioning_unauthorized' });
    }
    try {
      const state = store.getState();
      const credential = state.credentials.find((item) => item.id === req.params.id && item.status === 'active');
      if (!credential) return res.status(404).json({ error: 'active_credential_not_found' });
      credential.status = 'revoked';
      store.persist();
      await store.flush();
      return res.status(200).json({ data: { credentialId: credential.id, status: 'revoked' } });
    } catch (err: any) {
      return res.status(500).json({ error: 'credential_revoke_failed', message: err.message });
    }
  });

  app.post('/api/v1/provisioning/credentials/:id/rotate', async (req: Request, res: Response) => {
    if (!isProvisioningAuthorized(req)) {
      return res.status(401).json({ error: 'provisioning_unauthorized' });
    }
    try {
      const state = store.getState();
      const previous = state.credentials.find((item) => item.id === req.params.id && item.status === 'active');
      if (!previous) return res.status(404).json({ error: 'active_credential_not_found' });

      const previousCredentialId = previous.id;
      previous.status = 'revoked';
      const credentialId = `cred_${crypto.randomUUID()}`;
      const apiKey = `msk_live_${crypto.randomBytes(32).toString('hex')}`;
      const replacement: ApiCredentialRecord = {
        id: credentialId,
        consumer_name: previous.consumer_name,
        consumer_project: previous.consumer_project,
        api_key_hash: hashApiKey(apiKey),
        status: 'active',
        created_at: new Date().toISOString(),
      };
      state.credentials.unshift(replacement);
      store.persist();
      await store.flush();

      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ data: {
        credentialId, previousCredentialId, apiKey,
        consumerName: replacement.consumer_name,
        consumerProject: replacement.consumer_project,
        revealOnce: true,
      } });
    } catch (err: any) {
      return res.status(500).json({ error: 'credential_rotation_failed', message: err.message });
    }
  });

  // =========================================================================
  // 10. SCRAPER & CLOUDFLARE BROWSER SETTINGS (/api/v1/scraper/settings)
  // =========================================================================

  app.get('/api/v1/scraper/settings', (_req: Request, res: Response) => {
    try {
      const state = store.getState();
      const hasRemoteEndpoint = Boolean(process.env.BROWSERLESS_TOKEN || state.settings?.browserWsEndpoint || process.env.BROWSER_WS_ENDPOINT);
      const engine = process.env.BROWSERLESS_TOKEN ? 'browserless' : hasRemoteEndpoint ? 'remote_chromium' : 'local_puppeteer';
      return res.json({
        engine,
        hasRemoteEndpoint,
        status: 'ready',
        description: engine === 'browserless'
          ? 'Browserless remoto configurado por variável de ambiente'
          : hasRemoteEndpoint
            ? 'Chromium remoto configurado'
            : 'Chromium local disponível somente em desenvolvimento',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v1/scraper/settings', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });
      if (user.role !== 'admin') return res.status(403).json({ error: 'Acesso restrito a administradores.' });
      const { browserWsEndpoint, preferredEngine } = req.body;
      const state = store.getState();
      if (!state.settings) {
        state.settings = {};
      }
      if (typeof browserWsEndpoint === 'string') {
        state.settings.browserWsEndpoint = browserWsEndpoint.trim();
      }
      if (preferredEngine) {
        state.settings.preferredEngine = preferredEngine;
      }
      store.persist();
      return res.json({
        success: true,
        message: 'Configurações de navegador atualizadas.',
        settings: {
          preferredEngine: state.settings.preferredEngine,
          hasRemoteEndpoint: Boolean(process.env.BROWSERLESS_TOKEN || state.settings.browserWsEndpoint || process.env.BROWSER_WS_ENDPOINT),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 11. BILLING / PAGBANK INTEGRATION (/api/v1/billing)
  // =========================================================================

  // Get current user's subscription status and available plans
  app.get('/api/v1/billing/status', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const state = store.getState();
      const userProfile = state.users.find((u) => u.id === user.id);
      if (!userProfile) return res.status(404).json({ error: 'Usuário não encontrado.' });

      const effectivePlan = getEffectivePlan(userProfile);
      const planConfig = getPlanConfig(effectivePlan);

      // Calculate usage this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const userJobs = state.jobs.filter((job) => job.user_id === user.id);
      const userJobIds = new Set(userJobs.map((job) => job.id));
      const monthlyLeads = state.places
        .filter((place) => userJobIds.has(place.job_id) && place.collected_at >= monthStart)
        .length;

      return res.json({
        currentPlan: effectivePlan,
        isActive: isPlanActive(userProfile),
        planExpiresAt: userProfile.planExpiresAt || null,
        limits: planConfig,
        usage: {
          monthlyLeads,
          remainingLeads: Math.max(0, planConfig.leadsPerMonth - monthlyLeads),
        },
        pagbankConfigured: !!process.env.PAGBANK_SANDBOX_TOKEN || !!process.env.PAGBANK_PRODUCTION_TOKEN,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Get available plans
  app.get('/api/v1/billing/plans', (_req: Request, res: Response) => {
    try {
      const plans = Object.entries(PLAN_CONFIGS).map(([tier, config]) => ({
        tier,
        name: tier.charAt(0).toUpperCase() + tier.slice(1),
        ...config,
        features: [
          `${config.leadsPerMonth.toLocaleString('pt-BR')} leads/mês`,
          `${config.projects === -1 ? 'Ilimitados' : config.projects} projetos`,
          config.apiAccess ? 'Acesso à API' : null,
          config.webhooks ? 'Webhooks' : null,
          config.whiteLabel ? 'White-label' : null,
        ].filter(Boolean),
      }));
      return res.json({ plans });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Create checkout session for plan upgrade
  app.post('/api/v1/billing/checkout', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const { planTier, billingCycle } = req.body;
      const planTierStr = planTier as PlanTier;
      const billingCycleStr = billingCycle as 'monthly' | 'annual';

      if (!planTierStr || !billingCycleStr) {
        return res.status(400).json({ error: 'planTier e billingCycle são obrigatórios.' });
      }

      if (!['starter', 'growth', 'pro'].includes(planTierStr)) {
        return res.status(400).json({ error: 'Plano inválido. Use: starter, growth ou pro.' });
      }

      if (!['monthly', 'annual'].includes(billingCycleStr)) {
        return res.status(400).json({ error: 'Ciclo de cobrança inválido. Use: monthly ou annual.' });
      }

      const state = store.getState();
      const userProfile = state.users.find((u) => u.id === user.id);
      if (!userProfile) return res.status(404).json({ error: 'Usuário não encontrado.' });

      // Check if user already has this plan or higher
      const currentPlan = getEffectivePlan(userProfile);
      const planHierarchy = { free: 0, starter: 1, growth: 2, pro: 3 };
      if (planHierarchy[planTierStr] <= planHierarchy[currentPlan]) {
        return res.status(400).json({ error: 'Você já possui este plano ou um superior.' });
      }

      const referenceId = `sub_${user.id}_${planTierStr}_${billingCycleStr}_${Date.now()}`;
      const pagbankOrder = await createPagBankOrder({
        planTier: planTierStr,
        billingCycle: billingCycleStr,
        customerEmail: userProfile.email,
        customerName: userProfile.name,
        customerId: user.id,
        referenceId,
      });

      if (!pagbankOrder) {
        return res.status(500).json({ error: 'Falha ao criar sessão de pagamento no PagBank.' });
      }

      // Store pending subscription reference
      const userProfile2 = state.users.find((u) => u.id === user.id);
      if (userProfile2) {
        (userProfile2 as any).pendingSubscription = {
          planTier: planTierStr,
          billingCycle: billingCycleStr,
          referenceId,
          pagbankOrderId: pagbankOrder.id,
          createdAt: new Date().toISOString(),
        };
        store.persist();
      }

      return res.json({
        checkoutUrl: pagbankOrder.checkoutUrl,
        orderId: pagbankOrder.id,
        referenceId,
      });
    } catch (err: any) {
      console.error('[Billing] Checkout error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Cancel subscription (downgrade to free at period end)
  app.post('/api/v1/billing/cancel', async (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const state = store.getState();
      const userProfile = state.users.find((u) => u.id === user.id);
      if (!userProfile) return res.status(404).json({ error: 'Usuário não encontrado.' });

      if (!userProfile.plan || userProfile.plan === 'free') {
        return res.status(400).json({ error: 'Você já está no plano gratuito.' });
      }

      // Mark for cancellation at period end
      userProfile.plan = 'free';
      userProfile.planExpiresAt = userProfile.planExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      store.persist();
      await store.flush();

      return res.json({
        success: true,
        message: 'Assinatura cancelada. O plano gratuito será ativado ao final do período atual.',
        planExpiresAt: userProfile.planExpiresAt,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // PagBank webhook endpoint
  app.post('/api/v1/billing/webhook', async (req: Request, res: Response) => {
    try {
      const config = getPagBankConfig();
      if (!config.webhookSecret) {
        console.warn('[PagBank Webhook] Webhook secret not configured');
        return res.status(200).json({ received: true }); // Don't block if not configured
      }

      // Verify webhook signature
      if (!verifyPagBankWebhook(req, config.webhookSecret)) {
        console.warn('[PagBank Webhook] Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body;
      const productOrigin = req.header('x-product-origin') || req.header('X-Product-Origin');
      const productId = req.header('x-product-id') || req.header('X-Product-Id');

      console.log('[PagBank Webhook] Received:', productOrigin, productId, event?.type || 'unknown');

      // Handle order events
      if (productOrigin === 'ORDER' || event?.type?.startsWith('ORDER')) {
        const orderId = productId || event?.order?.id;
        if (orderId) {
          const order = await getPagBankOrder(orderId);
          if (order) {
            const userId = order?.metadata?.user_id;
            const planTier = order?.metadata?.plan_tier as PlanTier;
            const billingCycle = order?.metadata?.billing_cycle as 'monthly' | 'annual';

            if (userId && planTier) {
              const state = store.getState();
              const userProfile = state.users.find((u) => u.id === userId);

              // Check if order is paid
              const charge = order.charges?.[0];
              const chargeStatus = charge?.status;

              if (chargeStatus === 'PAID' || chargeStatus === 'AUTHORIZED') {
                const chargeId = charge?.id;
                if (chargeId) {
                  await handleSuccessfulPayment(store.getState(), userId, planTier, billingCycle, order.id, chargeId);
                }
              } else if (chargeStatus === 'DECLINED' || chargeStatus === 'CANCELED' || chargeStatus === 'EXPIRED') {
                await handleFailedPayment(store.getState(), userId);
              }
            }
          }
        }
      }

      // Handle charge events (payment status changes)
      if (productOrigin === 'CHARGE' || event?.type?.startsWith('CHARGE')) {
        const chargeId = productId || event?.charge?.id;
        if (chargeId) {
          const charge = await getPagBankCharge(chargeId);
          if (charge) {
            const orderId = charge.order_id;
            if (orderId) {
              const order = await getPagBankOrder(orderId);
              if (order) {
                const userId = order?.metadata?.user_id;
                const planTier = order?.metadata?.plan_tier as PlanTier;
                const billingCycle = order?.metadata?.billing_cycle as 'monthly' | 'annual';

                if (userId && planTier) {
                  const chargeStatus = charge.status;

                  if (chargeStatus === 'PAID' || chargeStatus === 'AUTHORIZED') {
                    await handleSuccessfulPayment(store.getState(), userId, planTier, billingCycle, orderId, chargeId);
                  } else if (chargeStatus === 'DECLINED' || chargeStatus === 'CANCELED' || chargeStatus === 'EXPIRED' || chargeStatus === 'WAITING') {
                    // For WAITING (boleto), we might want to keep pending
                    if (chargeStatus !== 'WAITING') {
                      await handleFailedPayment(store.getState(), userId);
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Always return 200 to acknowledge receipt
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error('[PagBank Webhook] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // Get billing history
  app.get('/api/v1/billing/history', (req: Request, res: Response) => {
    try {
      const user = resolveUserFromRequest(req);
      if (!user) return res.status(401).json({ error: 'Autenticação necessária.' });

      const state = store.getState();
      const logs = state.logs
        .filter((log) => log.user_id === user.id && log.category === 'billing')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

      return res.json({ history: logs });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 11. VITE MIDDLEWARE / SPA STATIC HANDLER
  // =========================================================================

  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve(__dirname, 'dist'))) {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}
