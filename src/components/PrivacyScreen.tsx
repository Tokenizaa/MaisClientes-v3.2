import React, { useState } from 'react';
import { Download, Trash2, ShieldCheck, AlertTriangle, FileJson, UserRound } from 'lucide-react';
import { apiFetch } from '../utils/api';

export const PrivacyScreen: React.FC = () => {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const response = await apiFetch('/api/auth/export', { cache: 'no-store' });
      if (!response.ok) throw new Error('Falha ao exportar dados');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || `mapscrape-export-${Date.now()}.json`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setMessage({ text: 'Dados exportados com sucesso. O arquivo JSON contém todos os seus dados.', type: 'success' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao exportar dados.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('ATENÇÃO: Esta ação é irreversível. Todos os seus dados (projetos, coletas, leads, categorias, credenciais, oportunidades) serão excluídos permanentemente. Confirma?')) {
      return;
    }
    if (!window.confirm('Última confirmação: sua conta será excluída e não poderá ser recuperada. Tem certeza absoluta?')) {
      return;
    }
    setBusy('delete');
    setMessage(null);
    try {
      const response = await apiFetch('/api/auth/me', { method: 'DELETE', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Falha ao excluir conta');
      setMessage({ text: data.message || 'Conta excluída com sucesso.', type: 'success' });
      // Clear session and redirect to auth
      window.sessionStorage.removeItem('mapscrape_session_token');
      window.sessionStorage.removeItem('mapscrape_user');
      window.sessionStorage.removeItem('mapscrape_api_key');
      window.sessionStorage.removeItem('mapscrape_user_id');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao excluir conta.', type: 'error' });
      setBusy(null);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>LGPD & Dados Pessoais</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Privacidade e Seus Dados</h1>
        <p className="mt-2 text-sm text-slate-400 max-w-2xl">
          Exercite seus direitos conforme a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018).
          Seus dados são seus. Você controla o que fica e o que vai embora.
        </p>
      </header>

      {/* Rights Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-5 shadow-xl shadow-blue-950/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white">Portabilidade</h3>
              <p className="text-xs text-slate-400">Art. 18, V — Receba seus dados</p>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            Baixe um arquivo JSON completo com sua conta, projetos, coletas, leads, categorias,
            credenciais de API, oportunidades e análises de inteligência comercial.
          </p>
          <button
            type="button"
            onClick={handleExport}
            disabled={busy === 'export'}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 px-4 py-2.5 text-sm font-semibold text-emerald-300 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Download className={`h-4 w-4 ${busy === 'export' ? 'animate-spin' : ''}`} />
            <span>{busy === 'export' ? 'Preparando download…' : 'Exportar Meus Dados (JSON)'}</span>
          </button>
        </article>

        <article className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-5 shadow-xl shadow-blue-950/20 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-white">Exclusão</h3>
              <p className="text-xs text-slate-400">Art. 18, VI — Apague tudo</p>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            Exclua permanentemente sua conta e <strong>todos</strong> os dados associados:
            projetos, coletas, estabelecimentos, categorias, chaves de API, oportunidades e histórico.
            Ação irreversível.
          </p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={busy === 'delete'}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Trash2 className={`h-4 w-4 ${busy === 'delete' ? 'animate-spin' : ''}`} />
            <span>{busy === 'delete' ? 'Excluindo…' : 'Excluir Minha Conta'}</span>
          </button>
        </article>
      </div>

      {/* Data Retention & Processing Info */}
      <div className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-5 shadow-xl shadow-blue-950/20 space-y-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FileJson className="h-5 w-5 text-blue-400" />
          O que coletamos e por quanto tempo mantemos
        </h2>
        <dl className="space-y-3 text-sm text-slate-300 divide-y divide-[#17274f]">
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Dados de conta</dt>
            <dd>E-mail, nome, hash de senha, role. Mantidos enquanto a conta existir.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Projetos & Categorias</dt>
            <dd>Nomes, metadados de organização. Excluídos com a conta ou sob solicitação.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Coletas (Jobs) & Leads</dt>
            <dd>Dados públicos do Google Maps (nome, endereço, telefone, site, avaliações). Mantidos enquanto o projeto existir.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Web Intelligence</dt>
            <dd>Análise de sites institucionais (tecnologias, e-commerce, canais). Cache local; não compartilhado.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Oportunidades (Kanban)</dt>
            <dd>Estágio, valor, contatos, histórico de interações. Dados comerciais sensíveis — excluídos com a conta.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Credenciais de API</dt>
            <dd>Apenas hash SHA-256 da chave. Chave original exibida uma vez na criação. Revogação imediata disponível.</dd>
          </div>
          <div className="py-3 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
            <dt className="font-semibold text-slate-200">Logs de auditoria</dt>
            <dd>Eventos técnicos (início/fim de coleta, erros). Mantidos por 90 dias; anonimizados após.</dd>
          </div>
        </dl>
      </div>

      {/* Third Party & Rights */}
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-5 shadow-xl shadow-blue-950/20 space-y-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Compartilhamento com terceiros
          </h3>
          <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
            <li><strong>Supabase:</strong> Banco de dados e autenticação (processador de dados, EUA/BR).</li>
            <li><strong>Google (Gemini API):</strong> Análise de inteligência comercial via IA (apenas dados do site + Maps).</li>
            <li><strong>Browserless / Cloudflare:</strong> Navegador remoto para scraping (sem armazenamento de dados).</li>
            <li><strong>Nenhum dado</strong> é vendido, alugado ou compartilhado para marketing de terceiros.</li>
          </ul>
        </article>

        <article className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-5 shadow-xl shadow-blue-950/20 space-y-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Seus direitos (Art. 18 LGPD)
          </h3>
          <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
            <li>Confirmação da existência de tratamento</li>
            <li>Acesso aos dados (botão "Exportar Meus Dados")</li>
            <li>Correção de dados incompletos/inexatos (editar perfil)</li>
            <li>Anonimização, bloqueio ou eliminação desnecessários</li>
            <li>Portabilidade (JSON estruturado)</li>
            <li>Eliminação dos dados tratados com consentimento (botão "Excluir Minha Conta")</li>
            <li>Informação sobre compartilhamento</li>
            <li>Revogação do consentimento</li>
          </ul>
        </article>
      </div>

      {/* Notifications */}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-medium ${
            message.type === 'error'
              ? 'border-red-500/30 bg-red-950/40 text-red-300'
              : message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
              : 'border-blue-500/30 bg-blue-950/40 text-blue-200'
          }`}
        >
          {message.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />}
          {message.type === 'success' && <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />}
          {message.type === 'info' && <UserRound className="h-4 w-4 shrink-0 text-blue-400" />}
          <span className="flex-1">{message.text}</span>
        </div>
      )}

      {/* Contact DPO */}
      <div className="rounded-2xl border border-dashed border-[#1d3162] p-5 bg-[#070e20]/50 text-center space-y-2">
        <p className="text-sm text-slate-400">Dúvidas, requisições ou reclamações sobre proteção de dados:</p>
        <a
          href="mailto:privacidade@mapscrape.com"
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium text-sm"
        >
          <UserRound className="h-4 w-4" />
          <span>privacidade@mapscrape.com</span>
        </a>
        <p className="text-xs text-slate-500">Encarregado (DPO) — Resposta em até 15 dias corridos (Art. 18, §1º LGPD).</p>
      </div>
    </section>
  );
};