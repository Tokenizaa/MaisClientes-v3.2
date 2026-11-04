/**
 * Normalization module for Google Maps data fields.
 * Normalizes values without altering their factual meaning.
 */

export function cleanText(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/[\uE000-\uF8FF]/g, '') // remove private-use unicode icons
    .trim();
}

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Endereço: " or "Address: " prefix if present from aria-label
  cleaned = cleaned.replace(/^(endereço|address|adresse|dirección):\s*/i, '');
  return cleaned.trim();
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Telefone: " or "Phone: " prefix if present from aria-label
  cleaned = cleaned.replace(/^(telefone|phone|téléphone|teléfono):\s*/i, '');
  // Remove icon remnants
  cleaned = cleaned.replace(/^[\s]+/, '');
  return cleaned.trim();
}

export function normalizeWebsite(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove "Website: " or "Site: " prefix
  cleaned = cleaned.replace(/^(website|site|sito web|sitio web):\s*/i, '');
  cleaned = cleaned.replace(/^[\s]+/, '');
  return cleaned.trim();
}

export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  // Remove trailing or leading bullet or dot
  cleaned = cleaned.replace(/^[·•\s]+|[·•\s]+$/g, '');
  return cleaned.trim();
}

export function normalizeRating(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw);
  // Match rating like "4.5" or "4,5"
  const match = cleaned.match(/(\d+[.,]\d+)/);
  if (match) {
    return match[1];
  }
  return cleaned;
}

export function normalizeReviewCount(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw);
  // Common formats: "(1.234)", "1.234 avaliações", "(58)"
  const match = cleaned.match(/([\d.,]+)\s*(?:avaliações|reviews)?/i);
  if (match) {
    // Keep numbers and periods/commas as formatted by Google
    return match[1].replace(/[()]/g, '').trim();
  }
  return cleaned.replace(/[()]/g, '').trim();
}

export function normalizePriceRange(raw: string | null | undefined): string {
  if (!raw) return '';
  let cleaned = cleanText(raw);
  cleaned = cleaned.replace(/^(preço|price|prix|precio):\s*/i, '');
  return cleaned.trim();
}

export function normalizeBusinessStatus(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = cleanText(raw).replace(/\s+/g, ' ').trim();
  // Maps may render a different language despite the requested pt-BR locale.
  if (/temporarily closed|fermé temporairement|cerrado temporalmente|fechado temporariamente/i.test(cleaned)) {
    return 'Fechado temporariamente';
  }
  if (/permanently closed|fermé définitivement|cerrado permanentemente|fechado permanentemente/i.test(cleaned)) {
    return 'Fechado permanentemente';
  }
  if (/(?:^|[^a-z])(?:open|ouvert|abierto|aberta|aberto)(?:$|[^a-z])/i.test(cleaned)) {
    const next = cleaned.match(/(?:closes|closing|ferme|fermera|fecha)\s+(?:at|à|a|às|as)?\s*([\d: h.]+)/i);
    return next ? `Aberto · fecha às ${next[1].trim()}` : 'Aberto';
  }
  if (/(?:^|[^a-z])(?:closed|fermé|fermée|cerrado|cerrada|fechado|fechada)(?:$|[^a-z])/i.test(cleaned)) {
    return 'Fechado';
  }
  return cleaned;
}

export interface AddressComponents {
  postal_code: string;
  country: string;
  city: string;
  state: string;
  neighborhood: string;
}

const BRAZIL_STATES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

