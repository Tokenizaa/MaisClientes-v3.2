import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabase: SupabaseClient | null = null;
let pagesRuntimeEnv: Record<string, unknown> = {};

/** Inject Cloudflare Pages bindings before a request handler accesses the database. */
export function configureDatabaseEnv(env: Record<string, unknown> | undefined): void {
  pagesRuntimeEnv = env ?? {};
}

/** Export the injected Pages runtime env for other modules (e.g. scraper). */
export { pagesRuntimeEnv };

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const processEnv = typeof process !== 'undefined' ? process.env : {};
    const url = String(pagesRuntimeEnv.SUPABASE_URL ?? processEnv.SUPABASE_URL ?? '').trim();
    // Todas as operações de persistência usam a Service Role Key no servidor.
    const key = String(
      pagesRuntimeEnv.SUPABASE_SERVICE_ROLE_KEY ??
      processEnv.SUPABASE_SERVICE_ROLE_KEY ??
      ''
    ).trim();
    if (!url || !key) {
      throw new Error(
        'Database não configurada: defina SUPABASE_URL e SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no ambiente.'
      );
    }
    supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  return supabase;
}

// ============================================================================
// AUTH
// ============================================================================

export interface SupabaseAuthUser {
  id: string; // Supabase Auth UUID
  email: string;
  app_metadata: any;
  user_metadata: any;
  aud: string;
  role: 'authenticated' | 'public';
  created_at: string;
  updated_at: string;
}

export async function getCurrentSupabaseUser(): Promise<SupabaseAuthUser | null> {
  const db = getSupabase();
  const { data, error } = await db.auth.getUser();
  
  if (error || !data.user) return null;
  return data.user as SupabaseAuthUser;
}

export async function getSession(): Promise<{ session: any; user: SupabaseAuthUser } | { error: any }> {
  const db = getSupabase();
  return db.auth.getSession();
}

// ============================================================================
// Users - Profile lookups (linked to Supabase Auth)
// ============================================================================

export interface UserAccount {
  id: string; // Supabase Auth user UUID
  email: string;
  display_name: string;
  role: 'admin' | 'user';
  created_at: string;
  last_login_at: string | null;
}

export async function findUserById(id: string): Promise<UserAccount | null> {
  const db = getSupabase();
  const { data, error } = await db
    .schema('mapscrape').from('users')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return data as unknown as UserAccount;
}

export async function findUserByEmail(email: string): Promise<UserAccount | null> {
  const db = getSupabase();
  const { data, error } = await db
    .schema('mapscrape').from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single();

  if (error || !data) return null;
  return data as unknown as UserAccount;
}

// Helper: get the authenticated user's profile from Supabase Auth
export async function getAuthenticatedUser(): Promise<UserAccount | null> {
  const result: { session: any; user: SupabaseAuthUser; } | { error: any; } = await getSession();
  
  // Check if result has error property (type guard)
  if ('error' in result) {
    // It's the error type
    return null;
  }
  
  const session = result.session;
  if (!session?.user) return null;
  
  // Get the user profile linked to this Auth user
  return findUserById(session.user.id);
}

// Helper: ensure a user profile exists (create if not)
export async function ensureUserProfile(email: string, name: string): Promise<UserAccount> {
  // Try to find existing user
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  
  // Create new profile - use a UUID based on email for consistency
  const userId = `user_${email.replace(/[^a-z0-9]/g, '_').replace(/_+$/, '')}`;
  
  await createUser({
    id: userId,
    email,
    displayName: name || email.split('@')[0],
    passwordHash: '',  // Supabase Auth handles password verification
    role: 'user',
    createdAt: new Date().toISOString(),
  });
  
  return findUserByEmail(email) as Promise<UserAccount>;
}

// ============================================================================
// USER CRUD
// ============================================================================

export async function createUser(input: {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: string;
}): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('users').insert({
    id: input.id,
    email: input.email.toLowerCase(),
    display_name: input.displayName,
    password_hash: input.passwordHash,
    role: input.role,
    created_at: input.createdAt,
  });

  if (error) throw new Error(`Erro ao criar usuário: ${error.message}`);
}

export async function updateUserLogin(id: string, timestamp: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('users').update({ last_login_at: timestamp }).eq('id', id);

  if (error) throw new Error(`Erro ao atualizar login: ${error.message}`);
}

// ============================================================================
// API CREEDENTIALS
// ============================================================================

