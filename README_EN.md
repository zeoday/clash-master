<p align="center">
  <img src="./assets/icon-neko-master.png" width="200" alt="Neko Master Logo" style="margin-bottom: 16px;">
  <br>
  <b style="font-size: 32px;">Neko Master</b>
</p>

<p align="center">
  <b>Visualize your network traffic at a glance.</b><br>
  <span>Real-time Monitoring · Traffic Auditing · Multi-gateway Management</span>
</p>

<p align="center">
  <a href="https://github.com/foru17/neko-master/stargazers"><img src="https://img.shields.io/github/stars/foru17/neko-master?style=flat-square&color=yellow" alt="Stars"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/pulls/foru17/neko-master?style=flat-square&color=blue&logo=docker" alt="Docker Pulls"></a>
  <a href="https://hub.docker.com/r/foru17/neko-master"><img src="https://img.shields.io/docker/v/foru17/neko-master?style=flat-square&label=Docker&color=2496ED" alt="Docker Version"></a>
  <a href="https://github.com/foru17/neko-master/blob/main/LICENSE"><img src="https://img.shields.io/github/license/foru17/neko-master?style=flat-square&color=green" alt="License"></a>
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=node.js">
</p>

> [!IMPORTANT]
> **Disclaimer**
>
> This project is a **network traffic analysis and visualization tool**, designed to display and audit traffic data from your local gateway.
>
> This project **does NOT provide any network access services, proxy subscriptions, or cross-network connection capabilities**.
> All data comes from the user's own network environment.
>
> Please use this software in compliance with local laws and regulations.

![Neko Master Overview](./assets/neko-master-overview.png)
![Neko Master Rules](./assets/neko-master-rules.png)
![Neko Master Regions](./assets/neko-master-regions.png)

## 🌐 Live Demo

**Demo URL**: https://neko-master.is26.com  
**Password**: `neko2026`

> The demo is in read-only showcase mode with limited functionality.

## About the Name

