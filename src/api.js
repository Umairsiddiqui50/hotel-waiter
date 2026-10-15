// Smart Table Service - Shared API Client
import { CONFIG } from './config.js';
import { showToast } from './ui.js';

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

  // Staff JWT authorization injection if present
  const staffToken = localStorage.getItem('sts_staff_token');
  if (staffToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${staffToken}`;
  }

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body !== undefined && options.body !== null) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (netErr) {
    throw new ApiError(0, `Network error: Unable to reach backend server at ${CONFIG.API_BASE}. Please verify the server is running.`);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = (data && typeof data === 'object' && data.detail) ? data.detail : (typeof data === 'string' ? data : `Request failed with status ${response.status}`);
    
    // Auth redirection for protected staff routes (never customer)
    if (response.status === 401 || response.status === 403) {
      if (window.location.hash.startsWith('#/waiter') && !window.location.hash.includes('login')) {
        localStorage.removeItem('sts_staff_token');
        localStorage.removeItem('sts_staff_user');
        window.location.hash = '#/waiter/login';
        showToast('Session expired. Please sign in again.', 'warning');
      } else if (window.location.hash.startsWith('#/admin') && !window.location.hash.includes('login')) {
        localStorage.removeItem('sts_staff_token');
        localStorage.removeItem('sts_staff_user');
        window.location.hash = '#/admin/login';
        showToast('Session expired. Please sign in again.', 'warning');
      }
    }

    throw new ApiError(response.status, detail, data);
  }

  return data;
}
