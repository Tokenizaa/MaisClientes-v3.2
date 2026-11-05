import React, { useState, useEffect } from 'react';
import { CreditCard, Crown, ArrowUp, ArrowDown, Check, X, Loader2, History, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { apiFetch } from '../utils/api';

type PlanTier = 'free' | 'starter' | 'growth' | 'pro';
type BillingCycle = 'monthly' | 'annual';

interface PlanConfig {
  leadsPerMonth: number;
  projects: number;
  apiAccess: boolean;
  webhooks: boolean;
  whiteLabel: boolean;
  priceMonthly: number;
  priceAnnual: number;
  features: string[];
}

interface BillingStatus {
  currentPlan: PlanTier;
  isActive: boolean;
  planExpiresAt: string | null;
  limits: PlanConfig;
  usage: {
    monthlyLeads: number;
    remainingLeads: number;
  };
  pagbankConfigured: boolean;
}

type PlanOption = PlanConfig & {
  tier: PlanTier;
  name: string;
};

const PLAN_OPTIONS: PlanOption[] = [
  {
    tier: 'free',
    name: 'Gratuito',
    leadsPerMonth: 500,
    projects: 1,
    apiAccess: false,
    webhooks: false,
    whiteLabel: false,
    priceMonthly: 0,
    priceAnnual: 0,
    features: ['500 leads/mês', '1 projeto', 'Exportação CSV', 'Histórico de coletas'],
  },
  {
    tier: 'starter',
    name: 'Starter',
    leadsPerMonth: 10000,
    projects: 5,
    apiAccess: false,
    webhooks: false,
    whiteLabel: false,
    priceMonthly: 19700,
    priceAnnual: 189120,
    features: ['10.000 leads/mês', '5 projetos', 'Exportação CSV', 'Histórico completo', 'Suporte por e-mail'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    leadsPerMonth: 50000,
    projects: 20,
    apiAccess: true,
    webhooks: true,
    whiteLabel: false,
    priceMonthly: 49700,
    priceAnnual: 477120,
    features: ['50.000 leads/mês', '20 projetos', 'Acesso à API', 'Webhooks', 'Filtros avançados', 'Suporte prioritário'],
  },
  {
    tier: 'pro',
    name: 'Pro',
    leadsPerMonth: 200000,
    projects: -1,
    apiAccess: true,
    webhooks: true,
    whiteLabel: true,
    priceMonthly: 99700,
    priceAnnual: 957120,
    features: ['200.000 leads/mês', 'Projetos ilimitados', 'API completa', 'Webhooks', 'White-label', 'White-label', 'Sync CRM 2-way', 'Suporte dedicado', 'Gerente de conta'],
  },
];

const PLAN_HIERARCHY: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, pro: 3 };

export const BillingScreen: React.FC = () => {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const response = await apiFetch('/api/v1/billing/status', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to load billing status:', error);
    }
  };

  const loadHistory = async () => {
    // Could load billing history from /api/v1/billing/history
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleUpgrade = async (targetTier: PlanTier) => {
    if (!status) return;
    setBusy(targetTier);
    setMessage(null);
    try {
      const response = await apiFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planTier: targetTier, billingCycle: selectedCycle }),
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Falha ao criar checkout');
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank');
        setMessage({ text: 'Redirecionando para pagamento...', type: 'info' });
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao processar upgrade', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!status || status.currentPlan === 'free') return;
    if (!window.confirm('Cancelar a assinatura? O plano gratuito será ativado ao final do período atual.')) return;
    setBusy('cancel');
    setMessage(null);
    try {
      const response = await apiFetch('/api/v1/billing/cancel', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Falha ao cancelar');
      setMessage({ text: data.message, type: 'success' });
      loadStatus();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Falha ao cancelar', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const currentPlan = status?.currentPlan || 'free';
  const currentPlanConfig = PLAN_OPTIONS.find(p => p.tier === currentPlan);
  const isUpgrade = (tier: PlanTier) => PLAN_HIERARCHY[tier] > PLAN_HIERARCHY[currentPlan];
  const isDowngrade = (tier: PlanTier) => PLAN_HIERARCHY[tier] < PLAN_HIERARCHY[currentPlan];

  return (
    <section className="mx-auto max-w-6xl space-y-8 py-2 sm:py-6">
      {/* Header */}
      <header className="border-b border-zinc-800 pb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <CreditCard className="w-3.5 h-3.5" />
          <span>Planos e Faturamento</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">Gerencie seu Plano</h1>
        <p className="mt-2 text-base text-zinc-400 max-w-3xl leading-relaxed">
          Escolha o plano ideal para sua operação. Upgrade imediato, downgrade no fim do ciclo.
        </p>
      </header>

      {/* Current Plan Status */}
      {status && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Crown className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Plano Atual: {currentPlanConfig?.name || currentPlan}</h3>
                <p className="text-sm text-zinc-400">
                  {status.isActive ? 'Ativo' : 'Expirado'} • {status.usage.monthlyLeads.toLocaleString('pt-BR')} de {status.limits.leadsPerMonth.toLocaleString('pt-BR')} leads usados este mês
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-400">Leads restantes</p>
              <p className="font-bold text-emerald-400 text-2xl">{status.usage.remainingLeads.toLocaleString('pt-BR')}</p>
            </div>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (status.usage.monthlyLeads / status.limits.leadsPerMonth) * 100)}%` }}
            />
          </div>
          {status.planExpiresAt && (
            <p className="text-sm text-zinc-400">
              Renovação: {new Date(status.planExpiresAt).toLocaleDateString('pt-BR')}
            </p>
          )}
          {currentPlan !== 'free' && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy === 'cancel'}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-300 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Cancelar assinatura (mantém até o fim do período)
            </button>
          )}
        </div>
      )}

      {/* Billing Cycle Selector */}
      <div className="flex items-center gap-4 border-b border-zinc-800 pb-5">
        <span className="text-sm font-semibold text-zinc-300">Ciclo de cobrança:</span>
        <div className="flex items-center rounded-xl bg-zinc-900/90 border border-zinc-800 p-0.5">
          {(['monthly', 'annual'] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => setSelectedCycle(cycle)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                selectedCycle === cycle
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cycle === 'monthly' ? 'Mensal' : 'Anual (20% off)'}
            </button>
          ))}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_OPTIONS.map((plan) => {
          const isCurrent = plan.tier === currentPlan;
          const isAvailable = plan.tier !== 'free' || currentPlan === 'free';
          const showUpgrade = isUpgrade(plan.tier);
          const showDowngrade = isDowngrade(plan.tier);

          return (
            <article
              key={plan.tier}
              className={`relative rounded-2xl border p-5 space-y-4 transition-all ${
                isCurrent
                  ? 'border-emerald-500/40 bg-emerald-500/10 shadow-lg shadow-emerald-950/20'
                  : 'border-zinc-800 bg-zinc-900/90 hover:border-emerald-500/20'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                  Atual
                </div>
              )}

              <div className="text-center">
                <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {selectedCycle === 'monthly'
                    ? `${formatPrice(plan.priceMonthly)}/mês`
                    : `${formatPrice(plan.priceAnnual)}/ano`}
                </p>
                {plan.priceAnnual > 0 && selectedCycle === 'annual' && (
                  <p className="text-xs text-emerald-400 mt-0.5">
                    {formatPrice(plan.priceMonthly * 12 - plan.priceAnnual)} de economia
                  </p>
                )}
              </div>

              <ul className="space-y-2 text-sm text-zinc-300">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="pt-2 border-t border-zinc-800">
                {plan.tier === currentPlan ? (
                  <div className="text-center text-sm text-zinc-400">Plano atual</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => plan.tier !== 'free' ? handleUpgrade(plan.tier) : loadStatus()}
                    disabled={busy === plan.tier || (!isUpgrade(plan.tier) && !isDowngrade(plan.tier))}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                      isUpgrade(plan.tier)
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : isDowngrade(plan.tier)
                        ? 'bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 text-zinc-300'
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    {busy === plan.tier ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : isUpgrade(plan.tier) ? (
                      <>
                        <ArrowUp className="w-4 h-4" />
                        Upgrade para {plan.name}
                      </>
                    ) : isDowngrade(plan.tier) ? (
                      <>
                        <ArrowDown className="w-4 h-4" />
                        Downgrade para {plan.name}
                      </>
                    ) : (
                      'Plano atual'
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Usage Details */}
      {status && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 space-y-4">
          <h3 className="font-bold text-white">Detalhes de Uso</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
              <p className="text-3xl font-bold text-white">{status.usage.monthlyLeads.toLocaleString('pt-BR')}</p>
              <p className="text-sm text-zinc-400">Leads coletados este mês</p>
            </div>
            <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
              <p className="text-3xl font-bold text-emerald-400">{status.usage.remainingLeads.toLocaleString('pt-BR')}</p>
              <p className="text-sm text-zinc-400">Leads restantes</p>
            </div>
            <div className="rounded-xl bg-zinc-800/50 p-4 text-center">
              <p className="text-3xl font-bold text-blue-400">{status.limits.projects === -1 ? '∞' : status.limits.projects}</p>
              <p className="text-sm text-zinc-400">Limite de projetos</p>
            </div>
          </div>
        </div>
      )}

      {/* Billing History */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-blue-400" />
          Histórico de Faturamento
        </h3>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="border-b border-zinc-800 p-3 font-semibold text-sm text-zinc-300 grid grid-cols-4 gap-4">
            <span>Data</span>
            <span>Evento</span>
            <span>Plano</span>
            <span>Valor</span>
          </div>
          <div className="p-4 text-center text-zinc-500">
            <History className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
            <p>Nenhum evento de faturamento ainda.</p>
            <p className="text-xs text-zinc-600 mt-1">Eventos aparecerão aqui após o primeiro pagamento.</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl border p-4 text-sm font-medium max-w-md ${
            message.type === 'error'
              ? 'border-red-500/30 bg-red-950/40 text-red-300'
              : message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
              : 'border-blue-500/30 bg-blue-950/40 text-blue-200'
          }`}
        >
          {message.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
          {message.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
          {message.type === 'info' && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-blue-400" />}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
};