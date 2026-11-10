/* MapScrape Browser Extension - Content Script
 * Executa nas páginas do Google Maps.
 * Responsabilidades:
 * - Detectar quando o usuário está no Google Maps com resultados de busca
 * - Extrair nomes, telefones, avaliações, endereços e URLs dos resultados visíveis
 * - Fazer scroll/rolagem para carregar mais resultados
 * - Enviar lotes progressivos para o background script (que encaminha para a API)
 */

(function () {
  'use strict';

  const API_POLL_INTERVAL = 2000;
  const SCROLL_DELAY_MS = 3500;
  const MAX_RETRY = 3;

  let isRunning = false;
  let currentJob = null;
  let collectedCount = 0;
  let seenUrls = new Set();
  let scrollTimeout = null;
  let stopRequested = false;

  // Verificar se a página é do Google Maps com resultados
  function isGoogleMapsSearchPage() {
    return (
      window.location.hostname.includes('google.com/maps') ||
      window.location.hostname === 'maps.google.com'
    ) && window.location.pathname.includes('/search/');
  }

  // Extrair links de estabelecimentos visíveis
  function extractPlacesFromPage() {
    const results = [];
    const links = Array.from(
      document.querySelectorAll('a[href*="/maps/place/"]')
    );

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href || seenUrls.has(href)) continue;
      seenUrls.add(href);

      const parent =
        link.closest('[role="feed"]') || link.parentElement;
      const containerText = parent ? parent.innerText : '';
      const lines = containerText
        .split('\n')
        .filter((l) => l.trim());

      const name =
        lines[0] || link.textContent || 'Estabelecimento';
      let phone = '';
      let rating = '';

      const phoneMatch = containerText.match(
        /(\+?\d[\d\s\-]{7,}\d)/
      );
      if (phoneMatch) phone = phoneMatch[1].trim();

      const ratingMatch = containerText.match(/(\d[.,]\d)/);
      if (ratingMatch) rating = ratingMatch[1];

      results.push({
        id: 'place_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name,
        category: currentJob ? currentJob.segment : '',
        address: currentJob ? currentJob.location + ', Brasil' : '',
        phone,
        website: '',
        rating,
        review_count: '',
        city: currentJob ? currentJob.location.split(',')[0] : '',
        state: currentJob ? 'SP' : '',
        source_url: href,
        maps_url: href,
        collected_at: new Date().toISOString(),
      });
    }

    return results;
  }

  // Enviar lote para o background script
  async function sendBatchToBackground(places) {
    if (!places || places.length === 0) return;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'placesCollected',
        places,
        jobId: currentJob ? currentJob.jobId : null,
      });
      if (response && response.success) {
        collectedCount = response.collected || collectedCount;
        dispatchProgressEvent();
      }
    } catch (err) {
      console.error('[MapScrape CS] Falha ao enviar lote:', err);
    }
  }

  // Disparar evento de progresso para a página (útil para debug/overlay)
  function dispatchProgressEvent() {
    window.dispatchEvent(
      new CustomEvent('mapscrape-progress', {
        detail: {
          collected: collectedCount,
          jobId: currentJob ? currentJob.jobId : null,
        },
      })
    );
  }

  // Rolagem da página para carregar mais resultados
  function scrollPage() {
    if (stopRequested) return;
    const feed = document.querySelector('[role="feed"]');
    if (feed) {
      feed.scrollBy(0, 800);
    } else {
      window.scrollBy(0, 800);
    }
  }

  // Loop principal de coleta
  async function collectionLoop(limit) {
    let rounds = 0;
    const maxRounds = Math.ceil(limit / 10);

    while (isRunning && collectedCount < limit && rounds < maxRounds) {
      if (stopRequested) break;

      rounds++;

      // Aguardar resultados carregarem
      await new Promise((r) => setTimeout(r, 3000));

      // Extrair lugares visíveis
      const places = extractPlacesFromPage();
      if (places.length > 0) {
        await sendBatchToBackground(places);
      }

      if (collectedCount >= limit) break;

      // Rolar para carregar mais
      scrollPage();
      await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));
    }

    isRunning = false;
    // Notificar conclusão ao background
    try {
      await chrome.runtime.sendMessage({
        action: 'getJobStatus',
      });
    } catch (e) {
      // Ignorar erros de comunicação ao finalizar
    }
    dispatchProgressEvent();
    console.info(
      `[MapScrape CS] Coleta finalizada. ${collectedCount} lugar(es) coletado(s).`
    );
  }

  // Ouvir mensagens do background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
      try {
        switch (request.action) {
          case 'startCollection':
            if (isRunning) {
              sendResponse({ success: false, error: 'Coleta já em andamento.' });
              return;
            }
            if (!request.job) {
              sendResponse({ success: false, error: 'Job não informado.' });
              return;
            }
            currentJob = request.job;
            isRunning = true;
            stopRequested = false;
            collectedCount = 0;
            seenUrls = new Set();
            sendResponse({ success: true });
            // Iniciar coleta de forma assíncrona
            setTimeout(() => collectionLoop(request.job.limit || 20), 1000);
            break;

          case 'stopCollection':
            stopRequested = true;
            isRunning = false;
            sendResponse({ success: true });
            break;

          case 'getState':
            sendResponse({
              success: true,
              isRunning,
              collectedCount,
              job: currentJob,
            });
            break;

          default:
            sendResponse({ success: false, error: 'Ação desconhecida.' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message || String(err) });
      }
    })();
    return true;
  });

  // Inicializar: verificar se já havia uma coleta pendente (recuperação)
  chrome.storage.local.get(['mapscrape_extension_enabled'], (result) => {
    if (result.mapscrape_extension_enabled) {
      // Se a extensão estava ativa antes de uma recarga, tentar retomar
      console.info('[MapScrape CS] Extensão estava ativa anteriormente.');
    }
  });

  console.info('[MapScrape CS] Content script carregado. Página:', window.location.href);
})();
