import React, { useState } from 'react';
import { AmbientBackground } from './AmbientBackground';
import { HolographicGridOverlay } from './HolographicGridOverlay';
import { MapPin, ArrowRight, LoaderCircle } from 'lucide-react';

type User = { id: string; email: string; name: string; role: 'admin' | 'user' };
type Props = { onAuthenticated: (token: string, user: User) => void };

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || `Não foi possível ${mode === 'login' ? 'entrar' : 'criar a conta'} (HTTP ${response.status}).`);
      if (!data.token || !data.user) throw new Error('Resposta de autenticação inválida.');
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de autenticação.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="app-shell min-h-screen bg-transparent text-zinc-100">
    <AmbientBackground />
    <HolographicGridOverlay />
    <main className="relative z-10 flex min-h-screen items-center justify-center bg-transparent px-4 py-10 text-zinc-100">
    <section className="w-full max-w-md">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"><MapPin className="h-5 w-5" /></div>
        <div><p className="text-lg font-semibold tracking-tight">MapScrape</p><p className="text-sm text-zinc-400">Plataforma de coleta e dados</p></div>
      </div>
      <div className="app-visual-panel rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl sm:p-8" style={{ backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)" }}>
        <div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight">{mode === 'login' ? 'Acesse sua conta' : 'Crie sua conta'}</h1><p className="mt-2 text-sm leading-6 text-zinc-400">{mode === 'login' ? 'Entre para gerenciar projetos, pesquisas e resultados.' : 'Cadastre-se para usar a plataforma sem uma chave de API.'}</p></div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {mode === 'register' && <label className="block text-sm font-medium text-zinc-300">Nome completo<input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500" placeholder="Seu nome" /></label>}
          <label className="block text-sm font-medium text-zinc-300">E-mail<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500" placeholder="voce@empresa.com" /></label>
          <label className="block text-sm font-medium text-zinc-300">Senha<input required type="password" minLength={mode === 'register' ? 12 : 1} maxLength={200} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-emerald-500" placeholder={mode === 'register' ? 'Mínimo de 12 caracteres' : 'Sua senha'} /></label>
          {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar na plataforma' : 'Criar conta'}</button>
        </form>
        <div className="mt-6 border-t border-zinc-800 pt-5 text-center text-sm text-zinc-400">{mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="font-semibold text-emerald-400 hover:text-emerald-300">{mode === 'login' ? 'Cadastre-se' : 'Fazer login'}</button></div>
        {mode === 'register' && <p className="mt-4 text-xs leading-5 text-zinc-500">Use uma senha exclusiva com pelo menos 12 caracteres. A conta recebe um espaço de trabalho isolado.</p>}
      </div>
      <p className="mt-6 text-center text-xs text-zinc-600">MapScrape · Acesso seguro à plataforma</p>
    </section>
    </main>
  </div>;
};
