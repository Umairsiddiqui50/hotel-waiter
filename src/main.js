// Smart Table Service - Application Entry Point & Orchestrator
import { CONFIG } from './config.js';
import { getLang, setLang, t } from './i18n.js';
import { Router } from './router.js';
import { store } from './store.js';
import { renderCustomerView } from './customer/customer.js';
import { renderWaiterView } from './waiter/waiter.js';
import { renderAdminView } from './admin/admin.js';
import { renderKitchenView } from './kitchen/kitchen.js';

function updateHeader(route) {
  const headerContainer = document.getElementById('sts-header-container');
  if (!headerContainer) return;

  const isCustomer = route.startsWith('/customer');
  const isWaiter = route.startsWith('/waiter');
  const isAdmin = route.startsWith('/admin');
  const isKitchen = route.startsWith('/kitchen');

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
            <!-- Language Switcher for Customer -->
            <button class="sts-lang-btn" id="sts-lang-toggle" aria-label="Switch Language">
              <span>🌐</span>
              <span>${currentLang === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>
          ` : `
            <!-- Staff Portal Navigation -->
            <nav class="sts-nav-tabs" aria-label="Staff Navigation">
              <a href="#/customer" class="sts-nav-link ${isCustomer ? 'active' : ''}">Customer</a>
              <a href="#/waiter/dashboard" class="sts-nav-link ${isWaiter ? 'active' : ''}">Waiter</a>
              <a href="#/admin/dashboard" class="sts-nav-link ${isAdmin ? 'active' : ''}">Admin</a>
              <a href="#/kitchen" class="sts-nav-link ${isKitchen ? 'active' : ''}">Kitchen</a>
            </nav>
          `}
        </div>
      </div>
    </header>
  `;

  // Attach language toggle
  const langToggle = document.getElementById('sts-lang-toggle');
  if (langToggle) {
    langToggle.onclick = () => {
      const newLang = currentLang === 'en' ? 'hi' : 'en';
      setLang(newLang);
    };
  }
}

// Initialize Router
const router = new Router({
  '/customer': (params) => {
    updateHeader('/customer');
    renderCustomerView(params);
  },
  '/waiter/login': (params) => {
    updateHeader('/waiter');
    renderWaiterView(params);
  },
  '/waiter/dashboard': (params) => {
    updateHeader('/waiter');
    renderWaiterView(params);
  },
  '/admin/login': (params) => {
    updateHeader('/admin');
    renderAdminView(params);
  },
  '/admin/dashboard': (params) => {
    updateHeader('/admin');
    renderAdminView(params);
  },
  '/kitchen': (params) => {
    updateHeader('/kitchen');
    renderKitchenView(params);
  },
});

window.addEventListener('sts_language_change', () => {
  updateHeader(router.currentRoute || '/customer');
  if (router.currentRoute && router.currentRoute.startsWith('/customer')) {
    renderCustomerView(router.params);
  }
});

// Boot the router on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  router.init();
});
