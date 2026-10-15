// Smart Table Service - Waiter Workstation Controller
import { CONFIG, apiFetch, ApiError } from './api.js';
import { store, t, showToast, showModal, closeModal, playAlertChime } from './components.js';
import { authService } from './auth.js';

// Smart Table Service - Waiter Experience View





let waiterPollTimer = null;
let currentWaiterUser = null;
let soundEnabled = true;

export async function renderWaiterView(params) {
  const container = document.getElementById('sts-app-view');
  if (!container) return;

  const hash = window.location.hash || '';
  if (hash.includes('login') || !localStorage.getItem('sts_staff_token')) {
    renderWaiterLogin(container);
  } else {
    await renderWaiterDashboard(container);
  }
}

function renderWaiterLogin(container) {
  if (waiterPollTimer) clearInterval(waiterPollTimer);

  container.innerHTML = `
    <div style="max-width:440px;margin:2rem auto;padding:1.5rem;" class="card">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">🧑‍🍳</div>
        <h2 style="font-size:1.5rem;font-weight:700;">${t('waiter_login_title')}</h2>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-top:0.25rem;">Sign in to your table service roster workstation</p>
      </div>

      <form id="waiter-login-form">
        <div class="form-group">
          <label class="form-label">${t('email_label')}</label>
          <input type="text" id="waiter-identifier" class="form-input" placeholder="e.g. rahul.dev@restaurant.local or Rahul" required />
        </div>

        <div class="form-group">
          <label class="form-label">${t('password_label')}</label>
          <input type="password" id="waiter-password" class="form-input" value="DevOnly_ChangeMe!123" required />
        </div>

        <button type="submit" class="btn btn-primary btn-lg" id="waiter-signin-btn" style="width:100%;margin-top:0.5rem;">
          ${t('login_btn')}
        </button>
      </form>

      <!-- Quick Demo Account Switcher -->
      <div style="margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid var(--border-subtle);">
        <p style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.5rem;text-align:center;">
          Quick Staff Accounts (Dev)
        </p>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;justify-content:center;">
          ${['Rahul', 'Aman', 'Vikas', 'Suresh', 'Mohit'].map(name => `
            <button type="button" class="btn btn-outline btn-sm quick-waiter-btn" data-name="${name}">
              ${name}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.quick-waiter-btn').forEach(btn => {
    btn.onclick = () => {
      document.getElementById('waiter-identifier').value = `${btn.dataset.name.toLowerCase()}.dev@restaurant.local`;
      document.getElementById('waiter-password').value = "DevOnly_ChangeMe!123";
    };
  });

  const form = document.getElementById('waiter-login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('waiter-signin-btn');
    const identifier = document.getElementById('waiter-identifier').value.trim();
    const password = document.getElementById('waiter-password').value;

    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      const authData = await apiFetch('/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });

      if (authData.role !== 'WAITER' && authData.role !== 'MANAGER' && authData.role !== 'ADMIN') {
        throw new Error('Access denied: Staff account required.');
      }

      localStorage.setItem('sts_staff_token', authData.access_token);
      localStorage.setItem('sts_staff_user', JSON.stringify(authData));
      currentWaiterUser = authData;

      showToast(`Welcome back, ${authData.name}!`, 'success');
      window.location.hash = '#/waiter/dashboard';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = t('login_btn');
      showToast(err.message || 'Login failed. Verify credentials.', 'error');
    }
  };
}

