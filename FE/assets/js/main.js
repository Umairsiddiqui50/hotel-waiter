// Smart Table Service - Main Application Entry Point
import { CONFIG } from './api.js';
import { getLang, setLang, t } from './components.js';
import { renderCustomerView } from './customer.js';
import { renderWaiterView } from './waiter.js';
import { renderManagerView } from './manager.js';
import { authService } from './auth.js';

class AppRouter {
  constructor(routes = {}) {
    this.routes = routes;
    this.currentRoute = null;
    this.params = new URLSearchParams();
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();
  }

  handleRouting() {
    let hash = window.location.hash || '#/customer';
    if (!hash.startsWith('#/')) {
      hash = '#/customer';
    }

    const [pathPart, queryPart] = hash.slice(2).split('?');
    const path = '/' + (pathPart || 'customer');
    this.params = new URLSearchParams(queryPart || '');

    const regularQuery = new URLSearchParams(window.location.search);
    const tableRef = this.params.get('table') || regularQuery.get('table');
    if (tableRef) {
      this.params.set('table', tableRef);
    }

    let handler = this.routes[path];
    if (!handler) {
      if (path.startsWith('/waiter')) handler = this.routes['/waiter/dashboard'] || this.routes['/waiter'];
      else if (path.startsWith('/manager') || path.startsWith('/admin')) handler = this.routes['/manager/dashboard'] || this.routes['/manager'];
      else if (path.startsWith('/auth')) handler = this.routes['/auth'];
      else handler = this.routes['/customer'];
    }

    this.currentRoute = path;
    if (handler) {
      handler(this.params);
    }
  }

  navigate(pathWithQuery) {
    window.location.hash = pathWithQuery.startsWith('/') ? '#' + pathWithQuery : '#/' + pathWithQuery;
  }
}

function updateHeader(route) {
  const headerContainer = document.getElementById('sts-header-container');
  if (!headerContainer) return;

  const isCustomer = route.startsWith('/customer');
  const isWaiter = route.startsWith('/waiter');
  const isManager = route.startsWith('/manager') || route.startsWith('/admin');
  const isAuth = route.startsWith('/auth');

  const currentLang = getLang();

  headerContainer.innerHTML = `
    <header class="sts-header">
      <div class="sts-header-inner">
        <!-- Brand Mark -->
        <a class="sts-brand" href="#/customer">
          <div class="sts-brand-icon" aria-hidden="true">🍽️</div>
          <div class="sts-brand-text">
            <span class="sts-brand-title">${CONFIG.RESTAURANT_NAME}</span>
            <span class="sts-brand-sub">${t('brand_sub')}</span>
          </div>
        </a>

        <!-- Header Actions -->
        <div class="sts-header-actions">
          ${isCustomer ? `
            <button class="sts-lang-btn" id="sts-lang-toggle" aria-label="Switch Language">
              <span>🌐</span>
              <span>${currentLang === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>
          ` : ''}
          <!-- Navigation Portals -->
          <nav class="sts-nav-tabs" aria-label="Portal Navigation">
            <a href="#/customer?table=7" class="sts-nav-link ${isCustomer ? 'active' : ''}">Customer</a>
            <a href="#/waiter/dashboard" class="sts-nav-link ${isWaiter ? 'active' : ''}">Waiter</a>
            <a href="#/manager/dashboard" class="sts-nav-link ${isManager ? 'active' : ''}">Manager</a>
            <a href="#/auth" class="sts-nav-link ${isAuth ? 'active' : ''}">Staff Login</a>
          </nav>
        </div>
      </div>
    </header>
  `;

  const langToggle = document.getElementById('sts-lang-toggle');
  if (langToggle) {
    langToggle.onclick = () => {
      const newLang = currentLang === 'en' ? 'hi' : 'en';
      setLang(newLang);
    };
  }
}

function renderAuthView(params) {
  const container = document.getElementById('sts-app-view');
  if (!container) return;

  container.innerHTML = `
    <div style="max-width:440px;margin:3rem auto;padding:2rem;background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">🔐</div>
        <h2 style="margin:0;font-size:1.5rem;font-weight:700;">Staff Portal Login</h2>
        <p style="color:var(--text-secondary);font-size:0.875rem;margin-top:0.25rem;">Enter your waiter or manager credentials</p>
      </div>

      <form id="auth-form" style="display:flex;flex-direction:column;gap:1.25rem;">
        <div>
          <label style="display:block;font-size:0.8125rem;font-weight:600;margin-bottom:0.35rem;color:var(--text-secondary);">Username</label>
          <input type="text" id="auth-username" required placeholder="e.g. rahul or vikram" class="sts-input" style="width:100%;padding:0.75rem 1rem;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.9375rem;" />
        </div>

        <div>
          <label style="display:block;font-size:0.8125rem;font-weight:600;margin-bottom:0.35rem;color:var(--text-secondary);">Password</label>
          <input type="password" id="auth-password" required placeholder="••••••••" class="sts-input" style="width:100%;padding:0.75rem 1rem;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-primary);font-size:0.9375rem;" />
        </div>

        <button type="submit" id="auth-submit-btn" class="sts-btn sts-btn-primary" style="padding:0.85rem;font-size:1rem;font-weight:700;margin-top:0.5rem;">Sign In</button>
      </form>

      <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border-subtle);font-size:0.8125rem;color:var(--text-secondary);text-align:center;">
        <div><strong>Demo Credentials:</strong></div>
        <div style="margin-top:0.35rem;">Waiter: <code>rahul</code> / <code>waiter123</code></div>
        <div>Manager: <code>vikram</code> / <code>manager123</code></div>
      </div>
    </div>
  `;

  document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const u = document.getElementById('auth-username').value.trim();
    const p = document.getElementById('auth-password').value.trim();
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    try {
      const res = await authService.loginStaff(u, p);
      if (res.user.role === 'WAITER') {
        window.location.hash = '#/waiter/dashboard';
      } else {
        window.location.hash = '#/manager/dashboard';
      }
    } catch (err) {
      alert(err.message || 'Login failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  };
}

export const router = new AppRouter({
  '/customer': (params) => {
    updateHeader('/customer');
    renderCustomerView(params);
  },
  '/waiter': (params) => {
    updateHeader('/waiter');
    renderWaiterView(params);
  },
  '/waiter/dashboard': (params) => {
    updateHeader('/waiter');
    renderWaiterView(params);
  },
  '/waiter/login': (params) => {
    updateHeader('/waiter');
    renderWaiterView(params);
  },
  '/manager': (params) => {
    updateHeader('/manager');
    renderManagerView(params);
  },
  '/manager/dashboard': (params) => {
    updateHeader('/manager');
    renderManagerView(params);
  },
  '/admin/dashboard': (params) => {
    updateHeader('/manager');
    renderManagerView(params);
  },
  '/auth': (params) => {
    updateHeader('/auth');
    renderAuthView(params);
  },
});

window.addEventListener('sts_language_change', () => {
  updateHeader(router.currentRoute || '/customer');
  if (router.currentRoute && router.currentRoute.startsWith('/customer')) {
    renderCustomerView(router.params);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  router.init();
});
