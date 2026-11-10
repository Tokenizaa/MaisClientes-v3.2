/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

import { Sidebar, ScreenTab } from './components/Sidebar';
import { SearchScreen } from './components/SearchScreen';
import { ClientSideScrapeScreen } from './components/ClientSideScrapeScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ExportScreen } from './components/ExportScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { LogsScreen } from './components/LogsScreen';
import { DashboardScreen } from './components/DashboardScreen';
import { ProjectsScreen } from './components/ProjectsScreen';
import { CredentialsScreen } from './components/CredentialsScreen';
import { AuthScreen } from './components/AuthScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { KanbanScreen } from './components/KanbanScreen';
import { PrivacyScreen } from './components/PrivacyScreen';
import { BillingScreen } from './components/BillingScreen';
import { PlaceRecord, ScrapeJob } from './shared/types';
import { Menu } from 'lucide-react';
import { AmbientBackground } from './components/AmbientBackground';
import { HolographicGridOverlay } from './components/HolographicGridOverlay';

import { createClient } from '@supabase/supabase-js';

// Supabase Auth initialization
let supabase: any = null;

try {
  const processEnv = typeof process !== 'undefined' ? process.env : {};
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL || processEnv?.VITE_SUPABASE_URL || '')?.trim();
  const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || processEnv?.VITE_SUPABASE_ANON_KEY || '')?.trim();
  
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
} catch (e) {
  console.error('Supabase client initialization error:', e);
}