async function renderWaiterDashboard(container) {
  try {
    const me = await apiFetch('/auth/me');
    currentWaiterUser = me;
  } catch (err) {
    localStorage.removeItem('sts_staff_token');
    localStorage.removeItem('sts_staff_user');
    window.location.hash = '#/waiter/login';
    return;
  }

  container.innerHTML = `
    <!-- Waiter Profile Bar -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;" class="card">
      <div style="display:flex;align-items:center;gap:1rem;">
        <div style="width:48px;height:48px;border-radius:var(--radius-md);background:linear-gradient(135deg, #10B981, #059669);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">
          🧑‍🍳
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <h1 style="font-size:1.25rem;font-weight:700;">${currentWaiterUser.name}</h1>
            <span class="badge badge-assigned">${currentWaiterUser.role}</span>
          </div>
          <div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:0.2rem;">
            Accepted Today: <strong>${currentWaiterUser.accepted_count || 0}</strong> • Missed: <strong>${currentWaiterUser.missed_count || 0}</strong>
          </div>
        </div>
      </div>

      <!-- Online / Offline Safeguard Switch -->
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <button class="btn ${currentWaiterUser.is_online ? 'btn-success' : 'btn-danger'} btn-lg" id="waiter-status-toggle">
          <span class="dot" style="width:10px;height:10px;border-radius:50%;background:#FFF;display:inline-block;"></span>
          <span id="waiter-status-label">${currentWaiterUser.is_online ? t('status_online') : t('status_offline')}</span>
        </button>
        <button class="btn btn-outline btn-sm" id="waiter-logout-btn" title="Sign Out">Sign Out</button>
      </div>
    </div>

    <!-- Active Incoming Request Section -->
    <div id="waiter-incoming-container"></div>

    <!-- In-Progress Accepted Tasks Section -->
    <div id="waiter-inprogress-container"></div>

    <!-- Empty State Container -->
    <div id="waiter-empty-container"></div>
  `;

  // Attach status toggle
  const toggleBtn = document.getElementById('waiter-status-toggle');
  if (toggleBtn) {
    toggleBtn.onclick = async () => {
      toggleBtn.disabled = true;
      try {
        const newStatus = !currentWaiterUser.is_online;
        const updated = await apiFetch(`/waiters/${currentWaiterUser.id}/status`, {
          method: 'PATCH',
          body: { is_online: newStatus },
        });
        currentWaiterUser.is_online = updated.is_online;
        toggleBtn.className = `btn ${updated.is_online ? 'btn-success' : 'btn-danger'} btn-lg`;
        document.getElementById('waiter-status-label').textContent = updated.is_online ? t('status_online') : t('status_offline');
        showToast(`Status updated: ${updated.is_online ? 'Online (Ready)' : 'Offline (Paused)'}`, 'info');
      } catch (err) {
        showToast(err.message || 'Status toggle failed.', 'error');
      } finally {
        toggleBtn.disabled = false;
      }
    };
  }

  // Attach logout
  const logoutBtn = document.getElementById('waiter-logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem('sts_staff_token');
      localStorage.removeItem('sts_staff_user');
      showToast('Signed out of staff workstation.', 'info');
      window.location.hash = '#/waiter/login';
    };
  }

  await pollWaiterTasks();
  startWaiterPolling();
}

async function pollWaiterTasks() {
  if (!currentWaiterUser) return;
  try {
    const data = await apiFetch(`/waiters/${currentWaiterUser.id}/tasks`);
    renderTasksView(data);
  } catch (err) {
    console.error('Waiter task poll error:', err);
  }
}

