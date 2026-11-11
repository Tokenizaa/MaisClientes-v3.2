import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  RefreshCw,
  Trash2,
  Globe,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Server,
  Save,
  ExternalLink,
  Activity,
  Eye,
  EyeOff,
  Cloud,
} from 'lucide-react';

type Credential = { id: string; consumer_name: string; consumer_project: string; status: string };
type Issued = { credentialId: string; apiKey: string; consumerName: string; consumerProject: string };

interface ScraperSettingsState {
  engine: string;
  hasRemoteEndpoint: boolean;
  hasToken: boolean;
  tokenMasked?: string;
  description: string;
  status: string;
}

export const CredentialsScreen: React.FC = () => {
  // Consumer Keys state
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [items, setItems] = useState<Credential[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Scraper / Browserless state
  const [settings, setSettings] = useState<ScraperSettingsState | null>(null);
  const [browserlessToken, setBrowserlessToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test connection state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    version?: string;
    latencyMs?: number;
    engine?: string;
    error?: string;
  } | null>(null);

  const call = async (path: string, method = 'GET', body?: unknown) => {
    const sessionToken = window.sessionStorage.getItem('mapscrape_session_token') || '';
    const r = await fetch(path, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(sessionToken ? { Authorization: 'Bearer ' + sessionToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || d.error || 'HTTP ' + r.status);
    return d;
  };

  const refreshCredentials = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await call('/api/v1/provisioning/credentials');
      setItems(d.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao consultar credenciais');
    } finally {
      setBusy(false);
    }
  };

  const loadScraperSettings = async () => {
    try {
      const d = await call('/api/v1/scraper/settings');
      setSettings(d);
    } catch (e) {
      console.warn('Falha ao carregar configurações de raspagem:', e);
    }
  };

  useEffect(() => {
    void refreshCredentials();
    void loadScraperSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);
    setTestResult(null);

    try {
      const payload: Record<string, string> = {};
      if (browserlessToken.trim()) {
        payload.browserlessToken = browserlessToken.trim();
      }

      await call('/api/v1/scraper/settings', 'POST', payload);
      setSettingsMessage({ type: 'success', text: 'Token do Browserless salvo com sucesso!' });
      setBrowserlessToken('');
      await loadScraperSettings();
    } catch (e) {
      setSettingsMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Falha ao salvar configurações',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const payload: Record<string, string> = {};
      if (browserlessToken.trim()) {
        payload.token = browserlessToken.trim();
      }

      const res = await call('/api/v1/scraper/test-connection', 'POST', payload);
      setTestResult(res);
    } catch (e) {
      setTestResult({
        ok: false,
        error: e instanceof Error ? e.message : 'Erro ao testar conexão',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const createCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setIssued(null);
    try {
      const d = await call('/api/v1/provisioning/credentials', 'POST', {
        consumerName: name,
        consumerProject: project,
      });
      setIssued(d.data);
      setName('');
      await refreshCredentials();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao emitir credencial');
    } finally {
      setBusy(false);
    }
  };

  const revokeCredential = async (id: string) => {
    if (!window.confirm('Revogar esta chave de API?')) return;
    setError('');
    try {
      await call('/api/v1/provisioning/credentials/' + encodeURIComponent(id), 'DELETE');
      setItems((v) => v.map((x) => (x.id === id ? { ...x, status: 'revoked' } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao revogar credencial');
    }
  };

  const rotateCredential = async (id: string) => {
    if (!window.confirm('Rotacionar a chave? A chave anterior será revogada.')) return;
    setError('');
    setIssued(null);
    try {
      const d = await call(
        '/api/v1/provisioning/credentials/' + encodeURIComponent(id) + '/rotate',
        'POST'
      );
      setIssued(d.data);
      await refreshCredentials();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao rotacionar credencial');
    }
  };

  const isBrowserlessActive = settings?.engine === 'browserless' || Boolean(settings?.hasToken);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header className="border-b border-zinc-800 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Server className="w-3.5 h-3.5" />
          <span>Infraestrutura e Acesso</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
          Credenciais & Motor Browserless
        </h1>
        <p className="mt-2 text-base text-zinc-400 max-w-3xl leading-relaxed">
          O MaisClientes executa as raspagens do Google Maps diretamente na nuvem via <strong>Browserless.io</strong>, compatível com a Vercel e produção sem sobrecarregar sua máquina local.
        </p>
      </header>

      {/* SECTION 1: BROWSERLESS ENGINE (SIMPLE & DIRECT) */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-7 space-y-6 shadow-xl shadow-black/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-zinc-100">Motor de Raspagem Browserless</h2>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isBrowserlessActive
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {isBrowserlessActive ? 'Browserless Ativo' : 'Aguardando Token'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1">
              Conexão WebSocket direta com a nuvem Browserless (<code>wss://production-sfo.browserless.io</code>).
            </p>
          </div>

          <a
            href="https://browserless.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
          >
            <span>Obter chave no Browserless.io</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Status Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
              Modo de Execução
            </span>
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-base">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <span>Browserless Cloud</span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
              Status do Token
            </span>
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-base font-mono">
              <ShieldCheck className={`w-4 h-4 ${settings?.hasToken ? 'text-emerald-400' : 'text-zinc-500'}`} />
              <span>{settings?.hasToken ? settings.tokenMasked || 'Configurado' : 'Não informado'}</span>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <span className="text-xs uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
              Ambiente Vercel
            </span>
            <div className="flex items-center gap-2 text-zinc-100 font-bold text-xs font-mono">
              <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span>100% Serverless Ready</span>
            </div>
          </div>
        </div>

        {/* Browserless Form */}
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Token de API Browserless (BROWSERLESS_TOKEN)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={browserlessToken}
                onChange={(e) => setBrowserlessToken(e.target.value)}
                placeholder={settings?.hasToken ? `Token atual: ${settings.tokenMasked} (digite para alterar)` : 'Ex: 1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'}
                className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 pr-10 text-sm text-zinc-100 outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                title={showToken ? 'Ocultar' : 'Exibir'}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Na <strong>Vercel</strong>, você também pode adicionar <code>BROWSERLESS_TOKEN</code> diretamente nas variáveis de ambiente do projeto (Project Settings → Environment Variables).
            </p>
          </div>

          {settingsMessage && (
            <div
              className={`p-3.5 rounded-xl border text-sm flex items-center gap-2 ${
                settingsMessage.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              }`}
            >
              {settingsMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{settingsMessage.text}</span>
            </div>
          )}

          {/* Test connection result banner */}
          {testResult && (
            <div
              className={`p-4 rounded-xl border space-y-1.5 ${
                testResult.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {testResult.ok ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Conexão remota bem-sucedida com o cluster Browserless!</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Falha na conexão com o Browserless</span>
                  </>
                )}
              </div>
              {testResult.ok ? (
                <p className="text-xs text-zinc-300">
                  Chromium versão: <span className="font-mono font-bold text-white">{testResult.version}</span> · Latência: <span className="font-mono font-bold text-emerald-400">{testResult.latencyMs}ms</span>
                </p>
              ) : (
                <p className="text-xs text-rose-300 break-all">
                  Erro: {testResult.error}
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingSettings || !browserlessToken.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className={`h-4 w-4 ${savingSettings ? 'animate-spin' : ''}`} />
                <span>Salvar Token</span>
              </button>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-750 bg-zinc-950 hover:bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Activity className={`h-4 w-4 text-emerald-400 ${testingConnection ? 'animate-spin' : ''}`} />
                <span>{testingConnection ? 'Testando Conexão...' : 'Testar Conexão Browserless'}</span>
              </button>
            </div>

            <p className="text-xs text-zinc-500">
              Todas as coletas no Google Maps usarão este navegador na nuvem.
            </p>
          </div>
        </form>
      </section>

      {/* SECTION 2: API CONSUMER KEYS */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-7 space-y-6 shadow-xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Chaves de API (Projetos Consumidores)</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Emita chaves no formato <code className="text-emerald-400 font-mono">msk_live_...</code> para consultar e sincronizar coletas externamente via REST API.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => void refreshCredentials()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-750 bg-zinc-950 hover:bg-zinc-800 px-4 py-2 text-xs sm:text-sm text-zinc-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {error}
          </p>
        )}

        {issued && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
              <KeyRound className="w-4 h-4" />
              <span>Chave de API gerada com sucesso (exibida apenas uma vez)</span>
            </div>
            <p className="text-xs text-zinc-300 font-medium">
              Cliente: <span className="text-white font-bold">{issued.consumerName}</span> · Projeto: <span className="text-white font-bold">{issued.consumerProject}</span>
            </p>
            <div className="flex items-center gap-2">
              <code className="block flex-1 break-all rounded-xl bg-zinc-950 p-3 text-xs sm:text-sm font-mono text-emerald-400 border border-zinc-800">
                {issued.apiKey}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(issued.apiKey)}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-3 text-xs sm:text-sm font-bold text-zinc-950 transition-colors cursor-pointer shrink-0"
              >
                Copiar Chave
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Guarde esta chave em seu ambiente seguro. O hash SHA-256 é armazenado internamente para verificação.
            </p>
          </div>
        )}

        {/* New Integration Form */}
        <form onSubmit={(e) => void createCredential(e)} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Nome do Cliente / Empresa
            </label>
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Agência de Prospecção"
              className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Projeto Vinculado
            </label>
            <input
              required
              maxLength={200}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="Ex: Campanha São Paulo 2026"
              className="w-full rounded-xl border border-zinc-750 bg-zinc-950 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim() || !project.trim() || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 h-[42px]"
          >
            <KeyRound className="h-4 w-4" />
            <span>Gerar Chave</span>
          </button>
        </form>

        {/* Credentials Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="border-b border-zinc-800 p-4 font-semibold text-sm text-zinc-300">
            Chaves Emitidas ({items.length})
          </div>

          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Nenhuma chave de integração externa emitida ainda.
            </p>
          ) : (
            <div className="divide-y divide-zinc-800/80">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-zinc-900/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-zinc-100 text-sm">{item.consumer_name}</p>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          item.status === 'active'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                        }`}
                      >
                        {item.status === 'active' ? 'Ativa' : 'Revogada'}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-xs text-zinc-400 font-mono">
                      {item.consumer_project} · {item.id}
                    </p>
                  </div>

                  {item.status === 'active' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void rotateCredential(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-850 hover:bg-zinc-750 px-3 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Rotacionar
                      </button>
                      <button
                        type="button"
                        onClick={() => void revokeCredential(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revogar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};