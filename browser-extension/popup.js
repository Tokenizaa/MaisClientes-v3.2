/* MapScrape Browser Extension - Popup Script
 * Interface da extensão (popup) que permite ao usuário configurar e iniciar coleta
 * Comunica com o background script e com a API do MapScrape
 */

(function () {
  'use strict';

  const API_BASE = 'https://maisclientes-api.olfnetto.workers.dev';

  // Elementos DOM
  const scrapeForm = document.getElementById('scrapeForm');
  const segmentInput = document.getElementById('segment');
  const locationInput = document.getElementById('location');
  const limitSelect = document.getElementById('limit');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const openMapsBtn = document.getElementById('openMapsBtn');
  const connIndicator = document.getElementById('connIndicator');
  const connDot = document.getElementById('connDot');
  const connText = document.getElementById('connText');
  const errorMsg = document.getElementById('errorMsg');
  const successMsg = document.getElementById('successMsg');
  const statusCard = document.getElementById('statusCard');
  const statusJobId = document.getElementById('statusJobId');
  const statusCollected = document.getElementById('statusCollected');
  const statusText = document.getElementById('statusText');

  // Estado local
  let token = null;
  let user = null;
  let currentJob = null;
  let pollInterval = null;
  let collectedCount = 0;

  // Funções de utilidade
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('show');
    setTimeout(() => errorMsg.classList.remove('show'), 5000);
  }

  function showSuccess(msg) {
    successMsg.textContent = msg;
    successMsg.classList.add('show');
    setTimeout(() => successMsg.classList.remove('show'), 5000);
  }

  function setConnected(connected) {
    if (connected) {
      connDot.classList.remove('disconnected');
      connDot.classList.add('connected');
      connText.textContent = 'Conectado';
    } else {
      connDot.classList.remove('connected');
      connDot.classList.add('disconnected');
      connText.textContent = 'Não conectado';
    }
  }

  function setBusy(busy) {
    startBtn.disabled = busy;
    startBtn.textContent = busy ? 'Iniciando...' : 'Iniciar Coleta';
    stopBtn.style.display = busy ? 'inline-block' : 'none';
    openMapsBtn.disabled = busy;
  }

  // Obter token de autenticação do storage da extensão
  async function getStoredToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['mapscrape_token', 'mapscrape_user'], (result) => {
        token = result.mapscrape_token || null;
        user = result.mapscrape_user || null;
        setConnected(Boolean(token));
        resolve(token);
      });
    });
  }

  // Chamar API do MapScrape
  async function apiFetch(path, init = {}) {
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
    return res;
  }

  // Criar job na plataforma
  async function createJob(segment, location, limit) {
    const res = await apiFetch('/api/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        segment,
        location,
        limit,
        projectName: `${segment} · ${location}`,
        categoryName: segment,
        source: 'browser_extension',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Falha HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.jobId || data.id || data.data?.jobId;
  }

  // Consultar status do job
  async function getJobStatus(jobId) {
    const res = await apiFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data || data;
  }

  // Atualizar UI com status
  function updateStatusUI(job, collected) {
    statusCard.style.display = 'block';
    statusJobId.textContent = job.id || '-';
    statusCollected.textContent = collected || 0;
    statusText.textContent = job.status_message || job.status || 'Processando...';

    if (job.status === 'completed') {
      statusText.style.color = '#4ade80';
      setBusy(false);
      clearInterval(pollInterval);
      pollInterval = null;
      showSuccess(`Coleta concluída: ${collected} estabelecimento(s) salvo(s).`);
    } else if (job.status === 'failed') {
      statusText.style.color = '#f87171';
      setBusy(false);
      clearInterval(pollInterval);
      pollInterval = null;
      showError(job.status_message || 'Falha na coleta.');
    } else if (job.status === 'stopped') {
      statusText.style.color = '#fbbf24';
      setBusy(false);
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Iniciar coleta
  async function startCollection(e) {
    e.preventDefault();

    if (!token) {
      showError('Extensão não autenticada. Faça login no MapScrape primeiro.');
      return;
    }

    const segment = segmentInput.value.trim();
    const location = locationInput.value.trim();
    const limit = parseInt(limitSelect.value, 10) || 20;

    if (!segment || !location) {
      showError('Informe segmento e localização.');
      return;
    }

    try {
      setBusy(true);
      showError('');
      showSuccess('');

      // Criar job na plataforma
      const jobId = await createJob(segment, location, limit);
      currentJob = { jobId, segment, location, limit };
      collectedCount = 0;

      // Notificar o background script para iniciar coleta
      const bgRes = await chrome.runtime.sendMessage({
        action: 'startScraping',
        job: currentJob,
      });

      if (!bgRes || !bgRes.success) {
        throw new Error(bgRes && bgRes.error ? bgRes.error : 'Falha ao iniciar na extensão.');
      }

      statusCard.style.display = 'block';
      statusJobId.textContent = jobId;
      statusCollected.textContent = '0';
      statusText.textContent = 'Aguardando início da coleta...';

      // Iniciar polling de status
      if (pollInterval) clearInterval(pollInterval);
      pollInterval = setInterval(async () => {
        const job = await getJobStatus(jobId);
        if (!job) return;

        // Consultar lugares coletados para atualizar contador
        const placesRes = await apiFetch(`/api/v1/leads?jobId=${encodeURIComponent(jobId)}`);
        let collected = 0;
        if (placesRes.ok) {
          const placesData = await placesRes.json();
          collected = placesData.total || (placesData.data ? placesData.data.length : 0);
        }

        collectedCount = collected;
        updateStatusUI(job, collected);
      }, 3000);

      showSuccess('Job criado. Coleta iniciada pela extensão.');
    } catch (err) {
      setBusy(false);
      showError(err.message || 'Erro ao iniciar coleta.');
    }
  }

  // Parar coleta
  async function stopCollection() {
    if (!currentJob) return;
    try {
      setBusy(false);
      await chrome.runtime.sendMessage({ action: 'stopScraping' });
      clearInterval(pollInterval);
      pollInterval = null;
      statusCard.style.display = 'none';
      showSuccess('Coleta interrompida.');
    } catch (err) {
      showError(err.message || 'Erro ao parar coleta.');
    }
  }

  // Abrir Google Maps em nova aba
  function openMaps() {
    const segment = segmentInput.value.trim();
    const location = locationInput.value.trim();
    if (!segment || !location) {
      showError('Informe segmento e localização primeiro.');
      return;
    }
    const url = `https://www.google.com/maps/search/${encodeURIComponent(`${segment} ${location}`)}`;
    chrome.tabs.create({ url });
  }

  // Inicialização
  async function init() {
    await getStoredToken();

    // Listener para mudanças de autenticação
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.mapscrape_token) {
        token = changes.mapscrape_token.newValue || null;
        setConnected(Boolean(token));
      }
    });

    // Listener de mensagens do background (progresso da coleta)
    chrome.runtime.onMessage.addListener((request) => {
      if (request.action === 'placesCollected') {
        collectedCount = request.collected || collectedCount;
        const el = document.getElementById('statusCollected');
        if (el) el.textContent = collectedCount;
      }
    });
  }

  // Event listeners
  scrapeForm.addEventListener('submit', startCollection);
  stopBtn.addEventListener('click', stopCollection);
  openMapsBtn.addEventListener('click', openMaps);

  init();
})();
