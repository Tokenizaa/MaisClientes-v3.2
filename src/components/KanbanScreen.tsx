import React, { useState, useEffect, useMemo } from 'react';
import {
  Kanban,
  Plus,
  Search,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Phone,
  Globe,
  MapPin,
  TrendingUp,
  DollarSign,
  Calendar,
  Layers,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Check,
} from 'lucide-react';
import type { OpportunityRecord, OpportunityStage, PlaceRecord } from '../shared/types';
import { apiFetch } from '../utils/api';

interface Props {
  places: PlaceRecord[];
  onSelectPlaceForDetails: (place: PlaceRecord) => void;
}

const STAGES: { id: OpportunityStage; label: string; color: string; border: string; bg: string }[] = [
  { id: 'lead', label: '1. Lead Coletado', color: 'text-slate-300', border: 'border-slate-700', bg: 'bg-slate-900/50' },
  { id: 'qualificacao', label: '2. Qualificação Web', color: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-950/20' },
  { id: 'apresentacao', label: '3. Demonstração Comercial', color: 'text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-950/20' },
  { id: 'proposta', label: '4. Proposta Enviada', color: 'text-amber-400', border: 'border-amber-500/30', bg: 'bg-amber-950/20' },
  { id: 'fechado', label: '5. Fechado / Ganho', color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-950/20' },
  { id: 'perdido', label: 'Perdido', color: 'text-rose-400', border: 'border-rose-500/30', bg: 'bg-rose-950/20' },
];

export const KanbanScreen: React.FC<Props> = ({ places, onSelectPlaceForDetails }) => {
  const [opportunities, setOpportunities] = useState<OpportunityRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddingModalOpen, setIsAddingModalOpen] = useState<boolean>(false);
  const [selectedPlaceIdForNew, setSelectedPlaceIdForNew] = useState<string>('');
  const [customDealValue, setCustomDealValue] = useState<string>('3500');

  const loadOpportunities = async () => {
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
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  const handleMoveStage = async (id: string, newStage: OpportunityStage) => {
    // Optimistic UI update
    setOpportunities((prev) =>
      prev.map((opp) => (opp.id === id ? { ...opp, stage: newStage } : opp))
    );
    try {
      await apiFetch(`/api/v1/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch (err) {
      console.error('Falha ao mover estágio:', err);
      loadOpportunities();
    }
  };

  const handleDeleteOpportunity = async (id: string) => {
    setOpportunities((prev) => prev.filter((opp) => opp.id !== id));
    try {
      await apiFetch(`/api/v1/opportunities/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Falha ao excluir oportunidade:', err);
      loadOpportunities();
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
          stage: 'qualificacao',
          dealValue: Number(customDealValue) || 0,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setOpportunities((prev) => [json.data, ...prev.filter((o) => o.id !== json.data.id)]);
        }
        setIsAddingModalOpen(false);
        setSelectedPlaceIdForNew('');
      }
    } catch (err) {
      console.error('Falha ao criar oportunidade:', err);
    }
  };

  const filteredOpportunities = useMemo(() => {
    if (!searchQuery.trim()) return opportunities;
    const q = searchQuery.toLowerCase();
    return opportunities.filter(
      (opp) =>
        opp.place_name.toLowerCase().includes(q) ||
        opp.category.toLowerCase().includes(q) ||
        opp.city?.toLowerCase().includes(q) ||
        (opp.web_intelligence?.commercial_analysis.recommended_solution || opp.web_intelligence?.commercial_analysis.recommended_limber_solution || '').toLowerCase().includes(q)
    );
  }, [opportunities, searchQuery]);

  const metrics = useMemo(() => {
    const total = opportunities.length;
    const active = opportunities.filter((o) => o.stage !== 'fechado' && o.stage !== 'perdido');
    const totalValue = active.reduce((acc, curr) => acc + (Number(curr.deal_value) || 0), 0);
    const wonCount = opportunities.filter((o) => o.stage === 'fechado').length;
    const avgScore = total > 0 ? Math.round(opportunities.reduce((acc, curr) => acc + (curr.score || 70), 0) / total) : 0;
    return { total, totalValue, wonCount, avgScore };
  }, [opportunities]);

  return (
    <div className="max-w-7xl mx-auto py-4 sm:py-6 space-y-6">
      {/* Title & Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 font-mono">
            <Kanban className="w-3.5 h-3.5 text-blue-400" />
            <span>Pipeline Comercial</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Pipeline de Oportunidades
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-300">
            Acompanhamento das oportunidades enriquecidas com Web Intelligence e inteligência comercial.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAddingModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Oportunidade</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Oportunidades Ativas</span>
          <p className="mt-1 text-2xl font-extrabold text-white font-mono">{metrics.total}</p>
          <span className="text-[11px] text-slate-400">Em prospecção ou fechamento</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Valor em Pipeline</span>
          <p className="mt-1 text-2xl font-extrabold text-emerald-300 font-mono">
            R$ {metrics.totalValue.toLocaleString('pt-BR')}
          </p>
          <span className="text-[11px] text-slate-400">Estimativa inicial das propostas</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Score de Qualificação</span>
          <p className="mt-1 text-2xl font-extrabold text-blue-300 font-mono">
            {metrics.avgScore} <span className="text-xs font-normal text-slate-400">/ 100</span>
          </p>
          <span className="text-[11px] text-slate-400">Qualificação por Web Intelligence</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Fechados / Ganhos</span>
          <p className="mt-1 text-2xl font-extrabold text-indigo-300 font-mono">{metrics.wonCount}</p>
          <span className="text-[11px] text-slate-400">Contratos concluídos</span>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filtrar oportunidades por empresa, cidade, categoria ou solução recomendada..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-slate-500"
        />
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start overflow-x-auto pb-6">
        {STAGES.map((col, colIdx) => {
          const colItems = filteredOpportunities.filter((o) => o.stage === col.id);

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-2xl border ${col.border} ${col.bg} p-3 min-h-[500px] shadow-lg`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
                <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                  {col.label}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-950 text-slate-300 border border-slate-800">
                  {colItems.length}
                </span>
              </div>

              {/* Column Cards */}
              <div className="space-y-3 flex-1">
                {colItems.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Nenhuma oportunidade nesta fase.
                  </div>
                ) : (
                  colItems.map((item) => {
                    const place = places.find((p) => p.id === item.place_id);

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/90 hover:border-slate-700 p-3.5 space-y-2.5 shadow-md transition-all group"
                      >
                        {/* Company Name & Tier */}
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (place) onSelectPlaceForDetails(place);
                            }}
                            className="text-left font-bold text-sm text-slate-100 hover:text-blue-400 transition-colors line-clamp-1 cursor-pointer"
                          >
                            {item.place_name}
                          </button>
                          {item.score !== undefined && (
                            <span className="shrink-0 px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-600/20 text-blue-300 border border-blue-500/30">
                              {item.score} pts
                            </span>
                          )}
                        </div>

                        {/* Category & City */}
                        <div className="text-xs text-slate-400 line-clamp-1">
                          {item.category} {item.city ? `· ${item.city}` : ''}
                        </div>

                        {/* Recommended Solution Pill */}
                        {(item.web_intelligence?.commercial_analysis.recommended_solution || item.web_intelligence?.commercial_analysis.recommended_limber_solution) && (
                          <div className="rounded-md bg-blue-950/60 border border-blue-800/40 p-1.5 text-[11px] text-blue-300 font-semibold line-clamp-1">
                            🎯 {item.web_intelligence.commercial_analysis.recommended_solution || item.web_intelligence.commercial_analysis.recommended_limber_solution}
                          </div>
                        )}

                        {/* Next Action */}
                        {item.next_action && (
                          <div className="text-[11px] text-amber-300/90 bg-amber-950/30 border border-amber-800/40 rounded p-1.5 line-clamp-2">
                            <span className="font-bold">Próx:</span> {item.next_action}
                          </div>
                        )}

                        {/* Value & Actions */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                          <span className="font-mono font-semibold text-emerald-400">
                            {item.deal_value ? `R$ ${item.deal_value.toLocaleString('pt-BR')}` : 'A orçar'}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Prev stage */}
                            {colIdx > 0 && (
                              <button
                                type="button"
                                title="Voltar fase anterior"
                                onClick={() => handleMoveStage(item.id, STAGES[colIdx - 1].id)}
                                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Next stage */}
                            {colIdx < STAGES.length - 1 && (
                              <button
                                type="button"
                                title="Avançar próxima fase"
                                onClick={() => handleMoveStage(item.id, STAGES[colIdx + 1].id)}
                                className="p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Delete */}
                            <button
                              type="button"
                              title="Remover oportunidade"
                              onClick={() => handleDeleteOpportunity(item.id)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add Opportunity Modal */}
      {isAddingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              <span>Adicionar Oportunidade ao Pipeline</span>
            </h3>
            <p className="text-xs text-slate-300">
              Selecione um estabelecimento coletado para iniciar o acompanhamento no Kanban comercial.
            </p>

            <form onSubmit={handleCreateNewOpportunity} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Estabelecimento Coletado
                </label>
                <select
                  required
                  value={selectedPlaceIdForNew}
                  onChange={(e) => setSelectedPlaceIdForNew(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500"
                >
                  <option value="">Selecione um estabelecimento...</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.category} ({p.city || 'Sem cidade'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Valor Estimado da Proposta (R$)
                </label>
                <input
                  type="number"
                  value={customDealValue}
                  onChange={(e) => setCustomDealValue(e.target.value)}
                  placeholder="Ex: 3500"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-slate-200 outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedPlaceIdForNew}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
                >
                  Criar no Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