export interface ApiCredential {
  id: string;
  consumer_name: string;
  consumer_project: string;
  key_hash: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export async function createApiCredential(input: {
  id: string;
  consumerName: string;
  consumerProject: string;
  keyHash: string;
  createdAt: string;
}): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('api_credentials').insert({
    id: input.id,
    consumer_name: input.consumerName,
    consumer_project: input.consumerProject,
    key_hash: input.keyHash,
    status: 'active',
    created_at: input.createdAt,
    last_used_at: null,
    revoked_at: null,
  });

  if (error) throw new Error(`Erro ao criar credencial API: ${error.message}`);
}

export async function findActiveApiCredential(keyHash: string): Promise<{ id: string; consumer_project: string } | null> {
  const db = getSupabase();
  const { data, error } = await db
    .schema('mapscrape').from('api_credentials')
    .select('id, consumer_project')
    .eq('key_hash', keyHash)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;

  // Update last_used_at
  await db.schema('mapscrape').from('api_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

  return { id: data.id, consumer_project: data.consumer_project };
}

export async function revokeApiCredential(id: string, consumerProject?: string): Promise<boolean> {
  const db = getSupabase();
  const { error, data } = await db
    .schema('mapscrape').from('api_credentials')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .select('status')
    .single();

  if (error) return false;
  return data?.status === 'revoked';
}

export async function listApiCredentials(): Promise<ApiCredential[]> {
  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('api_credentials').select('*').order('created_at', { ascending: false });

  if (error) throw error;
  return data as ApiCredential[];
}

// ============================================================================
// JOBS / SEARCHES
// ============================================================================

export interface ScrapeJob {
  id: string;
  user_id: string;
  segment: string;
  project_name?: string;
  project_id?: string;
  category_id?: string;
  location: string;
  limit_requested: number;
  status: 'running' | 'completed' | 'partial' | 'stopped' | 'failed';
  status_message: string;
  total_found: number;
  total_collected: number;
  total_duplicates: number;
  total_errors: number;
  current_step?: string;
  created_at: string;
  completed_at?: string;
}

export async function createJob(job: ScrapeJob & { user_id: string }): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('searches').insert({
    id: job.id,
    user_id: job.user_id,
    segment: job.segment,
    project_name: job.project_name || `${job.segment} · ${job.location}`,
    project_id: job.project_id || null,
    category_id: job.category_id || null,
    location: job.location,
    limit_requested: job.limit_requested,
    status: job.status,
    status_message: job.status_message,
    total_found: job.total_found,
    total_collected: job.total_collected,
    total_duplicates: job.total_duplicates,
    total_errors: job.total_errors,
    current_step: job.current_step || '',
    created_at: job.created_at,
    completed_at: job.completed_at || null,
  });

  if (error) throw new Error(`Erro ao criar job: ${error.message}`);
}

export async function updateJobProgress(id: string, updates: Partial<ScrapeJob>): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('searches').update(updates).eq('id', id);

  if (error) throw new Error(`Erro ao atualizar job: ${error.message}`);
}

export async function getJob(id: string, userId?: string): Promise<ScrapeJob | null> {
  const db = getSupabase();
  let query = db.schema('mapscrape').from('searches').select('*').eq('id', id);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();

  if (error || !data) return null;
  return data as unknown as ScrapeJob;
}

export async function listJobs(userId?: string): Promise<ScrapeJob[]> {
  const db = getSupabase();
  let query = db.schema('mapscrape').from('searches').select('*');

  if (userId) {
    query = query.eq('user_id', userId);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) throw error;
  return data as ScrapeJob[];
}

export async function deleteJob(id: string, userId?: string): Promise<boolean> {
  const db = getSupabase();
  // Delete places first
  await db.schema('mapscrape').from('places').delete().eq('job_id', id);
  // Delete search
  const { error } = await db.schema('mapscrape').from('searches').delete().eq('id', id);

  if (error) return false;
  return true;
}

// ============================================================================
// PLACES
// ============================================================================

export interface PlaceRecord {
  id: string;
  job_id: string;
  name: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  review_count: string;
  price_range: string;
  opening_hours: string;
  business_status: string;
  latitude: string;
  longitude: string;
  maps_url: string;
  description: string;
  services_attributes: string;
  photos?: string;
  videos?: string;
  logo_url?: string;
  booking_url?: string;
  social_links?: string;
  reviews?: string;
  review_topics?: string;
  additional_attributes?: string;
  media_items?: string;
  plus_code?: string;
  attributes?: string;
  accessibility_attributes?: string;
  next_opening_text?: string;
  next_open_day?: string;
  next_open_time?: string;
  visible_photos_count?: string;
  postal_code?: string;
  country?: string;
  city?: string;
  state?: string;
  source_place_id?: string;
  source_url?: string;
  popular_times?: string;
  rating_distribution?: string;
  review_highlights?: string;
  field_status?: string;
  collected_at: string;
}

