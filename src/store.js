// Smart Table Service - Reactive Application Store
import { CONFIG } from './config.js';

class AppStore {
  constructor() {
    this.cart = new Map(); // itemId -> { item, quantity }
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
      const savedCart = localStorage.getItem('sts_cart');
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        parsed.forEach(entry => this.cart.set(entry.item.id, entry));
      }
      const savedStaff = localStorage.getItem('sts_staff_user');
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
    localStorage.setItem('sts_cart', JSON.stringify(list));
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
