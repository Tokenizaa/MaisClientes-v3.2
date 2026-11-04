import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Phone,
  MessageCircle,
  Globe,
  MapPin,
  Star,
  ExternalLink,
  Sparkles,
  Calendar,
  Clock,
  Building2,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Send,
  Plus,
  Trash2,
  User,
  DollarSign,
  Tag,
  ArrowRight,
  TrendingUp,
  Share2,
  Search,
  Code,
  Layers,
  FileText,
  HelpCircle,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import type {
  PlaceRecord,
  OpportunityRecord,
  OpportunityStage,
  ContactInteraction,
  ContactInteractionType,
  ContactInteractionOutcome,
} from '../shared/types';
import { apiFetch } from '../utils/api';

export const STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; badgeClass: string; borderClass: string; dotClass: string }
> = {
  lead: {
    label: '1. Lead Coletado',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    borderClass: 'border-slate-700',
    dotClass: 'bg-slate-400',
  },
  qualificacao: {
    label: '2. Qualificação Web',
    badgeClass: 'bg-blue-950/70 text-blue-300 border-blue-500/40',
    borderClass: 'border-blue-500/40',
    dotClass: 'bg-blue-400',
  },
  apresentacao: {
    label: '3. Demonstração Comercial',
    badgeClass: 'bg-indigo-950/70 text-indigo-300 border-indigo-500/40',
    borderClass: 'border-indigo-500/40',
    dotClass: 'bg-indigo-400',
  },
  proposta: {
    label: '4. Proposta Enviada',
    badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-500/40',
    borderClass: 'border-amber-500/40',
    dotClass: 'bg-amber-400',
  },
  fechado: {
    label: '5. Fechado / Ganho',
    badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40',
    borderClass: 'border-emerald-500/40',
    dotClass: 'bg-emerald-400',
  },
  perdido: {
    label: 'Perdido',
    badgeClass: 'bg-rose-950/70 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/40',
    dotClass: 'bg-rose-400',
  },
};

type LeadSheetTab = 'comercial' | 'empresa' | 'digital' | 'avaliacoes_midia';

interface Props {
  place: PlaceRecord;
  onClose: () => void;
  onOpportunityUpdated?: (opp: OpportunityRecord) => void;
  onPlaceUpdated?: (updated: PlaceRecord) => void;
  onGoToKanban?: () => void;
}

