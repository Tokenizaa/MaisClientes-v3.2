import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  FileDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  MapPin,
  Phone,
  Globe,
  Star,
  Clock3,
  X,
  Building2,
  Copy,
  Check,
  LayoutGrid,
  Table as TableIcon,
  Image as ImageIcon,
  Video as VideoIcon,
  Share2,
  Info,
  DollarSign,
  Compass,
  PlayCircle,
  Sparkles,
  Kanban,
  Cpu,
  Layers,
  FileText,
  Code,
} from 'lucide-react';
import { PlaceRecord, ScrapeJob } from '../shared/types';
import { BusinessIntelligenceSection } from './BusinessIntelligenceSection';
import { LeadDetailsModal } from './LeadDetailsModal';

interface ResultsScreenProps {
  places: PlaceRecord[];
  totalPlaces: number;
  jobs: ScrapeJob[];
  selectedJobId: string | undefined;
  onSelectJobId: (id: string | undefined) => void;
  selectedPlaceIds: Set<string>;
  onToggleSelectPlace: (id: string) => void;
  onToggleSelectAll: (allIds: string[]) => void;
  onGoToExport: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSortChange: (field: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  isLoading: boolean;
  compactCardsOnly?: boolean;
  onPlaceUpdated?: (updated: PlaceRecord) => void;
  onGoToKanban?: () => void;
}

const detailFields: { key: keyof PlaceRecord; label: string }[] = [
  { key: 'booking_url', label: 'URL de Agendamento' },
  { key: 'category', label: 'Categoria' },
  { key: 'address', label: 'Endereço completo' },
  { key: 'phone', label: 'Telefone comercial' },
  { key: 'website', label: 'Website oficial' },
  { key: 'rating', label: 'Nota / Avaliação' },
  { key: 'review_count', label: 'Total de avaliações' },
  { key: 'price_range', label: 'Faixa de preço' },
  { key: 'business_status', label: 'Status de funcionamento' },
  { key: 'opening_hours', label: 'Horários de funcionamento' },
  { key: 'description', label: 'Descrição' },
  { key: 'services_attributes', label: 'Serviços e atributos' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'photos', label: 'Fotos (URLs)' },
  { key: 'videos', label: 'Vídeos (URLs)' },
  { key: 'logo_url', label: 'Logo / Imagem de perfil' },
  { key: 'social_links', label: 'Redes sociais' },
  { key: 'reviews', label: 'Avaliações e comentários' },
  { key: 'review_topics', label: 'Categorias dos comentários' },
  { key: 'additional_attributes', label: 'Atributos adicionais da ficha' },
  { key: 'media_items', label: 'Galeria de mídia' },
  { key: 'plus_code', label: 'Plus Code' },
  { key: 'attributes', label: 'Atributos do estabelecimento' },
  { key: 'accessibility_attributes', label: 'Acessibilidade' },
  { key: 'next_opening_text', label: 'Próxima abertura (texto)' },
  { key: 'next_open_day', label: 'Próximo dia de abertura' },
  { key: 'next_open_time', label: 'Próximo horário de abertura' },
  { key: 'visible_photos_count', label: 'Total de fotos informado' },
  { key: 'neighborhood', label: 'Bairro' },
  { key: 'postal_code', label: 'CEP / código postal' },
  { key: 'country', label: 'País' },
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado / região' },
  { key: 'source_place_id', label: 'ID da ficha na fonte' },
  { key: 'source_url', label: 'URL original da fonte' },
  { key: 'popular_times', label: 'Horários de movimento' },
  { key: 'rating_distribution', label: 'Distribuição de avaliações' },
  { key: 'review_highlights', label: 'Destaques de avaliações' },
  { key: 'field_status', label: 'Status de captura por campo' },
  { key: 'collected_at', label: 'Data e hora da coleta' },
];

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  places,
  totalPlaces,
  jobs,
  selectedJobId,
  onSelectJobId,
  selectedPlaceIds,
  onToggleSelectPlace,
  onToggleSelectAll,
  onGoToExport,
  searchQuery,
  onSearchQueryChange,
  selectedCategory,
  onCategoryChange,
  sortBy,
  sortOrder,
  onSortChange,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  isLoading,
  compactCardsOnly = false,
  onPlaceUpdated,
  onGoToKanban,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedPlace, setSelectedPlace] = useState<PlaceRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [expandedPlaceIds, setExpandedPlaceIds] = useState<Set<string>>(new Set());
  const [activeModalTab, setActiveModalTab] = useState<'intel' | 'overview' | 'digital' | 'media' | 'fields' | 'json'>('intel');
  const [fieldSearchFilter, setFieldSearchFilter] = useState('');
  const [copiedFieldKey, setCopiedFieldKey] = useState<string | null>(null);

  const toggleExpandPlace = (id: string) => {
    setExpandedPlaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyFieldValue = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedFieldKey(key);
      setTimeout(() => setCopiedFieldKey(null), 2000);
    } catch {}
  };

  const [coverage, setCoverage] = useState<{
    totalRecords: number;
    totalFields: number;
    averageCoverage: number;
    fields: { key: string; label: string; populated: number; missing: number; percentage: number }[];
  } | null>(null);
  const [coverageError, setCoverageError] = useState('');
  const [showCoverageSection, setShowCoverageSection] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const token =
      window.sessionStorage.getItem('mapscrape_api_key') ||
      window.sessionStorage.getItem('mapscrape_session_token');
    fetch('/api/v1/categories', {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((response) => { if (!response.ok) throw new Error('Falha ao carregar categorias'); return response.json(); })
      .then((data) => {
        if (!cancelled) {
          const list: string[] = Array.isArray(data.placeCategories)
            ? data.placeCategories.filter((name: unknown): name is string => typeof name === 'string' && Boolean(name.trim()))
            : [];
          setCategories(Array.from(new Set(list)));
        }
      })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCoverage = async () => {
      try {
        const params = new URLSearchParams();
        const token =
          window.sessionStorage.getItem('mapscrape_api_key') ||
          window.sessionStorage.getItem('mapscrape_session_token');
        const response = await fetch(`/api/v1/field-coverage?${params.toString()}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Não foi possível calcular a cobertura dos campos.');
        const data = await response.json();
        if (!cancelled) {
          setCoverage(data);
          setCoverageError('');
        }
      } catch (error: any) {
        if (!cancelled) setCoverageError(error?.message || 'Falha ao carregar a cobertura dos campos.');
      }
    };
    void loadCoverage();
    return () => {
      cancelled = true;
    };
  }, [selectedJobId, totalPlaces, places.length]);

  const currentIds = useMemo(() => places.map((place) => place.id), [places]);
  const isAllSelected = currentIds.length > 0 && currentIds.every((id) => selectedPlaceIds.has(id));
  const totalPages = Math.max(1, Math.ceil(totalPlaces / pageSize));

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const copyFullPlaceDetails = async () => {
    if (!selectedPlace) return;
    try {
      const formatted = Object.entries(selectedPlace)
        .map(([key, value]) => `${key}: ${value == null || value === '' ? '—' : String(value)}`)
        .join('\n');
      await navigator.clipboard.writeText(formatted);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    } catch {}
  };

  const missing = (val?: string) => (val && val.trim() ? val : <span className="text-slate-600 italic">—</span>);

  const getFirstPhotoUrl = (place: PlaceRecord): string | null => {
    if (place.logo_url && place.logo_url.startsWith('http')) return place.logo_url;
    if (place.photos && place.photos.trim()) {
      const urls = place.photos.split(' | ');
      if (urls.length > 0 && urls[0].startsWith('http')) return urls[0];
    }
    return null;
  };

  const getVideoUrls = (place: PlaceRecord): string[] => {
    if (!place.videos || !place.videos.trim()) return [];
    return place.videos.split(' | ').filter((u) => u.startsWith('http'));
  };

  const parseJsonField = <T,>(value: string | undefined, fallback: T): T => {
    if (!value?.trim()) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  };

  const getVideoEmbedUrl = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      if (parsed.hostname === 'youtu.be') {
        const id = parsed.pathname.slice(1);
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
    } catch {}
    return null;
  };

  return (
    <div className="max-w-7xl mx-auto py-2 sm:py-6 space-y-6">
      {!compactCardsOnly && (
        <>
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 font-mono">
            <Compass className="w-3.5 h-3.5 text-blue-400" />
            <span>Base Consolidada de Leads</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Base de Leads
          </h1>
          <p className="mt-1 text-base text-slate-300">
            {totalPlaces.toLocaleString('pt-BR')} estabelecimentos cadastrados e deduplicados automaticamente.
          </p>
        </div>

        {/* Global Export Shortcut Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGoToExport}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm sm:text-base shadow-xl shadow-blue-600/30 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none active:scale-95"
          >
            <FileDown className="w-5 h-5" />
            <span>
              {selectedPlaceIds.size > 0
                ? `Exportar Selecionados (${selectedPlaceIds.size})`
                : 'Exportar Base Completa'}
            </span>
          </button>
        </div>
      </div>

      {/* Field Coverage Strip */}
      <div className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-5 shadow-xl shadow-blue-950/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">Qualidade e Cobertura de Campos</span>
                {coverage && (
                  <span className="rounded-md bg-blue-600/25 text-blue-200 border border-blue-500/40 px-2 py-0.5 text-xs font-bold font-mono">
                    {coverage.averageCoverage}% preenchidos
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculada a partir dos dados persistidos no banco de dados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCoverageSection(!showCoverageSection)}
            className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-blue-400 underline underline-offset-4 cursor-pointer transition-colors"
          >
            {showCoverageSection ? 'Ocultar detalhes de cobertura' : 'Ver cobertura por campo (18 campos)'}
          </button>
        </div>

        {showCoverageSection && coverage && coverage.totalRecords > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
            {coverage.fields.map((field) => (
              <div key={field.key} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-300">{field.label}</span>
                  <span className="shrink-0 text-xs font-mono font-medium text-slate-400 tabular-nums">
                    {field.populated}/{coverage.totalRecords} ({field.percentage}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${field.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter and Control Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-xl shadow-black/20 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => {
              onSearchQueryChange(e.target.value);
              onPageChange(1);
            }}
            placeholder="Buscar por nome, categoria, bairro, endereço, telefone ou site..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-11 pr-4 text-sm sm:text-base text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium placeholder:text-slate-500"
          />
        </div>

        {/* Search Job Selector */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-slate-400" />
          <select
            value={selectedJobId || ''}
            onChange={(e) => {
              onSelectJobId(e.target.value || undefined);
              onPageChange(1);
            }}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm font-medium text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="" className="bg-slate-900 text-slate-100">Todas as coletas ({jobs.length})</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id} className="bg-slate-900 text-slate-100">
                {job.segment} · {job.location} ({job.total_collected})
              </option>
            ))}
          </select>
        </div>

        {/* Persisted category filter */}
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          <select
            aria-label="Filtrar por categoria"
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm font-medium text-slate-200 outline-none focus:border-blue-500"
          >
            <option value="">Todas as categorias ({categories.length})</option>
            {categories.map((category, index) => {
              const catName = typeof category === 'string' ? category : (category as any)?.name || `cat-${index}`;
              return (
                <option key={catName} value={catName}>
                  {catName}
                </option>
              );
            })}
          </select>
        </div>

        {/* View Mode Toggle (Cards vs Table) */}
        <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-slate-800 text-slate-100 shadow-xs border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-slate-800 text-slate-100 shadow-xs border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Tabela</span>
          </button>
        </div>
      </div>

      {/* Sorting and Select All Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400 px-1">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-300">Ordenar por:</span>
          <button
            type="button"
            onClick={() => onSortChange('name')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'name'
                ? 'bg-slate-800 text-slate-100 border-slate-600'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Nome {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => onSortChange('rating')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'rating'
                ? 'bg-slate-800 text-slate-100 border-slate-600'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Nota {sortBy === 'rating' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
          <button
            type="button"
            onClick={() => onSortChange('collected_at')}
            className={`px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
              sortBy === 'collected_at'
                ? 'bg-slate-800 text-slate-100 border-slate-600'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Data {sortBy === 'collected_at' && (sortOrder === 'asc' ? '↑' : '↓')}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm font-medium text-slate-300 hover:text-slate-100">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={() => onToggleSelectAll(currentIds)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
            />
            <span>Selecionar todos da página ({currentIds.length})</span>
          </label>

          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs sm:text-sm text-slate-300 outline-none"
          >
            <option value={10}>10 / pág</option>
            <option value={25}>25 / pág</option>
            <option value={50}>50 / pág</option>
            <option value={100}>100 / pág</option>
          </select>
        </div>
      </div>
    </>
  )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-16 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-base font-medium">Carregando estabelecimentos...</p>
        </div>
      ) : places.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/50">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-200">Nenhum estabelecimento encontrado</h3>
          <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">
            {searchQuery
              ? 'Nenhum resultado corresponde à sua busca. Tente palavras mais curtas.'
              : 'Execute uma nova coleta na tela "1. Pesquisar" para extrair fichas do Google Maps.'}
          </p>
        </div>
      ) : (compactCardsOnly || viewMode === 'cards') ? (
        /* ================= CARDS VIEW (Linear/Stripe Minimalist Dark Mode) ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {places.map((place) => {
            const isSelected = selectedPlaceIds.has(place.id);
            const photoUrl = getFirstPhotoUrl(place);
            const videos = getVideoUrls(place);
            const isExpanded = expandedPlaceIds.has(place.id);

            return (
              <article
                key={place.id}
                className={`flex flex-col justify-between rounded-2xl border transition-all duration-200 overflow-hidden bg-slate-900/90 shadow-lg shadow-black/30 ${
                  isSelected
                    ? 'border-blue-500 ring-2 ring-blue-500/20'
                    : 'border-slate-800 hover:border-slate-700'
                } ${
                  isExpanded
                    ? 'col-span-1 md:col-span-2 lg:col-span-3 border-blue-500/50 bg-[#080f22] ring-1 ring-blue-500/30 shadow-2xl'
                    : ''
                }`}
              >
                {/* Card Header Media */}
                {photoUrl ? (
                  <div className="relative h-44 w-full bg-slate-950 overflow-hidden border-b border-slate-800/80">
                    <img
                      src={photoUrl}
                      alt={place.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                    {/* Top Row in Photo */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between">
                      <label className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-950/80 backdrop-blur-xs border border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${place.name}`}
                          checked={isSelected}
                          onChange={() => onToggleSelectPlace(place.id)}
                          className="h-4 w-4 rounded border-slate-700 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                        />
                      </label>

                      <div className="flex items-center gap-1.5">
                        {videos.length > 0 && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-semibold backdrop-blur-xs">
                            <VideoIcon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Vídeo ({videos.length})</span>
                          </span>
                        )}
                        {place.category && (
                          <span className="px-2.5 py-1 rounded-md bg-slate-950/80 text-slate-300 border border-slate-800 text-xs font-medium backdrop-blur-xs">
                            {place.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 pb-0 flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${place.name}`}
                        checked={isSelected}
                        onChange={() => onToggleSelectPlace(place.id)}
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                      />
                    </label>

                    <div className="flex items-center gap-1.5">
                      {videos.length > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-xs font-medium">
                          <VideoIcon className="w-3 h-3 text-indigo-400" />
                          <span>Vídeo ({videos.length})</span>
                        </span>
                      )}
                      {place.category && (
                        <span className="px-2.5 py-1 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/80 text-xs font-medium">
                          {place.category}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    {/* Place Title */}
                    <button
                      type="button"
                      data-testid="open-lead-modal-btn"
                      onClick={() => setSelectedPlace(place)}
                      className="text-left group cursor-pointer w-full"
                    >
                      <h2 className="text-xl font-bold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-2 leading-snug">
                        {place.name || 'Estabelecimento sem nome'}
                      </h2>
                    </button>

                    {/* Rating & Reviews */}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-bold text-sm text-slate-100">{place.rating || '—'}</span>
                      </div>
                      <span className="text-xs sm:text-sm text-slate-400 font-medium">
                        {place.review_count ? `${place.review_count} avaliações` : 'Sem avaliações'}
                      </span>
                      {place.price_range && (
                        <span className="ml-auto text-xs font-semibold text-slate-300 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                          {place.price_range}
                        </span>
                      )}
                    </div>

                    {/* Contact & Address Lines */}
                    <div className="mt-4 space-y-2.5 text-xs sm:text-sm text-slate-300">
                      {/* Endereço */}
                      <div className="flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed font-medium">
                          {missing(place.address)}
                        </span>
                      </div>

                      {/* Telefone */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="font-semibold text-slate-100 font-mono">
                            {missing(place.phone)}
                          </span>
                        </div>
                        {place.phone && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(place.phone, `phone_${place.id}`)}
                            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer transition-colors"
                            title="Copiar telefone"
                          >
                            {copiedId === `phone_${place.id}` ? (
                              <Check className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Site */}
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline truncate block font-medium"
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">Site não informado</span>
                        )}
                      </div>
                    </div>

                    {/* Web Intelligence Preview / Score Badge */}
                    {place.web_intelligence ? (
                      <div
                        onClick={() => setSelectedPlace(place)}
                        className="mt-3 p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-between text-xs cursor-pointer hover:bg-blue-950/70 transition-all"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="font-bold text-blue-200 truncate">
                            {place.web_intelligence.commercial_analysis.recommended_solution || place.web_intelligence.commercial_analysis.recommended_limber_solution || 'Inteligência Comercial'}
                          </span>
                        </div>
                        <span className="shrink-0 ml-1.5 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-blue-600/30 text-blue-300 border border-blue-400/30">
                          {place.web_intelligence.scores.overall_score} pts · {place.web_intelligence.scores.qualification_tier}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSelectedPlace(place)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3 text-blue-400" />
                          <span>{place.website ? 'Analisar Web Intelligence' : 'Qualificar Negócio'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Status & Links */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                    <span
                      className={`truncate rounded-md px-2.5 py-1 text-xs font-semibold border ${
                        /aberto/i.test(place.business_status)
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : /fechado/i.test(place.business_status)
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {missing(place.business_status)}
                    </span>

                    <div className="flex items-center gap-2">
                      {place.maps_url && (
                        <a
                          href={place.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Abrir ficha do Google Maps"
                          title="Abrir ficha do Google Maps"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {place.booking_url && (
                        <a
                          href={place.booking_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 text-blue-400 hover:bg-blue-950/60 hover:text-blue-300 border border-blue-500/30 transition-colors"
                        >
                          <span>Agendar</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedPlace(place)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          isExpanded
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/30'
                            : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30'
                        }`}
                        title={isExpanded ? 'Recolher inteligência comercial' : 'Abrir ficha e inteligência comercial'}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        <span>{isExpanded ? 'Recolher BI' : 'Abrir inteligência'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPlace(place)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
                      >
                        Ver detalhes
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Business Intelligence Section */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-[#060c1c] p-4 sm:p-6 rounded-b-2xl animate-in fade-in duration-200">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                            <span>Inteligência Comercial Detalhada</span>
                            {place.category && (
                              <span className="text-xs text-slate-400 font-normal">· {place.category}</span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-400">
                            Diagnóstico do negócio, maturidade digital, aderência comercial e perguntas de sondagem para o vendedor.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPlace(place)}
                          className="text-xs font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-4 cursor-pointer"
                        >
                          Abrir em modal amplo ↗
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPlace(place)}
                          className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer"
                        >
                          Recolher
                        </button>
                      </div>
                    </div>
                    <BusinessIntelligenceSection
                      place={place}
                      onAnalysisUpdated={(updated) => {
                        onPlaceUpdated?.(updated);
                      }}
                      onOpenKanban={onGoToKanban}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => onToggleSelectAll(currentIds)}
                      className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 font-bold">Estabelecimento</th>
                  <th className="py-3.5 px-4 font-bold">Categoria</th>
                  <th className="py-3.5 px-4 text-center font-bold">Nota / Avaliações</th>
                  <th className="py-3.5 px-4 font-bold">Endereço</th>
                  <th className="py-3.5 px-4 font-bold">Telefone</th>
                  <th className="py-3.5 px-4 font-bold">Site</th>
                  <th className="py-3.5 px-4 font-bold">Mídia</th>
                  <th className="py-3.5 px-4 font-bold">Status</th>
                  <th className="py-3.5 px-4 font-bold text-blue-400">Inteligência Comercial</th>
                  <th className="py-3.5 px-4 text-center font-bold">Ficha Maps</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm text-slate-300">
                {places.map((place) => {
                  const isSelected = selectedPlaceIds.has(place.id);
                  const isExpanded = expandedPlaceIds.has(place.id);
                  const videos = getVideoUrls(place);

                  return (
                    <React.Fragment key={place.id}>
                      <tr
                        className={`hover:bg-slate-800/60 transition-colors ${
                          isSelected ? 'bg-slate-800/40' : ''
                        } ${isExpanded ? 'bg-slate-800/60' : ''}`}
                      >
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectPlace(place.id)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-100 max-w-[220px]">
                        <button
                          type="button"
                          onClick={() => setSelectedPlace(place)}
                          className="hover:text-blue-400 hover:underline text-left"
                        >
                          {place.name}
                        </button>
                      </td>
                      <td className="py-4 px-4 max-w-[150px] truncate text-slate-400">{missing(place.category)}</td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {place.rating ? (
                          <div className="inline-flex items-center gap-1 font-bold text-slate-100">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            <span>{place.rating}</span>
                            {place.review_count && (
                              <span className="text-slate-500 font-normal text-xs font-mono">
                                ({place.review_count})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 max-w-[240px] truncate" title={place.address}>
                        {missing(place.address)}
                      </td>
                      <td className="py-4 px-4 font-mono whitespace-nowrap font-medium text-slate-200">
                        {missing(place.phone)}
                      </td>
                      <td className="py-4 px-4 max-w-[160px] truncate">
                        {place.website ? (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline"
                          >
                            {place.website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        ) : (
                          <span className="text-slate-600 italic">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {place.photos && (
                            <span className="text-xs text-slate-400 font-mono" title="Fotos disponíveis">
                              📷
                            </span>
                          )}
                          {videos.length > 0 && (
                            <span className="text-xs text-indigo-400 font-mono" title={`${videos.length} vídeo(s)`}>
                              🎥
                            </span>
                          )}
                          {!place.photos && videos.length === 0 && (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium border ${
                            /aberto/i.test(place.business_status)
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {missing(place.business_status)}
                        </span>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {place.web_intelligence ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPlace(place)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-950/60 border border-blue-500/40 text-blue-300 font-mono text-xs font-bold hover:bg-blue-900/60 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-blue-400" />
                              <span>{place.web_intelligence.scores.overall_score} pts ({place.web_intelligence.scores.qualification_tier})</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedPlace(place)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-blue-400" />
                              <span>{place.website ? 'Analisar' : 'Qualificar'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedPlace(place)}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isExpanded
                                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-100 border-slate-700'
                            }`}
                            title={isExpanded ? 'Recolher análise comercial' : 'Abrir ficha e inteligência comercial'}
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {place.maps_url ? (
                            <a
                              href={place.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-slate-300 hover:text-white font-medium px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700"
                            >
                              <span>Ficha</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Inline Expanded Row */}
                      {isExpanded && (
                        <tr className="bg-[#060c1c] border-b border-slate-800">
                          <td colSpan={11} className="p-4 sm:p-6">
                            <div className="mb-4 flex items-center justify-between pb-3 border-b border-slate-800">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-blue-400" />
                                <span className="text-sm font-bold text-slate-100">
                                  Inteligência Comercial Detalhada · {place.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlace(place)}
                                  className="text-xs text-blue-400 hover:underline cursor-pointer"
                                >
                                  Abrir em modal amplo ↗
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedPlace(place)}
                                  className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 border border-slate-700 cursor-pointer"
                                >
                                  Recolher
                                </button>
                              </div>
                            </div>
                            <BusinessIntelligenceSection
                              place={place}
                              onAnalysisUpdated={(updated) => {
                                onPlaceUpdated?.(updated);
                              }}
                              onOpenKanban={onGoToKanban}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      {!compactCardsOnly && totalPlaces > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 px-6 py-4 text-sm font-medium text-slate-400 shadow-xl">
          <span>
            Mostrando {Math.min((currentPage - 1) * pageSize + 1, totalPlaces)}–{Math.min(currentPage * pageSize, totalPlaces)} de {totalPlaces.toLocaleString('pt-BR')} estabelecimentos
          </span>
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-200 font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="font-mono font-bold text-slate-100 tabular-nums">
              Página {currentPage} de {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-slate-200 font-semibold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Próxima <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================= MODAL UNIFICADO DA FICHA DO LEAD ================= */}
      {selectedPlace && (
        <LeadDetailsModal
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
          onPlaceUpdated={(updated) => {
            setSelectedPlace(updated);
            onPlaceUpdated?.(updated);
          }}
          onGoToKanban={onGoToKanban}
        />
      )}
    </div>
  );
};
