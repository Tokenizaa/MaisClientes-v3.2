import React from 'react';
import {
  Table2,
  FileDown,
  Trash2,
  Calendar,
  MapPin,
  Clock,
  Database,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';

interface HistoryScreenProps {
  jobs: ScrapeJob[];
  onViewResults: (jobId: string) => void;
  onGoToExportWithJob: (jobId: string) => void;
  onDeleteJob: (jobId: string) => Promise<void>;
}

export const HistoryScreen: React.FC<HistoryScreenProps> = ({
  jobs,
  onViewResults,
  onGoToExportWithJob,
  onDeleteJob,
}) => {
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-2 sm:py-6 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800 pb-5">
        <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400">
          Auditoria de Execuções
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-100 tracking-tight">
          Histórico de Pesquisas
        </h1>
        <p className="mt-3 text-base sm:text-lg text-slate-400 leading-relaxed max-w-3xl">
          Registro completo de todas as coletas realizadas no Google Maps, com os contadores de estabelecimentos encontrados, coletados e persistidos no SQLite.
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-3xl p-16 text-center">
          <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-200">Nenhuma pesquisa no histórico</h3>
          <p className="text-base text-slate-400 mt-2 max-w-md mx-auto">
            Quando você iniciar uma coleta na tela "1. Pesquisar", ela será registrada aqui com seus contadores e dados persistidos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            return (
              <div
                key={job.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl shadow-black/20 hover:border-slate-700 transition-all duration-150 backdrop-blur-sm"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                  {/* Left: Info */}
                  <div className="space-y-3 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-100">
                        {job.segment}
                      </h2>
                      <span className="text-slate-600">·</span>
                      <span className="text-sm sm:text-base font-semibold text-slate-300 flex items-center gap-1.5 bg-slate-950 px-3 py-1 rounded-lg border border-slate-800">
                        <MapPin className="w-4 h-4 text-blue-400" />
                        {job.location}
                      </span>
                    </div>

                    {/* Metric Badges */}
                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-400">
                      <span className="flex items-center gap-1.5 font-medium bg-slate-950 px-3 py-1 rounded-md border border-slate-800 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {formatDate(job.created_at)}
                      </span>
                      <span className="bg-slate-950 px-3 py-1 rounded-md border border-slate-800 font-mono tabular-nums">
                        Meta solicitada: <strong className="text-slate-200 font-bold">{job.limit_requested}</strong>
                      </span>
                      <span className="bg-blue-500/10 text-blue-300 px-3 py-1 rounded-md border border-blue-500/30 font-semibold font-mono tabular-nums">
                        Salvos no SQLite: <strong className="text-blue-300 font-extrabold">{job.total_collected}</strong>
                      </span>
                      {job.total_duplicates > 0 && (
                        <span className="bg-slate-950 px-3 py-1 rounded-md border border-slate-800 font-mono tabular-nums text-slate-400">
                          Duplicados ignorados: <strong className="text-slate-300">{job.total_duplicates}</strong>
                        </span>
                      )}
                      {job.total_errors > 0 && (
                        <span className="bg-rose-500/10 text-rose-300 px-3 py-1 rounded-md border border-rose-500/30 font-semibold font-mono tabular-nums">
                          Erros: <strong>{job.total_errors}</strong>
                        </span>
                      )}
                    </div>

                    {job.status_message && (
                      <div className="space-y-1">
                        <p className="text-xs sm:text-sm text-slate-300 line-clamp-2">{job.status_message}</p>
                        {job.completion_reason === 'feed_exhausted' && (
                          <p className="text-xs text-amber-300">Fim natural dos resultados disponíveis nesta consulta do Google Maps; não representa cobertura completa da região.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Status badge & Actions */}
                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <span
                      className={`text-xs sm:text-sm px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider border ${
                        job.status === 'completed'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : job.status === 'running'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
                          : job.status === 'partial'
                          ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                          : job.status === 'stopped'
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {job.completion_reason === 'feed_exhausted' && 'Fim da lista'}
                      {job.completion_reason === 'target_reached' && 'Meta atingida'}
                      {job.completion_reason === 'user_stopped' && 'Interrompida'}
                      {job.completion_reason === 'fatal_error' && 'Falha técnica'}
                      {!job.completion_reason && job.status === 'completed' && 'Concluída'}
                      {!job.completion_reason && job.status === 'running' && 'Em andamento'}
                      {!job.completion_reason && job.status === 'partial' && 'Parcial'}
                      {!job.completion_reason && job.status === 'stopped' && 'Interrompida'}
                      {!job.completion_reason && job.status === 'failed' && 'Falha'}
                    </span>

                    {/* View in Table */}
                    <button
                      type="button"
                      onClick={() => onViewResults(job.id)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer border border-slate-700"
                      title="Ver estabelecimentos desta coleta"
                    >
                      <Table2 className="w-4 h-4 text-blue-400" />
                      <span>Ver Resultados</span>
                    </button>

                    {/* Direct CSV Export */}
                    <button
                      type="button"
                      onClick={() => onGoToExportWithJob(job.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-sm shadow-blue-950/40"
                      title="Exportar esta pesquisa para CSV"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>Exportar CSV</span>
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Deseja remover esta pesquisa (${job.segment}) e seus registros do banco?`)) {
                          onDeleteJob(job.id);
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                      title="Excluir pesquisa do banco"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
