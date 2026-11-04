import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Square,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Building2,
  MapPin,
  Sparkles,
  Compass,
  Layers,
  Folder,
  Tags,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';
import { BRAZILIAN_STATES, POPULAR_CATEGORIES } from '../shared/brazilLocations';
import { ScrapeEvolutionHUD } from './ScrapeEvolutionHUD';
import { ScrapeResultCards } from './ScrapeResultCards';
import type { PlaceRecord } from '../shared/types';

async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}

interface SearchScreenProps {
  currentJob: ScrapeJob | null;
  isScraping: boolean;
  apiReady: boolean;
  onStartScrape: (projectName: string, categoryName: string, segment: string, location: string, limit: number) => Promise<void>;
  onStopScrape: () => Promise<void>;
  onGoToResults: () => void;
  initialProjectName?: string;
  initialCategoryName?: string;
  scrapeResults?: PlaceRecord[];
  liveResults?: React.ReactNode;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({
  currentJob,
  isScraping,
  apiReady,
  onStartScrape,
  onStopScrape,
  onGoToResults,
  initialProjectName,
  initialCategoryName,
  scrapeResults = [],
  liveResults,
}) => {
  const [segment, setSegment] = useState(initialCategoryName || '');
  const [projectName, setProjectName] = useState(initialProjectName || '');
  const [categoryName, setCategoryName] = useState(initialCategoryName || '');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; project_id?: string }>>([]);
  const [catalogMessage, setCatalogMessage] = useState('');
  const [locationMode, setLocationMode] = useState<'brazil' | 'custom'>('brazil');

  useEffect(() => {
    if (initialProjectName) setProjectName(initialProjectName);
  }, [initialProjectName]);

  useEffect(() => {
    if (initialCategoryName) {
      setCategoryName(initialCategoryName);
      if (!segment.trim()) setSegment(initialCategoryName);
    }
  }, [initialCategoryName]);

  // Brazil selector state
  const [selectedUf, setSelectedUf] = useState<string>('SP');
  const [selectedCity, setSelectedCity] = useState<string>('São Paulo');
  const [neighborhood, setNeighborhood] = useState<string>('');

  // Custom location state
  const [customLocation, setCustomLocation] = useState<string>('');

  // Active category group tab
  const [activeCategoryGroup, setActiveCategoryGroup] = useState<number>(0);
  const [showCategories, setShowCategories] = useState<boolean>(false);

