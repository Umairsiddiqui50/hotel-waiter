// Smart Table Service - Customer Experience View
import { CONFIG } from '../config.js';
import { t, getLang, setLang } from '../i18n.js';
import { store } from '../store.js';
import { apiFetch, ApiError } from '../api.js';
import { showToast, showModal, closeModal } from '../ui.js';

let menuCategories = [];
let activePollTimer = null;
let resendIntervalTimer = null;
let currentCategoryFilter = 'all';
let searchQuery = '';

export async function renderCustomerView(params) {
  const container = document.getElementById('sts-app-view');
  if (!container) return;

  // Extract table ref
  const tableRef = params.get('table') || '7';
  const qrToken = params.get('token') || null;
  store.setTableContext(tableRef, null, qrToken);

  container.innerHTML = `
    <!-- Table Context & Branding Hero -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:1.25rem;">
      <div>
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <h1 style="font-size:1.5rem;font-weight:700;">${CONFIG.RESTAURANT_NAME}</h1>
          <span class="sts-table-badge">
            <span class="dot"></span>
            ${t('table')} ${store.tableContext.tableNumber} • ${store.tableContext.isIndoor ? t('indoor') : t('outdoor')}
          </span>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem;">
          ${t('brand_sub')}
          ${store.tableContext.isVerified ? `<span style="color:var(--status-success);margin-left:0.5rem;">✓ ${t('scan_valid')}</span>` : `<span style="color:var(--text-muted);margin-left:0.5rem;">(${t('scan_unverified')})</span>`}
        </p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button class="btn btn-secondary btn-sm" id="cust-view-cart-btn" aria-label="View Order">
          🛒 ${t('cart_title')} (<span id="cust-cart-badge">0</span>)
        </button>
      </div>
    </div>

    <!-- Live Request Tracker Banner -->
    <div id="cust-active-tracker-container"></div>

    <!-- Quick Service Actions Bar -->
    <div style="margin-bottom:1.5rem;">
      <h2 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem;color:var(--text-secondary);">${t('call_waiter')} & Table Services</h2>
      <div class="service-actions-grid">
        <button class="service-btn" data-service="water" data-label="Water Bottle">
          <span class="icon">💧</span>
          <span class="label">${t('water')}</span>
        </button>
        <button class="service-btn" data-service="call" data-label="Call Waiter">
          <span class="icon">🛎️</span>
          <span class="label">${t('call_waiter')}</span>
        </button>
        <button class="service-btn" data-service="bill" data-label="Ask for Bill">
          <span class="icon">🧾</span>
          <span class="label">${t('bill')}</span>
        </button>
        <button class="service-btn" data-service="salad" data-label="Salad Refill">
          <span class="icon">🥗</span>
          <span class="label">${t('salad')}</span>
        </button>
        <button class="service-btn" data-service="spt" data-label="Salt/Pepper/Tissue">
          <span class="icon">🧂</span>
          <span class="label">${t('spt')}</span>
        </button>
        <button class="service-btn" data-service="cutlery" data-label="Cutlery">
          <span class="icon">🍽️</span>
          <span class="label">${t('cutlery')}</span>
        </button>
        <button class="service-btn" data-service="custom" data-label="Special Request">
          <span class="icon">✍️</span>
          <span class="label">${t('custom')}</span>
        </button>
      </div>
    </div>

    <!-- Menu Header, Search & Categories -->
    <div style="margin-bottom:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.75rem;">
        <h2 style="font-size:1.25rem;font-weight:700;">Menu</h2>
        <div style="min-width:240px;flex:1;max-width:360px;">
          <input type="text" id="cust-menu-search" class="search-input" placeholder="Search menu dishes..." />
        </div>
      </div>
      <div class="category-nav" id="cust-category-nav">
        <button class="category-pill active" data-cat="all">All Dishes</button>
        <div class="skeleton" style="width:100px;height:36px;display:inline-block;border-radius:20px;"></div>
      </div>
    </div>

    <!-- Menu Items Grid -->
    <div class="menu-grid" id="cust-menu-grid">
      ${[1,2,3,4,5,6].map(() => `
        <div class="menu-card">
          <div class="skeleton" style="height:140px;width:100%;"></div>
          <div class="menu-card-body">
            <div class="skeleton" style="height:20px;width:70%;margin-bottom:0.5rem;"></div>
            <div class="skeleton" style="height:14px;width:90%;margin-bottom:1rem;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div class="skeleton" style="height:22px;width:60px;"></div>
              <div class="skeleton" style="height:34px;width:80px;border-radius:20px;"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Floating Mobile Cart Bar -->
    <div class="floating-cart-bar" id="cust-floating-cart" style="display:none;">
      <div class="floating-cart-text">
        <span>🛒</span>
        <span id="cust-floating-qty">0 items</span>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;">
        <span class="floating-cart-total" id="cust-floating-total">₹0</span>
        <span style="font-size:0.875rem;font-weight:700;">${t('checkout')} →</span>
      </div>
    </div>

    <!-- Cart Slide-Over Drawer Container -->
    <div class="drawer-backdrop" id="cust-cart-drawer">
      <div class="drawer-content">
        <div class="drawer-header">
          <h3 style="font-size:1.125rem;">${t('cart_title')} (${t('table')} ${store.tableContext.tableNumber})</h3>
          <button class="btn btn-icon btn-outline" id="cust-drawer-close">&times;</button>
        </div>
        <div class="drawer-body" id="cust-cart-drawer-items"></div>
        <div class="drawer-footer" id="cust-cart-drawer-footer"></div>
      </div>
    </div>
  `;

  setupEventListeners();
  loadMenu();
  renderActiveTracker();
  updateCartUI();
  startTrackerPolling();
}

function setupEventListeners() {
  // Service button clicks
  document.querySelectorAll('.service-btn').forEach(btn => {
    btn.onclick = () => handleServiceClick(btn.dataset.service, btn.dataset.label);
  });

  // Search input
  const searchInput = document.getElementById('cust-menu-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderMenuItems();
    };
  }

  // Cart triggers
  const viewCartBtn = document.getElementById('cust-view-cart-btn');
  const floatingCart = document.getElementById('cust-floating-cart');
  const drawerClose = document.getElementById('cust-drawer-close');
  const drawer = document.getElementById('cust-cart-drawer');

  if (viewCartBtn) viewCartBtn.onclick = () => openCartDrawer();
  if (floatingCart) floatingCart.onclick = () => openCartDrawer();
  if (drawerClose) drawerClose.onclick = () => closeCartDrawer();
  if (drawer) {
    drawer.onclick = (e) => {
      if (e.target === drawer) closeCartDrawer();
    };
  }
}

async function loadMenu() {
  try {
    const categories = await apiFetch('/menu/categories');
    menuCategories = categories || [];
    renderCategoryPills();
    renderMenuItems();
  } catch (err) {
    console.error('Failed to load menu categories:', err);
    showToast('Failed to load menu from server. Please check backend connection.', 'error');
  }
}

function renderCategoryPills() {
  const nav = document.getElementById('cust-category-nav');
  if (!nav) return;

  nav.innerHTML = `
    <button class="category-pill ${currentCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">All Dishes</button>
    ${menuCategories.map(cat => `
      <button class="category-pill ${currentCategoryFilter === String(cat.id) ? 'active' : ''}" data-cat="${cat.id}">
        ${cat.name} (${cat.items ? cat.items.length : 0})
      </button>
    `).join('')}
  `;

  nav.querySelectorAll('.category-pill').forEach(pill => {
    pill.onclick = () => {
      currentCategoryFilter = pill.dataset.cat;
      nav.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderMenuItems();
    };
  });
}

function renderMenuItems() {
  const grid = document.getElementById('cust-menu-grid');
  if (!grid) return;

  let allItems = [];
  menuCategories.forEach(cat => {
    if (cat.items && Array.isArray(cat.items)) {
      cat.items.forEach(item => {
        allItems.push({ ...item, categoryName: cat.name });
      });
    }
  });

  let filtered = allItems;
  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter(item => String(item.category_id) === currentCategoryFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(item => item.name.toLowerCase().includes(searchQuery));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:3rem 1rem;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">🍽️</div>
        <h3 style="font-size:1.125rem;margin-bottom:0.25rem;">No menu items found</h3>
        <p style="font-size:0.875rem;color:var(--text-secondary);">Try clearing your search query or picking another category.</p>
      </div>
    `;
    return;
  }

  // Pre-curated high quality photos for prototype items
  const itemPhotos = {
    "Veg Biryani": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60",
    "Tandoori Roti": "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop&q=60",
    "Butter Naan": "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60",
    "Steam Rice": "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=500&auto=format&fit=crop&q=60",
    "Jeera Rice": "https://images.unsplash.com/photo-1596797038530-2c107229654b?w=500&auto=format&fit=crop&q=60",
    "Cold Drink": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=60",
    "Sweet Lassi": "https://images.unsplash.com/photo-1571328003758-4a3921661729?w=500&auto=format&fit=crop&q=60",
    "Dal Tadka": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60",
    "Gulab Jamun": "https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=500&auto=format&fit=crop&q=60",
  };

  grid.innerHTML = filtered.map(item => {
    const isVeg = !item.name.toLowerCase().includes('chicken') && !item.name.toLowerCase().includes('mutton') && !item.name.toLowerCase().includes('fish');
    const photo = item.image_url || itemPhotos[item.name] || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=60';
    const cartEntry = store.cart.get(item.id);
    const inCartQty = cartEntry ? cartEntry.quantity : 0;

    return `
      <div class="menu-card" data-item-id="${item.id}">
        <div class="menu-card-img-wrap">
          <img class="menu-card-img" src="${photo}" alt="${item.name}" loading="lazy" />
          <div style="position:absolute;top:0.75rem;left:0.75rem;">
            <span class="diet-badge ${isVeg ? 'diet-veg' : 'diet-non-veg'}" title="${isVeg ? 'Vegetarian' : 'Non-Vegetarian'}"></span>
          </div>
          ${!item.is_available ? `
            <div style="position:absolute;inset:0;background:rgba(11,15,25,0.75);display:flex;align-items:center;justify-content:center;">
              <span class="badge badge-failed">${t('sold_out')}</span>
            </div>
          ` : ''}
        </div>
        <div class="menu-card-body">
          <div class="menu-card-header">
            <h3 class="menu-card-title">${item.name}</h3>
          </div>
          <div class="menu-card-desc">${item.categoryName} • Freshly prepared with traditional spices</div>
          <div class="menu-card-footer">
            <div class="menu-card-price">₹${Number(item.price).toFixed(2)}</div>
            ${item.is_available ? `
              ${inCartQty > 0 ? `
                <div class="qty-stepper">
                  <button class="qty-btn" data-act="minus" data-id="${item.id}">−</button>
                  <span class="qty-val">${inCartQty}</span>
                  <button class="qty-btn" data-act="plus" data-id="${item.id}">+</button>
                </div>
              ` : `
                <button class="btn btn-outline btn-sm" data-act="add" data-id="${item.id}">
                  + ${t('add_to_cart')}
                </button>
              `}
            ` : `
              <button class="btn btn-secondary btn-sm" disabled>${t('sold_out')}</button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for menu buttons
  grid.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const itemId = parseInt(btn.dataset.id, 10);
      const item = allItems.find(i => i.id === itemId);
      if (!item) return;

      if (btn.dataset.act === 'add' || btn.dataset.act === 'plus') {
        store.addToCart(item, 1);
      } else if (btn.dataset.act === 'minus') {
        store.addToCart(item, -1);
      }
      renderMenuItems();
      updateCartUI();
    };
  });
}

