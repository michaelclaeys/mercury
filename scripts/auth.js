// scripts/auth.js
(function() {
    const SUPABASE_URL = 'https://bjjpfvlcwarloxigoytl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqanBmdmxjd2FybG94aWdveXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODgyNjcsImV4cCI6MjA4MTY2NDI2N30.cIVZG4D3-SK0qJp_TgcVBO848negG6bXRCSuHk5Motk';

    // Only create ONE global client
    if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    
    const supabase = window.supabaseClient;

    // Expose all functions globally
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

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = 'login.html';
        }
    });
})();