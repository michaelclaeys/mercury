/* ================================================================
   MERCURY — Shared Configuration
   Environment detection, API endpoints, Supabase config, constants
   ================================================================ */

export const ENV = {
  isLocal: window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:',
};

export const SUPABASE = {
  url: 'https://bjjpfvlcwarloxigoytl.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqanBmdmxjd2FybG94aWdveXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwODgyNjcsImV4cCI6MjA4MTY2NDI2N30.cIVZG4D3-SK0qJp_TgcVBO848negG6bXRCSuHk5Motk',
};

export const API = {
  base: ENV.isLocal
    ? 'http://localhost:8000/api'
    : 'https://mercury-backend.onrender.com/api',
};

export const STORAGE_KEYS = {
  visited: 'mercury_visited',
};
