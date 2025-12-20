// Supabase Auth Helper
// Put this file in: scripts/auth.js

// ⚠️ REPLACE THESE WITH YOUR ACTUAL SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://bjjpfvlcwarloxigoytl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqanBmdmxjd2FybG94aWdveXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODgyNjcsImV4cCI6MjA4MTY2NDI2N30.cIVZG4D3-SK0qJp_TgcVBO848negG6bXRCSuHk5Motk';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check if user is authenticated - use this to protect pages
async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        // Not logged in, redirect to login
        window.location.href = 'login.html';
        return null;
    }
    
    return session;
}

// Get current user data
async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Get user's subscription tier
function getUserTier(user) {
    if (!user) return 'free';
    return user.user_metadata?.tier || 'free';
}

// Sign out
async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = 'login.html';
    }
}

// Fetch with authentication token
async function fetchWithAuth(url, options = {}) {
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
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        // User logged out, redirect to login
        window.location.href = 'login.html';
    }
});
