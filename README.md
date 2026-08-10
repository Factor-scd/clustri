# Clustri

A cross-platform desktop client for managing Proxmox VE servers and clusters. The backend is Rust on Tauri 2; the UI is React 19 with TypeScript, Vite, and Tailwind CSS v4.

## Features

### Connections and authentication

- Manage multiple simultaneous connections to servers and clusters.
- Authenticate with an API token or with a username and password. Password mode uses ticket-based auth (PVEAuthCookie plus CSRF token).
- Credentials live in the OS keyring. API tokens never touch disk.
- Connections persist to `{app-config-dir}/clustri/connections.json`. The last active connection reconnects on launch.

### Cluster support

- On connect, the backend queries `/nodes` and `/cluster/status` and derives an endpoint URL for every cluster node, keeping the connection's scheme and port (default 8006) with the node's cluster IP (or name) as the host. The connected node is marked primary and the node list is stored with the connection.
- API requests route through an ordered, deduplicated endpoint list: the primary endpoint, configured fallbacks, then the discovered nodes. A connection refused, timeout, DNS, or transport failure retries the request on the next endpoint. Status is `connected` when the primary serves, `failover` while a fallback serves, and `failed` when every endpoint is unreachable.
- The frontend polls connection status every 10 seconds. The sidebar lists the cluster nodes with a live status dot per node (primary marked), shows a "Failover: {url}" note with an amber banner while on a fallback, and "Offline" when disconnected or failed.
- Connecting to another node of the same cluster (matched by cluster id) merges instead of duplicating: the new node's URL joins the existing connection as a fallback endpoint, the duplicate connection is removed, the active connection switches, and a toast explains what happened.

### Certificate handling (TOFU)

- On first connect, the app captures the server's TLS certificate and shows its SHA-256 fingerprint for confirmation.
- The fingerprint is pinned and verified on every subsequent connect. A per-connection "accept anyway" option covers cases where you knowingly replaced the server certificate.

### Dashboard and monitoring

- Cluster overview with a node health grid, resource gauges, an activity feed, and quick actions.
- Per-node view: resource usage, system information, and the VMs and containers on the node.

### VMs and containers (QEMU and LXC)

- List and filter VMs and containers.
- Lifecycle actions: start, stop, shutdown, reboot, suspend, resume, migrate.
- VM detail with overview, hardware, disks, network, snapshots, and console tabs.

### Storage and networking

- Disk management: list, add, resize, remove, move.
- Network interface management: list, add, edit, remove.
- Storage overview and per-storage detail.

### Snapshots and backups

- Snapshot list, create, delete, rollback.
- Backup jobs: list, create, edit, delete, run now. Restore or delete existing backups.

### Console

- noVNC for VMs and an xterm.js terminal for containers, with fullscreen and Ctrl+Alt+Del support.

### Tasks and events

- Task list with status filtering and a running-task indicator.
- A WebSocket relay in the backend forwards task, node, and VM events to the frontend. Polling remains the fallback.

### Interface

- Command palette (Ctrl/Cmd+K).
- System tray with a quick menu: show/hide, connection list, quit.
- Dark-first design with Geist for UI text, JetBrains Mono for data, and a single muted-orange accent. Light, dark, and system themes.

## Tech Stack

### Frontend

- React 19, TypeScript
- Vite, Tailwind CSS v4
- Radix UI-based components (shadcn-style)
- TanStack Query (server state), Zustand (client state)
- lucide-react icons, Recharts gauges, noVNC, xterm.js

### Backend

- Tauri 2
- reqwest with rustls for HTTP, keyring for the OS keyring, tokio for async
- rustls, x509-cert, and sha2 for certificate capture and fingerprinting
- tokio-tungstenite for the WebSocket relay

### Development and testing

- httpmock, rcgen, and tempfile for Rust tests
- oxlint for frontend linting

## Architecture

### Frontend to backend

The React frontend calls Rust commands over Tauri IPC. The backend proxies them to the Proxmox API over HTTPS.

```
React component
  → Tauri invoke
  → Rust command
  → Proxmox API ({base}/api2/json{path})
```

### API core

A Rust `ConnectionManager` owns one HTTP client per connection. A shared `api_request` core builds the `{base}/api2/json{path}` URL, injects auth (`PVEAPIToken` header for token mode; `PVEAuthCookie` and `CSRFPreventionToken` for password mode), unwraps the `{data}` envelope, and maps errors to the frontend.

The same core routes each request through an ordered, deduplicated endpoint list: the primary endpoint, configured fallbacks, then the discovered cluster nodes. On a connect, timeout, DNS, or transport failure it retries on the next endpoint, and the connection's runtime status tracks whether the primary (`connected`), a fallback (`failover`), or no endpoint (`failed`) served the last request.

Tauri commands cover: connection add/remove/update/load, connect/disconnect, set active; password and token login, logout, stored credentials; certificate info and trust; nodes, VMs, storage, storage content and detail, tasks, cluster status; QEMU and LXC lifecycle and migration; disks, NICs, snapshots; VNC and terminal proxies; websocket URL; backup jobs and restore; and the tray menu.

### TLS

Proxmox nodes typically run self-signed certificates, so the transport accepts them and the app enforces trust itself. On first connect the certificate is captured in `src-tauri/src/tls.rs`, its SHA-256 fingerprint is shown for confirmation, and the fingerprint is pinned and checked on every later connect.

Fingerprint pinning runs at connect time against the node you connected to. Fallback and discovered endpoints are used only in degraded failover mode and get no pin check of their own; the transport already accepts their self-signed certificates. This is a deliberate trade-off to keep failover automatic in home-lab setups.