/** Parse address components only when the displayed address contains explicit evidence. */
export function parseAddressComponents(raw: string | null | undefined): AddressComponents {
  const address = normalizeAddress(raw).replace(/\s+/g, ' ').trim();
  const postal_code =
    address.match(/\b\d{5}-\d{3}\b/)?.[0] ||
    address.match(/\b\d{5}\b/)?.[0] ||
    address.match(/\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\b/i)?.[0] ||
    '';
  const countryMatch = /,\s*(Brazil|Brasil|United States|United Kingdom|Canada|Australia|Portugal|España|Spain|France|Deutschland|Germany|Italy|México|Mexico)\s*$/i.exec(address);
  const country = countryMatch?.[1] || '';
  const beforeCountry = countryMatch ? address.slice(0, countryMatch.index) : address;
  const postalIndex = postal_code ? beforeCountry.lastIndexOf(postal_code) : -1;
  const withoutPostal = postalIndex >= 0
    ? beforeCountry.slice(0, postalIndex).replace(/[ ,\s-]+$/, '').trim()
    : beforeCountry.trim();
  const stateMatch = /(?:-|,)\s*([A-Z]{2})(?=\s*$)/.exec(withoutPostal);
  const stateCandidate = stateMatch?.[1]?.toUpperCase() || '';
  const state = BRAZIL_STATES.has(stateCandidate) ? stateCandidate : '';
  let city = '';
  let neighborhood = '';
  if (state && stateMatch) {
    const prefix = withoutPostal.slice(0, stateMatch.index).replace(/[ ,\s-]+$/, '').trim();
    const parts = prefix.split(',').map((part) => part.trim()).filter(Boolean);
    city = parts[parts.length - 1] || '';
    const areaSegment = parts[parts.length - 2] || '';
    const areaSeparator = areaSegment.lastIndexOf(' - ');
    if (areaSeparator >= 0) neighborhood = areaSegment.slice(areaSeparator + 3).trim();
    else if (areaSegment && !/\d/.test(areaSegment)) neighborhood = areaSegment;
  } else if (country && !state) {
    const parts = withoutPostal.split(',').map((part) => part.trim()).filter(Boolean);
    city = parts[parts.length - 1] || '';
  }
  return { postal_code, country, city, state, neighborhood };
}

/**
 * Parse a search-location string only when its structure makes city/state unambiguous.
 * Accepted forms: City, UF; Neighborhood, City, UF; and City, UF, Brasil.
 * A lone token or arbitrary multi-part phrase is never promoted to city/state.
 */
export function parseSearchLocationFallback(raw: string | null | undefined): { city: string; state: string } {
  const parts = String(raw || '').split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { city: '', state: '' };
  const last = parts[parts.length - 1];
  const penultimate = parts[parts.length - 2];
  if (/^(Brasil|Brazil)$/i.test(last) && BRAZIL_STATES.has(penultimate.toUpperCase())) {
    return { city: parts[parts.length - 3] || '', state: penultimate.toUpperCase() };
  }
  if (BRAZIL_STATES.has(last.toUpperCase())) {
    return { city: penultimate, state: last.toUpperCase() };
  }
  return { city: '', state: '' };
}
/** Extract Google's stable place identifier when the URL actually contains one. */
export function extractSourcePlaceId(url: string | null | undefined): string {
  let value = String(url || '');
  try { value = decodeURIComponent(value); } catch { /* Keep the original URL when decoding is incomplete. */ }

  // Maps URLs can contain a nearby feature/CID before the actual selected place.
  // Prefer the place identifier in the !3m6!1s payload, then the first !1s payload.
  const selectedPlace = value.match(/!3m6!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (selectedPlace) return selectedPlace.toLowerCase();

  const firstPlace = value.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (firstPlace) return firstPlace.toLowerCase();

  const anyCid = value.match(/(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (anyCid) return anyCid.toLowerCase();

  return value.match(/!1s([^!/?]+)/)?.[1] || '';
}

export function extractCoordinates(url: string | null | undefined): { latitude: string; longitude: string } {
  if (!url) return { latitude: '', longitude: '' };
  const isValidPair = (latitude: string, longitude: string): boolean => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  };
  // Google Maps place URLs commonly expose coordinates as !3dLAT!4dLNG.
  const match3d = url.match(/!3d(-?\d+(?:\.\d+)?)/);
  const match4d = url.match(/!4d(-?\d+(?:\.\d+)?)/);
  if (match3d && match4d && isValidPair(match3d[1], match4d[1])) {
    return { latitude: match3d[1], longitude: match4d[1] };
  }
  // Search/map URLs may instead expose the viewport center as @LAT,LNG.
  const matchAt = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (matchAt && isValidPair(matchAt[1], matchAt[2])) {
    return { latitude: matchAt[1], longitude: matchAt[2] };
  }
  return { latitude: '', longitude: '' };
}
