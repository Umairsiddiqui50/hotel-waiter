// Smart Table Service - UI Primitives (Toasts, Modals, Drawers)

export function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('sts-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sts-toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div style="flex:1;">${message}</div>
    <button style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.1rem;padding:0 0.25rem;" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector('button');
  closeBtn.onclick = () => {
    toast.remove();
  };

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }
}

export function showModal(title, bodyHtml, footerButtons = []) {
  closeModal(); // remove any existing
  const backdrop = document.createElement('div');
  backdrop.id = 'sts-active-modal';
  backdrop.className = 'modal-backdrop open';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  backdrop.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn btn-icon btn-outline" id="sts-modal-close" aria-label="Close modal">&times;</button>
      </div>
      <div class="modal-body">
        ${bodyHtml}
      </div>
      <div class="modal-footer" id="sts-modal-footer"></div>
    </div>
  `;

  const footer = backdrop.querySelector('#sts-modal-footer');
  if (footerButtons.length === 0) {
    footer.innerHTML = '<button class="btn btn-secondary" id="sts-modal-ok">Close</button>';
    backdrop.querySelector('#sts-modal-ok').onclick = closeModal;
  } else {
    footerButtons.forEach(btnConfig => {
      const b = document.createElement('button');
      b.className = btnConfig.className || 'btn btn-primary';
      b.textContent = btnConfig.text;
      b.onclick = () => {
        if (btnConfig.onClick) btnConfig.onClick();
        if (btnConfig.closeOnClick !== false) closeModal();
      };
      footer.appendChild(b);
    });
  }

  backdrop.querySelector('#sts-modal-close').onclick = closeModal;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  document.body.appendChild(backdrop);
}

export function closeModal() {
  const existing = document.getElementById('sts-active-modal');
  if (existing) existing.remove();
}
