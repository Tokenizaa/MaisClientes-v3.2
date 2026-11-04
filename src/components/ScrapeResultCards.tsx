import React from 'react';
import type { PlaceRecord } from '../shared/types';

interface ScrapeResultCardsProps {
  places: PlaceRecord[];
}

const firstPhoto = (place: PlaceRecord) => {
  const candidates = [place.logo_url, place.photos?.split('|')[0], place.media_items]
    .filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (candidate.startsWith('http')) return candidate;
    try {
      const parsed = JSON.parse(candidate);
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      const url = item?.url || item?.src;
      if (typeof url === 'string' && url.startsWith('http')) return url;
    } catch {}
  }
  return '';
};

export const ScrapeResultCards: React.FC<ScrapeResultCardsProps> = ({ places }) => {
  if (!places.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold text-white">Estabelecimentos capturados agora</h2>
          <p className="text-xs text-slate-400">Somente os registros desta execução.</p>
        </div>
        <span className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm font-semibold text-blue-300 tabular-nums">
          {places.length} salvos
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {places.slice(0, 9).map((place) => {
          const photo = firstPhoto(place);
          return (
            <article key={place.id} className="flex min-w-0 gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
              {photo ? (
                <img src={photo} alt="" referrerPolicy="no-referrer" className="h-20 w-20 shrink-0 rounded-lg object-cover bg-slate-950" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-500 text-2xl">⌂</div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-sm font-semibold text-slate-100">{place.name || 'Estabelecimento sem nome'}</h3>
                {place.category && <p className="mt-1 truncate text-xs text-blue-300">{place.category}</p>}
                {place.address && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{place.address}</p>}
                {place.phone && <p className="mt-1 truncate text-xs font-medium text-slate-300">{place.phone}</p>}
                {place.maps_url && <a href={place.maps_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold text-blue-400 hover:text-blue-300">Abrir no Maps ↗</a>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
