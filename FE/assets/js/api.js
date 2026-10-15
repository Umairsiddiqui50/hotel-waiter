// Smart Table Service - Shared API Client
export const CONFIG = {
  API_BASE: (() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const hashParams = hash.includes('?') ? new URLSearchParams(hash.split('?')[1]) : null;
    const queryApi = params.get('apiBase') || (hashParams ? hashParams.get('apiBase') : null);
    if (queryApi) return queryApi.replace(/\/$/, '');
    if (window.API_BASE) return window.API_BASE.replace(/\/$/, '');
    if (window.location.port && window.location.port !== '8000') {
      return `http://${window.location.hostname}:8000/api/v1`;
    }
    return `${window.location.origin}/api/v1`;
  })(),
  RESTAURANT_NAME: "Grand Bistro & Cafe",
  RESTAURANT_SLUG: "grand-bistro",
  TAX_RATE: 0.05,
  CURRENCY: "₹",
  TABLE_COUNT: 23,
  INDOOR_TABLES: 18,
  OUTDOOR_TABLES: 5,
};

export class ApiError extends Error {
  constructor(status, detail, rawData = null) {
    let message = detail;
    if (Array.isArray(detail)) {
      message = detail.map(d => d.msg || JSON.stringify(d)).join(', ');
    } else if (typeof detail === 'object' && detail !== null) {
      message = detail.message || JSON.stringify(detail);
    }
    super(message || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.rawData = rawData;
  }
}

export async function apiFetch(path, options = {}) {
  const url = path.startsWith('http') ? path : `${CONFIG.API_BASE}${path.startsWith('/') ? path : '/' + path}`;
  
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Safe Session Storage for JWT tokens (Never stored in localStorage)
  const staffToken = sessionStorage.getItem('sts_staff_token');
  if (staffToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${staffToken}`;
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    fetchOptions.body = JSON.stringify(options.body);
  } else if (options.body) {
    fetchOptions.body = options.body;
  }

  try {
    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const detail = (data && typeof data === 'object') ? (data.detail || data.message || 'Request failed') : data;
      throw new ApiError(res.status, detail, data);
    }
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, err.message || 'Network connectivity error', null);
  }
}
