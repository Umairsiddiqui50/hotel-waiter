// Smart Table Service - Kitchen Display System (KDS) View
import { CONFIG } from '../config.js';
import { apiFetch } from '../api.js';
import { showToast } from '../ui.js';

let kitchenPollTimer = null;

export async function renderKitchenView(params) {
  const container = document.getElementById('sts-app-view');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.5rem;">
      <div>
        <h1 style="font-size:1.5rem;font-weight:700;">Kitchen Order Tickets (KDS)</h1>
        <p style="font-size:0.875rem;color:var(--text-secondary);">Real-time live kitchen preparation screen</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <span class="badge badge-accepted">Live Kitchen Sync</span>
      </div>
    </div>

    <!-- KDS Columns Grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:1.25rem;" id="kds-columns-container">
      <div class="card" style="background:#0E1422;min-height:400px;">
        <h3 style="font-size:1rem;font-weight:700;color:var(--status-warning);margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">
          <span>⏳ RECEIVED</span>
          <span class="badge badge-pending" id="kds-cnt-confirmed">0</span>
        </h3>
        <div id="kds-col-confirmed" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
      </div>

      <div class="card" style="background:#0E1422;min-height:400px;">
        <h3 style="font-size:1rem;font-weight:700;color:var(--status-info);margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">
          <span>🍳 PREPARING</span>
          <span class="badge badge-assigned" id="kds-cnt-preparing">0</span>
        </h3>
        <div id="kds-col-preparing" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
      </div>

      <div class="card" style="background:#0E1422;min-height:400px;">
        <h3 style="font-size:1rem;font-weight:700;color:var(--status-success);margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">
          <span>🔔 READY FOR PICKUP</span>
          <span class="badge badge-accepted" id="kds-cnt-ready">0</span>
        </h3>
        <div id="kds-col-ready" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
      </div>

      <div class="card" style="background:#0E1422;min-height:400px;">
        <h3 style="font-size:1rem;font-weight:700;color:var(--text-secondary);margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;">
          <span>✓ SERVED</span>
          <span class="badge badge-closed" id="kds-cnt-served">0</span>
        </h3>
        <div id="kds-col-served" style="display:flex;flex-direction:column;gap:0.75rem;"></div>
      </div>
    </div>
  `;

  await pollKitchenOrders();
  startKitchenPolling();
}

async function pollKitchenOrders() {
  try {
    const orders = await apiFetch('/orders?limit=40');
    renderKdsCards(orders || []);
  } catch (err) {
    console.error('KDS poll error:', err);
  }
}

function renderKdsCards(orders) {
  const confirmedCol = document.getElementById('kds-col-confirmed');
  const preparingCol = document.getElementById('kds-col-preparing');
  const readyCol = document.getElementById('kds-col-ready');
  const servedCol = document.getElementById('kds-col-served');

  if (!confirmedCol || !preparingCol || !readyCol || !servedCol) return;

  const confirmed = orders.filter(o => o.status === 'CONFIRMED');
  const preparing = orders.filter(o => o.status === 'PREPARING');
  const ready = orders.filter(o => o.status === 'READY');
  const served = orders.filter(o => o.status === 'SERVED');

  document.getElementById('kds-cnt-confirmed').textContent = confirmed.length;
  document.getElementById('kds-cnt-preparing').textContent = preparing.length;
  document.getElementById('kds-cnt-ready').textContent = ready.length;
  document.getElementById('kds-cnt-served').textContent = served.length;

  confirmedCol.innerHTML = confirmed.map(o => renderTicket(o, 'Start Cooking', 'PREPARING', 'btn-primary')).join('');
  preparingCol.innerHTML = preparing.map(o => renderTicket(o, 'Mark Ready', 'READY', 'btn-success')).join('');
  readyCol.innerHTML = ready.map(o => renderTicket(o, 'Mark Served', 'SERVED', 'btn-secondary')).join('');
  servedCol.innerHTML = served.slice(0, 5).map(o => renderTicket(o, null, null, '')).join('');

  document.querySelectorAll('[data-kds-advance]').forEach(btn => {
    btn.onclick = async () => {
      const orderId = btn.dataset.orderId;
      const nextStatus = btn.dataset.kdsAdvance;
      try {
        await apiFetch(`/orders/${orderId}/status`, {
          method: 'PATCH',
          body: { status: nextStatus },
        });
        showToast(`Order #${orderId} moved to ${nextStatus}`, 'success');
        await pollKitchenOrders();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  });
}

function renderTicket(order, actionText, nextStatus, btnClass) {
  const items = order.items || [];
  return `
    <div class="card" style="padding:1rem;background:var(--bg-surface);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
        <span class="sts-table-badge" style="font-size:0.75rem;">Table ${order.table_id || 'Walk-in'}</span>
        <span style="font-size:0.75rem;color:var(--text-muted);">#${order.id}</span>
      </div>

      <div style="margin:0.5rem 0;font-size:0.875rem;">
        ${items.map(i => `
          <div style="display:flex;justify-content:space-between;padding:0.2rem 0;">
            <strong>${i.quantity}x ${i.item_name}</strong>
          </div>
        `).join('')}
      </div>

      ${order.special_instructions ? `
        <div style="background:var(--bg-input);padding:0.4rem 0.6rem;border-radius:var(--radius-sm);font-size:0.75rem;color:var(--status-warning);margin:0.5rem 0;">
          Note: ${order.special_instructions}
        </div>
      ` : ''}

      ${actionText ? `
        <button class="btn ${btnClass} btn-sm" style="width:100%;margin-top:0.5rem;" data-order-id="${order.id}" data-kds-advance="${nextStatus}">
          ${actionText}
        </button>
      ` : `
        <div style="text-align:center;font-size:0.75rem;color:var(--status-success);margin-top:0.25rem;">✓ Delivered</div>
      `}
    </div>
  `;
}

function startKitchenPolling() {
  if (kitchenPollTimer) clearInterval(kitchenPollTimer);
  kitchenPollTimer = setInterval(pollKitchenOrders, 3000);
}
