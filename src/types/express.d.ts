import 'express';

declare global {
  namespace Express {
    interface Request {
      supabaseUser?: {
        user: any;
        profile: any;
      };
    }
  }
}