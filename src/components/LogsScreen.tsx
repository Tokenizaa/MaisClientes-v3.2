import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Search, AlertCircle, AlertTriangle, Info, Bug, ChevronDown, ChevronUp, ClipboardCopy, Check, Copy } from 'lucide-react';

type AuditLog = {
  id: string;
  created_at: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  event: string;
  message: string;
  job_id: string;
  metadata: string;
};

const levelLabels: Record<string, string> = { debug: 'Debug', info: 'Info', warn: 'Aviso', error: 'Erro' };
const levelClasses: Record<string, string> = {
  debug: 'bg-zinc-800 text-zinc-300 border border-zinc-700',
  info: 'bg-blue-500/10 text-blue-300 border border-blue-500/30',
  warn: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
  error: 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
};

export const LogsScreen: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [jobId, setJobId] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = window.sessionStorage.getItem('mapscrape_session_token');
      const params = new URLSearchParams({ limit: '100' });
      if (level) params.set('level', level);
      if (category) params.set('category', category);
      if (query.trim()) params.set('query', query.trim());
      if (jobId.trim()) params.set('jobId', jobId.trim());
      const response = await fetch(`/api/v1/logs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Não foi possível carregar os logs.');
      const data = await response.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      setError(err?.message || 'Falha ao consultar os logs.');
    } finally {
      setLoading(false);
    }
  }, [level, category, query, jobId]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const downloadLogs = async () => {
    try {
      const token = window.sessionStorage.getItem('mapscrape_session_token');
      const params = new URLSearchParams();
      if (level) params.set('level', level);
      if (category) params.set('category', category);
      if (query.trim()) params.set('query', query.trim());
      if (jobId.trim()) params.set('jobId', jobId.trim());
      const res = await fetch(`/api/v1/logs/export?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Falha ao exportar logs.');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mapscrape-audit-${new Date().toISOString().slice(0, 10)}.jsonl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err?.message || 'Falha ao exportar logs.');
    }
  };

  const formatLogForCopy = (log: AuditLog) => {
    let metadata = log.metadata || '{}';
    try { metadata = JSON.stringify(JSON.parse(metadata), null, 2); } catch {}
    return [
      `Data: ${formatDate(log.created_at)}`,
      `Nível: ${levelLabels[log.level] || log.level}`,
      `Categoria: ${log.category}`,
      `Evento: ${log.event}`,
      `Mensagem: ${log.message}`,
      log.job_id ? `Job: ${log.job_id}` : '',
      `ID: ${log.id}`,
      `Metadados: ${metadata}`,
    ].filter(Boolean).join('\n');
  };

  const copyText = async (text: string, id: string | null = null) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopyFeedback(id ? 'Log copiado.' : 'Logs copiados.');
      window.setTimeout(() => {
        setCopiedId((current) => current === id ? null : current);
        setCopyFeedback('');
      }, 1800);
    } catch {
      setError('Não foi possível copiar. Verifique a permissão da área de transferência do navegador.');
    }
  };

  const visibleSelectedLogs = logs.filter((log) => selectedIds.includes(log.id));
  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const toggleAllVisible = () => {
    const allVisibleSelected = logs.length > 0 && logs.every((log) => selectedIds.includes(log.id));
    setSelectedIds((current) => allVisibleSelected
      ? current.filter((id) => !logs.some((log) => log.id === id))
      : Array.from(new Set([...current, ...logs.map((log) => log.id)])));
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
  };

  const iconForLevel = (value: string) => {
    if (value === 'error') return <AlertCircle className="w-4 h-4" />;
    if (value === 'warn') return <AlertTriangle className="w-4 h-4" />;
    if (value === 'debug') return <Bug className="w-4 h-4" />;
    return <Info className="w-4 h-4" />;
  };

  return (
    <div className="max-w-6xl mx-auto py-2 sm:py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-zinc-850 pb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400">
            Diagnóstico do Sistema
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-100">Logs e Auditoria</h1>
          <p className="mt-2 text-base text-zinc-400 max-w-2xl">Eventos reais da coleta, persistidos no Supabase para diagnosticar cada etapa do Google Maps.</p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={() => void loadLogs()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-750 bg-zinc-900 px-3.5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-zinc-400'}`} /> Atualizar
          </button>
          <button
            onClick={downloadLogs}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer shadow-sm shadow-blue-950/40"
          >
            <Download className="w-4 h-4" /> Baixar JSONL
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_180px] gap-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl backdrop-blur-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar mensagem, evento, URL ou ID da pesquisa..."
            className="w-full rounded-xl border border-zinc-750 bg-zinc-950 py-2.5 pl-10 pr-3 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-xl border border-zinc-750 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 outline-none focus:border-blue-500"
        >
          <option value="" className="bg-zinc-900 text-zinc-100">Todos os níveis</option>
          <option value="error" className="bg-zinc-900 text-zinc-100">Erros</option>
          <option value="warn" className="bg-zinc-900 text-zinc-100">Avisos</option>
          <option value="info" className="bg-zinc-900 text-zinc-100">Informações</option>
          <option value="debug" className="bg-zinc-900 text-zinc-100">Debug</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-xl border border-zinc-750 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-200 outline-none focus:border-emerald-500"
        >
          <option value="" className="bg-zinc-900 text-zinc-100">Todas as categorias</option>
          <option value="scraper" className="bg-zinc-900 text-zinc-100">Raspagem</option>
          <option value="server" className="bg-zinc-900 text-zinc-100">Servidor</option>
          <option value="api" className="bg-zinc-900 text-zinc-100">API</option>
        </select>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-4 sm:flex-row sm:items-end sm:justify-between shadow-xl backdrop-blur-sm">
        <label className="flex-1 text-xs font-semibold text-zinc-400">
          ID da pesquisa (opcional)
          <input
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="job_..."
            className="mt-1.5 block w-full rounded-xl border border-zinc-750 bg-zinc-950 px-3.5 py-2.5 text-sm font-mono text-zinc-100 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { if (jobId.trim()) window.location.href = `/api/v1/reports/${encodeURIComponent(jobId.trim())}`; }}
            disabled={!jobId.trim()}
            className="rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-zinc-850 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
          >
            Baixar JSON
          </button>
          <button
            onClick={() => { if (jobId.trim()) window.location.href = `/api/v1/reports/${encodeURIComponent(jobId.trim())}/pdf`; }}
            disabled={!jobId.trim()}
            className="rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors cursor-pointer"
          >
            Baixar PDF
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono">
          <span>{total.toLocaleString('pt-BR')} eventos encontrados</span>
          <span>Exibindo até 100 eventos por página</span>
          <span>{visibleSelectedLogs.length} selecionado(s)</span>
          {copyFeedback && <span className="text-emerald-400">{copyFeedback}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={toggleAllVisible} disabled={!logs.length} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
            {logs.length > 0 && logs.every((log) => selectedIds.includes(log.id)) ? 'Desmarcar exibidos' : 'Selecionar exibidos'}
          </button>
          <button onClick={() => void copyText(visibleSelectedLogs.map(formatLogForCopy).join('\n\n'))} disabled={!visibleSelectedLogs.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
            <ClipboardCopy className="h-3.5 w-3.5" /> Copiar selecionados
          </button>
          <button onClick={() => void copyText(logs.map(formatLogForCopy).join('\n\n'))} disabled={!logs.length} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
            <Copy className="h-3.5 w-3.5" /> Copiar exibidos
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-300">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/90 shadow-xl">
        {loading && logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-zinc-400">Consultando auditoria no Supabase...</div>
        ) : logs.length === 0 ? (
          <div className="p-16 text-center text-sm text-zinc-400">Nenhum evento encontrado para estes filtros.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {logs.map((log) => {
              const isExpanded = expanded === log.id;
              return (
                <div key={log.id} className="px-5 py-4 hover:bg-zinc-850/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar log ${log.event}`}
                      checked={selectedIds.includes(log.id)}
                      onChange={() => toggleSelected(log.id)}
                      className="mt-2 h-4 w-4 shrink-0 accent-blue-500 cursor-pointer"
                    />
                    <button onClick={() => setExpanded(isExpanded ? null : log.id)} className="flex min-w-0 flex-1 items-start gap-3.5 text-left cursor-pointer">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${levelClasses[log.level] || levelClasses.info}`}>
                      {iconForLevel(log.level)} {levelLabels[log.level] || log.level}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-sm font-bold text-zinc-100">{log.event}</span>
                        <span className="text-xs font-mono text-zinc-500">[{log.category}]</span>
                      </span>
                      <span className="mt-1 block text-sm text-zinc-300 break-words leading-relaxed">{log.message}</span>
                      <span className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-zinc-500 font-mono">
                        <span>{formatDate(log.created_at)}</span>
                        {log.job_id && <span>job: {log.job_id}</span>}
                      </span>
                    </span>
                    {isExpanded ? <ChevronUp className="mt-1 h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />}
                    </button>
                    <button
                      onClick={() => void copyText(formatLogForCopy(log), log.id)}
                      title="Copiar este log"
                      aria-label="Copiar este log"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-2 text-xs font-semibold text-zinc-300 hover:border-blue-500 hover:text-white"
                    >
                      {copiedId === log.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{copiedId === log.id ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 ml-0 sm:ml-24 rounded-xl bg-zinc-950 p-4 border border-zinc-800 text-xs text-zinc-300 font-mono">
                      <div className="mb-2 text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Metadados técnicos</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words">{(() => { try { return JSON.stringify(JSON.parse(log.metadata || '{}'), null, 2); } catch { return log.metadata || '{}'; } })()}</pre>
                      <div className="mt-3 text-[11px] text-zinc-500">ID do evento: {log.id}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed px-1">O download gera um arquivo .jsonl, um evento JSON por linha. Ideal para auditoria técnica detalhada.</p>
    </div>
  );
};
