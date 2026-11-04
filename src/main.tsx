import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for authentication
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

try {
  const descriptor =
    Object.getOwnPropertyDescriptor(window, 'fetch') ||
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'fetch');

  if (!descriptor || descriptor.writable || typeof descriptor.set === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
      let headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      
      // Add Authorization token if we have a Supabase session or API key
      const token =
        window.sessionStorage.getItem('mapscrape_api_key') ||
        window.sessionStorage.getItem('mapscrape_session_token');
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      
      return nativeFetch(input, { ...init, headers, cache: init.cache || 'no-store' });
    };
  }
} catch {
  // If window.fetch has only a getter or is protected by host sandbox/iframe, skip overriding
}

createRoot(document.getElementById('root')!).render(<App />);