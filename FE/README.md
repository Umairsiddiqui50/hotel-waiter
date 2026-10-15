# Frontend (FE) — Smart Table Service & Waiter Routing System

This directory houses the complete frontend client application for the **Grand Bistro & Cafe** Restaurant Platform.

## Architecture

```text
FE/
├── index.html                   # Central portal entry point
├── assets/
│   ├── css/
│   │   ├── main.css             # Theme variables, typography, reset, header, navigation, and imports
│   │   ├── customer.css         # Customer menu, cart drawer, quick service actions, badges
│   │   ├── waiter.css           # Waiter workstation, alert pulse countdown, workload pill
│   │   └── manager.css          # 23-table live floor map, waiter roster, alert log
│   ├── js/
│   │   ├── main.js              # Application orchestrator and client router
│   │   ├── api.js               # Central HTTP client (apiFetch, ApiError, CONFIG)
│   │   ├── auth.js              # Token and session manager (sessionStorage only)
│   │   ├── customer.js          # Customer screen controller
│   │   ├── waiter.js            # Waiter dashboard controller
│   │   ├── manager.js           # Manager operational console controller
│   │   └── components.js        # Reusable UI components (Toast, Modal, Audio, Store, i18n)
│   └── images/
│       └── logo.svg             # SVG vector logo
├── pages/
│   ├── customer/index.html      # Deep-link customer QR dining entry
│   ├── waiter/index.html        # Waiter workstation portal
│   ├── manager/index.html       # Manager console portal
│   └── auth/index.html          # Staff login portal
└── README.md
```

## Security & API Design Rules
1. **Token Storage**: Staff JWT access tokens are stored in `sessionStorage` (never in `localStorage`) to protect against persistent XSS and leakage across browser sessions.
2. **Backend Communication**: All backend communication uses documented HTTP APIs under `/api/v1/`.
3. **No Direct Database Access**: The frontend has no knowledge of database internals or connection strings.

## Running the Frontend Locally

### Option 1: Via the Root Entry Point
```powershell
python start.py --frontend
```

### Option 2: Using Python Built-in Web Server
```powershell
python -m http.server 3000 --directory FE
```
Then navigate to: `http://localhost:3000/#/customer?table=7`
