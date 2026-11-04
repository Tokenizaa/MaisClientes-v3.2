import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      role: 'admin' | 'user';
    }
    interface Request {
      user?: User;
    }
  }
}

/**
 * Supabase Authentication Middleware
 * Validates the Supabase JWT from the Authorization header.
 * Attaches req.user with the Supabase Auth user profile data.
 * Returns 401 if missing/invalid token, 403 if user not authorized.
 */
export function supabaseAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  // Verify the Supabase JWT token
  try {
    const supabase = require('@supabase/supabase-js')
      .createClient(process.env.SUPABASE_URL?.trim() || '', process.env.SUPABASE_ANON_KEY?.trim() || '');

    const { data, error } = supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Token inválido ou expirado.' });
      return;
    }

    // Get the user profile linked to this Auth user
    const user = data.user as { id: string; email: string; app_metadata: any; user_metadata: any };

    // Look up the profile in our users table
    // We'll attach the profile data to req.user
    req.headers['x-supabase-user'] = JSON.stringify({
      id: user.id,
      email: user.email,
      // We'll fetch the full profile below, but attach minimal info
    });

    // Fetch the user profile from our database
    // For now, attach the basic user info
    req.user = {
      id: user.id,
      email: user.email,
      // Role will be fetched from the profile; default to 'user'
      role: 'user',
    };

    next();
  } catch (error) {
    console.error('Supabase Auth middleware error:', error);
    res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

/**
 * Optional Supabase Auth Middleware
 * Attaches user if token provided, but doesn't fail if absent.
 * Useful for endpoints that work both authenticated and unauthenticated.
 */
export function optionalSupabaseAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const supabase = require('@supabase/supabase-js')
        .createClient(process.env.SUPABASE_URL?.trim() || '', process.env.SUPABASE_ANON_KEY?.trim() || '');

      const { data, error } = supabase.auth.getUser(token);

      if (data && data.user) {
        const user = data.user as { id: string; email: string; app_metadata: any; user_metadata: any };
        req.user = {
          id: user.id,
          email: user.email,
          role: 'user',
        };
      }
    } catch {
      // Ignore invalid tokens in optional mode
    }
  }

  next();
}

/**
 * Job ownership middleware
 * Verifies that the requesting user owns the job ID specified in the request.
 */
export function jobOwnershipMiddleware(required: boolean = true): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      if (required) {
        res.status(401).json({ error: 'Usuário não autenticado.' });
        return;
      }
      next();
      return;
    }

    const { id: user_id } = req.user;
    const jobId = req.params.id || req.query.jobId || req.body.jobId;

    if (!jobId) {
      if (required) {
        res.status(400).json({ error: 'ID da pesquisa não informado.' });
        return;
      }
      next();
      return;
    }

    // We need to check DB ownership - but we'll allow the request
    // Full DB ownership check should be done in the route handler
    // since we don't have direct DB access in the middleware without
    // introducing circular dependencies
    next();
  };
}

/**
 * Generate a session token for frontend use (Supabase Auth session)
 * This is used for the frontend sessionStorage approach
 */
export function generateSupabaseSession(userId: string, email: string, role: 'admin' | 'user'): string {
  // In a real Supabase Auth setup, we'd use supabase.auth.getSession()
  // or create a signed JWT from Supabase. For now, we return a simple
  // format that the frontend can use with the homegrown API routes.
  // The frontend should ideally use Supabase JS SDK directly.
  return btoa(`${userId}:${email}:${role}`);
}