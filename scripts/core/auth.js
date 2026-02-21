/* ================================================================
   MERCURY — Auth Module (ES Module)
   Centralized authentication. Import where needed instead of
   relying on window globals.

   Usage:
     import { requireAuth, getCurrentUser, signOut, fetchWithAuth, getUserTier } from './core/auth.js';
   ================================================================ */

import { ENV, SUPABASE } from './config.js';

let supabase = null;

function getClient() {
  if (supabase) return supabase;
  if (!ENV.isLocal && window.supabase) {
    supabase = window.supabaseClient || window.supabase.createClient(SUPABASE.url, SUPABASE.anonKey);
    window.supabaseClient = supabase;
  }
  return supabase;
}

// ── Dev-mode stubs ──────────────────────────────────────────
const DEV_USER = { email: 'dev@local', user_metadata: { tier: 'free' } };

const devAuth = {
  requireAuth: async () => ({ access_token: 'dev-token', user: DEV_USER }),
  getCurrentUser: async () => DEV_USER,
  getUserTier: (user) => user?.user_metadata?.tier || 'free',
  signOut: async () => { window.location.href = 'login.html'; },
  fetchWithAuth: (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: 'Bearer dev-token', 'Content-Type': 'application/json' },
  }),
};

// ── Production auth ─────────────────────────────────────────
const prodAuth = {
  requireAuth: async () => {
    const client = getClient();
    const { data: { session } } = await client.auth.getSession();
    if (!session) { window.location.href = 'login.html'; return null; }
    return session;
  },

  getCurrentUser: async () => {
    const client = getClient();
    const { data: { user } } = await client.auth.getUser();
    return user;
  },

  getUserTier: (user) => user?.user_metadata?.tier || 'free',

  signOut: async () => {
    const client = getClient();
    const { error } = await client.auth.signOut();
    if (!error) window.location.href = 'login.html';
  },

  fetchWithAuth: async (url, opts = {}) => {
    const client = getClient();
    const { data: { session } } = await client.auth.getSession();
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: `Bearer ${session?.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  },
};

// ── Export the right implementation ─────────────────────────
const auth = ENV.isLocal ? devAuth : prodAuth;

export const requireAuth   = auth.requireAuth;
export const getCurrentUser = auth.getCurrentUser;
export const getUserTier    = auth.getUserTier;
export const signOut        = auth.signOut;
export const fetchWithAuth  = auth.fetchWithAuth;

// Also expose on window for legacy scripts that aren't modules yet
window.requireAuth   = auth.requireAuth;
window.getCurrentUser = auth.getCurrentUser;
window.getUserTier    = auth.getUserTier;
window.signOut        = auth.signOut;
window.fetchWithAuth  = auth.fetchWithAuth;

// ── Auth state listener (production only) ───────────────────
if (!ENV.isLocal) {
  const client = getClient();
  if (client) {
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.href = 'login.html';
    });
  }
}

if (ENV.isLocal) console.log('[Mercury] Local dev mode — auth bypassed');
