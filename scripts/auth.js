// scripts/auth.js
(function() {
    const isLocalDev = window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || window.location.protocol === 'file:';

    if (isLocalDev) {
        // Local dev mode — bypass Supabase auth entirely
        window.requireAuth = async function() {
            return { access_token: 'dev-token', user: { email: 'dev@local' } };
        };
        window.getCurrentUser = async function() {
            return { email: 'dev@local', user_metadata: { tier: 'free' } };
        };
        window.getUserTier = function(user) {
            return user?.user_metadata?.tier || 'free';
        };
        window.signOut = async function() {
            window.location.href = 'login.html';
        };
        window.fetchWithAuth = async function(url, options = {}) {
            return fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    'Content-Type': 'application/json'
                }
            });
        };
        window.refreshTier = async function() {
            // no-op in dev mode
        };
        console.log('[Mercury] Local dev mode — auth bypassed');
        return;
    }

    // ── Production: Supabase auth ──
    const SUPABASE_URL = 'https://bjjpfvlcwarloxigoytl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqanBmdmxjd2FybG94aWdveXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODgyNjcsImV4cCI6MjA4MTY2NDI2N30.cIVZG4D3-SK0qJp_TgcVBO848negG6bXRCSuHk5Motk';

    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    const supabase = window.supabaseClient;

    window.requireAuth = async function requireAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return null;
        }
        return session;
    };

    window.getCurrentUser = async function getCurrentUser() {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    };

    window.getUserTier = function getUserTier(user) {
        if (!user) return 'free';
        return user.user_metadata?.tier || 'free';
    };

    window.signOut = async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (!error) {
            window.location.href = 'login.html';
        }
    };

    window.fetchWithAuth = async function fetchWithAuth(url, options = {}) {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    };

    window.refreshTier = async function refreshTier() {
        // Force refresh the session to pick up updated user_metadata (e.g. after Stripe webhook)
        const { error } = await supabase.auth.refreshSession();
        if (error) console.warn('[Mercury] Failed to refresh session:', error);
    };

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = 'login.html';
        }
    });
})();