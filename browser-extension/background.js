// MapScrape Browser Extension - Background Service Worker (Manifest V3)
// Responsável por:
// - Receber solicitações de scraping da plataforma MapScrape
// - Gerenciar comunicação entre abas e a API
// - Coordenar execução do content script nas páginas do Google Maps
// - Enviar resultados coletados para a API existente

const API_BASE = 'https://maisclientes-api.olfnetto.workers.dev';

// Estado da extensão
let extensionState = {
  isConnected: false,
  currentJob: null,
  isCollecting: false,
  collectedCount: 0,
  token: null,
};

// Armazenar token de autenticação recebido da plataforma
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.mapscrape_token) {
      extensionState.token = changes.mapscrape_token.newValue || null;
      extensionState.isConnected = Boolean(extensionState.token);
    }
    if (changes.mapscrape_api_base) {
      // Permitir sobrescrever API base via storage (útil para testes)
      const val = changes.mapscrape_api_base.newValue;
      if (val) {
        // Não sobrescrever API_BASE diretamente (const), apenas logar
        console.info('[MapScrape BG] API base override ignorado via storage.');
      }
    }
  }
});

// Inicializar estado do storage
chrome.storage.local.get([
  'mapscrape_token',
  'mapscrape_user',
  'mapscrape_extension_enabled',
], (result) => {
  extensionState.token = result.mapscrape_token || null;
  extensionState.isConnected = Boolean(extensionState.token);
  console.info('[MapScrape BG] Extensão inicializada. Conectada:', extensionState.isConnected);
});

// Listener de mensagens de content scripts e popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'getState':
          sendResponse({
            success: true,
            state: extensionState,
          });
          break;

        case 'setToken':
          extensionState.token = request.token;
          extensionState.isConnected = Boolean(request.token);
          await chrome.storage.local.set({ mapscrape_token: request.token });
          if (request.user) {
            await chrome.storage.local.set({ mapscrape_user: request.user });
          }
          sendResponse({ success: true });
          break;

        case 'startScraping':
          if (!extensionState.token) {
            sendResponse({ success: false, error: 'Extensão não autenticada.' });
            return;
          }
          if (extensionState.isCollecting) {
            sendResponse({ success: false, error: 'Já há uma coleta em andamento.' });
            return;
          }
          extensionState.currentJob = request.job;
          extensionState.isCollecting = true;
          extensionState.collectedCount = 0;
          await chrome.storage.local.set({ mapscrape_extension_enabled: true });
          sendResponse({ success: true, jobId: request.job.jobId });
          break;

        case 'stopScraping':
          extensionState.isCollecting = false;
          extensionState.currentJob = null;
          await chrome.storage.local.set({ mapscrape_extension_enabled: false });
          sendResponse({ success: true });
          break;

        case 'placesCollected':
          // Recebe lotes de lugares do content script e encaminha para a API
          await sendPlacesBatch(request.places, request.jobId);
          extensionState.collectedCount += (request.places && request.places.length) || 0;
          sendResponse({ success: true, collected: extensionState.collectedCount });
          break;

        case 'getJobStatus':
          sendResponse({
            success: true,
            job: extensionState.currentJob,
            isCollecting: extensionState.isCollecting,
            collectedCount: extensionState.collectedCount,
          });
          break;

        default:
          sendResponse({ success: false, error: 'Ação desconhecida: ' + request.action });
      }
    } catch (err) {
      console.error('[MapScrape BG] Erro ao processar mensagem:', err);
      sendResponse({ success: false, error: err.message || String(err) });
    }
  })();
  return true; // Manter canal aberto para resposta assíncrona
});

// Envia um lote de lugares para a API existente do MapScrape
async function sendPlacesBatch(places, jobId) {
  if (!places || places.length === 0) return;
  if (!extensionState.token) {
    console.error('[MapScrape BG] Não há token para enviar lugares.');
    return;
  }

  const payload = {
    jobId,
    segment: extensionState.currentJob ? extensionState.currentJob.segment : '',
    location: extensionState.currentJob ? extensionState.currentJob.location : '',
    places: places.map((p) => ({
      id: p.id,
      name: p.name || 'Estabelecimento',
      category: p.category || '',
      address: p.address || '',
      phone: p.phone || '',
      website: p.website || '',
      rating: p.rating || '',
      review_count: p.review_count || '',
      city: p.city || '',
      state: p.state || '',
      source_url: p.source_url || '',
      maps_url: p.maps_url || '',
    })),
  };

  try {
    const response = await fetch(`${API_BASE}/api/v1/scrape/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${extensionState.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(
        `[MapScrape BG] Falha ao enviar lote: HTTP ${response.status} ${errorText}`
      );
      // Não lançar erro para não interromper a coleta; tentar novamente no próximo lote
      return;
    }

    const data = await response.json();
    console.info(
      `[MapScrape BG] Lote enviado: ${data.collected || 0} lugar(es) salvo(s).`
    );
  } catch (err) {
    console.error('[MapScrape BG] Erro de rede ao enviar lote:', err);
  }
}

// Atualizar status do job na plataforma via API (chamada do content script pode delegar aqui)
async function updateJobStatus(jobId, status, statusMessage, collected) {
  if (!extensionState.token) return;
  try {
    await fetch(`${API_BASE}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${extensionState.token}`,
      },
      body: JSON.stringify({
        status,
        status_message: statusMessage,
        total_collected: collected,
      }),
    });
  } catch (err) {
    console.error('[MapScrape BG] Falha ao atualizar status do job:', err);
  }
}

// Limpar estado quando o service worker é inativado
chrome.runtime.onSuspend.addListener(() => {
  extensionState.isCollecting = false;
  console.info('[MapScrape BG] Service worker suspenso.');
});
