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
  Clock,
  Check,
  Boxes,
  Zap,
  Copy,
  ChevronRight,
  ShoppingCart,
  Calendar,
  PhoneCall,
  MapPin,
  HelpCircle,
  FileText,
  Briefcase,
  SlidersHorizontal,
  Eye,
  ListOrdered,
  LayoutList,
} from 'lucide-react';
import type { PlaceRecord, WebEvidence, WebIntelligenceRecord, WebIntelligenceStatus } from '../shared/types';
import { apiFetch } from '../utils/api';

export interface BusinessIntelligenceSectionProps {
  place: PlaceRecord;
  onAnalysisUpdated?: (updatedPlace: PlaceRecord) => void;
  onOpenKanban?: () => void;
  compact?: boolean;
}

type SectionKey =
  | 'visao-geral'
  | 'o-que-faz'
  | 'operacao'
  | 'presenca-digital'
  | 'oportunidades'
  | 'solucoes-recomendadas'
  | 'solucoes-limber'
  | 'perguntas-vendedor'
  | 'fontes';

interface SectionDefinition {
  id: SectionKey;
  number: number;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const SECTIONS: SectionDefinition[] = [
  {
    id: 'visao-geral',
    number: 1,
    label: 'Visão geral',
    shortLabel: 'Visão Geral',
    icon: Building2,
    description: 'Resumo executivo do negócio, apresentação e contexto da empresa.',
  },
  {
    id: 'o-que-faz',
    number: 2,
    label: 'O que faz',
    shortLabel: 'O que Faz',
    icon: Briefcase,
    description: 'Atividade principal, produtos, serviços e público-alvo.',
  },
  {
    id: 'operacao',
    number: 3,
    label: 'Operação',
    shortLabel: 'Operação',
    icon: Layers,
    description: 'Estrutura operacional, unidades, canais de atendimento e pedidos.',
  },
  {
    id: 'presenca-digital',
    number: 4,
    label: 'Presença digital',
    shortLabel: 'Presença Digital',
    icon: Cpu,
    description: 'Maturidade digital observada, plataformas e processos online.',
  },
  {
    id: 'oportunidades',
    number: 5,
    label: 'Oportunidades',
    shortLabel: 'Oportunidades',
    icon: TrendingUp,
    description: 'Sinais de demanda de gestão, controle de estoque, vendas e fiscal.',
  },
  {
    id: 'solucoes-recomendadas',
    number: 6,
    label: 'Soluções Recomendadas',
    shortLabel: 'Soluções Recomendadas',
    icon: Sparkles,
    description: 'Solução recomendada, aderência técnica e justificativa comercial.',
  },
  {
    id: 'perguntas-vendedor',
    number: 7,
    label: 'Perguntas para o vendedor',
    shortLabel: 'Perguntas Vendedor',
    icon: MessageSquare,
    description: 'Roteiro de sondagem comercial para a 1ª abordagem e lacunas.',
  },
  {
    id: 'fontes',
    number: 8,
    label: 'Fontes',
    shortLabel: 'Fontes & Evidências',
    icon: ShieldCheck,
    description: 'Rastreabilidade de cada evidência com URL, tipo e confiabilidade.',
  },
];

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
  const [copiedDossier, setCopiedDossier] = useState<boolean>(false);

  // View mode: 'all' shows all 8 sections sequentially; 'tab' shows the active selected section
  const [viewMode, setViewMode] = useState<'all' | 'tab'>('all');
  const [selectedSection, setSelectedSection] = useState<SectionKey>('visao-geral');

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

