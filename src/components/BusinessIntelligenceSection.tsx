import React, { useState } from 'react';
import {
  Globe,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Building2,
  Cpu,
  Layers,
  TrendingUp,
  ShieldCheck,
  MessageSquare,
  Kanban,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Briefcase,
  Clock,
  ArrowRight,
} from 'lucide-react';
import type { PlaceRecord, WebIntelligenceRecord, WebIntelligenceStatus } from '../shared/types';
import { apiFetch } from '../utils/api';

export interface BusinessIntelligenceSectionProps {
  place: PlaceRecord;
  onAnalysisUpdated?: (updatedPlace: PlaceRecord) => void;
  onOpenKanban?: () => void;
  compact?: boolean;
}

export const BusinessIntelligenceSection: React.FC<BusinessIntelligenceSectionProps> = ({
  place,
  onAnalysisUpdated,
  onOpenKanban,
  compact = false,
}) => {
  const [intel, setIntel] = useState<WebIntelligenceRecord | undefined>(place.web_intelligence);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreatingOpp, setIsCreatingOpp] = useState<boolean>(false);
  const [oppCreatedSuccess, setOppCreatedSuccess] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isEvidencesExpanded, setIsEvidencesExpanded] = useState<boolean>(false);

  const status: WebIntelligenceStatus = intel?.status || place.web_intelligence_status || 'idle';

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch(`/api/v1/places/${place.id}/analyze-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.data) {
        setIntel(json.data);
        const updatedPlace: PlaceRecord = {
          ...place,
          web_intelligence_status: json.data.status,
          web_intelligence_score: json.data.scores?.overall_score,
          web_intelligence: json.data,
        };
        onAnalysisUpdated?.(updatedPlace);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao analisar o site da empresa.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateOpportunity = async () => {
    setIsCreatingOpp(true);
    try {
      const res = await apiFetch('/api/v1/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: place.id,
          stage: 'qualificacao',
          notes: intel?.commercial_analysis?.executive_summary || '',
          nextAction: intel?.commercial_analysis?.seller_discovery_questions?.[0]
            ? `Perguntar: ${intel.commercial_analysis.seller_discovery_questions[0]}`
            : 'Fazer primeiro contato de qualificação',
        }),
      });
      if (res.ok) {
        setOppCreatedSuccess(true);
        setTimeout(() => setOppCreatedSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Falha ao criar oportunidade:', err);
    } finally {
      setIsCreatingOpp(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyDossier = () => {
    if (!intel) return;
    const text = [
      `# DOSSIÊ DE INTELIGÊNCIA COMERCIAL`,
      `Empresa: ${intel.business_identity.company_name || place.name}`,
      `Site: ${intel.website_url || place.website || 'Não informado'}`,
      `Score: ${intel.scores.overall_score}/100 (Tier ${intel.scores.qualification_tier})`,
      `Solução Recomendada: ${intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado'}`,
      `Justificativa: ${intel.commercial_analysis.solution_justification}`,
      ``,
      `--- 1. QUEM É A EMPRESA ---`,
      `Atividade: ${intel.business_identity.primary_activity}`,
      `Público: ${intel.business_identity.target_audience}`,
      `Resumo: ${intel.commercial_analysis.executive_summary}`,
      ``,
      `--- 2. OPERAÇÃO ---`,
      `Estrutura: ${intel.operational_structure.operational_details}`,
      `Canais: ${intel.operational_structure.support_channels.join(', ')}`,
      ``,
      `--- 3. OPORTUNIDADES & DORES ---`,
      `Áreas: ${intel.opportunity_signals.opportunity_areas.join(', ')}`,
      `Diagnóstico: ${intel.opportunity_signals.observations}`,
      ``,
      `--- 4. PERGUNTAS DO VENDEDOR ---`,
      intel.commercial_analysis.seller_discovery_questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    ].join('\n');

    handleCopy(text, 'dossier');
  };

  // State when not analyzed yet
  if (!intel) {
    return (
      <div className="rounded-xl border border-slate-800 bg-[#081020] p-6 text-center space-y-4 shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <Sparkles className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Inteligência Comercial & Web Intelligence</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            Qualifique o lead automaticamente com IA, descobrindo o perfil operacional, dores, solução recomendada e perguntas de sondagem.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Analisando dados da empresa...' : 'Iniciar Análise Comercial'}</span>
          </button>
        </div>
      </div>
    );
  }

  const score = intel.scores.overall_score;
  const tier = intel.scores.qualification_tier;
  const solution = intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado de Gestão Comercial';
  const fitPoints = intel.commercial_analysis.fit_points || intel.commercial_analysis.limber_fit_points || [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#081122] p-5 sm:p-6 space-y-6 shadow-md text-slate-100">
      {/* ================= 1. BARRA SUPERIOR: SCORE & AÇÕES RÁPIDAS ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-mono text-sm font-bold">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Score {score}/100</span>
            <span className="text-emerald-400 font-sans font-bold">· Tier {tier}</span>
          </div>

          <span className="text-xs text-slate-400">
            Maturidade: <strong className="text-slate-200">{intel.digital_maturity.level}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyDossier}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 cursor-pointer transition-colors"
          >
            {copiedKey === 'dossier' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Dossiê</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCreateOpportunity}
            disabled={isCreatingOpp || oppCreatedSuccess}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              oppCreatedSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>{oppCreatedSuccess ? 'Oportunidade Criada!' : isCreatingOpp ? 'Criando...' : 'Adicionar ao Pipeline'}</span>
          </button>

          {onOpenKanban && (
            <button
              type="button"
              onClick={onOpenKanban}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 cursor-pointer"
            >
              <span>Ver no Kanban</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            title="Atualizar análise com IA"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* ================= 2. QUEM É & COMO FUNCIONA (RESUMO EXECUTIVO) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-300">
            <Building2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Quem é essa empresa?</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {intel.commercial_analysis.executive_summary}
          </p>
          <div className="pt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span><strong className="text-slate-200">Segmento:</strong> {intel.business_identity.segment}</span>
            <span><strong className="text-slate-200">Público:</strong> {intel.business_identity.target_audience}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Como funciona sua operação?</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {intel.operational_structure.operational_details || 'Operação comercial com atendimento presencial e canais digitais.'}
          </p>
          <div className="pt-1 text-[11px] text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
            <span><strong className="text-slate-200">Canais:</strong> {intel.operational_structure.support_channels.join(', ')}</span>
            <span><strong className="text-slate-200">Unidades:</strong> {intel.operational_structure.unit_count_estimate || '1'}</span>
          </div>
        </div>
      </div>

      {/* ================= 3. QUAL O PROBLEMA & QUAL A SOLUÇÃO ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Problema / Oportunidade */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Problemas & Oportunidades Identificadas</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {intel.opportunity_signals.observations}
          </p>
          {intel.opportunity_signals.opportunity_areas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {intel.opportunity_signals.opportunity_areas.map((area, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-300"
                >
                  {area}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Solução & Por que faz sentido */}
        <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-200">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Solução Recomendada & Aderência</span>
            </div>
            <span className="text-[11px] font-mono font-bold text-blue-300 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-600/40">
              {solution}
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            {intel.commercial_analysis.solution_justification}
          </p>
          {fitPoints.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {fitPoints.map((fit, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-slate-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{fit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================= 4. O QUE O VENDEDOR DEVE PERGUNTAR (SONDAGEM) ================= */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>O que o vendedor deve perguntar? (Roteiro de Discovery)</span>
          </div>
          <span className="text-[11px] text-slate-400">Clique para copiar</span>
        </div>

        <div className="space-y-2">
          {intel.commercial_analysis.seller_discovery_questions.map((q, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-200 group hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold">{idx + 1}.</span>
                <span>"{q}"</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(q, `q_${idx}`)}
                className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer shrink-0"
                title="Copiar pergunta"
              >
                {copiedKey === `q_${idx}` ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ================= 5. EVIDÊNCIAS & RASTREABILIDADE ================= */}
      <div className="border-t border-slate-800/80 pt-3">
        <button
          type="button"
          onClick={() => setIsEvidencesExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            <span>Evidências e Fontes da Análise ({intel.evidences.length})</span>
          </div>
          {isEvidencesExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isEvidencesExpanded && (
          <div className="mt-3 space-y-2">
            {intel.evidences.map((ev, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-slate-300"
              >
                <span>{ev.info}</span>
                <div className="flex items-center gap-2 shrink-0 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {ev.evidence_type} · Confiança {ev.confidence}
                  </span>
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Fonte</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