**Neko** (ねこ) means "cat" in Japanese, pronounced as **/ˈneɪkoʊ/** (NEH-ko).

Just like a cat—quiet yet keen—Neko Master focuses on lightweight, precise analysis and visualization of network traffic.

## 📋 Table of Contents

- [🚀 Quick Start](#-quick-start)
- [📖 First Time Setup](#-first-time-setup)
- [🔧 Port Conflict Resolution](#-port-conflict-resolution)
- [🔐 Authentication & Security](#-authentication--security)
- [🐳 Docker Configuration](#-docker-configuration)
- [🌐 Reverse Proxy & Tunnel](#-reverse-proxy--tunnel)
- [❓ FAQ](#-faq)
- [📁 Project Structure](#-project-structure)
- [🛠️ Tech Stack](#️-tech-stack)
- [📝 Changelog](./CHANGELOG.en.md)
- [📄 License](#-license)

## 🚀 Quick Start

### Method 1: Docker Compose (Recommended)

#### Scenario A: Minimal Deployment (Expose 3000 Only)

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

> This mode is fully compatible with upgrades.
> It will automatically fall back to HTTP polling refreshing if WebSocket is not connected.

#### Scenario B: Real-time WebSocket (Recommended with Reverse Proxy)

```yaml
services:
  neko-master:
    image: foru17/neko-master:latest
    container_name: neko-master
    restart: unless-stopped
    ports:
      - "3000:3000" # Web UI
      - "3002:3002" # WebSocket (For Nginx / Tunnel forwarding)
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DB_PATH=/app/data/stats.db
```

Start the service:

```bash
docker compose up -d
```

Visit <http://localhost:3000>

### Method 2: Docker Run

```bash
# Minimal (3000 only)
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest

# Real-time WS (with reverse proxy)
docker run -d \
  --name neko-master \
  -p 3000:3000 \
  -p 3002:3002 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  foru17/neko-master:latest
```

> The API uses the same domain `/api` by default, so exposing 3001 is usually unnecessary.
> If you want Real-time WebSocket, ensure the reverse proxy can access `3002`. It falls back to HTTP polling (approx. 5s interval) if not connected.

Visit <http://localhost:3000>

> To customize external ports (docker run), add:
> `-e WEB_EXTERNAL_PORT=8080 -e API_EXTERNAL_PORT=8081 -e WS_EXTERNAL_PORT=8082`

### Method 3: One-Click Script

Automatically detects port conflicts and configures accordingly. Suitable for users unfamiliar with Docker:

```bash
# Using curl
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash

# Or using wget
wget -qO- https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

The script will automatically:

- ✅ Download `docker-compose.yml`
- ✅ Check if default ports (3000/3001/3002) are occupied
- ✅ Provide available alternative ports
- ✅ Create configuration file and start the service

### Method 4: Run from Source

```bash
# 1. Clone repo
git clone https://github.com/foru17/neko-master.git
cd neko-master

# 2. Install dependencies
pnpm install

# 3. Start development server
pnpm dev
```

Visit <http://localhost:3000>

## 📖 First Time Setup

![First Time Setup](./assets/neko-master-setup.png)

1. Open <http://localhost:3000>
2. A **Gateway Configuration** dialog will appear on first visit.
3. Fill in your network gateway (e.g., OpenClash) connection info:
   - **Name**: Custom name (e.g., "Home Gateway")
   - **Host**: Gateway backend IP (e.g., `192.168.101.1`)
   - **Port**: Gateway backend port (e.g., `9090`)
   - **Token**: Fill in if Secret is configured, otherwise leave empty
4. Click "Add Backend" to save.
5. The system will start collecting and analyzing traffic data.

> 💡 **Get Gateway Address**: Go to your gateway panel (e.g., OpenClash) → Open "External Control" → Copy API Address.

## 🔧 Port Conflict Resolution

If you see an error about ports being occupied, here are the solutions:

### Option 1: Use .env File

Create a `.env` file (same directory as `docker-compose.yml`):

```env
WEB_EXTERNAL_PORT=8080    # Modify Web UI port
API_EXTERNAL_PORT=8081    # Modify API port
WS_EXTERNAL_PORT=8082     # Modify WebSocket external port (for direct connection)
```

Then restart:

```bash
docker compose down
docker compose up -d
```

Now visit <http://localhost:8080>

### Option 2: Modify docker-compose.yml Directly

```yaml
ports:
  - "8080:3000" # External 8080 -> Internal 3000
  - "8082:3002" # External 8082 -> Internal 3002 (for reverse proxy/tunnel forwarding WS)
```

> Note: The frontend reads the external port configuration at runtime, no need to set `NEXT_PUBLIC_WS_PORT` manually.

### Option 3: Use One-Click Script

```bash
curl -fsSL https://raw.githubusercontent.com/foru17/neko-master/main/setup.sh | bash
```

The script automatically detects and provides available ports.

## 🔐 Authentication & Security

Neko Master supports access authentication to protect your dashboard data security.

### Enable/Disable Authentication

1. Enter the dashboard and click "Settings" at the bottom of the left sidebar.
2. Switch to the "Security" tab.
3. On this page, you can enable/disable access control and set an access token.

### Forgot Password (Reset Access Token)

If you forget your access token, you can force entering **Emergency Access Mode** via the environment variable `FORCE_ACCESS_CONTROL_OFF`.

#### Docker Compose Users

1. Modify `docker-compose.yml` and add under `environment`:

   ```yaml
   environment:
     - FORCE_ACCESS_CONTROL_OFF=true
   ```

2. Restart the container:

   ```bash
   docker compose up -d
   ```

3. Refresh the page, and you will see an "Emergency Access Mode" warning. You can now reset a new token in "Settings -> Security" without the old password.

4. **IMPORTANT**: After resetting, make sure to remove this environment variable and restart the container again to restore access control.

#### Docker CLI Users

1. Stop and remove the old container (data in mounted volumes will not be lost):

   ```bash
   docker stop neko-master
   docker rm neko-master
   ```

2. Add the `-e FORCE_ACCESS_CONTROL_OFF=true` parameter and restart:

   ```bash
   docker run -d \
     --name neko-master \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     -e FORCE_ACCESS_CONTROL_OFF=true \
     foru17/neko-master:latest
   ```

3. After resetting the password, stop the container again, remove the parameter, and restart to restore normal protection mode.

## 🐳 Docker Configuration

### Ports

| Port | Usage | Required Externally | Description |
| :--: | :---: | :---: | :--- |
| 3000 | Web UI | ✅ | Frontend access entry |
| 3001 | API | Optional | Default same-origin `/api`, usually no need to expose |
| 3002 | WebSocket | Optional | Real-time push port, recommended for reverse proxy forwarding only |

### Environment Variables (Docker)

| Variable              | Default              | Description                                      | When to Set               |
| :-------------------- | :------------------- | :----------------------------------------------- | :------------------------ |
| `WEB_PORT`            | `3000`               | Web service listening port (internal)            | Usually unchanged         |
| `API_PORT`            | `3001`               | API service listening port (internal)            | Usually unchanged         |
| `COLLECTOR_WS_PORT`   | `3002`               | WS service listening port (internal)             | Usually unchanged         |
| `DB_PATH`             | `/app/data/stats.db` | SQLite data file path                            | Custom data directory     |
| `WEB_EXTERNAL_PORT`   | `3000`               | Injected external Web port for frontend display  | External mapping change   |
| `API_EXTERNAL_PORT`   | `3001`               | Injected external API port for frontend          | Direct API connection     |
| `WS_EXTERNAL_PORT`    | `3002`               | Injected external WS port for frontend           | Direct WS connection      |
| `NEXT_PUBLIC_API_URL` | Empty                | Force frontend API base URL (override `/api`)    | API not same-origin       |
| `NEXT_PUBLIC_WS_URL`  | Auto `/_cm_ws`       | Custom frontend WS URL (override default)        | Custom path/domain only   |

### API / WS Address Resolution Priority

1. API: `runtime-config(API_URL)` → `NEXT_PUBLIC_API_URL` → Default same-origin `/api`
2. WS: `runtime-config(WS_URL)` → `NEXT_PUBLIC_WS_URL` → Auto-inferred
3. Default uses same-origin `/_cm_ws`, generally no manual config needed unless using custom routing.

## 🌐 Reverse Proxy & Tunnel

Recommended to host Web and WS under the same domain, forwarding via different paths: `/` → `3000`, `/_cm_ws` → `3002`.

### Nginx Example (Recommended)

```nginx
server {
  listen 443 ssl http2;
  server_name neko.example.com;

  location / {
    proxy_pass http://<neko-master-host>:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location ^~ /_cm_ws {
    proxy_pass http://<neko-master-host>:3002;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_buffering off;
  }
}
```

配套 Docker environment:

```env
# Default no config needed (defaults to /_cm_ws)
# If custom path needed:
# NEXT_PUBLIC_WS_URL=/custom_ws
```

### Cloudflare Tunnel Example

`~/.cloudflared/config.yml`:

```yaml
tunnel: <your-tunnel-name-or-id>
credentials-file: /path/to/<credentials>.json

ingress:
  - hostname: neko.example.com
    path: /_cm_ws*
    service: http://localhost:3002
  - hostname: neko.example.com
    path: /*
    service: http://localhost:3000
  - service: http_status:404
```

Start:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run <your-tunnel-name-or-id>
```

If using Zero Trust Dashboard, ensure `/_cm_ws*` rule is placed **before** `/*`.

### Key Notes

1. Do NOT use `ws` (without leading `/`) for WS path, it may match static assets like `/_next/static/...` causing `426 Upgrade Required`.
2. WS route must have higher priority than catch-all route (`/*`).
3. `NEXT_PUBLIC_WS_URL` is usually not needed; if customized, restart frontend.
4. Mapping only `3000` works but falls back to HTTP polling (slower).
5. Third-party script failures (e.g., `beacon.min.js`) usually don't affect main functionality.
6. No separate `/api` proxy needed by default (frontend forwards `/api` internally to `3001`).

### Multi-Arch Support

Docker image supports both `linux/amd64` and `linux/arm64`.

### Data Persistence

Data defaults to `/app/data` inside container. Map it to host recommended:

```yaml
volumes:
  - ./data:/app/data
```

### Update to Latest

```bash
docker compose pull
docker compose up -d
```

## ❓ FAQ

### Q: "Port already occupied" error?

**A:** See [Port Conflict Resolution](#-port-conflict-resolution). Easiest way is to modify ports via `.env`.

### Q: Cannot access after changing port?

**A:** Ensure:
1. `.env` file updated.
2. Service restarted: `docker compose restart`.
3. Visiting with new port (e.g., `http://localhost:8080`).

### Q: Upgrading from old version, only mapping 3000?

**A:** Compatible. Page works, automatically falls back to HTTP polling if WS not connected.
For real-time experience, configure reverse proxy path (e.g., `/_cm_ws`) to `3002`.

### Q: Unstable connection / Upgrade Required error?

**A:** Often due to WS route matching too broadly (catching static files). Check:
1. Use `/_cm_ws*` path for WS.
2. Priority higher than `/*`.

### Q: OpenClash connection failed?

**A:** Check:
1. OpenClash "External Control" enabled.
2. Correct Host/Port.
3. Secret Token matches (if set).
4. Container network connectivity to OpenClash.

### Q: How to view logs?

**A:** `docker logs -f neko-master`

### Q: How to backup data?

**A:** Backup the mapped directory (default `./data/stats.db`).

### Q: How to clear history?

**A:** Settings -> Database -> Select range to clear.

## 📁 Project Structure

```
neko-master/
├── docker-compose.yml      # Docker Compose config
├── Dockerfile              # Docker build
├── setup.sh                # Setup script
├── docker-start.sh         # Container start script
├── start.sh                # Dev start script
├── assets/                 # Assets
├── apps/
│   ├── collector/          # Node.js + WebSocket service
│   └── web/                # Next.js frontend
└── packages/
    └── shared/             # Shared types
```

## 🛠️ Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **UI**: shadcn/ui
- **Collector**: Node.js + Fastify + WebSocket + SQLite
- **Viz**: Recharts + D3.js
- **i18n**: next-intl
- **Deploy**: Docker + Docker Compose

## 📄 License

MIT License © 2024 [foru17](https://github.com/foru17)
