import React, { useEffect, useMemo, useState } from 'react';
import {
  Folder,
  FolderOpen,
  MapPin,
  Search,
  ArrowRight,
  Layers3,
  Tags,
  Play,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  Plus,
  Radio,
  History,
  Building2,
  Calendar,
  AlertTriangle,
  FolderKanban,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';

async function accountFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token =
    window.sessionStorage.getItem('mapscrape_api_key') ||
    window.sessionStorage.getItem('mapscrape_session_token');
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: init.cache || 'no-store' });
}

export type PersistedProject = { id: string; name: string; created_at: string; updated_at?: string };
export type PersistedCategory = { id: string; name: string; project_id: string; created_at?: string };

interface Props {
  jobs: ScrapeJob[];
  apiReady: boolean;
  onOpenJob: (jobId: string) => void;
  onNewScrape: (projectName?: string, categoryName?: string) => void;
}

export const ProjectsScreen: React.FC<Props> = ({ jobs, apiReady, onOpenJob, onNewScrape }) => {
  const [query, setQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryProjectId, setCategoryProjectId] = useState('');
  const [catalog, setCatalog] = useState<PersistedProject[]>([]);
  const [categories, setCategories] = useState<PersistedCategory[]>([]);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // In-app Delete Confirmation (Eliminates blocked window.confirm in iframe)
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Category to delete
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);

  // Editing state for projects
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');

  // Editing state for categories
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const loadData = async () => {
    if (!apiReady) return;
    try {
      const [projectRes, categoryRes] = await Promise.all([
        accountFetch('/api/v1/projects', { cache: 'no-store' }),
        accountFetch('/api/v1/categories', { cache: 'no-store' }),
      ]);
      if (!projectRes.ok) throw new Error(`Projetos: HTTP ${projectRes.status}`);
      if (!categoryRes.ok) throw new Error(`Categorias: HTTP ${categoryRes.status}`);
      const projectData = await projectRes.json();
      const categoryData = await categoryRes.json();
      setCatalog(
        Array.isArray(projectData.data) ? projectData.data : projectData.projects ?? []
      );
      const rawCategories = Array.isArray(categoryData.data) ? categoryData.data : categoryData.categories ?? [];
      setCategories(
        rawCategories.map((c: any, i: number) =>
          typeof c === 'string'
            ? { id: `cat_${i}_${c}`, name: c, project_id: '', created_at: new Date().toISOString() }
            : {
                id: c?.id || `cat_${i}`,
                name: c?.name || '',
                project_id: c?.project_id || '',
                created_at: c?.created_at || new Date().toISOString(),
              }
        )
      );
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao carregar projetos e categorias.',
        type: 'error',
      });
    }
  };

  useEffect(() => {
    void loadData();
  }, [apiReady]);

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || !apiReady || isSavingProject) return;
    setIsSavingProject(true);
    setMessage(null);
    try {
      const response = await accountFetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const project = data.data ?? data.project;
      setCatalog((current) =>
        current.some((item) => item.id === project.id)
          ? current
          : [...current, project].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setNewProjectName('');
      setMessage({ text: `Projeto “${project.name}” salvo com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao criar projeto.',
        type: 'error',
      });
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleUpdateProject = async (id: string) => {
    const name = editingProjectName.trim();
    if (!name) return;
    try {
      const response = await accountFetch(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      const project = data.data ?? data.project ?? { id, name };
      setCatalog((current) =>
        current.map((item) => (item.id === id ? { ...item, name } : item)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setEditingProjectId(null);
      setMessage({ text: `Projeto atualizado para “${name}”.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao atualizar projeto.',
        type: 'error',
      });
    }
  };

  const executeDeleteProject = async () => {
    if (!projectToDelete) return;
    const { id, name } = projectToDelete;
    setIsDeleting(true);
    try {
      const response = await accountFetch(`/api/v1/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setCatalog((current) => current.filter((item) => item.id !== id));
      setProjectToDelete(null);
      setMessage({ text: `Projeto “${name}” excluído com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao excluir projeto.',
        type: 'error',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const createCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCategoryName.trim();
    if (!name || !categoryProjectId || !apiReady || isSavingCategory) return;
    setIsSavingCategory(true);
    setMessage(null);
    try {
      const response = await accountFetch('/api/v1/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: categoryProjectId }),
      });
      const data = await response.json();
      if (!response.ok || (!data.data?.id && !data.category?.id)) {
        throw new Error(data.message || data.error || `Não foi possível salvar a categoria (HTTP ${response.status}).`);
      }
      const category = data.data ?? data.category;
      setCategories((current) =>
        current.some((item) => item.id === category.id)
          ? current
          : [...current, category].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      setNewCategoryName('');
      setMessage({
        text: `Categoria “${category.name}” cadastrada para pesquisas.`,
        type: 'success',
      });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao criar categoria.',
        type: 'error',
      });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const executeDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const { id, name } = categoryToDelete;
    try {
      const response = await accountFetch(`/api/v1/categories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      setCategories((current) => current.filter((item) => item.id !== id));
      setCategoryToDelete(null);
      setMessage({ text: `Categoria “${name}” excluída com sucesso.`, type: 'success' });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : 'Falha ao excluir categoria.',
        type: 'error',
      });
    }
  };

  const projects = useMemo(() => {
    const persisted = catalog.map((project) => {
      const related = jobs
        .filter((job) => job.project_id === project.id || (!job.project_id && job.project_name === project.name))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        id: project.id,
        name: project.name,
        isPersisted: true,
        jobs: related,
        total: related.reduce((sum, job) => sum + (job.total_collected || 0), 0),
      };
    });

    const knownNames = new Set(persisted.map((project) => project.name.toLocaleLowerCase('pt-BR')));
    const legacy = new Map<string, ScrapeJob[]>();
    for (const job of jobs) {
      const name = job.project_name?.trim() || `${job.segment} · ${job.location}`;
      if (knownNames.has(name.toLocaleLowerCase('pt-BR'))) continue;
      legacy.set(name, [...(legacy.get(name) || []), job]);
    }

    const all = [
      ...persisted,
      ...[...legacy.entries()].map(([name, items]) => ({
        id: `legacy:${name}`,
        name,
        isPersisted: false,
        jobs: items.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        total: items.reduce((sum, job) => sum + (job.total_collected || 0), 0),
      })),
    ];

    const needle = query.toLocaleLowerCase('pt-BR').trim();
    if (!needle) return all.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return all
      .filter(
        (project) =>
          project.name.toLocaleLowerCase('pt-BR').includes(needle) ||
          project.jobs.some((job) => `${job.segment} ${job.location}`.toLocaleLowerCase('pt-BR').includes(needle))
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [jobs, catalog, query]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-[#152347] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-2 font-mono">
            <FolderKanban className="w-3.5 h-3.5 text-blue-400" />
            <span>Gestão Unificada de Campanhas</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Projetos & Campanhas</h1>
          <p className="mt-1 text-sm text-slate-300 max-w-2xl">
            Organize suas extrações por projetos e categorias de pesquisa, e consulte o histórico de coletas realizadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNewScrape()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all cursor-pointer active:scale-95"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>Nova Coleta</span>
        </button>
      </header>

      {/* Message Alert */}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-3 rounded-xl border p-4 text-sm font-medium ${
            message.type === 'error'
              ? 'border-red-500/30 bg-red-950/40 text-red-300'
              : 'border-blue-500/30 bg-blue-950/40 text-blue-200'
          }`}
        >
          {message.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0 text-red-400" /> : <Check className="h-4 w-4 shrink-0 text-blue-400" />}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Fechar mensagem"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* In-app Project Delete Confirmation Modal (NO window.confirm!) */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040814]/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-[#0b1428] border border-red-500/30 p-6 space-y-5 shadow-2xl shadow-red-950/40">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-500/40 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Excluir Projeto</h3>
                <p className="text-xs text-slate-400">Esta ação é irreversível.</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Tem certeza que deseja remover o projeto <strong className="text-white">“{projectToDelete.name}”</strong>?
              As coletas e os estabelecimentos existentes serão preservados desvinculados.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl border border-[#1d3162] hover:bg-[#101d3b] text-slate-300 text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteProject()}
                disabled={isDeleting}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir Projeto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-app Category Delete Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040814]/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#0b1428] border border-[#1d3162] p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Excluir Categoria</h3>
            <p className="text-sm text-slate-300">
              Deseja remover a categoria <strong className="text-white">“{categoryToDelete.name}”</strong>?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="px-4 py-2 rounded-xl border border-[#1d3162] text-slate-300 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteCategory()}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Registration Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Create Project Card */}
        <section className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-5 space-y-4">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Folder className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Criar Novo Projeto</h2>
          </div>
          <form onSubmit={(e) => void createProject(e)} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Clínicas Odontológicas SP"
              aria-label="Nome do novo projeto"
              className="flex-1 rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newProjectName.trim() || isSavingProject}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isSavingProject ? 'Salvando...' : 'Salvar Projeto'}</span>
            </button>
          </form>
          <p className="text-xs text-slate-400">
            Projetos agrupam suas coletas e facilitam a exportação combinada de dados.
          </p>
        </section>

        {/* Create Category Card */}
        <section className="rounded-2xl border border-[#17274f] bg-[#0b1429] p-5 space-y-4">
          <div className="flex items-center gap-2.5 text-slate-200">
            <div className="w-8 h-8 rounded-lg bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Tags className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Cadastrar Categoria</h2>
          </div>
          <form onSubmit={(e) => void createCategory(e)} className="flex flex-col gap-2 sm:flex-row">
            <select
              value={categoryProjectId}
              onChange={(e) => setCategoryProjectId(e.target.value)}
              aria-label="Selecionar projeto para a categoria"
              className="rounded-xl border border-[#1d3162] bg-[#070e20] px-3 py-2.5 text-xs text-slate-100 outline-none focus:border-blue-500 sm:w-44"
            >
              <option value="">Vincular a projeto</option>
              {catalog.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Implantes Dentários"
              aria-label="Nome da categoria"
              className="flex-1 rounded-xl border border-[#1d3162] bg-[#070e20] px-3.5 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newCategoryName.trim() || !categoryProjectId || isSavingCategory}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{isSavingCategory ? 'Salvando...' : 'Cadastrar'}</span>
            </button>
          </form>

          {/* Existing categories list */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="group flex items-center gap-1.5 rounded-lg border border-[#1d3162] bg-[#070e20] px-2.5 py-1 text-xs text-slate-200 hover:border-blue-500/40 transition-colors"
                >
                  <span className="font-medium text-slate-200">{cat.name}</span>
                  <button
                    type="button"
                    onClick={() => onNewScrape(catalog.find((p) => p.id === cat.project_id)?.name, cat.name)}
                    className="text-blue-400 hover:text-blue-300 p-0.5 ml-1"
                    title="Pesquisar nesta categoria"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryToDelete({ id: cat.id, name: cat.name })}
                    className="text-slate-500 hover:text-red-400 p-0.5"
                    title="Excluir categoria"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Filter / Search Bar */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          aria-label="Buscar projeto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome do projeto, segmento ou localização..."
          className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] py-3 pl-10 pr-4 text-sm text-slate-100 outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1d3162] p-12 text-center bg-[#070e20]/50">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-500 mb-3" />
          <h2 className="text-lg font-bold text-white">
            {query ? 'Nenhum projeto encontrado para esta busca' : 'Nenhum projeto cadastrado'}
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-md mx-auto">
            {query ? 'Tente buscar com outro termo.' : 'Crie um novo projeto acima ou inicie uma coleta diretamente.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="flex flex-col rounded-2xl border border-[#17274f] bg-[#0b1429] p-5 shadow-xl shadow-blue-950/20 hover:border-blue-500/40 transition-all space-y-4"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="rounded-xl border border-blue-500/30 bg-blue-600/15 p-2.5 text-blue-400 shrink-0">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    {editingProjectId === project.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          value={editingProjectName}
                          onChange={(e) => setEditingProjectName(e.target.value)}
                          className="rounded-lg bg-[#070e20] border border-[#1d3162] px-2.5 py-1 text-sm text-white font-bold"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => void handleUpdateProject(project.id)}
                          className="text-blue-400 hover:text-blue-300 p-1"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProjectId(null)}
                          className="text-slate-400 hover:text-white p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <h2 className="font-bold text-white text-base truncate" title={project.name}>
                        {project.name}
                      </h2>
                    )}
                    <p className="mt-0.5 text-xs text-blue-300/80">
                      {project.jobs.length} {project.jobs.length === 1 ? 'coleta' : 'coletas'} · <strong className="text-white font-mono">{project.total.toLocaleString('pt-BR')}</strong> leads salvos
                    </p>
                  </div>
                </div>

                {project.isPersisted && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjectId(project.id);
                        setEditingProjectName(project.name);
                      }}
                      className="text-slate-400 hover:text-blue-300 p-1.5 rounded-lg hover:bg-[#122247] transition-colors"
                      title="Editar nome"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {/* Delete Project Button with Reliable In-App Confirmation */}
                    <button
                      type="button"
                      onClick={() => setProjectToDelete({ id: project.id, name: project.name })}
                      className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-950/40 transition-colors cursor-pointer"
                      title="Excluir projeto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Action Button: Start Scrape in this Project */}
              <div>
                <button
                  type="button"
                  onClick={() => onNewScrape(project.name)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600/15 border border-blue-500/30 hover:bg-blue-600/25 text-blue-300 hover:text-white py-2 text-xs font-bold transition-all cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Iniciar Coleta neste Projeto</span>
                </button>
              </div>

              {/* Linked Past Scrape Jobs History */}
              {project.jobs.length > 0 && (
                <div className="space-y-2 flex-1 pt-2 border-t border-[#17274f]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Histórico de Coletas</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {project.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-[#070e20] border border-[#17274f] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-100">{job.segment}</p>
                          <p className="flex items-center gap-1 truncate text-[11px] text-slate-400">
                            <MapPin className="h-2.5 w-2.5 text-blue-400 shrink-0" />
                            {job.location}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${
                                job.status === 'completed'
                                  ? 'bg-emerald-400'
                                  : job.status === 'running'
                                  ? 'bg-blue-400 animate-ping'
                                  : 'bg-slate-500'
                              }`}
                            />
                            {job.total_collected} leads salvos
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenJob(job.id)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#1d3162] hover:border-blue-400 hover:text-blue-300 px-2 py-1 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
                        >
                          <span>Ver</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <footer className="pt-4 border-t border-[#152347] text-xs text-slate-400 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-blue-400" />
        <span>Todos os projetos e histórico de coletas são sincronizados e deduplicados automaticamente.</span>
      </footer>
    </div>
  );
};
