// Smart Table Service - Global Configuration
export const CONFIG = {
  API_BASE: (() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const hashParams = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : null;
    const queryApi = params.get('apiBase') || (hashParams ? hashParams.get('apiBase') : null);
    if (queryApi) return queryApi.replace(/\/$/, '');
    if (window.API_BASE) return window.API_BASE.replace(/\/$/, '');
    // Default to port 8000 when running from local dev server or relative to current origin
    if (window.location.port && window.location.port !== '8000') {
      return `http://${window.location.hostname}:8000/api/v1`;
    }
    return `${window.location.origin}/api/v1`;
  })(),
  RESTAURANT_NAME: "Grand Bistro & Cafe",
  RESTAURANT_SLUG: "grand-bistro",
  TAX_RATE: 0.05, // 5% GST
  CURRENCY: "₹",
  TABLE_COUNT: 23,
  INDOOR_TABLES: 18,
  OUTDOOR_TABLES: 5,
};
