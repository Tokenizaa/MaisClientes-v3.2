import React from 'react';
import {
  Search,
  Table2,
  FolderKanban,
  LayoutDashboard,
  ClipboardList,
  MapPin,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Square,
  Database,
  UserRound,
  LogOut,
  Kanban,
  Shield,
  CreditCard,
  Monitor,
  Puzzle,
} from 'lucide-react';
import { ScrapeJob } from '../shared/types';

export type ScreenTab = 'dashboard' | 'projects' | 'credentials' | 'search' | 'results' | 'export' | 'history' | 'logs' | 'profile' | 'kanban' | 'privacy' | 'billing' | 'client-scrape' | 'extension';

interface SidebarProps {
  currentTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  totalPlaces: number;
  selectedCount: number;
  isScrapingActive: boolean;
  currentJob: ScrapeJob | null;
  onStopScrape?: () => void;
  userName: string;
  userEmail: string;
  onProfileClick: () => void;
  onLogout: () => void;
  isAdmin?: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  totalPlaces,
  selectedCount,
  isScrapingActive,
  currentJob,
  onStopScrape,
  userName,
  userEmail,
  onProfileClick,
  onLogout,
  isAdmin = false,
  isOpenMobile,
  onCloseMobile,
}) => {
  // Consolidated and streamlined navigation hubs
  const navItems = [
    {
      id: 'search' as ScreenTab,
      label: 'Nova Coleta',
      icon: Search,
      badge: isScrapingActive ? 'Varrendo' : undefined,
      badgeVariant: 'active',
      description: 'Pesquisar no Google Maps',
    },
    {
      id: 'client-scrape' as ScreenTab,
      label: 'Coleta no Seu Navegador',
      icon: Monitor,
      description: 'Coleta client-side via Google Maps',
    },
    {
      id: 'extension' as ScreenTab,
      label: 'Extensão do Navegador',
      icon: Puzzle,
      description: 'Coleta automatizada via extensão Chrome',
    },
    {
      id: 'results' as ScreenTab,
      label: 'Base de Leads',
      icon: Table2,
      badge: totalPlaces > 0 ? totalPlaces.toLocaleString('pt-BR') : undefined,
      badgeVariant: 'neutral',
      description: 'Leads, filtros e exportação',
    },
    {
      id: 'kanban' as ScreenTab,
      label: 'Pipeline Kanban',
      icon: Kanban,
      badge: 'CRM',
      badgeVariant: 'active',
      description: 'Oportunidades & qualificação',
    },
    {
      id: 'projects' as ScreenTab,
      label: 'Projetos e Coletas',
      icon: FolderKanban,
      description: 'Projetos, categorias e histórico',
    },
    {
      id: 'dashboard' as ScreenTab,
      label: 'Painel Geral',
      icon: LayoutDashboard,
      description: 'Métricas e taxas de conversão',
    },
    {
      id: 'logs' as ScreenTab,
      label: 'Auditoria & Sistema',
      icon: ClipboardList,
      description: 'Logs de atividade e auditoria',
    },
    ...(isAdmin ? [{
      id: 'credentials' as ScreenTab,
      label: 'Credenciais API',
      icon: KeyRound,
      description: 'Chaves de integração e acesso',
    }] : []),
    {
      id: 'privacy' as ScreenTab,
      label: 'Privacidade & LGPD',
      icon: Shield,
      description: 'Dados, direitos e exportação',
    },
    {
      id: 'billing' as ScreenTab,
      label: 'Planos e Faturamento',
      icon: CreditCard,
      description: 'Gerencie seu plano e assinatura',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Fechar menu lateral"
          onClick={onCloseMobile}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              onCloseMobile();
            }
          }}
          className="fixed inset-0 bg-[#040814]/80 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
        />
      )}

      {/* Sidebar Panel - Deep Dark Navy Palette */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-[#070e20] border-r border-[#152347] flex flex-col transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:bottom-auto lg:col-start-1 lg:row-start-1 lg:h-screen lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-[#152347]/80 bg-[#060c1c]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/30 via-[#0d1b3d] to-[#081024] border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-md shadow-blue-950/50">
              <MapPin className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-100 text-lg tracking-tight">MapScrape</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-blue-300/70 font-normal">Coleta Comercial Google Maps</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 py-5 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
            Plataforma Unificada
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentTab === item.id ||
              (item.id === 'results' && currentTab === 'export') ||
              (item.id === 'projects' && currentTab === 'history');

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onTabChange(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600/25 via-[#122247] to-[#0e1b38] text-white border border-blue-500/40 shadow-md shadow-blue-950/40'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#0c1630]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/40'
                        : 'bg-[#0c1630] border border-[#17274f] text-slate-400 group-hover:text-blue-300 group-hover:border-blue-500/30'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-left truncate">
                    <div className="font-semibold text-sm leading-tight">{item.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.description}</div>
                  </div>
                </div>

                {item.badge && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-mono tabular-nums shrink-0 ${
                      item.badgeVariant === 'active'
                        ? 'bg-blue-600/30 text-blue-200 border border-blue-400/50 font-bold animate-pulse'
                        : 'bg-[#0f1d3d] text-blue-300 border border-blue-900/60 font-semibold'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Live Scraper Radar Widget */}
        {currentJob && (
          <div className="p-3.5 mx-3 mb-3 bg-[#0a142c] rounded-xl border border-blue-900/50 text-xs space-y-2.5 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                {currentJob.status === 'running' ? (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                ) : currentJob.status === 'completed' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
                {currentJob.status === 'running'
                  ? 'Coleta em andamento'
                  : currentJob.status === 'completed'
                  ? 'Coleta concluída'
                  : 'Status da coleta'}
              </span>
              <span className="font-mono text-blue-300 tabular-nums font-bold">
                {currentJob.total_collected}/{currentJob.limit_requested}
              </span>
            </div>

            <div className="text-slate-300 truncate text-[11px]">
              <span className="font-medium text-white">{currentJob.segment}</span> · {currentJob.location}
            </div>

            {currentJob.status === 'running' && onStopScrape && (
              <button
                type="button"
                onClick={onStopScrape}
                className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-700/50 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current text-red-400" />
                <span>Interromper coleta</span>
              </button>
            )}
          </div>
        )}

        {/* Account controls */}
        <div className="px-3 py-3 border-t border-[#152347]/80 space-y-2">
          <button type="button" onClick={() => { onProfileClick(); onCloseMobile(); }} className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${currentTab === 'profile' ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-[#0c1630] border border-transparent'}`}>
            <div className="h-9 w-9 shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 flex items-center justify-center text-cyan-200 font-bold text-sm">{(userName.trim().charAt(0) || 'U').toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-slate-100">{userName}</div><div className="truncate text-[10px] text-slate-400">{userEmail}</div><div className="mt-0.5 flex items-center gap-1 text-[10px] text-cyan-300"><UserRound className="h-3 w-3" />Meu perfil</div></div>
          </button>
          <button type="button" onClick={onLogout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"><LogOut className="h-4 w-4" />Sair da plataforma</button>
        </div>

        {/* Bottom Leads Indicator Bar */}
        <div className="p-4 border-t border-[#152347]/80 bg-[#060c1c]">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              <span className="font-medium">Total de Leads Salvos</span>
            </div>
            <span className="font-mono text-white tabular-nums font-bold">
              {totalPlaces.toLocaleString('pt-BR')}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 leading-tight">
            Deduplicação automática por URL e Endereço
          </p>
        </div>
      </aside>
    </>
  );
};