/** Normaliza uma URL do Google Maps para comparação consistente (remove query string e trailing slash). */
function normalizeMapsUrl(url: string | null | undefined): string {
  if (!url) return '';
  return String(url).trim().split('?')[0].replace(/\/$/, '');
}

export async function insertPlace(place: PlaceRecord): Promise<void> {
  const db = getSupabase();
  const cleanMapsUrl = normalizeMapsUrl(place.maps_url);
  const { error } = await db.schema('mapscrape').from('places').insert({
    id: place.id,
    job_id: place.job_id,
    name: place.name,
    category: place.category,
    address: place.address,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.review_count,
    price_range: place.price_range,
    opening_hours: place.opening_hours,
    business_status: place.business_status,
    latitude: place.latitude,
    longitude: place.longitude,
    maps_url: cleanMapsUrl,
    description: place.description,
    services_attributes: place.services_attributes,
    photos: place.photos || '',
    videos: place.videos || '',
    logo_url: place.logo_url || '',
    booking_url: place.booking_url || '',
    social_links: place.social_links || '',
    reviews: place.reviews || '[]',
    review_topics: place.review_topics || '[]',
    additional_attributes: place.additional_attributes || '{}',
    media_items: place.media_items || '[]',
    plus_code: place.plus_code || '',
    attributes: place.attributes || '[]',
    accessibility_attributes: place.accessibility_attributes || '[]',
    next_opening_text: place.next_opening_text || '',
    next_open_day: place.next_open_day || '',
    next_open_time: place.next_open_time || '',
    visible_photos_count: place.visible_photos_count || '',
    postal_code: place.postal_code || '',
    country: place.country || '',
    city: place.city || '',
    state: place.state || '',
    source_place_id: place.source_place_id || '',
    source_url: place.source_url || place.maps_url || '',
    popular_times: place.popular_times || '{}',
    rating_distribution: place.rating_distribution || '{}',
    review_highlights: place.review_highlights || '[]',
    field_status: place.field_status || '{}',
    collected_at: place.collected_at,
  });

  if (error) throw new Error(`Erro ao inserir lugar: ${error.message}`);
}

/** Update an existing place row so a new scrape can enrich old records without duplicating them. */
export async function updatePlace(id: string, place: PlaceRecord): Promise<void> {
  const db = getSupabase();
  const cleanMapsUrl = normalizeMapsUrl(place.maps_url);
  const { error } = await db.schema('mapscrape').from('places').update({
    name: place.name,
    category: place.category,
    address: place.address,
    phone: place.phone,
    website: place.website,
    rating: place.rating,
    review_count: place.review_count,
    price_range: place.price_range,
    opening_hours: place.opening_hours,
    business_status: place.business_status,
    latitude: place.latitude,
    longitude: place.longitude,
    maps_url: cleanMapsUrl,
    description: place.description,
    services_attributes: place.services_attributes,
    photos: place.photos || '',
    videos: place.videos || '',
    logo_url: place.logo_url || '',
    booking_url: place.booking_url || '',
    social_links: place.social_links || '',
    reviews: place.reviews || '[]',
    review_topics: place.review_topics || '[]',
    additional_attributes: place.additional_attributes || '{}',
    media_items: place.media_items || '[]',
    plus_code: place.plus_code || '',
    attributes: place.attributes || '[]',
    accessibility_attributes: place.accessibility_attributes || '[]',
    next_opening_text: place.next_opening_text || '',
    next_open_day: place.next_open_day || '',
    next_open_time: place.next_open_time || '',
    visible_photos_count: place.visible_photos_count || '',
    postal_code: place.postal_code || '',
    country: place.country || '',
    city: place.city || '',
    state: place.state || '',
    source_place_id: place.source_place_id || '',
    source_url: place.source_url || place.maps_url || '',
    popular_times: place.popular_times || '{}',
    rating_distribution: place.rating_distribution || '{}',
    review_highlights: place.review_highlights || '[]',
    field_status: place.field_status || '{}',
    collected_at: place.collected_at,
  }).eq('id', id);

  if (error) throw new Error(`Erro ao atualizar lugar: ${error.message}`);
}