function handleServiceClick(serviceKey, defaultLabel) {
  const optionsMap = {
    water: ["Cold", "Normal", "Hot"],
    bill: ["Cash", "Online"],
    spt: ["Salt", "Pepper", "Tissue"],
    cutlery: ["Plate", "Spoon", "Bowl", "Glass"],
  };

  const options = optionsMap[serviceKey];
  if (options && options.length > 0) {
    const bodyHtml = `
      <p style="margin-bottom:1rem;color:var(--text-secondary);">Select preference for <strong>${defaultLabel}</strong>:</p>
      <div style="display:flex;flex-direction:column;gap:0.5rem;" id="service-options-list">
        ${options.map((opt, i) => `
          <label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:var(--bg-input);border-radius:var(--radius-md);cursor:pointer;">
            <input type="radio" name="opt_choice" value="${opt}" ${i === 0 ? 'checked' : ''} />
            <span style="font-weight:600;">${opt}</span>
          </label>
        `).join('')}
      </div>
    `;

    showModal(defaultLabel, bodyHtml, [
      {
        text: "Cancel",
        className: "btn btn-secondary",
        onClick: closeModal,
      },
      {
        text: "Send Request",
        className: "btn btn-primary",
        onClick: () => {
          const selected = document.querySelector('input[name="opt_choice"]:checked');
          const details = selected ? selected.value : "";
          dispatchServiceRequest(serviceKey, details);
        }
      }
    ]);
  } else if (serviceKey === 'custom') {
    const bodyHtml = `
      <p style="margin-bottom:0.75rem;color:var(--text-secondary);">Describe what you need at Table ${store.tableContext.tableNumber}:</p>
      <textarea id="custom-request-text" class="form-textarea" rows="3" placeholder="e.g. Extra napkins, clean table, allergen question..."></textarea>
    `;
    showModal("Special Request", bodyHtml, [
      { text: "Cancel", className: "btn btn-secondary", onClick: closeModal },
      {
        text: "Send Request",
        className: "btn btn-primary",
        onClick: () => {
          const text = document.getElementById('custom-request-text').value.trim();
          if (!text) {
            showToast("Please enter a short request description.", "warning");
            return;
          }
          dispatchServiceRequest(serviceKey, text);
        }
      }
    ]);
  } else {
    dispatchServiceRequest(serviceKey, "");
  }
}

