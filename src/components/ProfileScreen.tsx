import React, { useState } from 'react';
import { CalendarDays, Mail, Save, UserRound } from 'lucide-react';

type ProfileUser = { id: string; email: string; name: string; role: 'admin' | 'user'; createdAt?: string };

export const ProfileScreen: React.FC<{ user: ProfileUser; onSave: (name: string) => Promise<void> }> = ({ user, onSave }) => {
  const [name, setName] = useState(user.name || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(''); setError('');
    try { await onSave(name.trim()); setMessage('Perfil atualizado com sucesso.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o perfil.'); }
    finally { setBusy(false); }
  };

  const initials = (name.trim() || user.email).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cyan-200"><UserRound className="h-3.5 w-3.5" />Conta e identificação</div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Meu Perfil</h1>
        <p className="mt-2 text-sm text-slate-400">Gerencie suas informações de identificação na plataforma.</p>
      </header>
      <div className="rounded-2xl border border-[#17274f] bg-[#0b1429]/90 p-6 shadow-xl shadow-blue-950/20 sm:p-8">
        <div className="mb-7 flex items-center gap-4 border-b border-[#17274f] pb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-xl font-bold text-cyan-100">{initials || 'U'}</div>
          <div className="min-w-0"><p className="truncate text-lg font-bold text-white">{user.name || 'Usuário'}</p><p className="truncate text-sm text-slate-400">{user.email}</p><span className="mt-1 inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</span></div>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <label className="block space-y-2 text-sm font-semibold text-slate-200">Nome completo<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-[#1d3162] bg-[#070e20] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-400" /></label>
          <div className="space-y-2"><span className="block text-sm font-semibold text-slate-200">E-mail</span><div className="flex items-center gap-3 rounded-xl border border-[#17274f] bg-[#070e20]/70 px-4 py-3 text-sm text-slate-400"><Mail className="h-4 w-4 shrink-0" />{user.email}</div><p className="text-xs text-slate-500">O e-mail é usado para acessar a conta e não pode ser alterado nesta tela.</p></div>
          {user.createdAt && <div className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays className="h-4 w-4" />Conta criada em {new Date(user.createdAt).toLocaleDateString('pt-BR')}</div>}
          {message && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</p>}
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          <div className="flex justify-end"><button type="submit" disabled={busy || name.trim().length < 2 || name.trim() === user.name} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"><Save className="h-4 w-4" />{busy ? 'Salvando…' : 'Salvar alterações'}</button></div>
        </form>
      </div>
    </section>
  );
};