import { apiFetch, getAuthToken } from './utils/api.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<ScreenTab>('dashboard');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasApiKey, setHasApiKey] = useState(() => Boolean(window.sessionStorage.getItem('mapscrape_session_token')));
  const [authUser, setAuthUser] = useState<{ id: string; email: string; name: string; role: 'admin' | 'user'; createdAt?: string } | null>(() => {
    try { 
      const userJson = window.sessionStorage.getItem('mapscrape_user'); 
      return userJson ? JSON.parse(userJson) : null; 
    } catch { return null; }
  });
  const [apiKeyError, setApiKeyError] = useState('');

  useEffect(() => {
    // Initialize Supabase Auth session if client available
    if (!supabase) return;
    
    let active = true;
    
    // Restore session from Supabase
    supabase.auth.getSession().then(async ({ data, error }: { data: any; error: any }) => {
      if (!active) return;
      
      if (data?.session?.user?.id) {
        const userId = data.session.user.id;
        window.sessionStorage.setItem('mapscrape_user_id', userId);
        
        // Look up the user profile in our database
        try {
          const profileResponse = await apiFetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            cache: 'no-store',
          });
          
          if (!profileResponse.ok) {
            // Fall back to reading from sessionStorage if API call fails
            const userJson = window.sessionStorage.getItem('mapscrape_user');
            if (userJson) {
              setAuthUser(JSON.parse(userJson));
            }
          } else {
            const profile = await profileResponse.json();
            if (profile.user) {
              setAuthUser(profile.user);
              window.sessionStorage.setItem('mapscrape_user', JSON.stringify(profile.user));
            }
          }
        } catch (err) {
          // Fall back to sessionStorage
          const userJson = window.sessionStorage.getItem('mapscrape_user');
          if (userJson) {
            setAuthUser(JSON.parse(userJson));
          }
        }
      } else {
        const localToken = window.sessionStorage.getItem('mapscrape_session_token');
        if (!localToken || !localToken.startsWith('sess_')) {
          window.sessionStorage.removeItem('mapscrape_session_token');
          window.sessionStorage.removeItem('mapscrape_user');
          setAuthUser(null);
        }
      }
    });
    
    // Listen for auth state changes
    const unsubscribe = supabase.auth.onAuthStateChange(async (event: string, session: any) => {
      if (!active) return;
      
      if (session?.user?.id) {
        const userId = session.user.id;
        window.sessionStorage.setItem('mapscrape_user_id', userId);
        
        // Fetch user profile
        try {
          const profileResponse = await apiFetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store',
          });
          
          if (!profileResponse.ok) {
            // Fall back
          } else {
            const profile = await profileResponse.json();
            if (profile.user) {
              setAuthUser(profile.user);
              window.sessionStorage.setItem('mapscrape_user', JSON.stringify(profile.user));
              window.sessionStorage.setItem('mapscrape_session_token', session.access_token);
            }
          }
        } catch (err) {
          // Fall back
        }
      } else if (event === 'SIGNED_OUT') {
        window.sessionStorage.removeItem('mapscrape_session_token');
        window.sessionStorage.removeItem('mapscrape_user');
        setAuthUser(null);
        setHasApiKey(false);
      }
    });
    
    return () => {
      active = false;
      unsubscribe();
    };
  }, [supabase]);

  const [isConnectingApi, setIsConnectingApi] = useState(false);

  const handleConnectApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = apiKeyInput.trim();
    if (!key) return;
    setIsConnectingApi(true);
    setApiKeyError('');
    window.sessionStorage.setItem('mapscrape_api_key', key);
    try {
      const response = await apiFetch('/api/v1/jobs', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 ? 'Chave de API inválida ou revogada.' : `Falha de autenticação (HTTP ${response.status}).`);
      setHasApiKey(true);
      setApiKeyInput('');
      // Load history and places after connecting
      // These will be loaded below
    } catch (error) {
      window.sessionStorage.removeItem('mapscrape_api_key');
      setHasApiKey(false);
      setApiKeyError(error instanceof Error ? error.message : 'Não foi possível validar a chave.');
    } finally {
      setIsConnectingApi(false);
    }
  };

  const handleDisconnectApiKey = () => {
    window.sessionStorage.removeItem('mapscrape_api_key');
    window.sessionStorage.removeItem('mapscrape_session_token');
    window.sessionStorage.removeItem('mapscrape_user');
    window.sessionStorage.removeItem('mapscrape_user_id');
    setAuthUser(null);
    setHasApiKey(false);
    setJobs([]);
    setPlaces([]);
    setTotalPlaces(0);
    setApiKeyInput('');
  };

  const handleAuthenticated = (token: string, user: { id: string; email: string; name: string; role: 'admin' | 'user'; createdAt?: string }) => {
    window.sessionStorage.removeItem('mapscrape_api_key');
    window.sessionStorage.setItem('mapscrape_session_token', token);
    window.sessionStorage.setItem('mapscrape_user', JSON.stringify(user));
    setAuthUser(user);
    setHasApiKey(true);
    setApiKeyError('');
  };

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Active or most recent job
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [preselectedProject, setPreselectedProject] = useState<string>('');
  const [preselectedCategory, setPreselectedCategory] = useState<string>('');

  // History list
  const [jobs, setJobs] = useState<ScrapeJob[]>([]);

  // Results state
  const [places, setPlaces] = useState<PlaceRecord[]>([]);
  const [liveScrapePlaces, setLiveScrapePlaces] = useState<PlaceRecord[]>([]);
  const [totalPlaces, setTotalPlaces] = useState<number>(0);
  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('collected_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState<boolean>(false);

  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load past searches history
  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/jobs');
      if (res.ok) {
        const data = await res.json();
        const jobs = data && data.data ? data.data : data;
        setJobs(Array.isArray(jobs) ? jobs : []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  // Load places for table
  const loadPlaces = useCallback(async (jobIdOverride?: string): Promise<PlaceRecord[]> => {
    setIsLoadingPlaces(true);
    let loadedPlaces: PlaceRecord[] = [];
    try {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(pageSize),
        sortBy,
        sortOrder,
      });

      const effectiveJobId = jobIdOverride !== undefined ? jobIdOverride : selectedJobId;
      if (effectiveJobId) params.append('jobId', effectiveJobId);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await apiFetch(`/api/v1/leads?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const leads = data && data.data ? data.data : data;
        loadedPlaces = Array.isArray(leads) ? leads : leads?.places ?? [];
        setPlaces(loadedPlaces);
        setTotalPlaces(data && data.pagination ? data.pagination.total : data?.total ?? 0);
      }
    } catch (err) {
      console.error('Failed to load places:', err);
    } finally {
      setIsLoadingPlaces(false);
    }
    return loadedPlaces;
  }, [currentPage, pageSize, sortBy, sortOrder, selectedJobId, searchQuery, categoryFilter]);

  // Initial load - only load data if user is authenticated
  useEffect(() => {
    if (!hasApiKey) {
      // User not authenticated - show auth screen will be handled by parent
      return;
    }
    loadHistory();
    loadPlaces();
  }, [hasApiKey, loadHistory, loadPlaces]);

  // Poll persistent job state. Serverless instances do not share in-memory SSE clients.
  const subscribeToJobStream = useCallback((jobId: string) => {
    if (progressPollRef.current) clearInterval(progressPollRef.current);

    let consecutiveErrors = 0;
    const pollStatus = async () => {
      try {
        const res = await apiFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = await res.text();
          const message = `HTTP ${res.status}: ${body.slice(0, 160)}`;
          if (res.status === 404 || res.status === 401 || res.status === 403) {
            if (progressPollRef.current) clearInterval(progressPollRef.current);
            progressPollRef.current = null;
            setIsScraping(false);
            setCurrentJob((current) => current ? {
              ...current, status: 'failed',
              status_message: res.status === 404
                ? 'A API não encontrou esta coleta. Atualize o histórico e tente novamente.'
                : 'Sua sessão expirou ou não tem permissão para consultar esta coleta.',
              current_step: 'Consulta interrompida',
            } : current);
            console.error('Consulta de progresso encerrada:', message);
            await loadHistory();
            return;
          }
          throw new Error(message);
        }

        const body = await res.json();
        const updatedJob = (body && body.data ? body.data : body) as ScrapeJob & { isRunning?: boolean };
        consecutiveErrors = 0;
        setCurrentJob(updatedJob);
        setIsScraping(updatedJob.status === 'running');
        await loadHistory();
        const jobPlaces = await loadPlaces(jobId);
        setLiveScrapePlaces(jobPlaces);

        // The backend owns worker continuation. The UI only polls persisted progress.

        if (updatedJob.status !== 'running') {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
          // A coleta terminou: abre a base consolidada e recarrega a visão global,
          // sem manter o filtro restrito ao job recém-finalizado.
          setCurrentPage(1);
          setSelectedJobId(undefined);
          setCurrentTab('results');
          await loadPlaces('');
        }
      } catch (err) {
        consecutiveErrors++;
        console.error('Falha ao consultar progresso da coleta:', err);
        if (consecutiveErrors >= 5) {
          if (progressPollRef.current) clearInterval(progressPollRef.current);
          progressPollRef.current = null;
          setIsScraping(false);
          await loadHistory();
        }
      }
    };

    void pollStatus();
    progressPollRef.current = setInterval(() => { void pollStatus(); }, 2000);
  }, [loadHistory, loadPlaces]);

  // Clean up progress polling on unmount
  useEffect(() => {
    return () => {
      if (progressPollRef.current) clearInterval(progressPollRef.current);
    };
  }, []);

  const [appNotification, setAppNotification] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  // Handlers
  const handleStartScrape = async (projectName: string, categoryName: string, segment: string, location: string, limit: number) => {
    try {
      setAppNotification(null);
      const res = await apiFetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, categoryName, segment, location, limit, force: true }),
      });

      const contentType = res.headers.get('content-type') || '';
      const responseText = await res.text();
      let data: { data?: { jobId?: string }; jobId?: string; error?: string; message?: string } | null = null;

      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      if (!res.ok) {
        const detail = data?.error || data?.message ||
          (responseText.trim().startsWith('<')
            ? 'O servidor retornou uma resposta inesperada. Verifique se o backend está ativo.'
            : responseText.trim().slice(0, 240));
        setAppNotification({
          message: `Não foi possível iniciar a coleta: ${detail || res.statusText}`,
          type: 'error',
        });
        return;
      }

      const jobId = data?.data?.jobId ?? data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        setAppNotification({
          message: 'Resposta inesperada do servidor ao iniciar a pesquisa.',
          type: 'error',
        });
        return;
      }

      setPlaces([]);
      setLiveScrapePlaces([]);
      setTotalPlaces(0);
      setCurrentPage(1);
      setSelectedPlaceIds(new Set());
      setIsScraping(true);
      setSelectedJobId(jobId);
      subscribeToJobStream(jobId);
      void loadHistory();
      setAppNotification({
        message: `Coleta iniciada para "${segment}" em "${location}"!`,
        type: 'success',
      });
    } catch (err: any) {
      setAppNotification({
        message: `Falha na comunicação com o servidor: ${err.message}`,
        type: 'error',
      });
    }
  };

  const resetScrapeView = () => {
    if (progressPollRef.current) clearInterval(progressPollRef.current);
    progressPollRef.current = null;
    setIsScraping(false);
    setCurrentJob(null);
    setSelectedJobId(undefined);
    setPlaces([]);
    setTotalPlaces(0);
    setSelectedPlaceIds(new Set());
    setCurrentPage(1);
  };

  const handleStopScrape = async () => {
    if (!currentJob || currentJob.status !== 'running') return;
    const jobId = currentJob.id;
    try {
      const response = await apiFetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/stop`, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success !== true) {
        throw new Error(body?.error || `Falha ao interromper (HTTP ${response.status}).`);
      }
      resetScrapeView();
      await loadHistory();
      setAppNotification({ message: 'Coleta interrompida. Uma nova pesquisa começará do zero.', type: 'info' });
    } catch (err: any) {
      setAppNotification({ message: err instanceof Error ? err.message : 'Não foi possível interromper a coleta.', type: 'error' });
    }
  };

  // Se a aba for fechada ou atualizada, solicita cancelamento do job atual.
  // keepalive permite enviar a solicitação durante o unload sem restaurar a coleta depois.
  useEffect(() => {
    if (!isScraping || !currentJob?.id) return;
    const jobId = currentJob.id;
    const stopOnPageExit = () => {
      const token = getAuthToken();
      void fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/stop`, {
        method: 'POST',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {});
    };
    window.addEventListener('pagehide', stopOnPageExit);
    return () => window.removeEventListener('pagehide', stopOnPageExit);
  }, [isScraping, currentJob?.id]);

  const handleDeleteJob = async (jobId: string) => {
    try {
      const res = await apiFetch(`/api/v1/jobs/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedJobId === jobId) {
          setSelectedJobId(undefined);
        }
        if (currentJob?.id === jobId) {
          setCurrentJob(null);
        }
        await loadHistory();
        await loadPlaces();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleToggleSelectPlace = (id: string) => {
    const next = new Set(selectedPlaceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPlaceIds(next);
  };

  const handleToggleSelectAll = (allIds: string[]) => {
    const next = new Set(selectedPlaceIds);
    const allSelected = allIds.every((id) => next.has(id));
    if (allSelected) {
      allIds.forEach((id) => next.delete(id));
    } else {
      allIds.forEach((id) => next.add(id));
    }
    setSelectedPlaceIds(next);
  };

  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };



  // If user is not authenticated, show AuthScreen
  if (!hasApiKey) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app-shell min-h-screen bg-transparent text-slate-100 flex flex-col font-sans antialiased selection:bg-blue-600/30 selection:text-blue-200">
      <AmbientBackground />
      <HolographicGridOverlay />
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        totalPlaces={totalPlaces}
        selectedCount={selectedPlaceIds.size}
        isScrapingActive={isScraping}
        currentJob={currentJob}
        onStopScrape={handleStopScrape}
        userName={authUser?.name || authUser?.email || 'Usuário'}
        userEmail={authUser?.email || ''}
        onProfileClick={() => setCurrentTab('profile')}
        onLogout={handleDisconnectApiKey}
        isAdmin={authUser?.role === 'admin'}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area with Desktop Sidebar Offset */}
      <div className="lg:pl-72 flex-1 flex flex-col min-w-0">
        {/* Floating in-app notification banner */}
        {appNotification && (
          <div className="px-4 sm:px-8 pt-4">
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm font-semibold shadow-lg ${
                appNotification.type === 'error'
                  ? 'bg-red-950/80 border-red-500/50 text-red-200'
                  : appNotification.type === 'success'
                  ? 'bg-blue-950/80 border-blue-500/50 text-blue-200'
                  : 'bg-[#0d1c3e] border-blue-600/40 text-slate-200'
              }`}
            >
              <span>{appNotification.message}</span>
              <button
                type="button"
                onClick={() => setAppNotification(null)}
                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <main className="app-content flex-1 min-w-0 px-4 sm:px-6 xl:px-8 pt-3 pb-6 sm:pt-5 sm:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <button type="button" onClick={() => setIsMobileSidebarOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-[#071326]/75 text-slate-300 shadow-lg shadow-black/20 backdrop-blur-xl" aria-label="Abrir menu lateral"><Menu className="h-5 w-5" /></button>
              {isScraping && <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />Coleta ativa</span>}
            </div>
          {currentTab === 'dashboard' && <DashboardScreen totalPlaces={totalPlaces} jobs={jobs} currentJob={currentJob} isScraping={isScraping} onNavigate={setCurrentTab} />}

          {currentTab === 'profile' && authUser && <ProfileScreen user={authUser} onSave={async (name) => { const response = await apiFetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.user) throw new Error(payload.error || 'Não foi possível atualizar o perfil.'); setAuthUser(payload.user); window.sessionStorage.setItem('mapscrape_user', JSON.stringify(payload.user)); }} />}

          {currentTab === 'projects' && (
            <ProjectsScreen
              jobs={jobs}
              apiReady={hasApiKey}
              onNewScrape={(projectName, categoryName) => {
                if (projectName !== undefined) setPreselectedProject(projectName);
                if (categoryName !== undefined) setPreselectedCategory(categoryName);
                setCurrentTab('search');
              }}
              onOpenJob={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentPage(1);
                setCurrentTab('results');
              }}
            />
          )}

          {currentTab === 'credentials' && <CredentialsScreen />}

          {currentTab === 'search' && (
            <SearchScreen
              currentJob={currentJob}
              isScraping={isScraping}
              apiReady={hasApiKey}
              onStartScrape={handleStartScrape}
              onStopScrape={handleStopScrape}
              onGoToResults={() => setCurrentTab('results')}
              initialProjectName={preselectedProject}
              initialCategoryName={preselectedCategory}
              scrapeResults={liveScrapePlaces}
              liveResults={
                <ResultsScreen
                  compactCardsOnly
                  places={liveScrapePlaces}
                  totalPlaces={liveScrapePlaces.length}
                  jobs={jobs}
                  selectedJobId={currentJob?.id}
                  onSelectJobId={setSelectedJobId}
                  selectedPlaceIds={selectedPlaceIds}
                  onToggleSelectPlace={handleToggleSelectPlace}
                  onToggleSelectAll={handleToggleSelectAll}
                  onGoToExport={() => setCurrentTab('export')}
                  searchQuery=""
                  onSearchQueryChange={() => {}}
                  selectedCategory=""
                  onCategoryChange={() => {}}
                  sortBy="collected_at"
                  sortOrder="desc"
                  onSortChange={() => {}}
                  currentPage={1}
                  pageSize={500}
                  onPageChange={() => {}}
                  onPageSizeChange={() => {}}
                  isLoading={false}
                />
              }
            />
          )}

          {currentTab === 'client-scrape' && (
            <ClientSideScrapeScreen onGoToResults={() => setCurrentTab('results')} />
          )}

          {currentTab === 'results' && (
            <ResultsScreen
              places={places}
              totalPlaces={totalPlaces}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
              selectedPlaceIds={selectedPlaceIds}
              onToggleSelectPlace={handleToggleSelectPlace}
              onToggleSelectAll={handleToggleSelectAll}
              onGoToExport={() => setCurrentTab('export')}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              selectedCategory={categoryFilter}
              onCategoryChange={(value) => { setCategoryFilter(value); setCurrentPage(1); }}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
              currentPage={currentPage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              isLoading={isLoadingPlaces}
              onPlaceUpdated={(updated) => {
                setPlaces((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
              }}
              onGoToKanban={() => setCurrentTab('kanban')}
            />
          )}

          {currentTab === 'kanban' && (
            <KanbanScreen
              places={places}
              onSelectPlaceForDetails={(place) => {
                setSearchQuery(place.name);
                setCurrentTab('results');
              }}
            />
          )}

          {currentTab === 'export' && (
            <ExportScreen
              places={places}
              totalPlaces={totalPlaces}
              selectedPlaceIds={selectedPlaceIds}
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelectJobId={setSelectedJobId}
              searchQuery={searchQuery}
              selectedCategory={categoryFilter}
            />
          )}

          {currentTab === 'history' && (
            <HistoryScreen
              jobs={jobs}
              onViewResults={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('results');
              }}
              onGoToExportWithJob={(jobId) => {
                setSelectedJobId(jobId);
                setCurrentTab('export');
              }}
              onDeleteJob={handleDeleteJob}
            />
          )}

          {currentTab === 'logs' && <LogsScreen />}

          {currentTab === 'privacy' && <PrivacyScreen />}

          {currentTab === 'billing' && <BillingScreen />}
          </div>
        </main>
      </div>

    </div>
  );
}