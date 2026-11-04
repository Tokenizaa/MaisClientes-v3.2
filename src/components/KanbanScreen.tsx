import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Kanban,
  Plus,
  Search,
  Sparkles,
  Phone,
  Globe,
  MapPin,
  TrendingUp,
  DollarSign,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  MoreVertical,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  User,
  Trash2,
} from 'lucide-react';
import type { OpportunityRecord, OpportunityStage, PlaceRecord } from '../shared/types';
import { apiFetch } from '../utils/api';
import { LeadDetailsModal, STAGE_CONFIG } from './LeadDetailsModal';

interface Props {
  places: PlaceRecord[];
  onSelectPlaceForDetails?: (place: PlaceRecord) => void;
}

const STAGES: { id: OpportunityStage; label: string; shortLabel: string; color: string; border: string; bg: string }[] = [
  { id: 'lead', label: '1. Lead Coletado', shortLabel: 'Lead', color: 'text-slate-300', border: 'border-slate-800', bg: 'bg-[#0a0f1d]' },
  { id: 'qualificacao', label: '2. Qualificação Web', shortLabel: 'Qualificação', color: 'text-blue-400', border: 'border-blue-900/40', bg: 'bg-[#081226]' },
  { id: 'apresentacao', label: '3. Demonstração Comercial', shortLabel: 'Demonstração', color: 'text-indigo-400', border: 'border-indigo-900/40', bg: 'bg-[#0c102b]' },
  { id: 'proposta', label: '4. Proposta Enviada', shortLabel: 'Proposta', color: 'text-amber-400', border: 'border-amber-900/40', bg: 'bg-[#18140a]' },
  { id: 'fechado', label: '5. Fechado / Ganho', shortLabel: 'Ganho', color: 'text-emerald-400', border: 'border-emerald-900/40', bg: 'bg-[#081710]' },
  { id: 'perdido', label: 'Perdido', shortLabel: 'Perdido', color: 'text-rose-400', border: 'border-rose-900/40', bg: 'bg-[#180a0d]' },
];