  const handleCopyDossier = () => {
    if (!intel) return;
    const text = [
      `# DOSSIÊ DE INTELIGÊNCIA COMERCIAL`,
      `Empresa: ${intel.business_identity.company_name || place.name}`,
      `Site: ${intel.website_url || place.website || 'Não informado'}`,
      `Score Comercial: ${intel.scores.overall_score}/100 (Tier ${intel.scores.qualification_tier})`,
      `Maturidade Digital: ${intel.digital_maturity.level} (${intel.scores.digital_maturity}%)`,
      `Solução Recomendada: ${intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado'}`,
      `Justificativa: ${intel.commercial_analysis.solution_justification}`,
      ``,
      `--- 1. VISÃO GERAL ---`,
      `${intel.commercial_analysis.executive_summary}`,
      ``,
      `--- 2. O QUE FAZ ---`,
      `Atividade Principal: ${intel.business_identity.primary_activity}`,
      `Segmento: ${intel.business_identity.segment}${intel.business_identity.subsegment ? ` (${intel.business_identity.subsegment})` : ''}`,
      `Público-alvo: ${intel.business_identity.target_audience}`,
      `Alcance Geográfico: ${intel.business_identity.geographic_reach}`,
      `Produtos/Serviços: ${intel.business_identity.products_services.join(', ')}`,
      ``,
      `--- 3. OPERAÇÃO ---`,
      `Estrutura: ${intel.operational_structure.operational_details}`,
      `Unidades/Filiais: ${intel.operational_structure.unit_count_estimate || 'Não identificado'}`,
      `Canais de Atendimento: ${intel.operational_structure.support_channels.join(', ')}`,
      `E-commerce: ${intel.operational_structure.has_ecommerce ? 'Sim' : 'Não identificado'}`,
      `Agendamento/Reservas Online: ${intel.operational_structure.has_booking_or_orders ? 'Sim' : 'Não identificado'}`,
      ``,
      `--- 4. PRESENÇA DIGITAL ---`,
      `Nível: ${intel.digital_maturity.level}`,
      `Tecnologias: ${intel.digital_maturity.detected_technologies.join(', ') || 'Nenhuma detectada publicamente'}`,
      `Processos Digitais: ${intel.digital_maturity.digital_processes_summary}`,
      ``,
      `--- 5. OPORTUNIDADES ---`,
      `Áreas com Demanda de Gestão: ${intel.opportunity_signals.opportunity_areas.join(', ')}`,
      `Diagnóstico: ${intel.opportunity_signals.observations}`,
      ``,
      `--- 6. SOLUÇÕES RECOMENDADAS ---`,
      `Solução: ${intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado'}`,
      `Aderência: \n${(intel.commercial_analysis.fit_points || intel.commercial_analysis.limber_fit_points || []).map((p) => `* ${p}`).join('\n')}`,
      ``,
      `--- 7. PERGUNTAS PARA O VENDEDOR ---`,
      intel.commercial_analysis.seller_discovery_questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
      intel.commercial_analysis.information_gaps.length > 0
        ? `\nLacunas a Investigar:\n${intel.commercial_analysis.information_gaps.map((g) => `* ${g}`).join('\n')}`
        : '',
      ``,
      `--- 8. FONTES & EVIDÊNCIAS (${intel.evidences.length}) ---`,
      intel.evidences
        .map(
          (e) =>
            `* [${e.confidence}] ${e.evidence_type}: ${e.info} ${e.url ? `(${e.url})` : ''}`
        )
        .join('\n'),
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedDossier(true);
    setTimeout(() => setCopiedDossier(false), 3000);
  };

  const getStatusBadge = () => {
    if (isAnalyzing) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold animate-pulse">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
          Em análise (acessando site & qualificando)...
        </span>
      );
    }
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Análise Concluída (Site Oficial)
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            Análise Parcial (Home Coletada)
          </span>
        );
      case 'site_unavailable':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Site Indisponível (Qualificado via Maps)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            Aguardando análise
          </span>
        );
    }
  };

  const getConfidenceBadge = (confidence: WebEvidence['confidence']) => {
    switch (confidence) {
      case 'confirmado_no_site':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Confirmado no site
          </span>
        );
      case 'dados_coleta':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-950/80 text-blue-300 border border-blue-800/60">
            <Building2 className="w-3 h-3 text-blue-400" />
            Identificado nos dados da coleta
          </span>
        );
      case 'inferencia_comercial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-950/80 text-purple-300 border border-purple-800/60">
            <Sparkles className="w-3 h-3 text-purple-400" />
            Inferência comercial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="w-3 h-3 text-slate-500" />
            Não identificado
          </span>
        );
    }
  };

  return (
    <section
      aria-label="Inteligência do Negócio — Web Intelligence"
      className="rounded-2xl border border-blue-500/25 bg-slate-950/80 p-5 sm:p-6 space-y-6 shadow-xl shadow-blue-950/20"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
                Inteligência do Negócio
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  Web Intelligence
                </span>
              </h3>
            </div>
          </div>
          <p className="text-xs text-slate-400 pl-10 leading-relaxed">
            Varredura do site institucional oficial, classificação técnica de maturidade digital, identificação de oportunidades e aderência às soluções de gestão comercial.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {getStatusBadge()}

          <button
            type="button"
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-md shadow-blue-600/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            title="Executar ou atualizar a análise técnica do site"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{intel ? 'Reanalisar Site' : 'Analisar Site Agora'}</span>
          </button>

          {intel && (
            <button
              type="button"
              onClick={handleCopyDossier}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs transition-all cursor-pointer"
              title="Copiar resumo de inteligência comercial para a área de transferência"
            >
              {copiedDossier ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar Dossiê</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCreateOpportunity}
            disabled={isCreatingOpp || oppCreatedSuccess}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-all cursor-pointer disabled:opacity-60"
            title="Enviar este lead qualificado diretamente para o pipeline Kanban"
          >
            {oppCreatedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Criado no Kanban!</span>
              </>
            ) : (
              <>
                <Kanban className="w-3.5 h-3.5 text-blue-400" />
                <span>Criar no Kanban</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Initial state without analysis */}
      {!intel && !isAnalyzing && (
        <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/40 space-y-3.5">
          <Globe className="w-10 h-10 text-blue-400/80 mx-auto" />
          <h4 className="text-base font-bold text-slate-200">
            {place.website ? 'Website institucional pronto para extração e qualificação' : 'Sem website oficial informado na ficha'}
          </h4>
          <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
            {place.website
              ? `O endereço institucional "${place.website}" será acessado e analisado para mapear estrutura comercial, presença de e-commerce, catálogo de serviços, tecnologias e sinais de demanda de software.`
              : 'O estabelecimento não possui website oficial cadastrado no Google Maps. A qualificação será executada a partir dos dados consolidados da ficha, destacando as lacunas de informação para o vendedor.'}
          </p>
          <button
            type="button"
            onClick={handleRunAnalysis}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 cursor-pointer active:scale-95 transition-all"
          >
            <Sparkles className="w-4 h-4 text-blue-200" />
            Executar Análise de Inteligência Agora
          </button>
        </div>
      )}

      {/* Analysis Content */}
      {intel && (
        <div className="space-y-6">
          {/* Top Score & Highlights Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Overall Score Card */}
            <div className="rounded-xl bg-gradient-to-br from-blue-950/80 to-slate-900 border border-blue-500/30 p-4 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">Score Comercial</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-white font-mono">{intel.scores.overall_score}</span>
                  <span className="text-xs text-slate-400 font-mono">/ 100</span>
                  <span className="ml-auto px-2 py-0.5 rounded-md text-xs font-extrabold bg-blue-600 text-white font-mono shadow-sm">
                    Tier {intel.scores.qualification_tier}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 mt-2 line-clamp-2">
                {intel.scores.score_explanation}
              </p>
            </div>

            {/* Recommended Solution Card */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 col-span-1 md:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Solução Recomendada</span>
                </div>
                <h4 className="mt-1 text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>{intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado'}</span>
                </h4>
              </div>
              <p className="text-xs text-slate-300 mt-2 italic border-l-2 border-blue-500 pl-2 line-clamp-2">
                "{intel.commercial_analysis.solution_justification}"
              </p>
            </div>

            {/* Digital Maturity Card */}
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Maturidade Digital</span>
                <p className="text-xl font-bold text-slate-100 mt-1 flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-indigo-400" />
                  <span>{intel.digital_maturity.level}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({intel.scores.digital_maturity}%)
                  </span>
                </p>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                {intel.operational_structure.has_ecommerce ? 'E-commerce ativo · ' : ''}
                {intel.operational_structure.has_booking_or_orders ? 'Agendamento online · ' : ''}
                {intel.digital_maturity.detected_technologies.length > 0
                  ? `${intel.digital_maturity.detected_technologies.length} tecnologias detectadas`
                  : 'Presença digital básica'}
              </p>
            </div>
          </div>

          {/* Quick Navigation and View Mode Selector */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                Modo:
              </span>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Todos os 8 Blocos</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tab')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'tab'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Foco por Bloco</span>
              </button>
            </div>

            {/* Quick 8 Blocks Pill Navigator */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs py-0.5">
              {SECTIONS.map((sec) => {
                const Icon = sec.icon;
                const isSelected = selectedSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      setSelectedSection(sec.id);
                      if (viewMode === 'all') {
                        const el = document.getElementById(`bi-section-${sec.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer text-xs ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    }`}
                    title={sec.description}
                  >
                    <span className="font-mono text-[10px] text-blue-400 font-bold">{sec.number}.</span>
                    <span>{sec.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Render Sections (either all 8 sequentially or only the selected tab) */}
          <div className="space-y-6">
            {SECTIONS.map((sec) => {
              // If in tab mode and this is not the selected section, skip
              if (viewMode === 'tab' && selectedSection !== sec.id) {
                return null;
              }

              return (
                <div
                  key={sec.id}
                  id={`bi-section-${sec.id}`}
                  className="rounded-xl bg-slate-900/70 border border-slate-800/90 p-5 space-y-4 scroll-mt-6 transition-all hover:border-slate-700/80"
                >
                  {/* Block Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 font-mono font-extrabold text-xs border border-blue-500/30">
                        {sec.number}
                      </span>
                      <div>
                        <h4 className="text-sm font-extrabold text-slate-100 uppercase tracking-wider flex items-center gap-2">
                          <span>{sec.label}</span>
                        </h4>
                        <p className="text-[11px] text-slate-400">{sec.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* BLOCK 1: VISÃO GERAL */}
                  {sec.id === 'visao-geral' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
                        <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wide block">
                          Resumo Executivo do Negócio
                        </span>
                        <p className="text-sm text-slate-200 leading-relaxed">
                          {intel.commercial_analysis.executive_summary}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                          <span className="text-slate-400 text-[11px] block font-medium">Nome Comercial</span>
                          <span className="font-semibold text-slate-100 text-sm">
                            {intel.business_identity.company_name || place.name}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                          <span className="text-slate-400 text-[11px] block font-medium">Endereço Web Oficial</span>
                          {intel.website_url ? (
                            <a
                              href={intel.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold truncate max-w-full font-mono text-xs"
                            >
                              <span className="truncate">{intel.website_url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-slate-500 italic">Sem website institucional</span>
                          )}
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/80 space-y-1">
                          <span className="text-slate-400 text-[11px] block font-medium">Diagnóstico de Qualificação</span>
                          <span className="font-semibold text-slate-200">
                            Tier {intel.scores.qualification_tier} ({intel.scores.overall_score} pontos)
                          </span>
                        </div>
                      </div>

                      {/* Score Dimensions Visual Grid */}
                      <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/70 space-y-3">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Composição do Score Multidimensional
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                          {[
                            { label: 'Aderência Segmento', val: intel.scores.adherence_segment, color: 'bg-blue-500' },
                            { label: 'Compatibilidade', val: intel.scores.management_compatibility, color: 'bg-emerald-500' },
                            { label: 'Complexidade', val: intel.scores.operational_complexity, color: 'bg-amber-500' },
                            { label: 'Maturidade Digital', val: intel.scores.digital_maturity, color: 'bg-cyan-500' },
                            { label: 'Potencial', val: intel.scores.commercial_potential, color: 'bg-purple-500' },
                            { label: 'Confiabilidade', val: intel.scores.evidence_reliability, color: 'bg-indigo-500' },
                          ].map((item) => (
                            <div key={item.label} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/60">
                              <span className="text-[10px] text-slate-400 block truncate">{item.label}</span>
                              <span className="text-sm font-mono font-bold text-slate-100">{item.val}%</span>
                              <div className="h-1 w-full bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                                <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.val}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 2: O QUE FAZ */}
                  {sec.id === 'o-que-faz' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wide block">
                            Atividade Principal & Segmento
                          </span>
                          <p className="text-sm font-bold text-slate-100">
                            {intel.business_identity.primary_activity}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <span className="px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-800/50 text-blue-300 font-semibold">
                              Segmento: {intel.business_identity.segment}
                            </span>
                            {intel.business_identity.subsegment && (
                              <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                                Subsegmento: {intel.business_identity.subsegment}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide block">
                            Público-Alvo & Alcance Geográfico
                          </span>
                          <div className="space-y-1.5">
                            <p className="text-xs text-slate-300">
                              <strong className="text-slate-100">Público-alvo aparente:</strong>{' '}
                              {intel.business_identity.target_audience}
                            </p>
                            <p className="text-xs text-slate-300">
                              <strong className="text-slate-100">Área geográfica de atuação:</strong>{' '}
                              {intel.business_identity.geographic_reach}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Products & Services */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
                          Produtos e Serviços Comercializados
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {intel.business_identity.products_services.length > 0 ? (
                            intel.business_identity.products_services.map((item, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-medium"
                              >
                                {item}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500 italic">
                              Não detalhado na página inicial; consultar portfólio completo na abordagem comercial.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 3: OPERAÇÃO */}
                  {sec.id === 'operacao' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide block">
                          Como Opera na Prática
                        </span>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {intel.operational_structure.operational_details}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Estrutura de Unidades</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.unit_count_estimate || 'Unidade única identificada'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Canais de Atendimento</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.support_channels.join(', ') || 'Presencial / Telefone'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Operação Comercial Multicanal</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.is_multichannel
                              ? 'Sim (Atendimento físico e canais online integrados)'
                              : 'Operação presencial ou canal único'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Catálogo Online</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.has_online_catalog
                              ? 'Identificado catálogo / vitrine de produtos'
                              : 'Sem catálogo público estruturado'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Vendas Online / E-commerce</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.has_ecommerce
                              ? `Sim (${intel.operational_structure.ecommerce_platform || 'Loja própria'})`
                              : 'Sem e-commerce direto identificado'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
                          <span className="text-slate-400 text-[11px] block">Reservas / Pedidos Online</span>
                          <span className="font-semibold text-slate-200">
                            {intel.operational_structure.has_booking_or_orders
                              ? 'Identificado módulo de agendamento ou pedidos'
                              : 'Não identificado no site oficial'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 4: PRESENÇA DIGITAL */}
                  {sec.id === 'presenca-digital' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wide">
                            Maturidade Digital Observada
                          </span>
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono ${
                              intel.digital_maturity.level === 'Alta'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : intel.digital_maturity.level === 'Média'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            Nível: {intel.digital_maturity.level}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {intel.digital_maturity.digital_processes_summary}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
                            Plataformas e Tecnologias Detectadas
                          </span>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {intel.digital_maturity.detected_technologies.length > 0 ? (
                              intel.digital_maturity.detected_technologies.map((tech) => (
                                <span
                                  key={tech}
                                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-blue-300 font-mono font-medium text-xs"
                                >
                                  {tech}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-500 italic">
                                Nenhuma tecnologia de terceiro declarada publicamente no código do site.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
                            Recursos Digitais de Vendas & Integrações
                          </span>
                          <div className="space-y-1.5 text-xs text-slate-300">
                            {intel.digital_maturity.online_sales_capabilities.length > 0 ? (
                              intel.digital_maturity.online_sales_capabilities.map((cap, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>{cap}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-slate-500 italic">
                                Sem recursos avançados de checkout ou vendas integradas identificados.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 5: OPORTUNIDADES */}
                  {sec.id === 'oportunidades' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide block">
                          Áreas Operacionais com Potencial de Gestão
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {intel.opportunity_signals.opportunity_areas.map((area) => (
                            <span
                              key={area}
                              className="px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-bold text-xs flex items-center gap-1.5"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>{area}</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide block">
                          Diagnóstico & Sinais Observados
                        </span>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                          {intel.opportunity_signals.observations}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <span className="text-slate-400 text-[11px] block">Catálogo Amplo / Diversificado:</span>
                          <span className="font-semibold text-slate-200">
                            {intel.opportunity_signals.large_catalog ? 'Sim (Demanda controle de estoque/grade)' : 'Catálogo focado'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <span className="text-slate-400 text-[11px] block">Múltiplas Unidades / Lojas:</span>
                          <span className="font-semibold text-slate-200">
                            {intel.opportunity_signals.multiple_units ? 'Sim (Demanda gestão multiunidade / matriz-filial)' : 'Unidade única identificada'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <span className="text-slate-400 text-[11px] block">Demanda de Integração de Processos:</span>
                          <span className="font-semibold text-slate-200">
                            {intel.opportunity_signals.integration_demand ? 'Alta (Canais e rotinas dispersos)' : 'Rotina padrão'}
                          </span>
                        </div>

                        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                          <span className="text-slate-400 text-[11px] block">Controle Administrativo & Fiscal:</span>
                          <span className="font-semibold text-slate-200">
                            {intel.opportunity_signals.administrative_control_need ? 'Recomendado (NF-e, financeiro e DRE)' : 'Básico'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BLOCK 6: SOLUÇÕES RECOMENDADAS */}
                  {(sec.id === 'solucoes-recomendadas' || sec.id === 'solucoes-limber') && (
                    <div className="space-y-4">
                      {/* Highlight Box */}
                      <div className="p-5 rounded-xl bg-gradient-to-r from-blue-950/90 via-slate-900 to-indigo-950/70 border border-blue-500/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-blue-400" />
                            Solução de Gestão Recomendada
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-mono font-bold text-xs shadow-sm">
                            {intel.commercial_analysis.recommended_solution || intel.commercial_analysis.recommended_limber_solution || 'ERP Integrado'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 font-medium leading-relaxed italic border-l-2 border-blue-400 pl-3">
                          "{intel.commercial_analysis.solution_justification}"
                        </p>
                      </div>

                      {/* Fit Points */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                        <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wide block">
                          Pontos de Aderência Específicos
                        </span>
                        <div className="space-y-2 text-xs text-slate-300">
                          {(intel.commercial_analysis.fit_points || intel.commercial_analysis.limber_fit_points || []).map((fitPoint, idx) => (
                            <div key={idx} className="flex items-start gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{fitPoint}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Commercial Opportunities */}
                      {intel.commercial_analysis.commercial_opportunities.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wide block">
                            Oportunidades Comerciais Adicionais
                          </span>
                          <ul className="space-y-1.5 text-xs text-slate-300">
                            {intel.commercial_analysis.commercial_opportunities.map((opp, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-purple-400 font-bold">•</span>
                                <span>{opp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BLOCK 7: PERGUNTAS PARA O VENDEDOR */}
                  {sec.id === 'perguntas-vendedor' && (
                    <div className="space-y-4">
                      <div className="p-4 rounded-xl bg-slate-950 border border-amber-500/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4 text-amber-400" />
                            Roteiro de Sondagem para a 1ª Conversa
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Playbook do SDR / Vendedor
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {intel.commercial_analysis.seller_discovery_questions.map((q, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-200"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold text-[11px]">
                                {idx + 1}
                              </span>
                              <span className="mt-0.5 font-medium leading-relaxed">{q}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Information Gaps */}
                      {intel.commercial_analysis.information_gaps.length > 0 && (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                            Lacunas de Informação (Investigar durante o contato)
                          </span>
                          <div className="space-y-1.5 text-xs text-slate-400">
                            {intel.commercial_analysis.information_gaps.map((gap, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                                <span>{gap}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BLOCK 8: FONTES */}
                  {sec.id === 'fontes' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>
                          {intel.evidences.length} evidência(s) registrada(s) com rastreabilidade completa.
                        </span>
                        <span className="font-mono text-[11px]">
                          Data da análise: {new Date(intel.analyzed_at).toLocaleDateString('pt-BR')} às{' '}
                          {new Date(intel.analyzed_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {intel.evidences.map((ev, i) => (
                          <div
                            key={i}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 hover:border-slate-700/80 transition-colors"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                                <span>{ev.evidence_type}</span>
                              </span>
                              {getConfidenceBadge(ev.confidence)}
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed pl-5 border-l-2 border-slate-800">
                              {ev.info}
                            </p>
                            {ev.url && (
                              <div className="pt-1 pl-5">
                                <a
                                  href={ev.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-mono"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span className="truncate max-w-sm sm:max-w-md">{ev.url}</span>
                                </a>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
