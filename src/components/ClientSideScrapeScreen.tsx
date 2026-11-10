import React, { useState, useEffect } from 'react';
import {
  Play,
  Square,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Mail,
  Globe,
  ClipboardList,
} from 'lucide-react';
import { PlaceRecord } from '../shared/types';

function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: 'no-store' });
}

export interface ClientSideScrapeProps {
  onGoToResults?: () => void;
}

export const ClientSideScrapeScreen: React.FC<ClientSideScrapeProps> = ({
  onGoToResults,
}) => {
  const [segment, setSegment] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(20);
  const [jobId, setJobId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectedCount, setCollectedCount] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');

  const baseUrl = window.location.origin;

  useEffect(() => {
    if (!jobId) return;
    let active = true;

    const refreshJob = async () => {
      try {
        const response = await accountFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
        if (!response.ok) throw new Error(`Falha ao consultar coleta (HTTP ${response.status}).`);
        const payload = await response.json();
        const job = payload.data || payload;
        if (!active) return;

        setCollectedCount(Number(job.total_collected || 0));
        if (['completed', 'failed', 'stopped'].includes(job.status)) {
          setIsCollecting(false);
          setMessage(job.status_message || (
            job.status === 'completed' ? 'Coleta concluída.' :
            job.status === 'stopped' ? 'Coleta interrompida.' : 'A coleta falhou.'
          ));
          setMessageType(job.status === 'completed' ? 'success' : 'error');
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Falha ao consultar o status da coleta.');
          setMessageType('error');
        }
      }
    };

    void refreshJob();
    const interval = window.setInterval(() => void refreshJob(), 2000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [jobId]);

  // Script que o usuário cola no console do Google Maps
  const collectScript = `(async () => {
    const SEGMENT = ${JSON.stringify(segment)};
    const LOCATION = ${JSON.stringify(location)};
    const LIMIT = ${limit};
    const JOB_ID = ${JSON.stringify(jobId)};
    const API_BASE = ${JSON.stringify(baseUrl)};
    const TOKEN = ${JSON.stringify(
      window.sessionStorage.getItem('mapscrape_api_key') ||
        window.sessionStorage.getItem('mapscrape_session_token') ||
        ''
    )};

    console.log('🗺️ Iniciando coleta client-side:', SEGMENT, 'em', LOCATION);

    // Aguardar resultados carregarem
    await new Promise(r => setTimeout(r, 5000));

    const results = [];
    const seen = new Set();

    for (let round = 0; round < Math.ceil(LIMIT / 10); round++) {
      const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      for (const link of links) {
        if (results.length >= LIMIT) break;
        const href = link.getAttribute('href');
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const parent = link.closest('[role="feed"]') || link.parentElement;
        const containerText = parent ? parent.innerText : '';
        const lines = containerText.split('\\n').filter(l => l.trim());

        const name = lines[0] || link.textContent || 'Estabelecimento';
        let phone = '';
        let rating = '';
        const phoneMatch = containerText.match(/(\\+?\\d[\\d\\s\\-]{7,}\\d)/);
        if (phoneMatch) phone = phoneMatch[1].trim();
        const ratingMatch = containerText.match(/(\\d[.,]\\d)/);
        if (ratingMatch) rating = ratingMatch[1];

        results.push({
          id: 'place_' + Date.now() + '_' + Math.random().toString(36).substring(2,7),
          job_id: JOB_ID,
          name,
          category: SEGMENT,
          address: LOCATION + ', Brasil',
          phone,
          website: '',
          rating,
          review_count: '',
          city: LOCATION.split(',')[0],
          state: (LOCATION.match(/(?:,\\s*|\\s+)([A-Z]{2})$/) || [])[1] || '',
          source_url: href,
          maps_url: href,
          collected_at: new Date().toISOString(),
        });
      }

      if (results.length >= LIMIT) break;

      // Rolar para carregar mais resultados
      const feed = document.querySelector('[role="feed"]');
      if (feed) {
        feed.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        window.scrollBy(0, 800);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('📊 Coletados:', results.length, 'estabelecimentos');

    // Enviar para a API
    try {
      const resp = await fetch(API_BASE + '/api/v1/scrape/collect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + TOKEN,
        },
        body: JSON.stringify({
          jobId: JOB_ID,
          segment: SEGMENT,
          location: LOCATION,
          places: results,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `A API recusou os resultados (HTTP ${resp.status}).`);
      console.log('✅ Enviados para a API:', data.collected, 'lugares');
      alert('Coleta concluída! ' + data.collected + ' estabelecimento(s) salvo(s).');
    } catch (err) {
      console.error('❌ Falha ao enviar para API:', err);
      alert('Falha ao enviar dados para a API. Verifique o console.');
    }
  })();`;

  const createJob = async () => {
    if (!segment.trim() || !location.trim()) {
      setMessage('Informe segmento e localização.');
      setMessageType('error');
      return;
    }
    setIsCreating(true);
    setMessage('Criando job de coleta...');
    try {
      const resp = await accountFetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment,
          location,
          limit,
          projectName: `${segment} · ${location}`,
          categoryName: segment,
          source: 'browser_extension',
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao criar job.');
      setJobId(data.jobId || data.id);
      setIsCollecting(true);
      setMessage('Job criado. Abra o Google Maps e execute o script de coleta.');
      setMessageType('info');
    } catch (err: any) {
      setMessage(err instanceof Error ? err.message : 'Erro ao criar job.');
      setMessageType('error');
    } finally {
      setIsCreating(false);
    }
  };

  const openMaps = () => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(
      `${segment} ${location}`
    )}`;
    window.open(url, '_blank');
  };

  const copyScript = () => {
    navigator.clipboard.writeText(collectScript);
    setMessage('Script copiado para a área de transferência!');
    setMessageType('success');
    setTimeout(() => setMessage(''), 2000);
  };

  const reset = () => {
    setJobId('');
    setIsCollecting(false);
    setMessage('');
    setCollectedCount(0);
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="bg-[#0b1429] border border-[#17274f] rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">Coleta pelo Seu Navegador</h2>
        </div>
        <p className="text-slate-300 text-sm mb-6">
          Como o scraping server-side não tem slots disponíveis, a coleta agora é feita
          diretamente no seu navegador. Você abre o Google Maps, cola um script no console
          e os dados são salvos automaticamente na plataforma.
        </p>

        <form onSubmit={(e) => { e.preventDefault(); createJob(); }} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-200">Segmento <span className="text-blue-400">*</span></label>
              <input
                type="text"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                placeholder="Ex: Restaurantes, Clínicas Odontológicas..."
                className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-200">Localização <span className="text-blue-400">*</span></label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: São Paulo, SP"
                className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 focus:border-blue-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-200">Limite</label>
              <select
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 focus:border-blue-500 outline-none"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={isCreating || !segment.trim() || !location.trim()}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span>{isCreating ? 'Criando job...' : 'Criar Job de Coleta'}</span>
          </button>
        </form>

        {jobId && (
          <div className="mt-6 p-4 rounded-xl bg-[#081024] border border-[#17274f] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Job ID:</span>
              <code className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded">{jobId}</code>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={openMaps}
                className="flex-1 py-3 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-300 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir Google Maps</span>
              </button>
              <button
                onClick={copyScript}
                className="flex-1 py-3 bg-slate-700/50 hover:bg-slate-600 border border-slate-500 rounded-xl text-slate-200 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Copy className="w-4 h-4" />
                <span>Copiar Script</span>
              </button>
            </div>
            <div className="bg-[#070e20] border border-[#1d3162] rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Instruções:</h3>
              <ol className="text-sm text-slate-300 space-y-2 ml-4 list-decimal">
                <li>Clique em <strong>Abrir Google Maps</strong> (nova aba)</li>
                <li>Faça a busca e aguarde carregar os resultados</li>
                <li>Clique em <strong>Copiar Script</strong></li>
                <li>No Google Maps, pressione <strong>F12</strong> → aba <strong>Console</strong></li>
                <li>Cole o script e pressione <strong>Enter</strong></li>
                <li>Aguarde a coleta terminar e os dados serão salvos aqui</li>
              </ol>
            </div>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer hover:text-slate-300">Ver script (para referência)</summary>
              <pre className="mt-2 p-3 rounded bg-black/40 text-blue-300 text-xs overflow-x-auto font-mono">{collectScript.slice(0, 300)}...</pre>
            </details>
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            messageType === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : messageType === 'error'
                ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
          }`}>
            {messageType === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {messageType === 'error' && <AlertTriangle className="w-4 h-4" />}
            {messageType === 'info' && <Mail className="w-4 h-4" />}
            <span>{message}</span>
          </div>
        )}
      </div>

      {collectedCount > 0 && onGoToResults && (
        <div className="flex justify-center">
          <button
            onClick={onGoToResults}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors"
          >
            <ClipboardList className="w-4 h-4 mr-2" />Ver Resultados Coletados
          </button>
        </div>
      )}
    </div>
  );
};
