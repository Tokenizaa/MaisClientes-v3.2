import React, { useState, useEffect } from 'react';
import { KeyRound, RefreshCw, Trash2, Globe, Cpu, CheckCircle2, ShieldCheck, Server, Save, ExternalLink } from 'lucide-react';


type Credential = { id: string; consumer_name: string; consumer_project: string; status: string };
type Issued = { credentialId: string; apiKey: string; consumerName: string; consumerProject: string };

export const CredentialsScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [items, setItems] = useState<Credential[]>([]);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);


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

  const refresh = async () => {
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

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao emitir credencial');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm('Revogar esta chave de API?')) return;
    setError('');
    try {
      await call('/api/v1/provisioning/credentials/' + encodeURIComponent(id), 'DELETE');
      setItems((v) => v.map((x) => (x.id === id ? { ...x, status: 'revoked' } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao revogar credencial');
    }
  };

  const rotate = async (id: string) => {
    if (!window.confirm('Rotacionar a chave? A chave anterior será revogada.')) return;
    setError('');
    setIssued(null);
    try {
      const d = await call(
        '/api/v1/provisioning/credentials/' + encodeURIComponent(id) + '/rotate',
        'POST'
      );
      setIssued(d.data);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao rotacionar credencial');
    }
  };


  return (
    <div className="mx-auto max-w-6xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header className="border-b border-zinc-800 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Server className="w-3.5 h-3.5" />
          <span>Infraestrutura e Acesso</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
          Credenciais & Motor de Raspagem Real
        </h1>
        <p className="mt-2 text-base text-zinc-400 max-w-3xl leading-relaxed">
          Gerencie o motor de execução real (Puppeteer Headless ou Cloudflare Browser Rendering) e controle chaves de integração para projetos consumidores.
        </p>
      </header>

      {/* API Consumer Keys Section */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-6 sm:p-7 space-y-6 shadow-xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Chaves de API (Projetos Consumidores)</h2>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Emita chaves no formato <code className="text-emerald-400 font-mono">msk_live_...</code> para consultar e sincronizar coletas externamente.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => void refresh()}
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
        <form onSubmit={(e) => void create(e)} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
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
                        onClick={() => void rotate(item.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-850 hover:bg-zinc-750 px-3 py-1.5 text-xs text-zinc-200 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Rotacionar
                      </button>
                      <button
                        type="button"
                        onClick={() => void revoke(item.id)}
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