function renderTasksView(data) {
  const incomingContainer = document.getElementById('waiter-incoming-container');
  const inprogressContainer = document.getElementById('waiter-inprogress-container');
  const emptyContainer = document.getElementById('waiter-empty-container');
  if (!incomingContainer || !inprogressContainer || !emptyContainer) return;

  const incoming = data.incoming || [];
  const inprogress = data.in_progress || [];

  // 1. Incoming waiting assignment
  if (incoming.length > 0) {
    const task = incoming[0];
    playAlertSound();

    incomingContainer.innerHTML = `
      <div class="waiter-task-card" style="border:2px solid var(--accent-gold);background:rgba(245, 158, 11, 0.04);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <span class="badge badge-alert" style="font-size:0.875rem;padding:0.4rem 0.8rem;">
            🔔 ${t('incoming_task')} (Attempt ${task.attempt_number} of 3)
          </span>
          <span style="font-family:var(--font-display);font-size:1.125rem;font-weight:700;color:var(--accent-gold);" id="waiter-countdown-display">
            ${task.remaining_seconds}s remaining
          </span>
        </div>

        <div style="margin:1.25rem 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <div style="font-size:2rem;font-weight:800;font-family:var(--font-display);color:var(--text-primary);">
              ${t('table')} ${task.table_id}
            </div>
            <div style="font-size:1.125rem;color:var(--text-primary);margin-top:0.25rem;display:flex;align-items:center;gap:0.5rem;">
              <span><strong>${task.service_key.toUpperCase()}</strong></span>
              ${task.details ? `<span style="color:var(--accent-gold);">(${task.details})</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:0.8125rem;color:var(--text-secondary);">Timeout Policy:</div>
            <div style="font-size:0.9375rem;font-weight:600;">${task.timeout_seconds}s limit</div>
          </div>
        </div>

        <!-- Touch-Friendly Large Action Buttons -->
        <div style="display:grid;grid-template-columns: 2fr 1fr; gap: 1rem; margin-top: 1rem;">
          <button class="btn btn-success btn-lg" id="waiter-accept-btn" style="font-size:1.125rem;min-height:56px;">
            ✓ ${t('accept_btn')}
          </button>
          <button class="btn btn-outline btn-lg" id="waiter-reject-btn" style="min-height:56px;border-color:var(--status-danger);color:var(--status-danger);">
            ✕ ${t('reject_btn')}
          </button>
        </div>
      </div>
    `;

    document.getElementById('waiter-accept-btn').onclick = async () => {
      try {
        await apiFetch(`/waiters/${currentWaiterUser.id}/service-requests/${task.request_id}/accept`, {
          method: 'POST',
        });
        showToast(`Accepted Table ${task.table_id} request!`, 'success');
        await pollWaiterTasks();
      } catch (err) {
        showToast(err.message || 'Accept failed.', 'error');
      }
    };

    document.getElementById('waiter-reject-btn').onclick = () => {
      showRejectReasonModal(task);
    };
  } else {
    incomingContainer.innerHTML = '';
  }

  // 2. In-progress tasks
  if (inprogress.length > 0) {
    inprogressContainer.innerHTML = `
      <h2 style="font-size:1.125rem;font-weight:700;margin:1.5rem 0 0.75rem 0;">In-Progress Tasks (${inprogress.length})</h2>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${inprogress.map(task => `
          <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;border-left:4px solid var(--status-success);">
            <div>
              <div style="font-size:1.25rem;font-weight:700;">${t('table')} ${task.table_id}</div>
              <div style="font-size:0.9375rem;color:var(--text-secondary);margin-top:0.2rem;">
                Request: <strong>${task.service_key.toUpperCase()}</strong> ${task.details ? `(${task.details})` : ''}
              </div>
            </div>
            <button class="btn btn-primary" data-complete-id="${task.request_id}">
              ✓ ${t('complete_btn')}
            </button>
          </div>
        `).join('')}
      </div>
    `;

    inprogressContainer.querySelectorAll('[data-complete-id]').forEach(btn => {
      btn.onclick = async () => {
        const reqId = btn.dataset.completeId;
        try {
          await apiFetch(`/waiters/${currentWaiterUser.id}/service-requests/${reqId}/complete`, {
            method: 'POST',
          });
          showToast(`Completed task for Table!`, 'success');
          await pollWaiterTasks();
        } catch (err) {
          showToast(err.message || 'Failed to complete task.', 'error');
        }
      };
    });
  } else {
    inprogressContainer.innerHTML = '';
  }

  // 3. Empty State
  if (incoming.length === 0 && inprogress.length === 0) {
    emptyContainer.innerHTML = `
      <div class="card" style="text-align:center;padding:3rem 1rem;margin-top:1rem;">
        <div style="font-size:3rem;margin-bottom:0.75rem;">✨</div>
        <h3 style="font-size:1.25rem;margin-bottom:0.25rem;">${t('no_active_tasks')}</h3>
        <p style="font-size:0.875rem;color:var(--text-secondary);">
          Keep your status <strong>ONLINE</strong> to receive table service calls automatically.
        </p>
      </div>
    `;
  } else {
    emptyContainer.innerHTML = '';
  }
}

function showRejectReasonModal(task) {
  const reasons = [
    "Attending another table",
    "Serving hot food / busy in kitchen",
    "Customer table clarification",
    "Break / End of shift",
  ];

  const bodyHtml = `
    <p style="margin-bottom:1rem;color:var(--text-secondary);">
      Select reason for rejecting Table ${task.table_id} (${task.service_key}):
    </p>
    <div style="display:flex;flex-direction:column;gap:0.5rem;" id="reject-reasons-list">
      ${reasons.map((r, i) => `
        <label style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;background:var(--bg-input);border-radius:var(--radius-md);cursor:pointer;">
          <input type="radio" name="rejection_choice" value="${r}" ${i === 0 ? 'checked' : ''} />
          <span>${r}</span>
        </label>
      `).join('')}
    </div>
  `;

  showModal("Decline Table Request", bodyHtml, [
    { text: "Cancel", className: "btn btn-secondary", onClick: closeModal },
    {
      text: "Confirm Rejection",
      className: "btn btn-danger",
      onClick: async () => {
        const checked = document.querySelector('input[name="rejection_choice"]:checked');
        const reason = checked ? checked.value : "Attending another table";
        try {
          await apiFetch(`/waiters/${currentWaiterUser.id}/service-requests/${task.request_id}/reject`, {
            method: 'POST',
            body: { rejection_reason: reason },
          });
          showToast(`Declined Table ${task.table_id}. Routing to next waiter.`, 'warning');
          closeModal();
          await pollWaiterTasks();
        } catch (err) {
          showToast(err.message || 'Rejection failed.', 'error');
        }
      }
    }
  ]);
}

function playAlertSound() {
  if (!soundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    // browser audio autoplay restrictions
  }
}

function startWaiterPolling() {
  if (waiterPollTimer) clearInterval(waiterPollTimer);
  waiterPollTimer = setInterval(pollWaiterTasks, 2500);
}