async function dispatchServiceRequest(serviceKey, details) {
  try {
    const payload = {
      table_id: store.tableContext.tableNumber,
      service_key: serviceKey,
      details: details || "",
    };
    const req = await apiFetch('/service-requests', {
      method: 'POST',
      body: payload,
    });
    store.activeServiceRequest = req;
    showToast(`Request sent to staff: ${serviceKey} (${details || 'Standard'})`, 'success');
    renderActiveTracker();
    startResendCooldownTimer();
  } catch (err) {
    console.error('Failed to dispatch service request:', err);
    showToast(err.message || 'Failed to dispatch request. Waiters may be busy.', 'error');
  }
}

function renderActiveTracker() {
  const container = document.getElementById('cust-active-tracker-container');
  if (!container) return;

  const req = store.activeServiceRequest;
  if (!req || req.status === 'CLOSED' || req.status === 'CANCELLED') {
    container.innerHTML = '';
    return;
  }

  const isAccepted = req.status === 'ACCEPTED';
  const isFailed = req.status === 'FAILED';
  const badgeClass = isAccepted ? 'badge-accepted' : (isFailed ? 'badge-alert' : 'badge-pending');
  const badgeLabel = isAccepted ? t('request_accepted') : (isFailed ? 'Escalated to Manager' : t('request_waiting'));

  container.innerHTML = `
    <div class="active-tracker-banner">
      <div class="tracker-info">
        <div class="tracker-icon-pulse">
          ${isAccepted ? '🚶' : (isFailed ? '⚠️' : '⏳')}
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
            <strong style="font-size:0.9375rem;">${req.service_key.toUpperCase()} ${req.details ? `(${req.details})` : ''}</strong>
            <span class="badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div style="font-size:0.8125rem;color:var(--text-secondary);" id="cust-tracker-cooldown-text">
            ${isAccepted ? 'Staff accepted request. On the way to table.' : 'Request is being routed to the best available waiter.'}
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button class="btn btn-outline btn-sm" id="cust-tracker-resend-btn" style="display:none;">
          ${t('resend_btn')}
        </button>
        <button class="btn btn-danger btn-sm" id="cust-tracker-cancel-btn">
          ${t('cancel_btn')}
        </button>
      </div>
    </div>
  `;

  const resendBtn = document.getElementById('cust-tracker-resend-btn');
  const cancelBtn = document.getElementById('cust-tracker-cancel-btn');

  if (resendBtn) {
    resendBtn.onclick = async () => {
      try {
        const res = await apiFetch(`/service-requests/${req.id}/resend`, { method: 'POST' });
        store.activeServiceRequest = res;
        showToast('Request resent to staff.', 'info');
        renderActiveTracker();
        startResendCooldownTimer();
      } catch (err) {
        showToast(err.message, 'warning');
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      try {
        const res = await apiFetch(`/service-requests/${req.id}/cancel`, {
          method: 'POST',
          body: { table_id: store.tableContext.tableNumber }
        });
        store.activeServiceRequest = null;
        showToast('Request cancelled.', 'info');
        renderActiveTracker();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }
}

function startResendCooldownTimer() {
  if (resendIntervalTimer) clearInterval(resendIntervalTimer);
  const cooldownSec = 60; // 60s duplicate/resend cooldown rule
  let remaining = cooldownSec;

  const update = () => {
    const textEl = document.getElementById('cust-tracker-cooldown-text');
    const resendBtn = document.getElementById('cust-tracker-resend-btn');
    if (!textEl) return;

    if (remaining > 0) {
      textEl.textContent = `${t('resend_cooldown')} ${remaining}s`;
      if (resendBtn) resendBtn.style.display = 'none';
      remaining--;
    } else {
      textEl.textContent = 'Still waiting? You can resend request.';
      if (resendBtn) resendBtn.style.display = 'inline-flex';
      clearInterval(resendIntervalTimer);
    }
  };

  update();
  resendIntervalTimer = setInterval(update, 1000);
}

function startTrackerPolling() {
  if (activePollTimer) clearInterval(activePollTimer);
  activePollTimer = setInterval(async () => {
    if (!store.activeServiceRequest) return;
    try {
      const refreshed = await apiFetch(`/service-requests/${store.activeServiceRequest.id}`);
      if (refreshed) {
        const prevStatus = store.activeServiceRequest.status;
        store.activeServiceRequest = refreshed;
        if (prevStatus !== refreshed.status) {
          renderActiveTracker();
          if (refreshed.status === 'ACCEPTED') {
            showToast('A waiter has accepted your table request!', 'success');
          }
        }
      }
    } catch (e) {
      // quiet poll catch
    }
  }, 3000);
}

function openCartDrawer() {
  const drawer = document.getElementById('cust-cart-drawer');
  if (!drawer) return;
  drawer.classList.add('open');
  renderCartDrawerContent();
}

function closeCartDrawer() {
  const drawer = document.getElementById('cust-cart-drawer');
  if (drawer) drawer.classList.remove('open');
}

function updateCartUI() {
  const summary = store.getCartSummary();
  const badge = document.getElementById('cust-cart-badge');
  const floatingBar = document.getElementById('cust-floating-cart');
  const floatingQty = document.getElementById('cust-floating-qty');
  const floatingTotal = document.getElementById('cust-floating-total');

  if (badge) badge.textContent = summary.totalItems;
  if (floatingBar) {
    if (summary.totalItems > 0) {
      floatingBar.style.display = 'flex';
      if (floatingQty) floatingQty.textContent = `${summary.totalItems} item${summary.totalItems > 1 ? 's' : ''}`;
      if (floatingTotal) floatingTotal.textContent = `₹${summary.total.toFixed(2)}`;
    } else {
      floatingBar.style.display = 'none';
    }
  }
}

function renderCartDrawerContent() {
  const itemsContainer = document.getElementById('cust-cart-drawer-items');
  const footerContainer = document.getElementById('cust-cart-drawer-footer');
  if (!itemsContainer || !footerContainer) return;

  const summary = store.getCartSummary();
  if (summary.items.length === 0) {
    itemsContainer.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;">
        <div style="font-size:3rem;margin-bottom:0.75rem;">🛒</div>
        <p style="color:var(--text-secondary);font-size:0.9375rem;">${t('cart_empty')}</p>
      </div>
    `;
    footerContainer.innerHTML = '';
    return;
  }

  itemsContainer.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;">
      ${summary.items.map(({ item, quantity }) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:0.75rem;border-bottom:1px solid var(--border-subtle);">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:0.9375rem;">${item.name}</div>
            <div style="font-size:0.8125rem;color:var(--accent-gold);margin-top:0.2rem;">₹${Number(item.price).toFixed(2)} each</div>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" data-drawer-act="minus" data-id="${item.id}">−</button>
            <span class="qty-val">${quantity}</span>
            <button class="qty-btn" data-drawer-act="plus" data-id="${item.id}">+</button>
          </div>
        </div>
      `).join('')}
      <div class="form-group" style="margin-top:0.5rem;">
        <label class="form-label">Special Cooking Instructions</label>
        <textarea id="cust-order-notes" class="form-textarea" rows="2" placeholder="e.g. Extra spicy, no garlic, less oil..."></textarea>
      </div>
    </div>
  `;

  footerContainer.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:1rem;font-size:0.875rem;">
      <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
        <span>${t('subtotal')}</span>
        <span>₹${summary.subtotal.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
        <span>${t('tax')}</span>
        <span>₹${summary.tax.toFixed(2)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:1.125rem;font-weight:700;color:var(--text-primary);padding-top:0.5rem;border-top:1px solid var(--border-subtle);">
        <span>${t('total')}</span>
        <span style="color:var(--accent-gold);">₹${summary.total.toFixed(2)}</span>
      </div>
    </div>
    <button class="btn btn-primary btn-lg" id="cust-place-order-btn" style="width:100%;">
      ${t('checkout')} (₹${summary.total.toFixed(2)})
    </button>
  `;

  // Attach drawer qty buttons
  itemsContainer.querySelectorAll('[data-drawer-act]').forEach(btn => {
    btn.onclick = () => {
      const id = parseInt(btn.dataset.id, 10);
      const entry = store.cart.get(id);
      if (!entry) return;
      if (btn.dataset.drawerAct === 'plus') store.addToCart(entry.item, 1);
      else if (btn.dataset.drawerAct === 'minus') store.addToCart(entry.item, -1);
      renderMenuItems();
      updateCartUI();
      renderCartDrawerContent();
    };
  });

  // Attach order placement
  const placeOrderBtn = document.getElementById('cust-place-order-btn');
  if (placeOrderBtn) {
    placeOrderBtn.onclick = async () => {
      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = "Placing Order with Kitchen...";
      try {
        const notes = document.getElementById('cust-order-notes') ? document.getElementById('cust-order-notes').value.trim() : null;
        const itemsPayload = summary.items.map(({ item, quantity }) => ({
          menu_item_id: item.id,
          quantity,
        }));

        const orderResp = await apiFetch('/orders', {
          method: 'POST',
          body: {
            table_id: store.tableContext.tableNumber,
            order_type: 'DINE_IN',
            items: itemsPayload,
            special_instructions: notes,
          }
        });

        store.clearCart();
        updateCartUI();
        closeCartDrawer();

        showModal(
          "Order Confirmed! 🍽️",
          `
            <div style="text-align:center;padding:1rem 0;">
              <div style="font-size:3rem;margin-bottom:0.75rem;">✅</div>
              <h4 style="font-size:1.25rem;margin-bottom:0.5rem;">Order #${orderResp.id} Dispatched</h4>
              <p style="color:var(--text-secondary);font-size:0.9375rem;margin-bottom:1rem;">
                Your order of <strong>₹${Number(orderResp.total_amount).toFixed(2)}</strong> has been sent to the kitchen.
              </p>
              <div style="background:var(--bg-input);padding:0.75rem;border-radius:var(--radius-md);text-align:left;font-size:0.875rem;">
                <div><strong>Table:</strong> ${orderResp.table_id} (${store.tableContext.section})</div>
                <div><strong>Status:</strong> <span class="badge badge-accepted">${orderResp.status}</span></div>
                <div><strong>Items:</strong> ${orderResp.items.map(i => `${i.quantity}x ${i.item_name}`).join(', ')}</div>
              </div>
            </div>
          `,
          [{ text: "Done", className: "btn btn-primary", onClick: closeModal }]
        );
      } catch (err) {
        placeOrderBtn.disabled = false;
        placeOrderBtn.textContent = `${t('checkout')} (₹${summary.total.toFixed(2)})`;
        showToast(err.message || 'Failed to place order.', 'error');
      }
    };
  }
}
