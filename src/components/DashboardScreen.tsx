import React from 'react';
import {
  Activity,
  ArrowRight,
  Database,
  CheckCircle2,
  FolderKanban,
  Search,
  Table2,
  ShieldCheck,
  TrendingUp,
  Radio,
  FileSpreadsheet,
  Globe,
  Phone,
  Compass,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';
import { ScreenTab } from './Sidebar';

interface Props {
  totalPlaces: number;
  jobs: ScrapeJob[];
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  onNavigate: (tab: ScreenTab) => void;
}

export const DashboardScreen: React.FC<Props> = ({
  totalPlaces,
  jobs,
  currentJob,
  isScraping,
  onNavigate,
}) => {
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const totalDuplicates = jobs.reduce((acc, j) => acc + (j.total_duplicates || 0), 0);
  const totalSearches = jobs.length;

  const metrics = [
    {
      label: 'Estabelecimentos Salvos',
      value: totalPlaces.toLocaleString('pt-BR'),
      subtext: 'Na base local de leads',
      icon: Database,
      accent: 'blue',
    },
    {
      label: 'Duplicidades Filtradas',
      value: totalDuplicates.toLocaleString('pt-BR'),
      subtext: 'Protegidas contra re-inserção',
      icon: ShieldCheck,
      accent: 'cyan',
    },
    {
      label: 'Coletas Concluídas',
      value: `${completed} de ${totalSearches}`,
      subtext: 'Execuções realizadas',
      icon: CheckCircle2,
      accent: 'indigo',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-0 sm:py-2">
      {/* Header */}
      <header className="border-b border-[#152347] pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 font-mono">
          <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          <span>Central de Inteligência Comercial</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          Painel Geral
        </h1>
        <p className="mt-2 max-w-2xl text-base text-slate-300">
          Acompanhe dados persistidos, integridade de deduplicação e o fluxo das pesquisas no Google Maps.
        </p>
      </header>

      {/* KPI Cards Row */}
      <section className="grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value, subtext, icon: Icon, accent }) => (
          <div
            key={label}
            className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-6 shadow-xl shadow-blue-950/20 hover:border-blue-500/30 transition-all space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
                {label}
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-3xl font-extrabold tabular-nums text-white font-mono">
              {value}
            </p>
            <p className="text-xs text-blue-300/70">{subtext}</p>
          </div>
        ))}
      </section>

      {/* Operation State & Quick Hubs */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Active Engine Card */}
        <div className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-6 flex flex-col justify-between shadow-xl shadow-blue-950/20">
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-[#152347] pb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className={`w-4 h-4 ${isScraping ? 'text-blue-400 animate-pulse' : 'text-slate-500'}`} />
                <span>Estado da Operação</span>
              </h2>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                  isScraping
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/40 animate-pulse'
                    : 'bg-[#0e1b38] text-slate-400 border-[#1d3162]'
                }`}
              >
                {isScraping ? 'Coleta Ativa' : 'Pronto para Pesquisa'}
              </span>
            </div>

            {currentJob ? (
              <div className="mt-5 space-y-3">
                <div>
                  <span className="text-xs text-blue-400 font-mono font-bold uppercase tracking-wider">
                    Pesquisa Atual
                  </span>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {currentJob.segment} <span className="text-blue-400 font-normal">·</span> {currentJob.location}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#070e20] border border-[#17274f] text-xs text-slate-300">
                  {currentJob.status_message || currentJob.current_step || 'Aguardando comandos'}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
                  <span><strong className="text-white">{currentJob.total_collected || 0}</strong> coletados</span>
                  <span><strong className="text-cyan-400">{currentJob.total_duplicates || 0}</strong> duplicados</span>
                  <span><strong className="text-red-400">{currentJob.total_errors || 0}</strong> erros</span>
                </div>
              </div>
            ) : (
              <div className="mt-8 text-center text-slate-400 space-y-2">
                <Compass className="w-8 h-8 text-blue-400/60 mx-auto" />
                <p className="text-sm">Nenhuma coleta em execução no momento.</p>
                <p className="text-xs text-slate-500">Inicie uma nova coleta ou gerencie seus projetos.</p>
              </div>
            )}
          </div>

          <div className="pt-6 mt-6 border-t border-[#152347] flex gap-3">
            <button
              type="button"
              onClick={() => onNavigate('search')}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
            >
              <span>Nova Coleta</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('results')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1d3162] hover:bg-[#122247] px-4 py-3 text-sm font-semibold text-slate-200 transition-colors cursor-pointer"
            >
              <span>Ver Leads ({totalPlaces})</span>
            </button>
          </div>
        </div>

        {/* Quick Hub Links */}
        <div className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-6 shadow-xl shadow-blue-950/20">
          <h2 className="text-base font-bold text-white border-b border-[#152347] pb-4">
            Acesso Rápido aos Módulos
          </h2>
          <div className="mt-3 divide-y divide-[#152347]">
            {[
              {
                tab: 'search' as ScreenTab,
                title: 'Nova Coleta no Google Maps',
                description: 'Pesquise por segmento, cidade e meta de novos leads',
                icon: Search,
              },
              {
                tab: 'results' as ScreenTab,
                title: 'Base de Leads & Exportação',
                description: 'Filtros avançados, telefones, sites e download em CSV/JSON',
                icon: Table2,
              },
              {
                tab: 'projects' as ScreenTab,
                title: 'Projetos, Categorias & Histórico',
                description: 'Organização de campanhas e histórico de coletas',
                icon: FolderKanban,
              },
              {
                tab: 'logs' as ScreenTab,
                title: 'Auditoria & Logs do Sistema',
                description: 'Eventos de execução do Chromium e integridade da API',
                icon: Activity,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="flex w-full items-center justify-between py-3.5 text-left group hover:bg-[#0e1b38] px-2.5 rounded-xl transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#070e20] border border-[#17274f] flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:border-blue-500/40 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-sm font-bold text-slate-100 group-hover:text-blue-300 transition-colors">
                        {item.title}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {item.description}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};