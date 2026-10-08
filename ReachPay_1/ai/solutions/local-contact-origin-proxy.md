# Local API origin alignment

The local API now supplies the Vite development origin (`http://localhost:5173`) only when not running in production and no explicit origin was configured. This keeps local form requests same-origin through the Vite proxy, while production still requires `PUBLIC_SITE_URL`.
