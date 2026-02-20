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

// Mercury Engine API (bot engine, wallets, trading)
// Override via window.MERCURY_ENGINE_BASE before script load for custom deployments
export const ENGINE = {
  base: window.MERCURY_ENGINE_BASE || (ENV.isLocal
    ? 'http://localhost:8778'
    : 'https://engine.mercurysuite.net'),
};

// Mobile detection
export const DEVICE = {
  isMobile: /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent)
    || (window.innerWidth <= 768),
  isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
};

// Also expose on window for non-module scripts (funding.js, wallet-service.js, etc.)
window.MERCURY_CONFIG = {
  engineBase: ENGINE.base,
  isLocal: ENV.isLocal,
  isMobile: DEVICE.isMobile,
  isTouch: DEVICE.isTouch,
};

export const STORAGE_KEYS = {
  visited: 'mercury_visited',
};
