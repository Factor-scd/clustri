# ProxmoxDesktop

A cross-platform desktop application for managing Proxmox VE servers and clusters. Built with Tauri, React, and TypeScript.

## Features

### Phase 1: Foundation (Current)
- ✅ Multi-server connection management
- ✅ API token authentication
- ✅ Self-signed certificate handling (TOFU)
- ✅ OS keyring integration for secure credential storage
- ✅ Dashboard with cluster overview
- ✅ Node status monitoring
- ✅ Real-time resource usage tracking

### Planned Features
- VM & Container lifecycle management (start, stop, reboot, shutdown)
- Console access (noVNC for VMs, xterm.js for containers)
- Disk management (add, resize, remove, move)
- Network interface management
- Backup job management and restore
- Snapshot management
- System tray integration
- Command palette (Cmd/Ctrl+K)
- Automatic failover with primary/fallback endpoints

## Tech Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library (Radix UI + Tailwind)
- **TanStack Query** - Server state management
- **Zustand** - Client state management
- **Lucide React** - Icons

### Backend (Tauri)
- **Tauri 2** - Desktop app framework
- **Rust** - Backend logic
- **reqwest** - HTTP client with TLS support
- **keyring** - OS keyring integration
- **tokio** - Async runtime

## Prerequisites

### System Dependencies

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
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew dependencies
brew install rust
```

#### Windows
```powershell
# Install Visual Studio Build Tools
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "Desktop development with C++"

# Install Rust via rustup
winget install Rustlang.Rustup
```

### Node.js
```bash
# Install Node.js 20+ via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
```

### Rust
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ProxmoxDesktop

# Install Node.js dependencies
npm install

# Install Tauri CLI globally (optional)
npm install -g @tauri-apps/cli
```

## Development

### Run in Development Mode

```bash
# Start the Vite dev server
npm run dev

# In a separate terminal, run the Tauri app
npm run tauri dev
```

The app will automatically reload when you make changes to the frontend or backend code.

### Build for Production

```bash
# Build the application
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

### Run Tests

```bash
# Run linter
npm run lint

# Type check
npm run tsc --noEmit
```

## Project Structure

```
ProxmoxDesktop/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── layout/               # Layout components (Sidebar, Dashboard)
│   │   └── connections/          # Connection management UI
│   ├── hooks/                    # React Query hooks
│   ├── stores/                   # Zustand stores
│   ├── lib/                      # Utilities and Tauri IPC
│   ├── types/                    # TypeScript types
│   ├── App.tsx                   # Main app component
│   ├── main.tsx                  # Entry point
│   └── index.css                 # Global styles
├── src-tauri/                    # Tauri/Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── lib.rs                # Tauri commands and app setup
│   │   ├── connection.rs         # Connection manager
│   │   ├── proxmox.rs            # Proxmox API types
│   │   └── error.rs              # Error handling
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── package.json                  # Node.js dependencies
├── vite.config.ts                # Vite configuration
└── tsconfig.json                 # TypeScript configuration
```

## Architecture

### Frontend-Backend Communication

The frontend communicates with the Rust backend via Tauri's IPC (Inter-Process Communication):

```
React Component
    ↓
Tauri IPC (invoke)
    ↓
Rust Backend
    ↓
Proxmox API (HTTPS)
```

### Connection Management

The app supports multiple simultaneous connections to Proxmox servers/clusters:
- Each connection has a primary endpoint and optional fallback endpoints
- Automatic failover when the primary endpoint is unreachable
- Credentials stored securely in OS keyring
- Certificate fingerprints cached for TOFU (Trust On First Use)

### State Management

- **TanStack Query**: Server state (API data, caching, refetching)
- **Zustand**: Client state (UI state, active connection, preferences)

## Configuration

### Proxmox API Token

To generate an API token in Proxmox:
1. Go to Datacenter → Permissions → API Tokens
2. Click "Add"
3. Select a user (e.g., root@pam)
4. Enter a Token ID (e.g., "desktop")
5. Uncheck "Privilege Separation" for full access
6. Copy the token (format: `user@realm!tokenid=secret`)

### Connection Settings

When adding a connection, you'll need:
- **Connection Name**: A friendly name for the connection
- **Server URL**: The Proxmox server URL (e.g., `https://192.168.1.10:8006`)
- **API Token**: The API token generated above

## Troubleshooting

### Linux: Missing System Dependencies

If you see errors about missing libraries:
```bash
sudo apt install -y libwebkit2gtk-4.1-dev build-essential libssl-dev
```

### macOS: Code Signing Issues

For development, you may need to allow the app in System Preferences → Security & Privacy.

### Windows: Build Errors

Make sure you have:
- Visual Studio Build Tools with "Desktop development with C++"
- WebView2 (usually pre-installed on Windows 10/11)

### Self-Signed Certificates

The app will prompt you to trust self-signed certificates on first connection. The certificate fingerprint is stored for future connections.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and fix any issues
5. Submit a pull request

## License

MIT

## Acknowledgments

- [Proxmox VE](https://www.proxmox.com/en/proxmox-ve) - The amazing virtualization platform
- [Tauri](https://tauri.app/) - Build smaller, faster, more secure desktop apps
- [shadcn/ui](https://ui.shadcn.com/) - Beautifully designed components