export const KanbanScreen: React.FC<Props> = ({ places, onSelectPlaceForDetails }) => {
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  // Lead inspection modal in-place
  const [inspectingPlace, setInspectingPlace] = useState<PlaceRecord | null>(null);

  // New opportunity modal state
  const [isAddingModalOpen, setIsAddingModalOpen] = useState<boolean>(false);
  const [selectedPlaceIdForNew, setSelectedPlaceIdForNew] = useState<string>('');
  const [newDealValue, setNewDealValue] = useState<string>('');
  const [newStage, setNewStage] = useState<OpportunityStage>('lead');
  const [newNextAction, setNewNextAction] = useState<string>('');
  const [newAssignedTo, setNewAssignedTo] = useState<string>('');

  // Drag and drop state
  const [draggedOppId, setDraggedOppId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<OpportunityStage | null>(null);

  const loadOpportunities = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/v1/opportunities');
      if (res.ok) {
        const json = await res.json();
        setOpportunities(json.data || []);
      }
    } catch (err) {
      console.error('Falha ao carregar oportunidades:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpportunities();
  }, [loadOpportunities]);

  const handleMoveStage = async (id: string, stage: OpportunityStage) => {
    const previous = opportunities;
    setOpportunities((prev) =>
      prev.map((opp) => (opp.id === id ? { ...opp, stage, updated_at: new Date().toISOString() } : opp))
    );
    try {
      const res = await apiFetch(`/api/v1/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) {
        throw new Error(`Falha HTTP ${res.status} ao mover oportunidade.`);
      }
      const json = await res.json();
      setOpportunities((prev) => prev.map((o) => (o.id === id ? json.data : o)));
    } catch (err) {
      console.error('Falha ao mover estágio:', err);
      setOpportunities(previous);
      await loadOpportunities();
    }
  };

  const handleDeleteOpportunity = async (id: string) => {
    const previous = opportunities;
    setOpportunities((prev) => prev.filter((opp) => opp.id !== id));
    try {
      const res = await apiFetch(`/api/v1/opportunities/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(`Falha HTTP ${res.status} ao excluir oportunidade.`);
      }
    } catch (err) {
      console.error('Falha ao excluir oportunidade:', err);
      setOpportunities(previous);
      await loadOpportunities();
    }
  };

  const handleCreateNewOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlaceIdForNew) return;
    try {
      const res = await apiFetch('/api/v1/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: selectedPlaceIdForNew,
          stage: newStage,
          dealValue: Number(newDealValue) || 0,
          nextAction: newNextAction.trim(),
          assignedTo: newAssignedTo.trim(),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setOpportunities((prev) => [json.data, ...prev.filter((o) => o.id !== json.data.id)]);
        }
        setIsAddingModalOpen(false);
        setSelectedPlaceIdForNew('');
        setNewDealValue('');
        setNewNextAction('');
        setNewAssignedTo('');
      }
    } catch (err) {
      console.error('Falha ao criar oportunidade:', err);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    setDraggedOppId(id);
  };

  const handleDragOver = (e: React.DragEvent, colId: OpportunityStage) => {
    e.preventDefault();
    if (dragOverColumn !== colId) {
      setDragOverColumn(colId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, colId: OpportunityStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedOppId;
    setDragOverColumn(null);
    setDraggedOppId(null);
    if (id) {
      handleMoveStage(id, colId);
    }
  };

  // Check if follow-up is delayed
  const isFollowUpDelayed = (nextContactAt?: string) => {
    if (!nextContactAt) return false;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(nextContactAt);
      return target < today;
    } catch {
      return false;
    }
  };

  // Filtered opportunities
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      if (stageFilter !== 'all' && opp.stage !== stageFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        opp.place_name.toLowerCase().includes(q) ||
        opp.category.toLowerCase().includes(q) ||
        opp.city?.toLowerCase().includes(q) ||
        opp.contact_name?.toLowerCase().includes(q) ||
        opp.assigned_to?.toLowerCase().includes(q) ||
        (opp.next_action && opp.next_action.toLowerCase().includes(q))
      );
    });
  }, [opportunities, searchQuery, stageFilter]);

  // Accurate Metrics (strict adherence to specs)
  const metrics = useMemo(() => {
    const total = opportunities.length;
    // Oportunidades Ativas: estritamente diferente de fechado e perdido
    const active = opportunities.filter((o) => o.stage !== 'fechado' && o.stage !== 'perdido');
    const activeCount = active.length;

    // Valor em Pipeline: soma apenas dos ativos com valor preenchido (> 0)
    const pipelineValue = active.reduce((acc, curr) => acc + (Number(curr.deal_value) || 0), 0);

    // Fechados / Ganho
    const wonCount = opportunities.filter((o) => o.stage === 'fechado').length;

    // Atenção necessária: retornos atrasados ou sem acompanhamento
    const attentionNeeded = active.filter((o) => {
      const delayed = isFollowUpDelayed(o.next_contact_at);
      const noContact = !o.next_action && !o.last_contact_at;
      return delayed || noContact;
    }).length;

    return { activeCount, pipelineValue, wonCount, attentionNeeded, total };
  }, [opportunities]);

  // Handle open lead sheet from Kanban
  const handleOpenLeadDetails = (placeId: string) => {
    const place = places.find((p) => p.id === placeId);
    if (place) {
      setInspectingPlace(place);
    } else {
      // Create a fallback PlaceRecord from opportunity data
      const opp = opportunities.find((o) => o.place_id === placeId);
      if (opp) {
        const syntheticPlace: PlaceRecord = {
          id: opp.place_id,
          name: opp.place_name,
          category: opp.category,
          address: '',
          phone: opp.phone || '',
          website: opp.website || '',
          rating: '',
          review_count: '',
          price_range: '',
          opening_hours: '',
          business_status: 'Aberto',
          latitude: '',
          longitude: '',
          maps_url: '',
          description: '',
          services_attributes: '',
          city: opp.city,
          collected_at: opp.created_at,
          job_id: 'kanban',
          web_intelligence: opp.web_intelligence,
          web_intelligence_score: opp.score,
        };
        setInspectingPlace(syntheticPlace);
      }
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto py-3 sm:py-5 space-y-5">
      {/* ================= 1. CABEÇALHO DO KANBAN ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-semibold mb-1">
            <Kanban className="w-3.5 h-3.5 text-blue-400" />
            <span>CRM & Gestão de Pipeline</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Pipeline de Oportunidades
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Acompanhe cada etapa da negociação, registre retornos e converta estabelecimentos em clientes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAddingModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Oportunidade</span>
          </button>
        </div>
      </div>

      {/* ================= 2. INDICADORES COMERCIAIS CORRETOS ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Oportunidades Ativas (Exclui estritamente Fechados e Perdidos) */}
        <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Oportunidades Ativas
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums">
              {metrics.activeCount}
            </p>
            <span className="text-xs text-slate-500">de {metrics.total} totais</span>
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Em prospecção, qualificação ou proposta
          </span>
        </div>

        {/* Valor em Pipeline Ativo */}
        <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
            Valor em Pipeline Ativo
          </span>
          <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono tabular-nums">
            {metrics.pipelineValue > 0
              ? `R$ ${metrics.pipelineValue.toLocaleString('pt-BR')}`
              : 'R$ 0'}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Soma de propostas ativas declaradas
          </span>
        </div>

        {/* Atenção Necessária */}
        <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 shadow-sm">
          <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
            Atenção Necessária
          </span>
          <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-amber-300 font-mono tabular-nums">
            {metrics.attentionNeeded}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Retornos vencidos ou sem acompanhamento
          </span>
        </div>

        {/* Fechados / Ganho */}
        <div className="rounded-xl border border-slate-800 bg-[#091122] p-4 shadow-sm">
          <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
            Contratos Ganhos
          </span>
          <p className="mt-1 text-2xl sm:text-3xl font-extrabold text-indigo-300 font-mono tabular-nums">
            {metrics.wonCount}
          </p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Oportunidades fechadas com sucesso
          </span>
        </div>
      </div>

      {/* ================= 3. BARRA DE BUSCA E FILTROS ================= */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por empresa, contato, cidade ou ação..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Fase:</span>
          </span>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">Todas as Fases</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ================= 4. COLUNAS DO KANBAN COM DRAG & DROP ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start overflow-x-auto pb-6">
        {STAGES.map((col) => {
          const colItems = filteredOpportunities.filter((o) => o.stage === col.id);
          const isOver = dragOverColumn === col.id;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.id)}
              className={`flex flex-col rounded-xl border transition-all min-h-[550px] p-2.5 ${col.border} ${col.bg} ${
                isOver ? 'ring-2 ring-blue-500/70 border-blue-400 bg-blue-950/30' : ''
              }`}
            >
              {/* Cabeçalho da Coluna */}
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80 mb-2.5 px-1">
                <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                  {col.shortLabel}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-slate-950 text-slate-300 border border-slate-800">
                  {colItems.length}
                </span>
              </div>

              {/* Lista de Cards da Coluna */}
              <div className="space-y-2.5 flex-1">
                {colItems.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-600 border border-dashed border-slate-800/60 rounded-lg">
                    Solte aqui ou adicione oportunidade
                  </div>
                ) : (
                  colItems.map((item) => {
                    const delayed = isFollowUpDelayed(item.next_contact_at);
                    const noFollowUp = !item.next_action && !item.last_contact_at;

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className={`rounded-xl border border-slate-800 bg-[#0a1224] hover:border-slate-700 p-3 space-y-2 shadow-sm transition-all cursor-grab active:cursor-grabbing group ${
                          draggedOppId === item.id ? 'opacity-40' : ''
                        }`}
                      >
                        {/* Linha 1: Nome e Score */}
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            data-testid="kanban-lead-btn"
                            onClick={() => handleOpenLeadDetails(item.place_id)}
                            className="text-left font-bold text-xs sm:text-sm text-slate-100 hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer flex-1"
                            title="Clique para abrir a ficha completa do lead"
                          >
                            {item.place_name}
                          </button>

                          {item.score !== undefined && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                              {item.score} pts
                            </span>
                          )}
                        </div>

                        {/* Linha 2: Categoria & Localização */}
                        <div className="text-[11px] text-slate-400 line-clamp-1 flex items-center gap-1">
                          <span className="truncate">{item.category}</span>
                          {item.city && (
                            <>
                              <span className="text-slate-600">·</span>
                              <span className="truncate">{item.city}</span>
                            </>
                          )}
                        </div>

                        {/* Linha 3: Valor Estimado (Apenas quando informado) */}
                        {item.deal_value && item.deal_value > 0 ? (
                          <div className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
                            <span>R$ {item.deal_value.toLocaleString('pt-BR')}</span>
                          </div>
                        ) : null}

                        {/* Linha 4: Próxima Ação */}
                        {item.next_action && (
                          <div className="text-[11px] text-slate-300 bg-slate-900/90 border border-slate-800 rounded p-1.5 line-clamp-2">
                            <span className="font-bold text-slate-400">Próx:</span> {item.next_action}
                          </div>
                        )}

                        {/* Linha 5: Indicadores de Retorno Atrasado ou Sem Acompanhamento */}
                        {delayed && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded px-1.5 py-0.5">
                            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>
                              Retorno atrasado (
                              {new Date(item.next_contact_at!).toLocaleDateString('pt-BR')}
                              )
                            </span>
                          </div>
                        )}

                        {!delayed && noFollowUp && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-300/90 bg-amber-950/30 border border-amber-500/30 rounded px-1.5 py-0.5">
                            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Sem acompanhamento</span>
                          </div>
                        )}

                        {/* Linha 6: Movimentação Acessível & Ações */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
                          {/* Seletor acessível de etapa (alternativa ao Drag and Drop) */}
                          <select
                            value={item.stage}
                            onChange={(e) => handleMoveStage(item.id, e.target.value as OpportunityStage)}
                            aria-label="Mover para etapa"
                            className="text-[10px] bg-slate-900 border border-slate-800 text-slate-300 rounded px-1.5 py-0.5 outline-none hover:border-slate-700 cursor-pointer max-w-[110px] truncate"
                          >
                            {STAGES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.shortLabel}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenLeadDetails(item.place_id)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded bg-blue-950/40 border border-blue-800/40 cursor-pointer"
                              title="Abrir ficha do lead"
                            >
                              Ficha
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteOpportunity(item.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                              title="Remover oportunidade"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ================= MODAL DE NOVA OPORTUNIDADE ================= */}
      {isAddingModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsAddingModalOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#091122] border border-slate-700 p-6 space-y-4 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Nova Oportunidade no Pipeline</span>
              </h2>
              <button
                type="button"
                onClick={() => setIsAddingModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNewOpportunity} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Selecione o Estabelecimento Coletado *
                </label>
                <select
                  value={selectedPlaceIdForNew}
                  onChange={(e) => setSelectedPlaceIdForNew(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">Selecione uma empresa da base...</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.city ? `(${p.city})` : ''} — {p.category || 'Geral'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Etapa Inicial
                  </label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as OpportunityStage)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="number"
                    placeholder="0,00 (opcional)"
                    value={newDealValue}
                    onChange={(e) => setNewDealValue(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Próxima Ação
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ligar para verificar interesse em sistema de gestão"
                  value={newNextAction}
                  onChange={(e) => setNewNextAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Vendedor Responsável
                </label>
                <input
                  type="text"
                  placeholder="Nome do consultor comercial (opcional)"
                  value={newAssignedTo}
                  onChange={(e) => setNewAssignedTo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedPlaceIdForNew}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md disabled:opacity-50 cursor-pointer"
                >
                  Criar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL COMPLETO DA FICHA DO LEAD IN-PLACE ================= */}
      {inspectingPlace && (
        <LeadDetailsModal
          place={inspectingPlace}
          onClose={() => setInspectingPlace(null)}
          onOpportunityUpdated={(updatedOpp) => {
            setOpportunities((prev) =>
              prev.map((o) => (o.id === updatedOpp.id ? updatedOpp : o))
            );
          }}
          onPlaceUpdated={(updatedPlace) => {
            setInspectingPlace(updatedPlace);
          }}
        />
      )}
    </div>
  );
};