### Real-time events

A WebSocket manager connects to the Proxmox event API and relays task, node, and VM events as Tauri events. The frontend falls back to polling when the socket is not connected.

### State management

TanStack Query handles server state (fetching, caching, refetching). Zustand handles client state (active connection, UI, preferences).

## Prerequisites

### System dependencies

#### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libwebkit2gtk-4.1-dev \
  webkit2gtk-driver
```

#### macOS

```bash
xcode-select --install
brew install rust
```

#### Windows

- Install Visual Studio Build Tools and select "Desktop development with C++".
- Install Rust via rustup: `winget install Rustlang.Rustup`

### Node.js

Node.js 20 or newer (nvm recommended):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

### Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

## Installation

```bash
git clone <repository-url>
cd clustri
npm install
```

The Tauri CLI is a devDependency, so `npm run tauri ...` works without a global install.

## Development

### Run in the browser (mock data)

```bash
npm run dev
```

Starts the Vite dev server. The frontend runs in a browser with mock data and no Tauri backend. Useful for UI work.

### Run the desktop app

```bash
npm run tauri dev
```

Starts the full app. Frontend and backend changes reload automatically.

### Build

```bash
npm run build          # type-check and bundle the frontend
npm run tauri build    # production bundle in src-tauri/target/release/bundle/
```

### Lint

```bash
npm run lint
```

## Testing

```bash
cargo test
```

64 Rust tests cover the API client (against mocked HTTP responses via httpmock), TLS capture and pinning, connection persistence, and every endpoint group. The frontend is exercised in the browser mock mode described above.

### Verifying against a real server

The backend was developed against the documented Proxmox VE API using mocked HTTP responses. There is no live-server test suite yet. To verify against real infrastructure:

1. Run `cargo test`.
2. Run `npm run tauri dev`.
3. Add a connection to a real Proxmox node (`https://host:8006`).
4. Confirm the certificate fingerprint matches the one shown in the Proxmox web UI (Datacenter → Options, or the node's `/etc/pve/local/pve-ssl.pem`).
5. Spot-check VM lifecycle actions, storage, backups, and the console.

Cluster discovery, failover, and same-cluster merging are covered by Rust tests using mocked HTTP (httpmock) and connection-refused simulations on closed ports. To verify them on real hardware, connect to one node of a multi-node cluster and confirm the sidebar lists the other nodes. Stop the connected node's API service, or block its port 8006 with a firewall rule, and check that the connection flips to failover and data keeps loading.

## Configuration

### Proxmox API token

1. In the Proxmox web UI, go to Datacenter → Permissions → API Tokens.
2. Click Add.
3. Select a user (for example, `root@pam`).
4. Enter a token ID (for example, `desktop`).
5. Uncheck Privilege Separation for full access.
6. Copy the token. It looks like `user@realm!tokenid=secret`.

### Connection settings

When adding a connection you need:

- **Name**: a friendly name for the connection
- **Server URL**: for example `https://192.168.1.10:8006`
- **Auth**: an API token, or a username and password (stored in the OS keyring; sessions use ticket auth)

## Project Structure

```
clustri/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # base components (buttons, dialogs, toasts)
│   │   ├── layout/               # sidebar, dashboard shell
│   │   ├── connections/          # connection manager and dialog
│   │   ├── dashboard/            # node health grid, gauges, activity feed, quick actions
│   │   ├── nodes/                # node list and detail
│   │   ├── vms/                  # VM/container lists, detail tabs
│   │   ├── console/              # noVNC and xterm consoles
│   │   ├── storage/              # storage overview and detail
│   │   ├── backups/              # backup jobs and backups
│   │   ├── tasks/                # task list and status bar
│   │   ├── settings/             # settings page, theme switcher
│   │   └── command/              # command palette
│   ├── hooks/                    # useProxmox, useWebSocket (TanStack Query)
│   ├── stores/                   # Zustand stores (connections, UI)
│   ├── lib/                      # tauri.ts IPC bindings, format helpers
│   ├── types/                    # TypeScript types
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── src-tauri/                    # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs               # binary entry point
│   │   ├── lib.rs                # Tauri commands, app setup, tray menu
│   │   ├── connection.rs         # ConnectionManager, api_request core
│   │   ├── proxmox.rs            # Proxmox API types
│   │   ├── tls.rs                # certificate capture and TOFU pinning
│   │   ├── websocket.rs          # WebSocket event relay
│   │   └── error.rs              # error mapping
│   ├── tests/                    # integration tests (httpmock, rcgen, tempfile)
│   │   ├── api_client.rs
│   │   ├── api_commands.rs
│   │   ├── api_console.rs
│   │   ├── api_disk_network.rs
│   │   ├── api_snapshots_backups.rs
│   │   ├── persistence.rs
│   │   └── tls.rs
│   ├── capabilities/             # Tauri permissions
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Troubleshooting

### Linux: missing system dependencies

```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential libssl-dev
```

### macOS: code signing

For development builds, allow the app in System Settings → Privacy & Security when prompted.

### Windows: build errors

Make sure you have Visual Studio Build Tools with "Desktop development with C++" and WebView2 (preinstalled on Windows 10 and 11).

### Self-signed certificates

On first connect the app shows the server certificate's SHA-256 fingerprint. Compare it against the fingerprint in the Proxmox web UI before trusting it. If the certificate changes later, the app blocks the connection until you confirm the new fingerprint. Use the "accept anyway" option only when you intentionally replaced the server certificate.

## Contributing

Contributions are welcome. Please:

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run `npm run lint` and `cargo test`, and fix any issues.
5. Submit a pull request.

## License

MIT
