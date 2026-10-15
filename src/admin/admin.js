// Smart Table Service - Restaurant Administrator / Manager Experience View
import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { apiFetch, ApiError } from '../api.js';
import { showToast, showModal, closeModal } from '../ui.js';

let adminPollTimer = null;
let currentAdminUser = null;
let activeAdminTab = 'overview'; // overview, tables, requests, staff, menu, settings

export async function renderAdminView(params) {
  const container = document.getElementById('sts-app-view');
  if (!container) return;

  const hash = window.location.hash || '';
  if (hash.includes('login') || !localStorage.getItem('sts_staff_token')) {
    renderAdminLogin(container);
  } else {
    await renderAdminDashboard(container);
  }
}

function renderAdminLogin(container) {
  if (adminPollTimer) clearInterval(adminPollTimer);

  container.innerHTML = `
    <div style="max-width:440px;margin:2rem auto;padding:1.5rem;" class="card">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:2.5rem;margin-bottom:0.5rem;">🏢</div>
        <h2 style="font-size:1.5rem;font-weight:700;">${t('admin_login_title')}</h2>
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-top:0.25rem;">Management console for restaurant operations</p>
      </div>

      <form id="admin-login-form">
        <div class="form-group">
          <label class="form-label">Manager Email / ID</label>
          <input type="text" id="admin-identifier" class="form-input" value="manager.dev@restaurant.local" required />
        </div>

        <div class="form-group">
          <label class="form-label">Password</label>
          <input type="password" id="admin-password" class="form-input" value="DevOnly_ChangeMe!123" required />
        </div>

        <button type="submit" class="btn btn-primary btn-lg" id="admin-signin-btn" style="width:100%;margin-top:0.5rem;">
          Sign In to Admin Console
        </button>
      </form>

      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border-subtle);text-align:center;">
        <button type="button" class="btn btn-outline btn-sm" id="quick-manager-btn">
          Pre-fill Demo Manager (Manager Vikram)
        </button>
      </div>
    </div>
  `;

  document.getElementById('quick-manager-btn').onclick = () => {
    document.getElementById('admin-identifier').value = 'manager.dev@restaurant.local';
    document.getElementById('admin-password').value = 'DevOnly_ChangeMe!123';
  };

  const form = document.getElementById('admin-login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('admin-signin-btn');
    const identifier = document.getElementById('admin-identifier').value.trim();
    const password = document.getElementById('admin-password').value;

    btn.disabled = true;
    btn.textContent = "Signing in...";

    try {
      const authData = await apiFetch('/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });

      if (authData.role !== 'MANAGER' && authData.role !== 'ADMIN') {
        throw new Error('Access denied: Manager or Administrator role required.');
      }

      localStorage.setItem('sts_staff_token', authData.access_token);
      localStorage.setItem('sts_staff_user', JSON.stringify(authData));
      currentAdminUser = authData;

      showToast(`Welcome to Management Console, ${authData.name}!`, 'success');
      window.location.hash = '#/admin/dashboard';
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Sign In to Admin Console";
      showToast(err.message || 'Login failed.', 'error');
    }
  };
}

async function renderAdminDashboard(container) {
  try {
    const me = await apiFetch('/auth/me');
    if (me.role !== 'MANAGER' && me.role !== 'ADMIN') {
      throw new Error('Forbidden');
    }
    currentAdminUser = me;
  } catch (err) {
    localStorage.removeItem('sts_staff_token');
    localStorage.removeItem('sts_staff_user');
    window.location.hash = '#/admin/login';
    return;
  }

  container.innerHTML = `
    <!-- Top Admin Bar -->
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
      <div>
        <h1 style="font-size:1.5rem;font-weight:700;">Operations Control Center</h1>
        <p style="font-size:0.875rem;color:var(--text-secondary);">${CONFIG.RESTAURANT_NAME} • Logged in as ${currentAdminUser.name}</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button class="btn btn-outline btn-sm" id="admin-logout-btn">Sign Out</button>
      </div>
    </div>

    <!-- Admin Navigation Tabs -->
    <div class="category-nav" id="admin-nav-tabs" style="margin-bottom:1.5rem;">
      <button class="category-pill ${activeAdminTab === 'overview' ? 'active' : ''}" data-tab="overview">📊 Overview</button>
      <button class="category-pill ${activeAdminTab === 'tables' ? 'active' : ''}" data-tab="tables">🪑 23 Tables Map</button>
      <button class="category-pill ${activeAdminTab === 'requests' ? 'active' : ''}" data-tab="requests">⚠️ Alerts & Requests</button>
      <button class="category-pill ${activeAdminTab === 'staff' ? 'active' : ''}" data-tab="staff">🧑‍🍳 Staff Roster</button>
      <button class="category-pill ${activeAdminTab === 'menu' ? 'active' : ''}" data-tab="menu">📋 Menu CRUD</button>
      <button class="category-pill ${activeAdminTab === 'settings' ? 'active' : ''}" data-tab="settings">⚙️ Settings</button>
    </div>

    <!-- Tab Content View Container -->
    <div id="admin-tab-content"></div>
  `;

  document.querySelectorAll('#admin-nav-tabs .category-pill').forEach(pill => {
    pill.onclick = () => {
      activeAdminTab = pill.dataset.tab;
      document.querySelectorAll('#admin-nav-tabs .category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderActiveTab();
    };
  });

  const logoutBtn = document.getElementById('admin-logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem('sts_staff_token');
      localStorage.removeItem('sts_staff_user');
      showToast('Signed out of admin console.', 'info');
      window.location.hash = '#/admin/login';
    };
  }

  await renderActiveTab();
  startAdminPolling();
}

async function renderActiveTab() {
  const content = document.getElementById('admin-tab-content');
  if (!content) return;

  if (activeAdminTab === 'overview') await renderOverviewTab(content);
  else if (activeAdminTab === 'tables') await renderTablesTab(content);
  else if (activeAdminTab === 'requests') await renderRequestsTab(content);
  else if (activeAdminTab === 'staff') await renderStaffTab(content);
  else if (activeAdminTab === 'menu') await renderMenuTab(content);
  else if (activeAdminTab === 'settings') renderSettingsTab(content);
}

async function renderOverviewTab(content) {
  content.innerHTML = '<div class="skeleton" style="height:140px;width:100%;margin-bottom:1rem;"></div>';
  try {
    const kpi = await apiFetch('/manager/dashboard');

    content.innerHTML = `
      <!-- KPI Metric Cards Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:1rem;margin-bottom:1.5rem;">
        <div class="card">
          <div style="font-size:0.8125rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Staff Availability</div>
          <div style="font-size:2rem;font-weight:800;color:var(--status-success);margin:0.25rem 0;">
            ${kpi.waiters_online} <span style="font-size:1.125rem;color:var(--text-secondary);font-weight:500;">/ ${kpi.waiters_total} Online</span>
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted);">Active waiter roster status</div>
        </div>

        <div class="card">
          <div style="font-size:0.8125rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Active Service Requests</div>
          <div style="font-size:2rem;font-weight:800;color:var(--accent-gold);margin:0.25rem 0;">
            ${kpi.open_requests}
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted);">Table calls requiring service</div>
        </div>

        <div class="card">
          <div style="font-size:0.8125rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Manager Alerts</div>
          <div style="font-size:2rem;font-weight:800;color:${kpi.open_alerts > 0 ? 'var(--status-danger)' : 'var(--text-primary)'};margin:0.25rem 0;">
            ${kpi.open_alerts}
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted);">Escalations needing manual action</div>
        </div>

        <div class="card">
          <div style="font-size:0.8125rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Active Dining Orders</div>
          <div style="font-size:2rem;font-weight:800;color:var(--status-info);margin:0.25rem 0;">
            ${kpi.active_orders}
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted);">Accepted orders on table</div>
        </div>
      </div>

      <!-- Performance & Latency Metrics -->
      <div class="card" style="margin-bottom:1.5rem;">
        <h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem;">Service Velocity KPIs</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:1rem;">
          <div>
            <div style="font-size:0.8125rem;color:var(--text-secondary);">Avg. Waiter Acceptance Speed:</div>
            <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);margin-top:0.2rem;">
              ${kpi.avg_accept_time_sec !== null ? `${kpi.avg_accept_time_sec.toFixed(1)} seconds` : 'No data yet'}
            </div>
          </div>
          <div>
            <div style="font-size:0.8125rem;color:var(--text-secondary);">Avg. Table Service Time:</div>
            <div style="font-size:1.25rem;font-weight:700;color:var(--text-primary);margin-top:0.2rem;">
              ${kpi.avg_service_time_min !== null ? `${kpi.avg_service_time_min.toFixed(1)} minutes` : 'No data yet'}
            </div>
          </div>
          <div>
            <div style="font-size:0.8125rem;color:var(--text-secondary);">Missed Requests Today:</div>
            <div style="font-size:1.25rem;font-weight:700;color:${kpi.missed_today > 0 ? 'var(--status-warning)' : 'var(--text-primary)'};margin-top:0.2rem;">
              ${kpi.missed_today}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="card" style="color:var(--status-danger);">Failed to load KPI overview: ${err.message}</div>`;
  }
}

async function renderTablesTab(content) {
  content.innerHTML = '<div class="skeleton" style="height:200px;width:100%;"></div>';
  try {
    const tables = await apiFetch('/manager/tables');
    const indoor = tables.filter(t => t.section === 'INDOOR');
    const outdoor = tables.filter(t => t.section === 'OUTDOOR');

    content.innerHTML = `
      <div style="margin-bottom:1.5rem;">
        <h3 style="font-size:1.125rem;font-weight:700;margin-bottom:0.75rem;">Indoor Section (Tables 1 - 18)</h3>
        <div class="tables-grid">
          ${indoor.map(t => renderTableBox(t)).join('')}
        </div>
      </div>

      <div>
        <h3 style="font-size:1.125rem;font-weight:700;margin-bottom:0.75rem;">Outdoor Terrace (Tables 19 - 23)</h3>
        <div class="tables-grid">
          ${outdoor.map(t => renderTableBox(t)).join('')}
        </div>
      </div>
    `;

    content.querySelectorAll('.table-box').forEach(box => {
      box.onclick = () => {
        const num = box.dataset.tableNum;
        window.open(`index.html#/customer?table=${num}`, '_blank');
      };
    });
  } catch (err) {
    content.innerHTML = `<div class="card" style="color:var(--status-danger);">Failed to load tables: ${err.message}</div>`;
  }
}

function renderTableBox(table) {
  let badgeClass = '';
  let badgeLabel = 'Idle';
  if (table.status_badge === 'alert') {
    badgeClass = 'status-alert';
    badgeLabel = 'Alert!';
  } else if (table.status_badge === 'acc') {
    badgeClass = 'status-acc';
    badgeLabel = 'Accepted';
  } else if (table.status_badge === 'wait') {
    badgeClass = 'status-wait';
    badgeLabel = 'Waiting';
  }

  return `
    <div class="table-box ${badgeClass}" data-table-num="${table.table_number}" title="Click to view Customer Screen for Table ${table.table_number}">
      <span class="table-section-tag">${table.section}</span>
      <span class="table-num">${table.table_number}</span>
      <span class="badge ${badgeClass ? `badge-${table.status_badge === 'acc' ? 'accepted' : (table.status_badge === 'wait' ? 'pending' : 'alert')}` : 'badge-closed'}">
        ${badgeLabel}
      </span>
      ${table.primary_waiter_name ? `
        <span style="font-size:0.6875rem;color:var(--text-muted);margin-top:0.2rem;">
          Wait: ${table.primary_waiter_name}
        </span>
      ` : ''}
    </div>
  `;
}

async function renderRequestsTab(content) {
  content.innerHTML = '<div class="skeleton" style="height:200px;width:100%;"></div>';
  try {
    const alerts = await apiFetch('/manager/alerts');
    const waiters = await apiFetch('/waiters');

    content.innerHTML = `
      <!-- Manager Alerts Section -->
      <div style="margin-bottom:2rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
          <h3 style="font-size:1.125rem;font-weight:700;">Active Escalations & Alerts (${alerts.length})</h3>
        </div>
        ${alerts.length === 0 ? `
          <div class="card" style="text-align:center;padding:2rem;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">✅</div>
            <p style="color:var(--text-secondary);">No open manager alerts. All requests routed smoothly.</p>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${alerts.map(a => `
              <div class="card" style="border-left:4px solid var(--status-danger);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
                <div>
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <span class="badge badge-alert">ALERT #${a.id} • TYPE: ${a.alert_type}</span>
                    <span style="font-size:0.8125rem;color:var(--text-muted);">Request #${a.request_id}</span>
                  </div>
                  <div style="font-size:0.875rem;color:var(--text-secondary);margin-top:0.35rem;">
                    ${a.alert_type === 'NONE' ? 'Zero waiters were online when customer requested service.' : (a.alert_type === 'ALL' ? 'All 3 attempts rejected or timed out.' : 'Resend limit reached.')}
                  </div>
                </div>
                ${a.is_open ? `
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <button class="btn btn-primary btn-sm" data-assign-alert-id="${a.id}">
                      Manual Assign Waiter
                    </button>
                    <button class="btn btn-outline btn-sm" data-resolve-alert-id="${a.id}">
                      Resolve
                    </button>
                  </div>
                ` : `
                  <span class="badge badge-closed">Resolved</span>
                `}
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;

    content.querySelectorAll('[data-assign-alert-id]').forEach(btn => {
      btn.onclick = () => {
        const alertId = btn.dataset.assignAlertId;
        showManualAssignModal(alertId, waiters);
      };
    });

    content.querySelectorAll('[data-resolve-alert-id]').forEach(btn => {
      btn.onclick = async () => {
        const alertId = btn.dataset.resolveAlertId;
        try {
          await apiFetch(`/manager/${currentAdminUser.id}/alerts/${alertId}/resolve`, {
            method: 'POST',
          });
          showToast(`Alert #${alertId} marked resolved.`, 'success');
          await renderRequestsTab(content);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  } catch (err) {
    content.innerHTML = `<div class="card" style="color:var(--status-danger);">Failed to load alerts: ${err.message}</div>`;
  }
}

function showManualAssignModal(alertId, waiters) {
  const onlineWaiters = (waiters || []).filter(w => w.is_online);

  const bodyHtml = `
    <p style="margin-bottom:1rem;color:var(--text-secondary);">
      Select waiter to manually assign to Alert #${alertId}:
    </p>
    ${onlineWaiters.length === 0 ? `
      <p style="color:var(--status-danger);font-weight:600;">No waiters currently online. Any staff member selected will be notified.</p>
    ` : ''}
    <div style="display:flex;flex-direction:column;gap:0.5rem;" id="manual-waiters-list">
      ${(waiters || []).map((w, i) => `
        <label style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:var(--bg-input);border-radius:var(--radius-md);cursor:pointer;">
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <input type="radio" name="assign_waiter_choice" value="${w.id}" ${i === 0 ? 'checked' : ''} />
            <span style="font-weight:600;">${w.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span class="badge ${w.is_online ? 'badge-accepted' : 'badge-closed'}">${w.is_online ? 'ONLINE' : 'OFFLINE'}</span>
            <span style="font-size:0.75rem;color:var(--text-muted);">${w.accepted_count || 0} accepted</span>
          </div>
        </label>
      `).join('')}
    </div>
  `;

  showModal("Manual Override Assignment", bodyHtml, [
    { text: "Cancel", className: "btn btn-secondary", onClick: closeModal },
    {
      text: "Assign Selected Waiter",
      className: "btn btn-primary",
      onClick: async () => {
        const checked = document.querySelector('input[name="assign_waiter_choice"]:checked');
        if (!checked) return;
        const waiterId = checked.value;
        try {
          await apiFetch(`/manager/${currentAdminUser.id}/alerts/${alertId}/assign`, {
            method: 'POST',
            body: { waiter_id: waiterId },
          });
          showToast(`Successfully assigned waiter to request!`, 'success');
          closeModal();
          const content = document.getElementById('admin-tab-content');
          if (content) renderRequestsTab(content);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    }
  ]);
}

async function renderStaffTab(content) {
  content.innerHTML = '<div class="skeleton" style="height:200px;width:100%;"></div>';
  try {
    const waiters = await apiFetch('/waiters');

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h3 style="font-size:1.125rem;font-weight:700;">Waiter Staff Roster (${waiters.length})</h3>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${waiters.map(w => `
          <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
            <div style="display:flex;align-items:center;gap:1rem;">
              <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--bg-surface-elevated);display:flex;align-items:center;justify-content:center;font-size:1.25rem;">
                🧑‍🍳
              </div>
              <div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <strong style="font-size:1rem;">${w.name}</strong>
                  <span class="badge ${w.is_online ? 'badge-accepted' : 'badge-closed'}">${w.is_online ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
                <div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:0.2rem;">
                  ${w.email} • Phone: ${w.phone}
                </div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:1.5rem;">
              <div style="text-align:right;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Workload</div>
                <div style="font-size:0.875rem;font-weight:600;">
                  Acc: <span style="color:var(--status-success);">${w.accepted_count}</span> | 
                  Miss: <span style="color:var(--status-warning);">${w.missed_count}</span> | 
                  Rej: <span style="color:var(--status-danger);">${w.rejected_count}</span>
                </div>
              </div>
              <button class="btn btn-outline btn-sm" data-toggle-waiter-id="${w.id}" data-current-online="${w.is_online}">
                ${w.is_online ? 'Set Offline' : 'Set Online'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    content.querySelectorAll('[data-toggle-waiter-id]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.toggleWaiterId;
        const current = btn.dataset.currentOnline === 'true';
        try {
          await apiFetch(`/waiters/${id}/status`, {
            method: 'PATCH',
            body: { is_online: !current },
          });
          showToast(`Updated waiter status.`, 'info');
          await renderStaffTab(content);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  } catch (err) {
    content.innerHTML = `<div class="card" style="color:var(--status-danger);">Failed to load staff roster: ${err.message}</div>`;
  }
}

async function renderMenuTab(content) {
  content.innerHTML = '<div class="skeleton" style="height:200px;width:100%;"></div>';
  try {
    const items = await apiFetch('/menu/items');

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h3 style="font-size:1.125rem;font-weight:700;">Menu Catalog Management (${items.length} items)</h3>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${items.map(item => `
          <div class="card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
            <div>
              <div style="font-size:1rem;font-weight:700;">${item.name}</div>
              <div style="font-size:0.875rem;color:var(--accent-gold);margin-top:0.2rem;">
                ₹${Number(item.price).toFixed(2)}
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span class="badge ${item.is_available ? 'badge-accepted' : 'badge-failed'}">
                ${item.is_available ? 'AVAILABLE' : 'SOLD OUT'}
              </span>
              <button class="btn btn-outline btn-sm" data-toggle-item-id="${item.id}" data-item-avail="${item.is_available}">
                ${item.is_available ? 'Mark Sold Out' : 'Mark Available'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    content.querySelectorAll('[data-toggle-item-id]').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.toggleItemId;
        const current = btn.dataset.itemAvail === 'true';
        try {
          await apiFetch(`/menu/items/${id}`, {
            method: 'PUT',
            body: { is_available: !current },
          });
          showToast('Updated item availability in catalog.', 'success');
          await renderMenuTab(content);
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  } catch (err) {
    content.innerHTML = `<div class="card" style="color:var(--status-danger);">Failed to load menu: ${err.message}</div>`;
  }
}

function renderSettingsTab(content) {
  content.innerHTML = `
    <div style="max-width:680px;" class="card">
      <h3 style="font-size:1.125rem;font-weight:700;margin-bottom:1.25rem;">Restaurant System Configuration</h3>
      <div class="form-group">
        <label class="form-label">Restaurant Name</label>
        <input type="text" class="form-input" value="${CONFIG.RESTAURANT_NAME}" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Table Roster Configuration</label>
        <input type="text" class="form-input" value="23 Tables Total: 18 Indoor (1-18), 5 Outdoor (19-23)" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Tax Rate (GST)</label>
        <input type="text" class="form-input" value="5.0% GST (Enforced Server-Side)" disabled />
      </div>
      <div class="form-group">
        <label class="form-label">Locked Routing Engine Rules</label>
        <div style="background:var(--bg-input);padding:0.75rem;border-radius:var(--radius-md);font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;">
          • 1st Attempt: 45 seconds countdown<br>
          • 2nd & 3rd Attempts: 30 seconds countdown<br>
          • Max Tries: 3 attempts before escalation to Manager<br>
          • Duplicate Suppression: 60-second cooldown rule<br>
          • Auto-Close: 10 minutes after acceptance
        </div>
      </div>
    </div>
  `;
}

function startAdminPolling() {
  if (adminPollTimer) clearInterval(adminPollTimer);
  adminPollTimer = setInterval(async () => {
    if (activeAdminTab === 'overview' || activeAdminTab === 'tables' || activeAdminTab === 'requests') {
      await renderActiveTab();
    }
  }, 4000);
}