export async function findPlaceByUrl(url: string, consumerProject?: string): Promise<PlaceRecord | null> {
  if (!url || !url.trim()) return null;
  const cleanUrl = url.trim().split('?')[0].replace(/\/$/, '');
  if (!cleanUrl) return null;
  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('places').select('*').eq('maps_url', cleanUrl).single();

  if (error || !data) return null;

  // Check ownership if consumerProject is specified
  if (consumerProject) {
    const { data: jobData, error: jobError } = await db.schema('mapscrape').from('searches').select('user_id').eq('id', data.job_id).single();

    if (jobError || jobData?.user_id !== consumerProject) {
      return null;
    }
  }

  return data as unknown as PlaceRecord;
}

export async function placeExistsByUrl(url: string, _jobId?: string): Promise<boolean> {
  return (await findPlaceByUrl(url)) !== null;
}

export async function getPlaces(options: {
  jobId?: string;
  query?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
  consumerProject?: string;
}): Promise<{ places: PlaceRecord[]; total: number }> {
  const db = getSupabase();
  const sortBy = options.sortBy || 'collected_at';
  const ascending = options.sortOrder === 'asc';
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);

  // Resolve the user's job ids when scoped by consumerProject (data isolation).
  let allowedJobIds: string[] | null = null;
  if (options.consumerProject) {
    const { data: userJobs, error: jobsError } = await db
      .schema('mapscrape').from('searches')
      .select('id')
      .eq('user_id', options.consumerProject);
    if (jobsError) throw jobsError;
    allowedJobIds = (userJobs ?? []).map((j: any) => j.id);
    if (allowedJobIds.length === 0) {
      return { places: [], total: 0 };
    }
  }

  let query = db.schema('mapscrape').from('places').select('*', { count: 'exact' });

  if (options.jobId) {
    query = query.eq('job_id', options.jobId);
  }
  if (allowedJobIds) {
    query = query.in('job_id', allowedJobIds);
  }

  if (options.query && options.query.trim()) {
    const q = String(options.query.trim());
    query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%,address.ilike.%${q}%,phone.ilike.%${q}%,website.ilike.%${q}%`);
  }

  if (options.category && options.category.trim()) {
    query = query.ilike('category', `%${String(options.category.trim())}%`);
  }

  query = query.order(sortBy, { ascending });

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) throw error;

  return {
    places: (data ?? []) as unknown as PlaceRecord[],
    total: count ?? 0,
  };
}

export async function getPlacesByIds(ids: string[], consumerProject?: string): Promise<PlaceRecord[]> {
  if (ids.length === 0) return [];
  const db = getSupabase();
  let query = db.schema('mapscrape').from('places').select('*').in('id', ids);

  if (consumerProject) {
    // Filter by user's jobs - get the user's job IDs first
    const { data: userJobs, error: jobsError } = await db.schema('mapscrape').from('searches').select('id').eq('user_id', consumerProject);

    if (jobsError) return [];

    const userJobIds = userJobs?.map((j: any) => j.id) || [];
    if (userJobIds.length === 0) return [];

    // Filter places to only those in user's jobs using a more compatible approach
    const { data: userPlaces, error: placesError } = await db.schema('mapscrape').from('places').select('id').in('job_id', userJobIds);

    if (placesError) return [];

    const userPlaceIds = userPlaces?.map((p: any) => p.id) || [];
    const filteredIds = ids.filter((id: string) => userPlaceIds.includes(id));

    if (filteredIds.length === 0) return [];

    query = db.schema('mapscrape').from('places').select('*').in('id', filteredIds);
  }

  const { data, error } = await query.order('collected_at', { ascending: false });

  if (error) throw error;
  return data as unknown as PlaceRecord[];
}

export async function getAllPlaces(jobId?: string, consumerProject?: string): Promise<PlaceRecord[]> {
  const db = getSupabase();
  let query = db.schema('mapscrape').from('places').select('*');

  if (jobId) {
    query = query.eq('job_id', jobId);
  }

  if (consumerProject) {
    // Instead of innerJoin, use a subquery approach
    // First get the user's job IDs
    const { data: userJobs, error: jobsError } = await db.schema('mapscrape').from('searches').select('id').eq('user_id', consumerProject);

    if (jobsError) return [];

    const userJobIds = userJobs?.map((j: any) => j.id) || [];
    if (userJobIds.length === 0) return [];

    // Get places for those jobs
    query = db.schema('mapscrape').from('places').select('*').in('job_id', userJobIds);
  }

  const { data, error } = await query.order('collected_at', { ascending: false });

  if (error) throw error;
  return data as unknown as PlaceRecord[];
}

export async function listPlaceCategories(consumerProject?: string): Promise<string[]> {
  const db = getSupabase();
  // Use a simple approach: get all places categories, then filter by user if needed
  let query = db.schema('mapscrape').from('places').select('category').gt('category', '');

  if (consumerProject) {
    // Get the user's job IDs first
    const { data: userJobs, error: jobsError } = await db.schema('mapscrape').from('searches').select('id').eq('user_id', consumerProject);

    if (jobsError) return [];

    const userJobIds = userJobs?.map((j: any) => j.id) || [];
    if (userJobIds.length === 0) return [];

    // Get places for user's jobs and extract categories
    const { data: userPlaces, error: placesError } = await db.schema('mapscrape').from('places').select('category').in('job_id', userJobIds);

    if (placesError) return [];

    // Extract distinct categories
    const categories = userPlaces?.map((p: any) => String(p.category || '')).filter(Boolean) || [];
    // Return unique categories
    return Array.from(new Set(categories));
  }

  // Without consumerProject, get all distinct categories
  const { data, error } = await query;

  if (error) throw error;
  // Extract distinct categories
  const categories = data?.map((row: any) => String(row.category || '')).filter(Boolean) || [];
  return Array.from(new Set(categories));
}

export async function countPlaces(): Promise<number> {
  const db = getSupabase();
  const { count, error } = await db.schema('mapscrape').from('places').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

// ============================================================================
// PROJECTS
// ============================================================================

export interface ProjectRecord {
  id: string;
  consumer_project: string;
  name: string;
  normalized_name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export async function listProjects(consumerProject: string, userId: string): Promise<ProjectRecord[]> {
  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('projects').select('*').eq('consumer_project', consumerProject).eq('user_id', userId).order('name', { ascending: false });

  if (error) throw error;
  return data as ProjectRecord[];
}

export async function resolveProject(consumerProject: string, name: string, userId: string): Promise<ProjectRecord> {
  const canonicalName = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const normalized = canonicalName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

  if (!normalized) throw new Error('project_name_required');

  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('projects').select('*').eq('consumer_project', consumerProject).eq('normalized_name', normalized).single();

  if (error || !data) {
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id: `prj_${Math.random().toString(36).substring(2, 9)}`,
      consumer_project: consumerProject,
      name: canonicalName,
      normalized_name: normalized,
      user_id: userId,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await db.schema('mapscrape').from('projects').insert(record);

    if (insertError) throw new Error(`Erro ao criar projeto: ${insertError.message}`);

    return record;
  }

  return data as ProjectRecord;
}

export async function updateProject(consumerProject: string, id: string, name: string, userId: string): Promise<ProjectRecord | null> {
  const canonicalName = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const normalized = canonicalName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

  if (!normalized) throw new Error('project_name_required');

  const db = getSupabase();
  const { data: existing, error: existError } = await db.schema('mapscrape').from('projects').select('*').eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId).single();

  if (existError || !existing) return null;

  // Check conflict
  const { data: conflict, error: conflictError } = await db.schema('mapscrape').from('projects').select('*').eq('consumer_project', consumerProject).eq('normalized_name', normalized).neq('id', id).single();

  if (conflictError || conflict) throw new Error('project_name_conflict');

  const now = new Date().toISOString();
  const { error: updateError } = await db.schema('mapscrape').from('projects').update({ name: canonicalName, normalized_name: normalized, updated_at: now }).eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId);

  if (updateError) throw new Error(`Erro ao atualizar projeto: ${updateError.message}`);

  const { data: updated, error: updatedError } = await db.schema('mapscrape').from('projects').select('*').eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId).single();

  if (updatedError) throw new Error(`Erro ao buscar projeto atualizado: ${updatedError.message}`);

  return updated as ProjectRecord;
}

export async function deleteProject(consumerProject: string, id: string, userId: string): Promise<boolean> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('projects').delete().eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId);

  if (error) return false;

  // Reset project_id in searches that reference this project
  await db.schema('mapscrape').from('searches').update({ project_id: null }).eq('project_id', id);

  return true;
}

// ============================================================================
// SEARCH CATEGORIES
// ============================================================================

export interface SearchCategoryRecord {
  id: string;
  consumer_project: string;
  name: string;
  normalized_name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export async function listSearchCategories(consumerProject: string, userId: string): Promise<SearchCategoryRecord[]> {
  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('search_categories').select('*').eq('consumer_project', consumerProject).eq('user_id', userId).order('name', { ascending: false });

  if (error) throw error;
  return data as SearchCategoryRecord[];
}

export async function resolveSearchCategory(consumerProject: string, name: string, userId: string): Promise<SearchCategoryRecord> {
  const canonicalName = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const normalized = canonicalName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

  if (!normalized) throw new Error('category_name_required');

  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('search_categories').select('*').eq('consumer_project', consumerProject).eq('normalized_name', normalized).single();

  if (error || !data) {
    const record: SearchCategoryRecord = {
      id: `cat_${Math.random().toString(36).substring(2, 9)}`,
      consumer_project: consumerProject,
      name: canonicalName,
      normalized_name: normalized,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await db.schema('mapscrape').from('search_categories').insert(record);

    if (insertError) throw new Error(`Erro ao criar categoria: ${insertError.message}`);

    return record;
  }

  return data as SearchCategoryRecord;
}

export async function updateSearchCategory(consumerProject: string, id: string, name: string, userId: string): Promise<SearchCategoryRecord | null> {
  const canonicalName = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const normalized = canonicalName.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

  if (!normalized) throw new Error('category_name_required');

  const db = getSupabase();
  const { data: existing, error: existError } = await db.schema('mapscrape').from('search_categories').select('*').eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId).single();

  if (existError || !existing) return null;

  // Check conflict
  const { data: conflict, error: conflictError } = await db.schema('mapscrape').from('search_categories').select('*').eq('consumer_project', consumerProject).eq('normalized_name', normalized).neq('id', id).single();

  if (conflictError || conflict) throw new Error('category_name_conflict');

  const now = new Date().toISOString();
  const { error: updateError } = await db.schema('mapscrape').from('search_categories').update({ name: canonicalName, normalized_name: normalized }).eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId);

  if (updateError) throw new Error(`Erro ao atualizar categoria: ${updateError.message}`);

  const { data: updated, error: updatedError } = await db.schema('mapscrape').from('search_categories').select('*').eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId).single();

  if (updatedError) throw new Error(`Erro ao buscar categoria atualizada: ${updatedError.message}`);

  return updated as SearchCategoryRecord;
}

export async function deleteSearchCategory(consumerProject: string, id: string, userId: string): Promise<boolean> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('search_categories').delete().eq('id', id).eq('consumer_project', consumerProject).eq('user_id', userId);

  if (error) return false;

  // Reset category_id in searches that reference this category
  await db.schema('mapscrape').from('searches').update({ category_id: null }).eq('category_id', id);

  return true;
}

// ============================================================================
// RUN REPORTS
// ============================================================================

export async function saveRunReport(jobId: string, reportJson: string, generatedAt: string, userId: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db.schema('mapscrape').from('run_reports').upsert({
    job_id: jobId,
    report_json: reportJson,
    generated_at: generatedAt,
  }, { onConflict: 'job_id' });

  if (error) throw new Error(`Erro ao salvar relatório: ${error.message}`);
}

export async function getRunReport(jobId: string): Promise<string | null> {
  const db = getSupabase();
  const { data, error } = await db.schema('mapscrape').from('run_reports').select('report_json').eq('job_id', jobId).single();

  if (error || !data) return null;

  // Supabase may return gzipped JSON
  if (typeof data.report_json === 'string' && data.report_json.startsWith('gzip-base64:')) {
    const { gunzipSync } = await import('node:zlib');
    return gunzipSync(Buffer.from(data.report_json.slice('gzip-base64:'.length), 'base64')).toString('utf8');
  }

  return data.report_json;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export async function countUsers(): Promise<number> {
  const db = getSupabase();
  const { count, error } = await db.schema('mapscrape').from('users').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

export async function initDb(): Promise<void> {
  // With Supabase, tables are created via database migrations.
  // This function is kept for compatibility but Supabase handles schema via SQL migrations.
  // Ensure the following tables exist in your Supabase project:
  // - users (with id referencing auth.users)
  // - api_credentials
  // - searches (jobs)
  // - places
  // - projects
  // - search_categories
  // - run_reports
  console.log('Supabase initialization checked - tables should exist in database.');
}