// Smart Table Service - Client-side Router
// Pure hash-based routing: #/customer, #/waiter/login, #/waiter/dashboard, #/admin/login, #/admin/dashboard, #/kitchen

export class Router {
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

    // Split route and search parameters in hash (e.g. #/customer?table=7)
    const [pathPart, queryPart] = hash.slice(2).split('?');
    const path = '/' + (pathPart || 'customer');
    this.params = new URLSearchParams(queryPart || '');

    // Check if table param is in regular window query or hash
    const regularQuery = new URLSearchParams(window.location.search);
    const tableRef = this.params.get('table') || regularQuery.get('table');
    if (tableRef) {
      this.params.set('table', tableRef);
    }

    // Match route handler
    let handler = this.routes[path];
    if (!handler) {
      if (path.startsWith('/waiter')) handler = this.routes['/waiter/dashboard'] || this.routes['/waiter/login'];
      else if (path.startsWith('/admin')) handler = this.routes['/admin/dashboard'] || this.routes['/admin/login'];
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
