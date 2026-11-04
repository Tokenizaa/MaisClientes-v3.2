import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Square,
  ArrowRight,
  ShieldCheck,
  Building2,
  Radio,
  Cpu,
  Layers,
  Sparkles,
  X,
  Flag,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';
import { calculateScrapeProgressPercent, isFeedExhaustedJob } from '../shared/scrape-progress';

interface ScrapeEvolutionHUDProps {
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  onStopScrape: () => Promise<void>;
  onGoToResults: () => void;
  regionalQuickActions: { label: string; location: string }[];
  onStartRegionalScrape: (location: string) => Promise<void>;
}

export const ScrapeEvolutionHUD: React.FC<ScrapeEvolutionHUDProps> = ({
  currentJob,
  onStopScrape,
  onGoToResults,
  regionalQuickActions,
  onStartRegionalScrape,
}) => {
  if (!currentJob) return null;

  const percent = calculateScrapeProgressPercent(currentJob);
  // The persisted job status is authoritative; a stale local flag must not hide completion UI.
  const isRunning = currentJob.status === 'running';
  const isCompleted = currentJob.status === 'completed';
  const isStopped = currentJob.status === 'stopped';
  const isFailed = currentJob.status === 'failed';
  const isPartial = currentJob.status === 'partial';
  const completionReason = currentJob.completion_reason;
  const isFeedExhausted = isFeedExhaustedJob(currentJob);
  const isTargetReached = completionReason === 'target_reached';
  const isAccessRestricted = completionReason === 'access_restricted';
  const isFatalScrapeError = completionReason === 'fatal_error';
  const [showFeedExhaustedModal, setShowFeedExhaustedModal] = useState(false);
  const [selectedRegionalLocation, setSelectedRegionalLocation] = useState(regionalQuickActions[0]?.location || '');

  useEffect(() => {
    if (isFeedExhausted) setShowFeedExhaustedModal(true);
  }, [currentJob.id, isFeedExhausted]);

  useEffect(() => {
    setSelectedRegionalLocation(regionalQuickActions[0]?.location || '');
  }, [currentJob.id]);

  // Radius for SVG circular progress
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <>
      {showFeedExhaustedModal && isFeedExhausted && !isRunning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 sm:p-6" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="feed-exhausted-title" className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-[#10233e] via-[#0a1930] to-[#071225] shadow-[0_25px_100px_rgba(0,0,0,0.65)]">
            <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
            <button type="button" onClick={() => setShowFeedExhaustedModal(false)} aria-label="Fechar aviso" className="absolute right-4 top-4 z-10 rounded-full border border-slate-600/60 bg-slate-900/70 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"><X className="h-5 w-5" /></button>
            <div className="relative p-6 sm:p-9">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/15 text-amber-300 shadow-lg shadow-amber-950/30"><Flag className="h-8 w-8" /></div>
              <div className="text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200">Pesquisa encerrada normalmente</span>
                <h2 id="feed-exhausted-title" className="mt-4 text-2xl font-extrabold leading-tight text-white sm:text-3xl">Fim da lista de resultados</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">O Google Maps chegou ao final dos resultados disponíveis para esta pesquisa. A coleta parou porque não havia mais resultados no feed — não por uma falha que interrompeu o processo.</p>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-blue-400/20 bg-blue-950/40 p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-white">{currentJob.total_found}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Detectados</div></div>
                <div className="rounded-xl border border-blue-400/20 bg-blue-950/40 p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-blue-200">{currentJob.total_duplicates}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Duplicados</div></div>
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-950/30 p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-emerald-300">{currentJob.total_collected}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Novos salvos</div></div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-950/30 p-3 text-center"><div className="text-2xl font-extrabold tabular-nums text-amber-200">{currentJob.total_errors}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Falhas individuais</div></div>
              </div>
              <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-amber-100">Meta solicitada: {currentJob.limit_requested} novos estabelecimentos</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">Foram salvos {currentJob.total_collected} de {currentJob.limit_requested}. O fim da lista não significa que toda a região foi coberta.</p>
                {currentJob.total_errors > 0 && <p className="mt-2 text-xs text-slate-400">As {currentJob.total_errors} falhas individuais foram contabilizadas separadamente e não impediram a coleta de chegar ao fim do feed.</p>}
              </div>
              {regionalQuickActions.length > 0 && (
                <div className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-950/20 p-4">
                  <div className="mb-3 text-left">
                    <p className="text-sm font-bold text-cyan-100">Continue a prospecção em outra região</p>
                    <p className="mt-1 text-xs text-slate-300">Inicie outra coleta mantendo o mesmo segmento, município e meta de novos contatos.</p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <label className="min-w-0 flex-1">
                      <span className="mb-1.5 block text-xs font-semibold text-cyan-100">Selecione a próxima região</span>
                      <select
                        aria-label="Selecionar próxima região para coleta"
                        value={selectedRegionalLocation}
                        onChange={(event) => setSelectedRegionalLocation(event.target.value)}
                        className="w-full rounded-xl border border-cyan-400/30 bg-[#071a30] px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20"
                      >
                        {regionalQuickActions.map((action) => (
                          <option key={action.location} value={action.location}>Zona {action.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        disabled={!selectedRegionalLocation}
                        onClick={() => void onStartRegionalScrape(selectedRegionalLocation)}
                        className="w-full rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-5 py-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200/70 hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                      >
                        Iniciar coleta
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
                <button type="button" onClick={() => setShowFeedExhaustedModal(false)} className="rounded-xl border border-slate-600/70 bg-slate-900/60 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">Fechar aviso</button>
                <button type="button" onClick={onGoToResults} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500">Ver os {currentJob.total_collected} leads salvos <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          </section>
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#091a35] via-[#07152b] to-[#050e20] border border-blue-500/25 shadow-2xl shadow-blue-950/60 p-5 sm:p-7 space-y-6">
      {/* Background ambient glow effects */}
      <div className="absolute top-0 right-1/4 -mt-16 w-80 h-80 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-10 -mb-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      {/* Top Banner & Status Bar */}
      <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-blue-800/55">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg ${
                isRunning
                  ? 'bg-blue-600/20 border-blue-400/40 text-blue-400 shadow-blue-500/20'
                  : isCompleted
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400 shadow-emerald-500/20'
                  : isFeedExhausted
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300 shadow-amber-500/20'
                  : isPartial || isFailed
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300 shadow-rose-500/20'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-400 shadow-amber-500/20'
              }`}
            >
              {isRunning ? (
                <Radio className="w-5 h-5 animate-pulse text-blue-400" />
              ) : isFeedExhausted ? (
                <Flag className="w-5 h-5 text-amber-300" />
              ) : isCompleted ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            {isRunning && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 font-mono">
                {isRunning ? 'Radar de Coleta em Tempo Real' : isFeedExhausted ? 'Pesquisa encerrada — fim dos resultados disponíveis' : isTargetReached ? 'Meta de novos estabelecimentos atingida' : isStopped ? 'Coleta interrompida pelo usuário' : isAccessRestricted ? 'Acesso limitado pelo Google Maps' : isFatalScrapeError ? 'Falha técnica na coleta' : isFailed ? 'Coleta não concluída — falha técnica' : isPartial ? 'Coleta finalizada parcialmente' : 'Coleta encerrada'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700/50 text-blue-200 font-mono">
                ID: {currentJob.id.slice(0, 12)}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>{currentJob.segment}</span>
              <span className="text-blue-400/60 font-light">·</span>
              <span className="text-slate-300 font-normal">{currentJob.location}</span>
            </h2>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {isRunning && (
            <button
              type="button"
              onClick={onStopScrape}
              className="px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-700/40 hover:border-red-500/60 text-xs font-medium transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current text-red-400" />
              <span>Interromper Coleta</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToResults}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold tracking-wide transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer"
          >
            <span>Ver Base de Leads ({currentJob.total_collected})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isRunning && isFeedExhausted && (
        <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-amber-200">O Google Maps chegou ao fim dos resultados desta pesquisa.</p>
          <p className="text-xs text-slate-300">Isso não significa que todos os estabelecimentos da região foram encontrados. Significa que não há mais resultados disponíveis nesta consulta. A meta era {currentJob.limit_requested}; foram salvos {currentJob.total_collected} novos estabelecimentos.</p>
          {currentJob.total_errors > 0 && <p className="text-xs text-slate-300">{currentJob.total_errors} ficha(s) apresentaram falha individual de extração. Essas falhas não interromperam a leitura do feed.</p>}
        </div>
      )}

      {!isRunning && isTargetReached && (
        <div className="relative rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-200">Meta atingida: {currentJob.total_collected} novos estabelecimentos salvos.</p>
        </div>
      )}

      {!isRunning && isAccessRestricted && (
        <div className="relative rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-rose-200">O Google Maps limitou ou solicitou verificação de acesso.</p>
          <p className="mt-1 text-xs text-slate-300">A execução foi encerrada sem afirmar que a lista terminou. O percentual mostra somente a meta de novos estabelecimentos efetivamente atingida.</p>
        </div>
      )}

      {!isRunning && isFatalScrapeError && (
        <div className="relative rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-rose-200">Falha técnica: a execução foi interrompida antes da confirmação do fim da lista.</p>
          <p className="mt-1 text-xs text-slate-300">{currentJob.status_message || 'Verifique os registros técnicos da execução.'} O percentual não será apresentado como conclusão normal.</p>
        </div>
      )}

      {/* Main Radar Gauge & Dynamic Telemetry Center */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: Circular Radar HUD */}
        <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-center gap-5 p-4 rounded-xl bg-[#081a33]/80 border border-blue-800/45">
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Rotating radar sweep animation */}
            {isRunning && (
              <div
                className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none opacity-40"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(59, 130, 246, 0.4) 360deg)',
                }}
              />
            )}

            {/* Glowing background ring */}
            <div className="absolute inset-2 rounded-full border border-blue-500/15" />
            <div className="absolute inset-5 rounded-full border border-blue-500/10" />

            {/* SVG Circular Progress */}
            <svg className="w-36 h-36 transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-slate-800/80"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-blue-400 transition-all duration-700 ease-out"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.6))',
                }}
              />
            </svg>

            {/* Center Gauge Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-extrabold text-white tracking-tight font-mono">
                {percent}%
              </span>
              <span className="text-[10px] uppercase font-semibold text-blue-300/80 tracking-wider">
                {isFeedExhausted ? 'Lista encerrada' : isTargetReached ? 'Meta atingida' : isAccessRestricted ? 'Acesso limitado' : isFatalScrapeError ? 'Falha técnica' : `${currentJob.total_collected} de ${currentJob.limit_requested}`}
              </span>
              {(isFeedExhausted || isTargetReached) && (
                <span className="text-[9px] text-slate-400">{currentJob.total_collected} / {currentJob.limit_requested} novos</span>
              )}
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1.5 flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/80 border border-blue-700/40 text-[11px] font-medium text-blue-300">
              <Cpu className="w-3 h-3 text-blue-400" />
              <span>Chromium DOM Engine</span>
            </div>
            <div className="text-sm font-semibold text-slate-200 truncate">
              {currentJob.current_step || 'Processando busca no Google Maps...'}
            </div>
            <p className="text-xs text-slate-400 line-clamp-2">
              {isFeedExhausted
                ? 'Fim natural dos resultados disponíveis nesta pesquisa do Google Maps.'
                : currentJob.status_message || 'Varrendo coordenadas geográficas e filtrando cadastros existentes.'}
            </p>
          </div>
        </div>

        {/* Right: 4 High-Tech Telemetry Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Card 1: Coletados */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Inéditos</span>
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono flex items-baseline gap-1">
              <span>{currentJob.total_collected}</span>
              <span className="text-xs font-normal text-slate-400">/ {currentJob.limit_requested}</span>
            </div>
            <div className="mt-2 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-400 h-full transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Card 2: Duplicados Filtrados */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Duplicados</span>
              <ShieldCheck className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-300 font-mono">
              {currentJob.total_duplicates}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 truncate">
              Protegidos no banco
            </div>
          </div>

          {/* Card 3: Varredura de Links */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Detectados</span>
              <Building2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-blue-200 font-mono">
              {currentJob.total_found}
            </div>
            <div className="text-[10px] text-slate-400 mt-2 truncate">
              No feed do mapa
            </div>
          </div>

          {/* Card 4: Erros / Estabilidade */}
          <div className="p-3.5 rounded-xl bg-[#081a33]/90 border border-blue-800/55 relative overflow-hidden group">
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider">Falhas</span>
              <Activity className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-slate-200 font-mono">
              {currentJob.total_errors}
            </div>
            <div className="text-[10px] text-emerald-400 mt-2 truncate">
              {currentJob.total_errors === 0 ? 'Taxa 100% limpa' : `${currentJob.total_errors} fichas indisponíveis`}
            </div>
          </div>
        </div>
      </div>


    </div>
    </>
  );
};
