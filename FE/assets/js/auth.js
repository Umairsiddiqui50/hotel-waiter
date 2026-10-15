// Smart Table Service - Authentication & Session Service
// Security Rule: Sensitive access tokens are strictly stored in sessionStorage, never in localStorage.
import { apiFetch, ApiError } from './api.js';

export const authService = {
  getStaffToken() {
    return sessionStorage.getItem('sts_staff_token');
  },
  
  getStaffUser() {
    const userStr = sessionStorage.getItem('sts_staff_user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  setStaffSession(token, user) {
    sessionStorage.setItem('sts_staff_token', token);
    sessionStorage.setItem('sts_staff_user', JSON.stringify(user));
  },

  clearStaffSession() {
    sessionStorage.removeItem('sts_staff_token');
    sessionStorage.removeItem('sts_staff_user');
  },

  async loginStaff(username, password) {
    let res;
    // Backend expects 'identifier' and 'password'
    const payload = { identifier: username, password };
    try {
      res = await apiFetch('/auth/login', {
        method: 'POST',
        body: payload
      });
    } catch (err) {
      if (err.status === 404) {
        res = await apiFetch('/auth/staff/login', {
          method: 'POST',
          body: payload
        });
      } else {
        throw err;
      }
    }

    if (res && res.access_token) {
      const user = res.user || {
        id: res.user_id,
        role: res.role,
        name: res.name,
        email: res.email,
        is_online: res.is_online,
        restaurant_id: res.restaurant_id
      };
      this.setStaffSession(res.access_token, user);
      return { ...res, user };
    }
    throw new ApiError(400, 'Invalid login response');
  },

  logoutStaff() {
    this.clearStaffSession();
    window.location.hash = '#/auth';
  },

  getCustomerSession() {
    const custStr = sessionStorage.getItem('sts_customer_session');
    try {
      return custStr ? JSON.parse(custStr) : null;
    } catch {
      return null;
    }
  },

  setCustomerSession(data) {
    sessionStorage.setItem('sts_customer_session', JSON.stringify(data));
  },

  async requestCustomerOtp(phone_number) {
    return await apiFetch('/auth/customer/request-otp', {
      method: 'POST',
      body: { phone_number }
    });
  },

  async verifyCustomerOtp(phone_number, otp_code) {
    const res = await apiFetch('/auth/customer/verify-otp', {
      method: 'POST',
      body: { phone_number, otp_code }
    });
    if (res && res.session_token) {
      this.setCustomerSession(res);
      return res;
    }
    throw new ApiError(400, 'Invalid OTP response');
  }
};
