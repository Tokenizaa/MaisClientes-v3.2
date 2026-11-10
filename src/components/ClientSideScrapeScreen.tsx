import React, { useEffect, useMemo, useState } from 'react';
import {
  Play,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Globe,
  ClipboardList,
  BookmarkPlus,
  Square,
} from 'lucide-react';

function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: 'no-store' });
}

interface ClientSideScrapeProps {
  onGoToResults?: () => void;
  initialSegment?: string;
  initialLocation?: string;
}

type JobStatus = 'running' | 'completed' | 'failed' | 'stopped';

export const ClientSideScrapeScreen: React.FC<ClientSideScrapeProps> = ({
  onGoToResults,
  initialSegment = '',
  initialLocation = '',
}) => {
  const [segment, setSegment] = useState(initialSegment);
  const [location, setLocation] = useState(initialLocation);
  const [limit, setLimit] = useState(20);
  const [jobId, setJobId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectedCount, setCollectedCount] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>('info');
  const [copied, setCopied] = useState(false);

  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token') ||
    '';
  const apiBase = window.location.origin;

  const bookmarkletUrl = useMemo(() => {
    const config = JSON.stringify({ apiBase, token });
    const script = `(async()=>{const C=${config};const wait=(ms)=>new Promise(r=>setTimeout(r,ms));const seen=new Set();const results=[];const getCard=(link)=>{let node=link;for(let i=0;i<7&&node;i++,node=node.parentElement){const links=node.querySelectorAll('a[href*="/maps/place/"]');if(links.length===1&&((node.innerText||'').trim().length>8))return node;}return link.parentElement||link;};const extract=(link)=>{const card=getCard(link);const text=(card.innerText||'').trim();const lines=text.split(/\\n+/).map(x=>x.trim()).filter(Boolean);const href=new URL(link.getAttribute('href'),location.origin).href;const name=(link.getAttribute('aria-label')||link.innerText||lines[0]||'').trim();const ratingMatch=(card.getAttribute('aria-label')||text).match(/([0-5][.,]\\d)\\s*(?:estrelas?|stars?)/i)||text.match(/(?:^|\\s)([0-5][.,]\\d)(?:\\s|$)/);const reviewsMatch=text.match(/([\\d.,]+)\\s*(?:avaliações|avaliação|reviews?)/i);const phoneMatch=text.match(/(?:\\+?55\\s*)?(?:\\(?\\d{2}\\)?\\s*)?9?\\d{4}[\\s-]?\\d{4}/);const websiteLink=Array.from(card.querySelectorAll('a[href^="http"]')).find(a=>!a.href.includes('google.com/maps'));return{id:'place_'+Math.random().toString(36).slice(2)+Date.now(),name:name||lines[0]||'Estabelecimento',address:lines.find(x=>/(rua|avenida|av\\.?|rodovia|estrada|praça|travessa|alameda)/i.test(x))||'',phone:phoneMatch?phoneMatch[0].trim():'',website:websiteLink?websiteLink.href:'',rating:ratingMatch?ratingMatch[1].replace(',','.').trim():'',review_count:reviewsMatch?reviewsMatch[1]:'',source_url:href,maps_url:href};};const feed=document.querySelector('[role="feed"]');if(!feed){alert('Abra uma busca no Google Maps e aguarde os resultados antes de executar este favorito.');return;}for(let round=0;round<20&&results.length<100;round++){const links=Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'));for(const link of links){if(results.length>=100)break;const href=link.getAttribute('href');if(!href||seen.has(href))continue;seen.add(href);const item=extract(link);if(item.name&&item.name.length>1)results.push(item);}if(results.length>=100)break;feed.scrollBy(0,Math.max(650,feed.clientHeight*0.8));await wait(1400);}try{await fetch(C.apiBase+'/api/v1/scrape/collect',{method:'POST',mode:'no-cors',body:new URLSearchParams({token:C.token,payload:JSON.stringify({places:results})})});console.log('[MaisClientes] Envio iniciado. Registros capturados:',results.length);alert('Coleta enviada: '+results.length+' estabelecimento(s). Volte ao MaisClientes para acompanhar a confirmação.');}catch(error){console.error('[MaisClientes] Falha no envio:',error);alert('Não foi possível enviar a coleta. Verifique sua conexão e tente novamente.');}})();`;
    return `javascript:${encodeURIComponent(script)}`;
  }, [apiBase, token]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let interval: number | undefined;

    const refreshJob = async () => {
      try {
        const response = await accountFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
        if (!response.ok) throw new Error(`Falha ao consultar coleta (HTTP ${response.status}).`);
        const payload = await response.json();
        const job = payload.data || payload;
        if (!active) return;
        setCollectedCount(Number(job.total_collected || 0));
        if (['completed', 'failed', 'stopped'].includes(job.status as JobStatus)) {
          if (interval !== undefined) window.clearInterval(interval);
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
    interval = window.setInterval(() => void refreshJob(), 2000);
    return () => {
      active = false;
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [jobId]);

  const createJob = async () => {
    if (!segment.trim() || !location.trim()) {
      setMessage('Informe o segmento e a localização.');
      setMessageType('error');
      return;
    }
    setIsCreating(true);
    setMessage('Preparando a coleta...');
    try {
      const response = await accountFetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segment: segment.trim(),
          location: location.trim(),
          limit,
          projectName: `${segment.trim()} · ${location.trim()}`,
          categoryName: segment.trim(),
          source: 'browser_client',
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha ao criar a coleta.');
      const id = payload.jobId || payload.id;
      if (!id) throw new Error('A API não retornou o identificador da coleta.');
      setJobId(id);
      setCollectedCount(0);
      setIsCollecting(true);
      setMessage('Coleta preparada. Abra o Google Maps e clique no favorito MaisClientes.');
      setMessageType('info');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao preparar a coleta.');
      setMessageType('error');
    } finally {
      setIsCreating(false);
    }
  };

  const openMaps = () => {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(`${segment} ${location}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletUrl);
      setCopied(true);
      setMessage('Favorito copiado. Se preferir, adicione-o manualmente aos favoritos do navegador.');
      setMessageType('success');
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage('Não foi possível copiar automaticamente. Arraste o link para a barra de favoritos.');
      setMessageType('error');
    }
  };

  const stopJob = async () => {
    if (!jobId) return;
    try {
      const response = await accountFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/stop`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível interromper a coleta.');
      setIsCollecting(false);
      setMessage('Coleta interrompida.');
      setMessageType('info');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao interromper a coleta.');
      setMessageType('error');
    }
  };

  const reset = () => {
    setJobId('');
    setIsCollecting(false);
    setCollectedCount(0);
    setMessage('');
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <section className="bg-[#0b1429] border border-[#17274f] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        <header className="flex items-center gap-3">
          <Globe className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Nova coleta</h1>
            <p className="text-sm text-slate-400">Usa o Google Maps aberto no seu próprio navegador.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-200">Segmento</span>
            <input value={segment} onChange={e => setSegment(e.target.value)} disabled={isCollecting} placeholder="Ex.: clínicas odontológicas" className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50" />
          </label>
          <label className="space-y-2">
            <span className="block text-sm font-semibold text-slate-200">Localização</span>
            <input value={location} onChange={e => setLocation(e.target.value)} disabled={isCollecting} placeholder="Ex.: Porto Alegre, RS" className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50" />
          </label>
          <label className="space-y-2 sm:max-w-xs">
            <span className="block text-sm font-semibold text-slate-200">Limite de estabelecimentos</span>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} disabled={isCollecting} className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50">
              {[10, 20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        {!jobId ? (
          <button type="button" onClick={createJob} disabled={isCreating || !segment.trim() || !location.trim()} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isCreating ? 'Preparando...' : 'Preparar coleta'}
          </button>
        ) : (
          <div className="rounded-xl border border-[#1d3162] bg-[#081024] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-200">Coleta preparada</span>
              <code className="text-xs text-blue-300">{jobId}</code>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={openMaps} className="flex-1 min-w-[180px] py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold flex items-center justify-center gap-2">
                <ExternalLink className="w-4 h-4" /> Abrir busca no Google Maps
              </button>
              <button type="button" onClick={stopJob} disabled={!isCollecting} className="py-3 px-4 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 text-sm font-semibold flex items-center gap-2">
                <Square className="w-4 h-4" /> Interromper
              </button>
            </div>
            <div className="rounded-xl border border-[#24365f] bg-[#070e20] p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BookmarkPlus className="w-4 h-4 text-blue-300" /> Configure uma vez o favorito de coleta
              </div>
              <p className="text-sm text-slate-300">Arraste o link abaixo para a barra de favoritos uma única vez. O mesmo favorito funciona nas próximas coletas; não instala extensão nem usa o console.</p>
              <div className="flex flex-wrap items-center gap-3">
                <a href="#" draggable onClick={event => event.preventDefault()} onDragStart={event => {
                  event.dataTransfer.setData('text/uri-list', bookmarkletUrl);
                  event.dataTransfer.setData('text/plain', bookmarkletUrl);
                  event.dataTransfer.effectAllowed = 'copy';
                }} className="inline-flex items-center gap-2 rounded-lg border border-blue-400/50 bg-blue-600/20 px-4 py-2.5 text-sm font-bold text-blue-200 cursor-grab">
                  <BookmarkPlus className="w-4 h-4" /> MaisClientes — Coletar
                </a>
                <button type="button" onClick={copyBookmarklet} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2.5 text-sm text-slate-200 hover:bg-white/5">
                  <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar favorito'}
                </button>
              </div>
              <p className="text-xs text-slate-500">Se sair da plataforma ou trocar de conta, prepare uma nova coleta e atualize o favorito para renovar a autenticação.</p>
              <ol className="list-decimal ml-5 space-y-1.5 text-xs text-slate-400">
                <li>Se necessário, mostre a barra de favoritos com <strong>Ctrl + Shift + B</strong>.</li>
                <li>Arraste <strong>MaisClientes — Coletar</strong> para essa barra. Faça isso apenas uma vez por navegador.</li>
                <li>Abra a busca preparada no Google Maps e aguarde os resultados aparecerem.</li>
                <li>Clique no favorito <strong>MaisClientes — Coletar</strong>. Não precisa abrir o console nem instalar extensão.</li>
              </ol>
            </div>
            <div className="text-sm text-slate-300 flex items-center justify-between gap-3">
              <span>{isCollecting ? 'Aguardando envio do navegador…' : 'Coleta finalizada'}</span>
              <strong className="text-blue-300 tabular-nums">{collectedCount} salvos</strong>
            </div>
            {!isCollecting && (
              <button type="button" onClick={reset} className="text-sm text-blue-300 hover:text-white underline underline-offset-4">Preparar outra coleta</button>
            )}
          </div>
        )}

        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
            messageType === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-300'
              : messageType === 'error' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
              : 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
          }`}>
            {messageType === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {messageType === 'error' && <AlertTriangle className="w-4 h-4" />}
            {messageType === 'info' && <Loader2 className="w-4 h-4" />}
            <span>{message}</span>
          </div>
        )}
      </section>

      {collectedCount > 0 && onGoToResults && (
        <div className="flex justify-center">
          <button type="button" onClick={onGoToResults} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Ver resultados coletados
          </button>
        </div>
      )}
    </div>
  );
};