  const [limit, setLimit] = useState<number>(20);
  const [validationError, setValidationError] = useState('');

  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!apiReady) return;
    let active = true;
    void Promise.all([
      accountFetch('/api/v1/projects', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`Projetos: HTTP ${response.status}`);
        return response.json();
      }),
      accountFetch('/api/v1/categories', { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) throw new Error(`Categorias: HTTP ${response.status}`);
        return response.json();
      }),
    ]).then(([projectData, categoryData]) => {
      if (!active) return;
      setProjects(
        Array.isArray(projectData.data) ? projectData.data : projectData.projects ?? []
      );
      const rawCategories = Array.isArray(categoryData.data) ? categoryData.data : [];
      setCategories(
        rawCategories
          .filter((category: any) => category && typeof category === 'object' && category.name)
          .map((category: any, i: number) => ({
            id: String(category.id || `cat_${i}`),
            name: String(category.name),
            project_id: String(category.project_id || category.projectId || ''),
          }))
      );
      setCatalogMessage('');
    }).catch((error) => {
      if (active) setCatalogMessage(error instanceof Error ? error.message : 'Falha ao carregar projetos e categorias.');
    });
    return () => { active = false; };
  }, [apiReady]);

  useEffect(() => {
    if (isScraping && currentJob) {
      const frame = window.requestAnimationFrame(() => {
        progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [isScraping, currentJob?.id]);

  const currentState = BRAZILIAN_STATES.find((s) => s.uf === selectedUf) || BRAZILIAN_STATES[0];

  const handleUfChange = (uf: string) => {
    setSelectedUf(uf);
    const stateObj = BRAZILIAN_STATES.find((s) => s.uf === uf);
    if (stateObj && stateObj.cities.length > 0) {
      setSelectedCity(stateObj.cities[0]);
    }
  };

  const getComputedLocation = (): string => {
    if (locationMode === 'custom') {
      return customLocation.trim();
    }
    const parts: string[] = [];
    if (neighborhood.trim()) {
      parts.push(neighborhood.trim());
    }
    if (selectedCity) {
      parts.push(selectedCity);
    }
    if (selectedUf) {
      parts.push(selectedUf);
    }
    return parts.join(', ');
  };

  const getRegionalQuickActions = () => {
    if (!currentJob) return [];
    const match = currentJob.location.match(/^(?:(Zona Norte|Zona Sul|Zona Leste|Zona Oeste),\s*)?(.+,\s*[A-Z]{2})$/i);
    if (!match) return [];
    const currentRegion = match[1]?.toLocaleLowerCase('pt-BR') || '';
    const baseLocation = match[2].trim();
    const regions = [
      { label: 'Norte', value: 'Zona Norte' },
      { label: 'Sul', value: 'Zona Sul' },
      { label: 'Leste', value: 'Zona Leste' },
      { label: 'Oeste', value: 'Zona Oeste' },
    ];
    return regions
      .filter((region) => region.value.toLocaleLowerCase('pt-BR') !== currentRegion)
      .map((region) => ({ label: region.label, location: `${region.value}, ${baseLocation}` }));
  };

  const startRegionalQuickAction = async (location: string) => {
    if (!currentJob || isScraping) return;
    const project = currentJob.project_name || `${currentJob.segment} · ${location}`;
    await onStartScrape(project, currentJob.segment, currentJob.segment, location, currentJob.limit_requested);
  };

  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    try {
      const response = await accountFetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar o projeto.');
      const project = payload.data || payload.project;
      if (project) {
        setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
        setProjectName(project.name);
        setCatalogMessage('Projeto criado e selecionado.');
      }
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : 'Falha ao criar projeto.');
    }
  };

  const createCategory = async () => {
    const name = categoryName.trim();
    const project = projects.find((item) => item.name.trim().toLocaleLowerCase('pt-BR') === projectName.trim().toLocaleLowerCase('pt-BR'));
    if (!name || !projectName.trim()) return;
    try {
      const response = await accountFetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: project?.id, projectName: projectName.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a categoria.');
      const category = payload.data || payload.category;
      const resolvedProject = payload.project || project;
      if (resolvedProject) {
        setProjects((current) => [resolvedProject, ...current.filter((item) => item.id !== resolvedProject.id)]);
        setProjectName(resolvedProject.name);
      }
      if (category) {
        setCategories((current) => [category, ...current.filter((item) => item.id !== category.id)]);
        setCategoryName(category.name);
        setSegment(category.name);
        setCatalogMessage('Categoria criada e selecionada.');
      }
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : 'Falha ao criar categoria.');
    }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!segment.trim()) {
      setValidationError('Informe ou selecione o segmento ou tipo de estabelecimento.');
      return;
    }
    const finalLoc = getComputedLocation();
    if (!finalLoc) {
      setValidationError('Selecione ou digite a cidade, bairro ou região.');
      return;
    }
    setValidationError('');
    const finalProjectName = projectName.trim() || `${segment.trim()} · ${finalLoc}`;
    const finalCategoryName = categoryName.trim() || segment.trim();
    await onStartScrape(finalProjectName, finalCategoryName, segment.trim(), finalLoc, limit);
  };

  const limitPresets = [10, 20, 50, 100];

  return (
    <div className="max-w-7xl mx-auto py-0 sm:py-2 space-y-6">
      {/* Intro Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-3">
          <Compass className="w-3.5 h-3.5 text-blue-400" />
          <span>Extração Comercial Automatizada</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight">
          Pesquisar no Google Maps
        </h1>
        <p className="mt-2 text-base text-slate-300 max-w-3xl leading-relaxed">
          Defina o projeto, o segmento, a localização e a meta de novos contatos a cadastrar. A pesquisa avança continuamente no mapa ignorando empresas já cadastradas.
        </p>
      </div>

      {/* Main Search Form Card - Deep Dark Navy Palette */}
      <div className="bg-[#0b1429] border border-[#17274f] rounded-2xl shadow-2xl shadow-blue-950/40 p-6 sm:p-8 space-y-8">
        <form onSubmit={handleStart} className="space-y-7">
          {/* Step 1 & 2: Project & Category */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="min-w-0 space-y-2.5">
              <label htmlFor="project-name" className="block text-sm font-semibold text-slate-200">
                1. Projeto / Campanha <span className="text-blue-400">*</span>
              </label>
              <div className="space-y-2">
                <select
                  aria-label="Selecionar projeto existente"
                  value={projects.some((project) => project.name === projectName) ? projectName : ''}
                  onChange={(e) => { setProjectName(e.target.value); setCategoryName(''); }}
                  disabled={isScraping || projects.length === 0}
                  className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">Selecionar projeto existente ({projects.length})</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.name}>{project.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    id="project-name"
                    value={projectName}
                    onChange={(e) => { setProjectName(e.target.value); setCategoryName(''); }}
                    maxLength={120}
                    placeholder="Ou digite o nome do projeto"
                    disabled={isScraping}
                    className="flex-1 rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void createProject()}
                    disabled={isScraping || !projectName.trim()}
                    className="rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 px-3.5 py-2.5 text-xs font-semibold text-blue-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-2.5">
              <label htmlFor="category-name" className="block text-sm font-semibold text-slate-200">
                2. Categoria da Pesquisa <span className="text-blue-400">*</span>
              </label>
              <div className="space-y-2">
                <select
                  aria-label="Selecionar categoria do projeto"
                  value={
                    categories.some(
                      (c) =>
                        c.name === categoryName &&
                        (!projectName.trim() ||
                          c.project_id === projects.find((p) => p.name.trim().toLowerCase() === projectName.trim().toLowerCase())?.id)
                    )
                      ? categoryName
                      : ''
                  }
                  onChange={(e) => {
                    setCategoryName(e.target.value);
                    if (e.target.value) setSegment(e.target.value);
                  }}
                  disabled={isScraping}
                  className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-3 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">Selecionar categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    id="category-name"
                    value={categoryName}
                    onChange={(e) => {
                      setCategoryName(e.target.value);
                      if (!segment.trim() || segment === categoryName) setSegment(e.target.value);
                    }}
                    maxLength={120}
                    placeholder="Ou digite uma nova categoria"
                    disabled={isScraping}
                    className="flex-1 rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void createCategory()}
                    disabled={isScraping || !categoryName.trim() || !projectName.trim()}
                    className="rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 px-3.5 py-2.5 text-xs font-semibold text-blue-300 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    Vincular
                  </button>
                </div>
              </div>
              {catalogMessage && <p className="text-xs text-blue-400 font-medium">{catalogMessage}</p>}
            </div>
          </div>

          {/* Step 3: Search Segment Input & Popular Suggestions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="segment" className="block text-sm font-semibold text-slate-200">
                3. Termo / Segmento a pesquisar no mapa <span className="text-blue-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCategories(!showCategories)}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{showCategories ? 'Ocultar sugestões' : 'Ver sugestões populares'}</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <Building2 className="w-5 h-5 text-blue-400" />
              </div>
              <input
                id="segment"
                type="text"
                value={segment}
                onChange={(e) => setSegment(e.target.value)}
                disabled={isScraping}
                placeholder="Ex: Clínicas Odontológicas, Restaurantes, Oficinas Mecânicas..."
                className="w-full pl-12 pr-4 py-3.5 bg-[#070e20] border border-[#1d3162] rounded-xl text-white text-base font-medium placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              />
            </div>

            {/* Popular categories tabs */}
            {showCategories && (
              <div className="p-4 rounded-xl bg-[#081024] border border-[#17274f] space-y-3 mt-2">
                <div className="flex flex-wrap gap-1.5 border-b border-[#17274f] pb-2.5">
                  {POPULAR_CATEGORIES.map((group, index) => (
                    <button
                      key={group.group}
                      type="button"
                      onClick={() => setActiveCategoryGroup(index)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        activeCategoryGroup === index
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-[#0f1d3d]'
                      }`}
                    >
                      {group.group}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {POPULAR_CATEGORIES[activeCategoryGroup]?.items.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setSegment(item);
                        setCategoryName(item);
                      }}
                      className="px-2.5 py-1 text-xs rounded-lg bg-[#0e1b38] hover:bg-[#14264f] border border-[#1c305c] hover:border-blue-500/50 text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Geographic Location */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-200">
                4. Região Geográfica <span className="text-blue-400">*</span>
              </label>
              <div className="flex items-center rounded-xl bg-[#070e20] border border-[#1d3162] p-0.5">
                <button
                  type="button"
                  onClick={() => setLocationMode('brazil')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    locationMode === 'brazil'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Cidades do Brasil
                </button>
                <button
                  type="button"
                  onClick={() => setLocationMode('custom')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    locationMode === 'custom'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Texto Livre
                </button>
              </div>
            </div>

            {locationMode === 'brazil' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="uf-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Estado (UF)
                  </label>
                  <select
                    id="uf-select"
                    value={selectedUf}
                    onChange={(e) => handleUfChange(e.target.value)}
                    disabled={isScraping}
                    className="w-full py-3 px-3 bg-[#070e20] border border-[#1d3162] rounded-xl text-slate-100 text-sm font-medium focus:border-blue-500 outline-none"
                  >
                    {BRAZILIAN_STATES.map((state) => (
                      <option key={state.uf} value={state.uf}>{state.name} ({state.uf})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="city-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Município
                  </label>
                  <input
                    id="city-select"
                    list="city-options"
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    disabled={isScraping}
                    placeholder="Digite ou escolha a cidade"
                    className="w-full py-3 px-3 bg-[#070e20] border border-[#1d3162] rounded-xl text-slate-100 text-sm font-medium focus:border-blue-500 outline-none"
                  />
                  <datalist id="city-options">
                    {currentState.cities.map((city) => <option key={city} value={city} />)}
                  </datalist>
                </div>

                <div>
                  <label htmlFor="neighborhood-select" className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Região da cidade <span className="text-slate-500 font-normal">(opcional)</span>
                  </label>
                  <select
                    id="neighborhood-select"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    disabled={isScraping}
                    className="w-full py-3 px-3 bg-[#070e20] border border-[#1d3162] rounded-xl text-slate-100 text-sm font-medium focus:border-blue-500 outline-none"
                  >
                    <option value="">Todas as regiões</option>
                    <option value="Zona Norte">Norte</option>
                    <option value="Zona Sul">Sul</option>
                    <option value="Zona Leste">Leste</option>
                    <option value="Zona Oeste">Oeste</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                  <MapPin className="w-5 h-5 text-blue-400" />
                </div>
                <input
                  type="text"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  disabled={isScraping}
                  placeholder="Ex: Av. Paulista, São Paulo - SP ou Copacabana, Rio de Janeiro..."
                  className="w-full pl-12 pr-4 py-3 bg-[#070e20] border border-[#1d3162] rounded-xl text-slate-100 text-sm font-medium focus:border-blue-500 outline-none"
                />
              </div>
            )}

          </div>

          {/* Step 5: Limit of Fresh Places */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-semibold text-slate-200">
                  5. Meta de Novos Estabelecimentos
                </label>
                <p className="text-xs text-slate-400">
                  A pesquisa avança continuamente até coletar esta quantidade de fichas <strong className="text-blue-300">inéditas</strong>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {limitPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLimit(preset)}
                  disabled={isScraping}
                  className={`py-3 px-3 text-sm font-bold rounded-xl border transition-all cursor-pointer ${
                    limit === preset
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30'
                      : 'bg-[#070e20] text-slate-300 border-[#1d3162] hover:bg-[#0c1836] hover:text-white'
                  }`}
                >
                  {preset} novos
                </button>
              ))}
            </div>
          </div>

          {validationError && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm font-medium text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Start Action Button */}
          <div className="pt-3 border-t border-[#17274f]">
            {!isScraping ? (
              <button
                type="submit"
                className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold text-base sm:text-lg rounded-xl shadow-xl shadow-blue-600/30 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Iniciar Coleta no Google Maps</span>
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1 py-3.5 px-6 bg-[#070e20] border border-blue-500/30 text-blue-200 font-semibold text-sm rounded-xl flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                  <span>Coleta em andamento pelo motor Chromium...</span>
                </div>
                <button
                  type="button"
                  onClick={onStopScrape}
                  className="py-3.5 px-6 bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-current text-red-400" />
                  <span>Interromper</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Real-time Evolution HUD: displayed directly below the search controls. */}
      {currentJob && (
        <>
          <div ref={progressRef}>
            <ScrapeEvolutionHUD
              currentJob={currentJob}
              isScraping={isScraping}
              onStopScrape={onStopScrape}
              onGoToResults={onGoToResults}
              regionalQuickActions={getRegionalQuickActions()}
              onStartRegionalScrape={startRegionalQuickAction}
            />
          </div>

          {/* Apenas os cards dos estabelecimentos salvos nesta execução. */}
          {liveResults ?? <ScrapeResultCards places={scrapeResults} />}
        </>
      )}

    </div>
  );
};
