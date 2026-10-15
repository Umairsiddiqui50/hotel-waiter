// Smart Table Service - Shared Reusable UI Components & i18n
import { CONFIG } from './api.js';

// Multi-language dictionary
const translations = {
  en: {
    brand_sub: "Smart Table Service Platform",
    call_waiter: "Call Waiter",
    request_bill: "Request Bill",
    need_water: "Need Water",
    extra_cutlery: "Extra Cutlery",
    menu_title: "Food & Beverage Menu",
    cart_title: "Your Table Order",
    place_order: "Confirm & Place Order",
    bill_subtotal: "Subtotal",
    bill_tax: "GST (5%)",
    bill_total: "Total Amount",
    active_service: "Assigned Waiter",
    status_pending: "Assigning...",
    status_accepted: "Waiter on the way",
    status_completed: "Service Completed",
    waiter_workstation: "Waiter Workstation",
    manager_console: "Operations Control",
    duty_active: "Active on Duty",
    duty_break: "On Short Break",
    duty_offline: "Off Duty",
    tables_indoor: "Indoor Tables (1-18)",
    tables_outdoor: "Outdoor Garden (19-23)",
  },
  hi: {
    brand_sub: "स्मार्ट टेबल सेवा प्रणाली",
    call_waiter: "वेटर को बुलाएं",
    request_bill: "बिल मांगें",
    need_water: "पानी चाहिए",
    extra_cutlery: "अतिरिक्त कटलरी",
    menu_title: "भोजन एवं पेय सूची",
    cart_title: "आपका आर्डर",
    place_order: "आर्डर सुनिश्चित करें",
    bill_subtotal: "उप-योग",
    bill_tax: "जीएसटी (5%)",
    bill_total: "कुल राशि",
    active_service: "नियुक्त वेटर",
    status_pending: "वेटर आवंटित हो रहा है...",
    status_accepted: "वेटर आ रहे हैं",
    status_completed: "सेवा पूर्ण हुई",
    waiter_workstation: "वेटर कार्यक्षेत्र",
    manager_console: "प्रबंधक नियंत्रण कक्ष",
    duty_active: "ड्यूटी पर सक्रिय",
    duty_break: "अल्प विराम",
    duty_offline: "ड्यूटी समाप्त",
    tables_indoor: "इनडोर टेबल्स (1-18)",
    tables_outdoor: "आउटडोर गार्डन (19-23)",
  }
};

let currentLang = 'en';

export function getLang() { return currentLang; }
export function setLang(lang) {
  if (translations[lang]) {
    currentLang = lang;
    window.dispatchEvent(new CustomEvent('sts_language_change', { detail: lang }));
  }
}
export function t(key) {
  return (translations[currentLang] && translations[currentLang][key]) || (translations['en'][key]) || key;
}

// Toast notification manager
export function showToast(message, type = 'info', durationMs = 3500) {
  let container = document.getElementById('sts-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sts-toast-container';
    container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:0.75rem;max-width:380px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.style.cssText = 'pointer-events:auto;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:0.85rem 1.25rem;box-shadow:var(--shadow-xl);color:var(--text-primary);font-size:0.875rem;display:flex;align-items:center;gap:0.75rem;animation:fadeIn 0.25s ease-out;';
  
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span aria-hidden="true">${icon}</span><div>${message}</div>`;
  
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// Modal dialog manager
export function showModal(title, contentHtml, actions = []) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'sts-active-modal';
  backdrop.className = 'modal-backdrop';
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem;';
  
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:var(--radius-xl);max-width:520px;width:100%;box-shadow:var(--shadow-xl);overflow:hidden;';

  let actionsHtml = actions.map((a, i) => `
    <button class="sts-btn ${a.primary ? 'sts-btn-primary' : 'sts-btn-secondary'}" id="modal-act-${i}">${a.label}</button>
  `).join('');

  box.innerHTML = `
    <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;">
      <h3 style="margin:0;font-size:1.15rem;font-weight:700;">${title}</h3>
      <button id="modal-close-btn" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1.25rem;">✕</button>
    </div>
    <div style="padding:1.5rem;max-height:70vh;overflow-y:auto;">${contentHtml}</div>
    <div style="padding:1rem 1.5rem;border-top:1px solid var(--border-subtle);display:flex;gap:0.75rem;justify-content:flex-end;background:rgba(0,0,0,0.15);">${actionsHtml}</div>
  `;

  backdrop.appendChild(box);
  document.body.appendChild(backdrop);

  document.getElementById('modal-close-btn').onclick = closeModal;
  actions.forEach((a, i) => {
    const el = document.getElementById(`modal-act-${i}`);
    if (el) el.onclick = () => { a.onClick && a.onClick(); closeModal(); };
  });
}

export function closeModal() {
  const modal = document.getElementById('sts-active-modal');
  if (modal) modal.remove();
}

// Audio ping using Web Audio API synthesis
export function playAlertChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Audio context may be restricted by autoplay policy
  }
}


// Application Reactive Store
class AppStore {
  constructor() {
    this.cart = new Map();
    this.activeServiceRequest = null;
    this.tableContext = {
      tableNumber: 7,
      section: 'INDOOR',
      isIndoor: true,
      qrToken: null,
      isVerified: false,
    };
    this.waiterUser = null;
    this.adminUser = null;
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const savedCart = sessionStorage.getItem('sts_cart');
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        parsed.forEach(entry => this.cart.set(entry.item.id, entry));
      }
      const savedStaff = sessionStorage.getItem('sts_staff_user');
      if (savedStaff) {
        const u = JSON.parse(savedStaff);
        if (u.role === 'WAITER') this.waiterUser = u;
        else if (u.role === 'ADMIN' || u.role === 'MANAGER') this.adminUser = u;
      }
    } catch (e) {
      console.warn('Storage parsing error:', e);
    }
  }

  saveCart() {
    const list = Array.from(this.cart.values());
    sessionStorage.setItem('sts_cart', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('sts_cart_updated', { detail: this.getCartSummary() }));
  }

  addToCart(item, delta = 1) {
    const existing = this.cart.get(item.id);
    if (existing) {
      existing.quantity += delta;
      if (existing.quantity <= 0) {
        this.cart.delete(item.id);
      }
    } else if (delta > 0) {
      this.cart.set(item.id, { item, quantity: delta });
    }
    this.saveCart();
  }

  setCartQty(item, quantity) {
    if (quantity <= 0) {
      this.cart.delete(item.id);
    } else {
      this.cart.set(item.id, { item, quantity });
    }
    this.saveCart();
  }

  clearCart() {
    this.cart.clear();
    this.saveCart();
  }

  getCartSummary() {
    let subtotal = 0;
    let totalItems = 0;
    for (const { item, quantity } of this.cart.values()) {
      subtotal += Number(item.price) * quantity;
      totalItems += quantity;
    }
    const tax = Math.round(subtotal * CONFIG.TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    return {
      items: Array.from(this.cart.values()),
      subtotal,
      tax,
      total,
      totalItems,
    };
  }

  setTableContext(tableNumber, section = null, qrToken = null) {
    const num = parseInt(tableNumber, 10) || 7;
    const isIndoor = section ? (section.toUpperCase() === 'INDOOR') : (num <= CONFIG.INDOOR_TABLES);
    this.tableContext = {
      tableNumber: num,
      section: isIndoor ? 'INDOOR' : 'OUTDOOR',
      isIndoor,
      qrToken,
      isVerified: !!qrToken,
    };
    window.dispatchEvent(new CustomEvent('sts_table_context_updated', { detail: this.tableContext }));
  }
}

export const store = new AppStore();
