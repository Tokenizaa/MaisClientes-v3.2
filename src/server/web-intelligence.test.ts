import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSocialOrDirectoryUrl,
  normalizeWebsiteUrl,
  generateWebIntelligence,
  type WebsiteScrapeResult,
} from './web-intelligence.ts';
import type { PlaceRecord } from '../shared/types.ts';

describe('Web Intelligence — URL Validation & Sanitization', () => {
  it('identifies social networks, messaging links, directories and marketplaces as non-institutional', () => {
    assert.equal(isSocialOrDirectoryUrl('https://instagram.com/empresa_exemplo'), true);
    assert.equal(isSocialOrDirectoryUrl('https://www.facebook.com/empresa'), true);
    assert.equal(isSocialOrDirectoryUrl('https://wa.me/5511999999999'), true);
    assert.equal(isSocialOrDirectoryUrl('https://api.whatsapp.com/send?phone=5511999999999'), true);
    assert.equal(isSocialOrDirectoryUrl('https://mercadolivre.com.br/loja/algo'), true);
    assert.equal(isSocialOrDirectoryUrl('https://ifood.com.br/delivery/sao-paulo-sp/restaurante'), true);
    assert.equal(isSocialOrDirectoryUrl('https://linktr.ee/minhaloja'), true);
  });

  it('accepts legitimate institutional website URLs', () => {
    assert.equal(isSocialOrDirectoryUrl('https://www.clinicamedica.com.br'), false);
    assert.equal(isSocialOrDirectoryUrl('https://padariacentral.com.br'), false);
    assert.equal(isSocialOrDirectoryUrl('http://autopecaspaulista.com.br'), false);
  });

  it('normalizes website URLs with missing protocols', () => {
    assert.equal(normalizeWebsiteUrl('clinicamedica.com.br'), 'https://clinicamedica.com.br/');
    assert.equal(normalizeWebsiteUrl('http://empresa.com'), 'http://empresa.com/');
    assert.equal(normalizeWebsiteUrl(''), null);
    assert.equal(normalizeWebsiteUrl('-'), null);
  });
});

describe('Web Intelligence — Analysis & Qualification Engine', () => {
  const samplePlace: PlaceRecord = {
    id: 'plc_test_01',
    job_id: 'job_01',
    name: 'Restaurante & Hamburgueria Brasa Nobre',
    category: 'Restaurante / Hamburgueria Artesanal',
    address: 'Av. Paulista, 1000, Bela Vista, São Paulo - SP',
    phone: '(11) 3254-8800',
    website: 'https://www.brasanobreburger.com.br',
    rating: '4.8',
    review_count: '340',
    price_range: '$$',
    opening_hours: 'Seg-Dom: 11:30-23:00',
    business_status: 'OPERATIONAL',
    latitude: '-23.56',
    longitude: '-46.65',
    maps_url: 'https://maps.google.com/?cid=12345',
    description: 'Hamburgueria gourmet com cortes selecionados, comanda eletrônica e delivery.',
    services_attributes: 'Consumo no local, Para viagem, Entrega',
    collected_at: new Date().toISOString(),
  };

  const sampleScrapeResult: WebsiteScrapeResult = {
    isAccessible: true,
    status: 'completed',
    statusMessage: 'Site acessado com sucesso.',
    resolvedUrl: 'https://www.brasanobreburger.com.br',
    homePage: {
      url: 'https://www.brasanobreburger.com.br',
      title: 'Brasa Nobre Burger | Hamburgueria e Choperia Artesanal',
      description: 'Melhores hambúrgueres artesanais de São Paulo. Faça seu pedido online ou visite nossa casa.',
      headings: ['Nosso Cardápio', 'Hambúrgueres Especiais', 'Chopp Artesanal', 'Unidades', 'Fale Conosco'],
      mainText: 'Trabalhamos com carnes nobres e preparo na brasa. Atendimento no salão e delivery com pedidos online.',
      detectedTech: ['WordPress/WooCommerce', 'Google Analytics/Tag Manager', 'Mercado Pago'],
      hasEcommerce: true,
      hasOnlineBooking: true,
      supportChannels: ['WhatsApp', 'Telefone / Central'],
      subLinks: ['https://www.brasanobreburger.com.br/cardapio', 'https://www.brasanobreburger.com.br/unidades'],
    },
  };

  it('generates commercial analysis matching Food Service solution', async () => {
    const intel = await generateWebIntelligence(samplePlace, sampleScrapeResult);

    assert.equal(intel.place_id, samplePlace.id);
    assert.equal(intel.place_name, samplePlace.name);
    assert.equal(intel.is_official_website, true);
    const recSolution = intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || '';
    assert.ok(recSolution.includes('Food Service'));
    assert.ok(intel.scores.overall_score >= 60, 'Score should be high for food service fit');
    assert.ok(intel.commercial_analysis.seller_discovery_questions.length >= 2, 'Should provide discovery questions');
    assert.ok(intel.evidences.length >= 3, 'Should provide traceable evidences');
    assert.ok(intel.evidences.some((e) => e.confidence === 'confirmado_no_site'), 'Must contain confirmed website evidence');
  });

  it('handles gracefully places without a website using Maps collect data', async () => {
    const placeNoSite: PlaceRecord = {
      ...samplePlace,
      id: 'plc_no_site',
      website: '',
    };
    const unavailableScrapeResult: WebsiteScrapeResult = {
      isAccessible: false,
      status: 'site_unavailable',
      statusMessage: 'Site institucional não informado na ficha.',
    };

    const intel = await generateWebIntelligence(placeNoSite, unavailableScrapeResult);
    assert.equal(intel.status, 'site_unavailable');
    assert.equal(intel.is_official_website, false);
    assert.ok(intel.evidences.some((e) => e.confidence === 'dados_coleta'), 'Must base evidence on Maps data');
    assert.ok(intel.scores.overall_score > 0, 'Must still produce a qualification score');
  });
});
