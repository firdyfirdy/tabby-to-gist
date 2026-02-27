# Tabby to Gist Sync

A lightweight [Tabby Terminal](https://tabby.sh/) plugin that seamlessly syncs your `config.yaml` to a private GitHub Gist, enabling configuration roaming across all your devices.

## Features

- **Secure by Design**: Uses Tabby's native Vault storage to securely manage your GitHub Personal Access Token (PAT).
- **Step-by-Step UI**: Simple guided setup process directly in the Tabby Settings panel.
- **Auto Gist Creation**: Automatically creates a private Gist for you if you don't already have one.
- **Configurable Auto-Sync**: Automatically pushes your local changes to the Gist based on a configurable polling interval.
- **Atomic Writes**: Safe and reliable config loading to prevent corruption.
- **SSH Key Generator**: Built-in tool to generate Ed25519, ECDSA, and RSA key pairs locally in proper OpenSSH format, with one-click copy and export.

## How to Build and Deploy Locally

### Prerequisites
- Node.js installed
- Tabby Terminal installed

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/firdyfirdy/tabby-to-gist.git
   cd tabby-to-gist
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the plugin:**
   This will compile the TypeScript and Angular components into the `dist/` folder using Webpack.
   ```bash
   npm run build
   ```

4. **Deploy to Tabby:**
   To install the plugin locally in your Tabby client, you need to copy or link the plugin directory to Tabby's plugin folder.

   **Method A: Symlink/Junction (Recommended for development)**
   Link your project folder so that you don't have to copy files every time you rebuild.
   - On **Windows** (Run as Administrator or in PowerShell):
     ```powershell
     New-Item -ItemType Junction -Path "$env:APPDATA\tabby\plugins\node_modules\tabby-to-gist" -Target "C:\path\to\your\tabby-to-gist"
     ```
   - On **macOS / Linux**:
     ```bash
     ln -s /path/to/your/tabby-to-gist ~/.config/tabby/plugins/node_modules/tabby-to-gist
     ```

   **Method B: Manual Copy**
   Copy the `package.json` and the built `dist/` folder directly toTabby's `node_modules`.
   ```bash
   mkdir -p ~/.config/tabby/plugins/node_modules/tabby-to-gist
   cp package.json ~/.config/tabby/plugins/node_modules/tabby-to-gist/
   cp -r dist ~/.config/tabby/plugins/node_modules/tabby-to-gist/
   ```

5. **Restart Tabby**
   Fully close and reopen Tabby. The "Gist Sync" tab should now appear in the Settings sidebar.

## Setup Instructions

1. Go to Tabby Settings > **Gist Sync**.
2. **Step 1:** Generate a [GitHub Personal Access Token](https://github.com/settings/tokens/new) with the `gist` scope. Paste it and save.
3. **Step 2:** Paste an existing private Gist ID or click "Auto Create New" to generate one.
4. **Step 3:** Turn on **Enable Sync**.

*Created by Tri Firdyanto.*
