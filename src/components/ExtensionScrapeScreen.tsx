import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Puzzle,
  Globe,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { PlaceRecord } from '../shared/types';

// Declaração do objeto chrome (disponível em contexto de extensão)
declare const chrome: {
  runtime: {
    sendMessage: (message: any, callback?: (response: any) => void) => void;
    lastError: { message?: string } | null;
  };
};

function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: 'no-store' });
}

export interface ExtensionScrapeProps {
  onGoToResults?: () => void;
}

export const ExtensionScrapeScreen: React.FC<ExtensionScrapeProps> = ({
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
  const [extensionInstalled, setExtensionInstalled] = useState<boolean | null>(null);

  const API_BASE = window.location.origin;

  // Verificar se a extensão está instalada via runtime.sendMessage
  useEffect(() => {
    const checkExtension = () => {
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        setExtensionInstalled(false);
        return;
      }
      try {
        chrome.runtime.sendMessage(
          { action: 'getState' },
          (response: any) => {
            if (chrome.runtime.lastError) {
              setExtensionInstalled(false);
            } else {
              setExtensionInstalled(!!response?.state?.isConnected);
            }
          }
        );
      } catch {
        setExtensionInstalled(false);
      }
    };
    checkExtension();
    const interval = setInterval(checkExtension, 5000);
    return () => clearInterval(interval);
  }, []);

  // Polling de status do job
  const [pollJobId, setPollJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!pollJobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await accountFetch(`/api/v1/jobs/${encodeURIComponent(pollJobId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const job = data.data || data;
        setCollectedCount(job.total_collected || 0);
        if (job.status !== 'running') {
          setIsCollecting(false);
          setPollJobId(null);
          clearInterval(interval);
        }
      } catch {
        // ignorar erros de polling
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [pollJobId]);

  const createJob = async () => {
    if (!segment.trim() || !location.trim()) return;
    setIsCreating(true);
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
      setPollJobId(data.jobId || data.id);
    } catch (err: any) {
      setMessage(err instanceof Error ? err.message : 'Erro ao criar job.');
      setMessageType('error');
    } finally {
      setIsCreating(false);
    }
  };

  const startCollection = () => {
    if (!extensionInstalled) {
      const url = 'https://chromewebstore.google.com/';
      window.open(url, '_blank');
      return;
    }
    // Notificar o background script da extensão para iniciar coleta
    chrome.runtime.sendMessage(
      { action: 'startScraping', job: { jobId, segment, location, limit } },
      (response: any) => {
        if (chrome.runtime.lastError || !response?.success) {
          setMessage('Extensão não respondeu. Certifique-se de que ela está instalada e conectada.');
          setMessageType('error');
          return;
        }
        setIsCollecting(true);
      }
    );
  };

  const stopCollection = () => {
    chrome.runtime.sendMessage({ action: 'stopScraping' });
    setIsCollecting(false);
    setPollJobId(null);
  };

  const openMaps = () => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(`${segment} ${location}`)}`;
    window.open(url, '_blank');
  };

  const reset = () => {
    setJobId('');
    setIsCollecting(false);
    setCollectedCount(0);
    setPollJobId(null);
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="bg-[#0b1429] border border-[#17274f] rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Puzzle className="w-6 h-6 text-blue-400" />
          <h2 className="text-xl font-bold text-white">Extensão do Navegador</h2>
        </div>
        <p className="text-slate-300 text-sm mb-6">
          A extensão do MapScrape coleta estabelecimentos do Google Maps diretamente
          no seu navegador, sem necessidade de infraestrutura de browser remoto.
        </p>

        {/* Status da extensão */}
        <div className={`p-3 rounded-xl border flex items-center gap-3 mb-6 ${
          extensionInstalled === null
            ? 'bg-[#070e20] border-[#1d3162] text-slate-400'
            : extensionInstalled
              ? 'bg-green-900/20 border-green-500/30 text-green-300'
              : 'bg-rose-900/20 border-rose-500/30 text-rose-300'
        }`}>
          {extensionInstalled === null ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : extensionInstalled ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            {extensionInstalled === null
              ? 'Verificando extensão...'
              : extensionInstalled
                ? 'Extensão instalada e conectada'
                : 'Extensão não encontrada'}
          </span>
          {extensionInstalled === false && (
            <button
              onClick={() => {
                const url = 'https://chromewebstore.google.com/';
                window.open(url, '_blank');
              }}
              className="ml-auto text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Instalar extensão
            </button>
          )}
        </div>

        {extensionInstalled === false && (
          <div className="p-4 rounded-xl bg-[#081024] border border-[#17274f] mb-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Como instalar:</h3>
            <ol className="text-sm text-slate-300 space-y-2 ml-4 list-decimal">
              <li>Acesse a <strong>Chrome Web Store</strong> e procure por "MapScrape"</li>
              <li>Clique em <strong>Adicionar ao Chrome</strong></li>
              <li>Faça login no MapScrape no seu navegador</li>
              <li>Volte aqui e configure sua coleta</li>
            </ol>
          </div>
        )}

        {extensionInstalled !== false && (
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
                  <option value="100">100</option>
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
              <span>{isCreating ? 'Criando job...' : 'Criar Job (Extensão)'}</span>
            </button>
          </form>
        )}

        {jobId && extensionInstalled && (
          <div className="mt-6 p-4 rounded-xl bg-[#081024] border border-[#17274f] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Job ID:</span>
              <code className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded">{jobId}</code>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={startCollection}
                disabled={isCollecting}
                className="flex-1 py-3 bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50 border border-blue-500/30 rounded-xl text-blue-300 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span>Iniciar Coleta na Extensão</span>
              </button>
              <button
                onClick={openMaps}
                className="flex-1 py-3 bg-slate-700/50 hover:bg-slate-600 border border-slate-500 rounded-xl text-slate-200 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir Google Maps</span>
              </button>
              <button
                onClick={stopCollection}
                disabled={!isCollecting}
                className="flex-1 py-3 bg-red-950/60 hover:bg-red-900/80 disabled:opacity-50 border border-red-700/50 rounded-xl text-red-300 text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Square className="w-4 h-4" />
                <span>Parar</span>
              </button>
            </div>
            <div className="bg-[#070e20] border border-[#1d3162] rounded-xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Status:</h3>
              <div className="space-y-1 text-sm text-slate-300">
                <div className="flex justify-between">
                  <span>Coletados:</span>
                  <span className="font-mono text-blue-400">{collectedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Limite:</span>
                  <span>{limit}</span>
                </div>
              </div>
            </div>
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