export const LeadDetailsModal: React.FC<Props> = ({
  place,
  onClose,
  onOpportunityUpdated,
  onPlaceUpdated,
  onGoToKanban,
}) => {
  const [activeTab, setActiveTab] = useState<LeadSheetTab>('comercial');
  const [opportunity, setOpportunity] = useState<OpportunityRecord | null>(null);
  const [isLoadingOpp, setIsLoadingOpp] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Interaction logging form state
  const [isLogContactOpen, setIsLogContactOpen] = useState<boolean>(false);
  const [contactType, setContactType] = useState<ContactInteractionType>('ligacao');
  const [contactNotes, setContactNotes] = useState<string>('');
  const [contactOutcome, setContactOutcome] = useState<ContactInteractionOutcome>('sucesso');
  const [nextContactDate, setNextContactDate] = useState<string>('');
  const [nextActionInput, setNextActionInput] = useState<string>('');
  const [isSavingInteraction, setIsSavingInteraction] = useState<boolean>(false);

  // Editable deal value / notes state
  const [isEditingDeal, setIsEditingDeal] = useState<boolean>(false);
  const [dealValueInput, setDealValueInput] = useState<string>('');
  const [contactNameInput, setContactNameInput] = useState<string>('');
  const [assignedToInput, setAssignedToInput] = useState<string>('');

  // Technical debug drawer
  const [isTechnicalAreaExpanded, setIsTechnicalAreaExpanded] = useState<boolean>(false);
  const [technicalSearch, setTechnicalSearch] = useState<string>('');

  // AI re-analyze trigger
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const intel = place.web_intelligence;

  // Normalize phone for WhatsApp & Dialing
  const rawPhone = place.phone || '';
  const cleanPhoneDigits = useMemo(() => rawPhone.replace(/\D/g, ''), [rawPhone]);
  const hasValidPhone = cleanPhoneDigits.length >= 8;
  const whatsappUrl = useMemo(() => {
    if (!hasValidPhone) return null;
    const number = cleanPhoneDigits.startsWith('55') ? cleanPhoneDigits : `55${cleanPhoneDigits}`;
    return `https://wa.me/${number}`;
  }, [hasValidPhone, cleanPhoneDigits]);

  // Load existing opportunity for this place
  useEffect(() => {
    let isMounted = true;
    const fetchOpportunity = async () => {
      setIsLoadingOpp(true);
      try {
        const res = await apiFetch(`/api/v1/opportunities/by-place/${place.id}`);
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.data) {
            setOpportunity(json.data);
            setDealValueInput(json.data.deal_value ? String(json.data.deal_value) : '');
            setContactNameInput(json.data.contact_name || '');
            setAssignedToInput(json.data.assigned_to || '');
          }
        }
      } catch (err) {
        console.error('Erro ao verificar oportunidade existente:', err);
      } finally {
        if (isMounted) setIsLoadingOpp(false);
      }
    };

    fetchOpportunity();
    return () => {
      isMounted = false;
    };
  }, [place.id]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Change stage or create opportunity if none exists yet
  const handleStageChange = async (newStage: OpportunityStage) => {
    try {
      if (opportunity) {
        const res = await apiFetch(`/api/v1/opportunities/${opportunity.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        });
        if (res.ok) {
          const json = await res.json();
          setOpportunity(json.data);
          onOpportunityUpdated?.(json.data);
        }
      } else {
        const res = await apiFetch('/api/v1/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: place.id,
            stage: newStage,
            dealValue: 0,
            notes: intel?.commercial_analysis?.executive_summary || '',
            nextAction: intel?.commercial_analysis?.seller_discovery_questions?.[0]
              ? `Perguntar: ${intel.commercial_analysis.seller_discovery_questions[0]}`
              : 'Fazer primeiro contato de qualificação',
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setOpportunity(json.data);
          onOpportunityUpdated?.(json.data);
        }
      }
    } catch (err) {
      console.error('Falha ao atualizar etapa comercial:', err);
    }
  };

  // Save deal value and contact details
  const handleSaveDealDetails = async () => {
    try {
      const dealValueNum = Number(dealValueInput) || 0;
      if (opportunity) {
        const res = await apiFetch(`/api/v1/opportunities/${opportunity.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deal_value: dealValueNum,
            contact_name: contactNameInput,
            assigned_to: assignedToInput,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setOpportunity(json.data);
          onOpportunityUpdated?.(json.data);
          setIsEditingDeal(false);
        }
      } else {
        const res = await apiFetch('/api/v1/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: place.id,
            stage: 'qualificacao',
            dealValue: dealValueNum,
            contactName: contactNameInput,
            assignedTo: assignedToInput,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setOpportunity(json.data);
          onOpportunityUpdated?.(json.data);
          setIsEditingDeal(false);
        }
      }
    } catch (err) {
      console.error('Falha ao salvar detalhes comerciais:', err);
    }
  };

  // Register contact interaction
  const handleLogInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactNotes.trim()) return;

    setIsSavingInteraction(true);
    try {
      let currentOppId = opportunity?.id;

      // Ensure opportunity exists first
      if (!currentOppId) {
        const createRes = await apiFetch('/api/v1/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            placeId: place.id,
            stage: 'qualificacao',
          }),
        });
        if (createRes.ok) {
          const json = await createRes.json();
          setOpportunity(json.data);
          onOpportunityUpdated?.(json.data);
          currentOppId = json.data.id;
        }
      }

      if (!currentOppId) throw new Error('Não foi possível inicializar a oportunidade.');

      const res = await apiFetch(`/api/v1/opportunities/${currentOppId}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: contactType,
          notes: contactNotes,
          outcome: contactOutcome,
          next_contact_at: nextContactDate || undefined,
          next_action: nextActionInput || undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setOpportunity(json.data);
        onOpportunityUpdated?.(json.data);
        setContactNotes('');
        setNextContactDate('');
        setNextActionInput('');
        setIsLogContactOpen(false);
      }
    } catch (err) {
      console.error('Falha ao registrar contato:', err);
    } finally {
      setIsSavingInteraction(false);
    }
  };

  // Trigger web intelligence analysis on demand
  const handleTriggerAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await apiFetch(`/api/v1/places/${place.id}/analyze-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          const updatedPlace: PlaceRecord = {
            ...place,
            web_intelligence_status: json.data.status,
            web_intelligence_score: json.data.scores?.overall_score,
            web_intelligence: json.data,
          };
          onPlaceUpdated?.(updatedPlace);
          if (opportunity) {
            setOpportunity({
              ...opportunity,
              web_intelligence: json.data,
              score: json.data.scores?.overall_score,
              qualification_tier: json.data.scores?.qualification_tier,
            });
          }
        }
      }
    } catch (err) {
      console.error('Falha ao analisar inteligência:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Media photos and videos
  const photos = useMemo(() => {
    if (!place.photos) return [];
    return place.photos
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.startsWith('http'));
  }, [place.photos]);

  const videos = useMemo(() => {
    if (!place.videos) return [];
    return place.videos
      .split('\n')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }, [place.videos]);

  // All 41 scraped fields for secondary drawer
  const allFieldEntries = useMemo(() => {
    return Object.entries(place).filter(
      ([key]) => !['web_intelligence', 'photos', 'videos'].includes(key)
    );
  }, [place]);

  const filteredFields = useMemo(() => {
    if (!technicalSearch.trim()) return allFieldEntries;
    const q = technicalSearch.toLowerCase();
    return allFieldEntries.filter(
      ([k, v]) => k.toLowerCase().includes(q) || String(v ?? '').toLowerCase().includes(q)
    );
  }, [allFieldEntries, technicalSearch]);

  const score = intel?.scores?.overall_score ?? place.web_intelligence_score;
  const qualificationTier = intel?.scores?.qualification_tier;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4 lg:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-title"
        className="max-h-[95vh] w-full max-w-6xl xl:max-w-7xl flex flex-col rounded-2xl bg-[#080d1a] border border-slate-700/80 shadow-2xl text-slate-100 overflow-hidden"
      >
        {/* ================= 1. CABEÇALHO COMERCIAL OBJETIVO ================= */}
        <div className="border-b border-slate-800 bg-[#0a1122] px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Lead Identity */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  {place.category || 'Empresa'}
                </span>

                {(place.neighborhood || place.city) && (
                  <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      {place.neighborhood ? `${place.neighborhood}, ` : ''}
                      {place.city || ''}
                      {place.state ? ` - ${place.state}` : ''}
                    </span>
                  </span>
                )}

                {place.rating && (
                  <span className="text-xs text-amber-300 font-bold flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{place.rating}</span>
                    {place.review_count && (
                      <span className="text-slate-400 font-normal">({place.review_count})</span>
                    )}
                  </span>
                )}

                {/* Qualification Score */}
                {score !== undefined && (
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" />
                    <span>
                      Score {score}/100 {qualificationTier ? `· Tier ${qualificationTier}` : ''}
                    </span>
                  </span>
                )}
              </div>

              <h2 id="lead-title" className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight truncate">
                {place.name}
              </h2>

              {/* Contact info subtitle */}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                {place.phone ? (
                  <span className="flex items-center gap-1 font-mono text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {place.phone}
                  </span>
                ) : (
                  <span className="text-slate-500 italic">Telefone não cadastrado</span>
                )}

                {place.website ? (
                  <a
                    href={place.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:underline truncate max-w-xs"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{place.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                  </a>
                ) : (
                  <span className="text-slate-500 italic">Sem site institucional</span>
                )}

                {place.maps_url && (
                  <a
                    href={place.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-200"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Google Maps</span>
                  </a>
                )}
              </div>
            </div>

            {/* Pipeline Stage Selector & Close Button */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Etapa Comercial */}
              <div className="flex flex-col items-start lg:items-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Etapa no Pipeline
                </span>
                <select
                  value={opportunity?.stage || ''}
                  onChange={(e) => handleStageChange(e.target.value as OpportunityStage)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors outline-none cursor-pointer ${
                    opportunity
                      ? STAGE_CONFIG[opportunity.stage]?.badgeClass || 'bg-slate-900 text-slate-200 border-slate-700'
                      : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <option value="" disabled>
                    + Adicionar ao Pipeline...
                  </option>
                  {Object.entries(STAGE_CONFIG).map(([stg, cfg]) => (
                    <option key={stg} value={stg} className="bg-slate-900 text-slate-200">
                      {cfg.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar ficha do lead"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ================= AÇÕES PRINCIPAIS COMERCIAIS ================= */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Ação 1: Ligar */}
              {hasValidPhone ? (
                <a
                  href={`tel:${cleanPhoneDigits}`}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-all"
                  title="Fazer ligação telefônica para este número"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Ligar ({rawPhone})</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 text-xs font-medium cursor-not-allowed opacity-60"
                  title="Telefone não disponível para discagem"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Sem telefone</span>
                </button>
              )}

              {/* Ação 2: WhatsApp */}
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-all"
                  title="Iniciar conversa no WhatsApp oficial"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp</span>
                </a>
              ) : null}

              {/* Ação 3: Registrar Contato */}
              <button
                type="button"
                onClick={() => setIsLogContactOpen((prev) => !prev)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  isLogContactOpen
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Registrar Contato</span>
              </button>

              {/* Re-analisar com IA */}
              <button
                type="button"
                onClick={handleTriggerAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                title="Executar ou atualizar enriquecimento Web Intelligence com IA"
              >
                <Sparkles className={`w-3.5 h-3.5 text-blue-400 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>{isAnalyzing ? 'Analisando...' : intel ? 'Reanalisar IA' : 'Qualificar com IA'}</span>
              </button>
            </div>

            {/* Quick Kanban Link & Status */}
            <div className="flex items-center gap-2 text-xs">
              {opportunity ? (
                <span className="text-slate-400">
                  {opportunity.last_contact_at
                    ? `Último contato: ${new Date(opportunity.last_contact_at).toLocaleDateString('pt-BR')}`
                    : 'Nenhum contato registrado'}
                </span>
              ) : (
                <span className="text-slate-500">Lead fora do pipeline</span>
              )}

              {onGoToKanban && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onGoToKanban();
                  }}
                  className="inline-flex items-center gap-1 text-blue-400 hover:underline font-semibold ml-2 cursor-pointer"
                >
                  <span>Abrir no Kanban</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Form inline de registro de contato */}
          {isLogContactOpen && (
            <form
              onSubmit={handleLogInteraction}
              className="mt-3 p-4 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Registrar Interação / Contato Comercial
                </span>
                <button
                  type="button"
                  onClick={() => setIsLogContactOpen(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Tipo de Contato
                  </label>
                  <select
                    value={contactType}
                    onChange={(e) => setContactType(e.target.value as ContactInteractionType)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="ligacao">📞 Ligação Telefônica</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                    <option value="reuniao">🤝 Reunião / Visita</option>
                    <option value="email">✉️ E-mail</option>
                    <option value="outro">📋 Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Desfecho
                  </label>
                  <select
                    value={contactOutcome}
                    onChange={(e) => setContactOutcome(e.target.value as ContactInteractionOutcome)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                  >
                    <option value="sucesso">✅ Sucesso / Falou com decisor</option>
                    <option value="sem_resposta">📵 Sem resposta / Caixa postal</option>
                    <option value="reagendado">📅 Reagendado retorno</option>
                    <option value="recusado">❌ Sem interesse no momento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Próxima Data de Retorno
                  </label>
                  <input
                    type="date"
                    value={nextContactDate}
                    onChange={(e) => setNextContactDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Notas da Conversa / Observações
                </label>
                <textarea
                  rows={2}
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  placeholder="Ex: Falou com o gerente Paulo. Estão trocando de sistema de vendas no próximo mês. Pediu proposta pelo WhatsApp..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <input
                  type="text"
                  placeholder="Próxima ação (Ex: Enviar proposta via PDF amanhã às 14h)"
                  value={nextActionInput}
                  onChange={(e) => setNextActionInput(e.target.value)}
                  className="flex-1 max-w-md px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                />

                <button
                  type="submit"
                  disabled={isSavingInteraction || !contactNotes.trim()}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer ml-3"
                >
                  {isSavingInteraction ? 'Salvando...' : 'Salvar Registro'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ================= 2. NAVEGAÇÃO POR 4 ABAS SIMPLES ================= */}
        <div className="border-b border-slate-800 bg-[#060a16] px-6 py-2 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('comercial')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'comercial'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-300" />
            <span>1. Comercial & Diagnóstico</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('empresa')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'empresa'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-slate-300" />
            <span>2. Empresa & Operação</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('digital')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'digital'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>3. Presença Digital & Evidências</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('avaliacoes_midia')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'avaliacoes_midia'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Star className="w-4 h-4 text-amber-400" />
            <span>4. Avaliações & Mídia ({photos.length})</span>
          </button>
        </div>

        {/* ================= 3. CONTEÚDO PRINCIPAL DAS ABAS ================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: COMERCIAL */}
          {activeTab === 'comercial' && (
            <div className="space-y-6">
              {/* Oportunidade Deal Management Bar */}
              <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Valor Estimado da Proposta
                    </span>
                    {isEditingDeal ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-400">R$</span>
                        <input
                          type="number"
                          placeholder="0,00"
                          value={dealValueInput}
                          onChange={(e) => setDealValueInput(e.target.value)}
                          className="w-28 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-emerald-300 font-mono font-bold"
                        />
                      </div>
                    ) : (
                      <span className="text-lg font-bold font-mono text-emerald-400">
                        {opportunity?.deal_value && opportunity.deal_value > 0
                          ? `R$ ${opportunity.deal_value.toLocaleString('pt-BR')}`
                          : 'Não orçado'}
                      </span>
                    )}
                  </div>

                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Contato / Decisor
                    </span>
                    {isEditingDeal ? (
                      <input
                        type="text"
                        placeholder="Nome do decisor"
                        value={contactNameInput}
                        onChange={(e) => setContactNameInput(e.target.value)}
                        className="mt-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-200">
                        {opportunity?.contact_name || 'A identificar'}
                      </span>
                    )}
                  </div>

                  <div className="border-l border-slate-800 pl-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Responsável Interno
                    </span>
                    {isEditingDeal ? (
                      <input
                        type="text"
                        placeholder="Vendedor responsável"
                        value={assignedToInput}
                        onChange={(e) => setAssignedToInput(e.target.value)}
                        className="mt-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-200"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-200">
                        {opportunity?.assigned_to || 'Não atribuído'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isEditingDeal ? (
                    <>
                      <button
                        type="button"
                        onClick={handleSaveDealDetails}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        Salvar Alterações
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingDeal(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingDeal(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                    >
                      Editar Dados Comerciais
                    </button>
                  )}
                </div>
              </div>

              {/* Bloco 1: Síntese Comercial & Diagnóstico */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quem é a Empresa & Oportunidade */}
                <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Quem é a Empresa & Operação
                    </h3>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                    <p>
                      <strong className="text-slate-100">Resumo: </strong>
                      {intel?.commercial_analysis?.executive_summary ||
                        'Estabelecimento comercial coletado via Google Maps. Aguardando enriquecimento via IA.'}
                    </p>

                    {intel?.business_identity?.primary_activity && (
                      <p>
                        <strong className="text-slate-100">Atividade Principal: </strong>
                        {intel.business_identity.primary_activity}
                      </p>
                    )}

                    {intel?.business_identity?.target_audience && (
                      <p>
                        <strong className="text-slate-100">Público-alvo: </strong>
                        {intel.business_identity.target_audience}
                      </p>
                    )}

                    {intel?.operational_structure?.operational_details && (
                      <p>
                        <strong className="text-slate-100">Estrutura Operacional: </strong>
                        {intel.operational_structure.operational_details}
                      </p>
                    )}
                  </div>
                </div>

                {/* Qual o Problema / Sinais de Oportunidade */}
                <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Diagnóstico & Oportunidades Identificadas
                    </h3>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                    <p>
                      <strong className="text-slate-100">Diagnóstico: </strong>
                      {intel?.opportunity_signals?.observations ||
                        'Potencial de melhoria na integração de canais de atendimento, controle de estoque e digitalização das vendas.'}
                    </p>

                    {intel?.opportunity_signals?.opportunity_areas &&
                      intel.opportunity_signals.opportunity_areas.length > 0 && (
                        <div>
                          <strong className="text-slate-100 block mb-1.5">
                            Áreas de Oportunidade:
                          </strong>
                          <div className="flex flex-wrap gap-1.5">
                            {intel.opportunity_signals.opportunity_areas.map((area, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300 font-medium text-[11px]"
                              >
                                {area}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {intel?.commercial_analysis?.information_gaps &&
                      intel.commercial_analysis.information_gaps.length > 0 && (
                        <div>
                          <strong className="text-slate-100 block mb-1">
                            Lacunas a Investigar no Contato:
                          </strong>
                          <ul className="list-disc list-inside space-y-1 text-slate-400">
                            {intel.commercial_analysis.information_gaps.map((gap, idx) => (
                              <li key={idx}>{gap}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>
              </div>

              {/* Bloco 2: Solução Recomendada & Por que faz sentido */}
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-blue-800/40">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-blue-200">
                      Solução Comercial Recomendada & Aderência
                    </h3>
                  </div>

                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-blue-600/30 border border-blue-500/40 text-blue-200">
                    {intel?.commercial_analysis?.recommended_solution ||
                      intel?.commercial_analysis?.recommended_limber_solution ||
                      'ERP Integrado de Gestão Comercial'}
                  </span>
                </div>

                <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                  <p>
                    <strong className="text-blue-300">Justificativa da Oferta: </strong>
                    {intel?.commercial_analysis?.solution_justification ||
                      'Solução completa de gestão comercial capaz de centralizar pedidos, emissão fiscal, contas e fidelização de clientes.'}
                  </p>

                  {/* Fit points */}
                  {((intel?.commercial_analysis?.fit_points ||
                    intel?.commercial_analysis?.limber_fit_points) &&
                    (intel?.commercial_analysis?.fit_points ||
                      intel?.commercial_analysis?.limber_fit_points)!.length > 0) && (
                    <div>
                      <strong className="text-blue-300 block mb-2">
                        Por que essa solução faz sentido (Pontos de Aderência):
                      </strong>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(
                          intel.commercial_analysis.fit_points ||
                          intel.commercial_analysis.limber_fit_points ||
                          []
                        ).map((fit, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="text-slate-200 text-xs">{fit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloco 3: O que o Vendedor deve Perguntar (Guia de Sondagem) */}
              <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Perguntas de Sondagem para o Vendedor (Discovery)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">Roteiro para Ligação ou WhatsApp</span>
                </div>

                <div className="space-y-2.5">
                  {(intel?.commercial_analysis?.seller_discovery_questions &&
                  intel.commercial_analysis.seller_discovery_questions.length > 0
                    ? intel.commercial_analysis.seller_discovery_questions
                    : [
                        'Como vocês controlam os pedidos recebidos pelos canais digitais atualmente?',
                        'Qual o maior gargalo operacional na gestão de clientes e vendas hoje?',
                        'Vocês utilizam algum software integrado de frente de caixa e estoque atualmente?',
                      ]
                  ).map((question, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors"
                    >
                      <span className="h-6 w-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-xs sm:text-sm text-slate-200 font-medium leading-snug flex-1">
                        "{question}"
                      </p>
                      <button
                        type="button"
                        onClick={() => handleCopy(question, `question_${idx}`)}
                        className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer shrink-0"
                        title="Copiar pergunta"
                      >
                        {copiedKey === `question_${idx}` ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bloco 4: Histórico de Contatos e Interações Registradas */}
              <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Histórico de Interações & Acompanhamento
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsLogContactOpen(true)}
                    className="text-xs text-blue-400 hover:underline font-semibold cursor-pointer"
                  >
                    + Novo Contato
                  </button>
                </div>

                {opportunity?.contact_history && opportunity.contact_history.length > 0 ? (
                  <div className="space-y-3">
                    {opportunity.contact_history.map((interaction, idx) => (
                      <div
                        key={interaction.id || idx}
                        className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                            {interaction.type === 'ligacao' && '📞 Ligação'}
                            {interaction.type === 'whatsapp' && '💬 WhatsApp'}
                            {interaction.type === 'reuniao' && '🤝 Reunião'}
                            {interaction.type === 'email' && '✉️ E-mail'}
                            {interaction.type === 'outro' && '📋 Contato'}
                            <span className="text-slate-500 font-normal">
                              · {new Date(interaction.created_at).toLocaleString('pt-BR')}
                            </span>
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              interaction.outcome === 'sucesso'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : interaction.outcome === 'sem_resposta'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : interaction.outcome === 'reagendado'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {interaction.outcome === 'sucesso' && 'Falou com decisor'}
                            {interaction.outcome === 'sem_resposta' && 'Sem resposta'}
                            {interaction.outcome === 'reagendado' && 'Reagendado'}
                            {interaction.outcome === 'recusado' && 'Recusado'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">
                          {interaction.notes}
                        </p>

                        {interaction.next_contact_at && (
                          <div className="text-[11px] text-amber-300/90 flex items-center gap-1 pt-1">
                            <Calendar className="w-3 h-3" />
                            <span>
                              Retorno agendado para:{' '}
                              {new Date(interaction.next_contact_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Nenhum contato registrado ainda. Clique em "Registrar Contato" para registrar a primeira tentativa.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: EMPRESA & OPERAÇÃO */}
          {activeTab === 'empresa' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dados Cadastrais */}
                <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Informações Cadastrais
                    </h3>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Nome Oficial:</span>
                      <span className="font-semibold text-slate-100">{place.name}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Categoria Primária:</span>
                      <span className="font-semibold text-slate-100">{place.category || '—'}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Endereço Completo:</span>
                      <span className="font-semibold text-slate-100 text-right max-w-xs">
                        {place.address || '—'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Bairro:</span>
                      <span className="font-semibold text-slate-100">{place.neighborhood || '—'}</span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Cidade / UF:</span>
                      <span className="font-semibold text-slate-100">
                        {place.city || '—'}{place.state ? ` / ${place.state}` : ''}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">CEP:</span>
                      <span className="font-mono text-slate-100">{place.postal_code || '—'}</span>
                    </div>

                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Status Operacional:</span>
                      <span className="font-semibold text-slate-100">{place.business_status || 'Aberto'}</span>
                    </div>
                  </div>
                </div>

                {/* Estrutura Operacional & Atendimento */}
                <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Estrutura Operacional
                    </h3>
                  </div>

                  <div className="space-y-2.5 text-xs text-slate-300">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Canais de Atendimento:</span>
                      <span className="font-semibold text-slate-100">
                        {intel?.operational_structure?.support_channels?.join(', ') ||
                          (place.phone ? 'Telefone, Balcão' : 'Balcão físico')}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Estimativa de Unidades:</span>
                      <span className="font-semibold text-slate-100">
                        {intel?.operational_structure?.unit_count_estimate || '1 unidade'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Venda Online / E-commerce:</span>
                      <span className="font-semibold text-slate-100">
                        {intel?.operational_structure?.has_ecommerce ? 'Sim ✅' : 'Não identificado'}
                      </span>
                    </div>

                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Agendamento ou Pedidos Online:</span>
                      <span className="font-semibold text-slate-100">
                        {intel?.operational_structure?.has_booking_or_orders ? 'Sim ✅' : 'Não identificado'}
                      </span>
                    </div>

                    {place.latitude && place.longitude && (
                      <div className="flex justify-between py-1">
                        <span className="text-slate-400">Coordenadas GPS:</span>
                        <span className="font-mono text-slate-200">
                          {place.latitude}, {place.longitude}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Horários de Funcionamento */}
              {place.opening_hours && (
                <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Horários de Atendimento
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {place.opening_hours.split('\n').map((line, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300"
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRESENÇA DIGITAL & EVIDÊNCIAS */}
          {activeTab === 'digital' && (
            <div className="space-y-6">
              {/* Resumo Digital */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-slate-800 bg-[#091124]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Website Institucional
                  </span>
                  {place.website ? (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-blue-400 hover:underline flex items-center gap-1 truncate"
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <span className="truncate">{place.website.replace(/^https?:\/\//, '')}</span>
                    </a>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Sem site institucional</span>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#091124]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Maturidade Digital
                  </span>
                  <span className="text-sm font-bold text-emerald-300">
                    {intel?.digital_maturity?.level || 'Básico / Local'}
                    {intel?.scores?.digital_maturity ? ` (${intel.scores.digital_maturity}%)` : ''}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#091124]">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Processos Digitais
                  </span>
                  <span className="text-xs text-slate-300 line-clamp-2">
                    {intel?.digital_maturity?.digital_processes_summary || 'Presença inicial no Google Maps'}
                  </span>
                </div>
              </div>

              {/* Tecnologias Detectadas */}
              {intel?.digital_maturity?.detected_technologies &&
                intel.digital_maturity.detected_technologies.length > 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                      <Tag className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                        Tecnologias & Ferramentas Detectadas
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intel.digital_maturity.detected_technologies.map((tech, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 font-mono text-xs font-semibold"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Evidências e Fontes Coletadas */}
              <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                      Evidências e Fontes da Análise ({intel?.evidences?.length || 0})
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400">Rastreabilidade e dados coletados</span>
                </div>

                {intel?.evidences && intel.evidences.length > 0 ? (
                  <div className="space-y-2.5">
                    {intel.evidences.map((ev, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <span className="font-semibold text-slate-200 block">{ev.info}</span>
                          <span className="text-slate-500 text-[11px] block">{ev.evidence_type}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              ev.confidence === 'confirmado_no_site'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                            }`}
                          >
                            {ev.confidence === 'confirmado_no_site'
                              ? 'Confirmado no Site'
                              : ev.confidence === 'dados_coleta'
                              ? 'Dados Maps'
                              : ev.confidence === 'inferencia_comercial'
                              ? 'Inferência IA'
                              : 'Não Identificado'}
                          </span>
                          {ev.url && (
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <span>Fonte</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    Nenhuma evidência extraída ainda. Execute a análise com IA para rastrear as fontes.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: AVALIAÇÕES & MÍDIA */}
          {activeTab === 'avaliacoes_midia' && (
            <div className="space-y-6">
              {/* Resumo de Avaliações */}
              <div className="rounded-2xl border border-slate-800 bg-[#091124] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 mb-1">
                      Reputação no Google Maps
                    </h3>
                    <p className="text-xs text-slate-400">
                      Opinião pública e notas deixadas por clientes no perfil comercial.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-extrabold text-amber-300 font-mono">
                      {place.rating && !isNaN(parseFloat(place.rating))
                        ? parseFloat(place.rating).toFixed(1)
                        : '—'}
                    </span>
                    <div>
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const parsedRating = place.rating ? parseFloat(place.rating) : 0;
                          return (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                !isNaN(parsedRating) && i < Math.floor(parsedRating)
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-600'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {place.review_count ? `${place.review_count} avaliações` : 'Sem avaliações'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Galeria de Fotos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    Galeria de Fotos Públicas ({photos.length})
                  </h3>
                </div>

                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {photos.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-800 block shadow-md"
                      >
                        <img
                          src={url}
                          alt={`${place.name} - Foto ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500 rounded-xl border border-slate-800 bg-[#091124]">
                    Nenhuma foto pública foi coletada na ficha.
                  </div>
                )}
              </div>

              {/* Vídeos */}
              {videos.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                    Vídeos Disponíveis ({videos.length})
                  </h3>
                  <div className="space-y-2">
                    {videos.map((vid, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-300 truncate max-w-lg">{vid}</span>
                        {vid.startsWith('http') && (
                          <a
                            href={vid}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1 shrink-0"
                          >
                            <span>Abrir vídeo</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= 4. ÁREA SECUNDÁRIA: DADOS TÉCNICOS & JSON ================= */}
        <div className="border-t border-slate-800 bg-[#060a16]">
          <button
            type="button"
            onClick={() => setIsTechnicalAreaExpanded((prev) => !prev)}
            className="w-full px-6 py-2.5 flex items-center justify-between text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-slate-500" />
              <span>Dados Técnicos, 41 Campos Coletados & JSON</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-normal">
                {isTechnicalAreaExpanded ? 'Recolher área técnica' : 'Expandir dados brutos'}
              </span>
              {isTechnicalAreaExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </button>

          {isTechnicalAreaExpanded && (
            <div className="p-6 border-t border-slate-800 bg-[#050812] max-h-96 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={technicalSearch}
                    onChange={(e) => setTechnicalSearch(e.target.value)}
                    placeholder="Filtrar campos por chave ou valor..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(place, null, 2), 'raw_json')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 cursor-pointer"
                >
                  {copiedKey === 'raw_json' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar JSON Completo</span>
                    </>
                  )}
                </button>
              </div>

              {/* Tabela de 41 campos */}
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] uppercase border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Campo</th>
                      <th className="py-2 px-3">Valor</th>
                      <th className="py-2 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredFields.map(([k, v]) => (
                      <tr key={k} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3 font-semibold text-slate-300">{k}</td>
                        <td className="py-2 px-3 text-slate-400 max-w-md truncate">
                          {v !== null && v !== undefined && v !== '' ? String(v) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {v && (
                            <button
                              type="button"
                              onClick={() => handleCopy(String(v), `field_${k}`)}
                              className="text-slate-500 hover:text-slate-200 p-1 cursor-pointer"
                              title="Copiar valor"
                            >
                              {copiedKey === `field_${k}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
