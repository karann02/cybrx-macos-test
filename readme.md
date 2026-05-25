# CybrX Agent — Installation & Build Guide

> **Developer note:** Update this file whenever code changes are made.

## What is CybrxAgent?
A secure background monitoring and automation agent. Runs **silently as a system service** — no UI, no manual launching required. Starts automatically on boot/login and restarts automatically if it ever stops.

---

## 📑 Table of Contents
- [What is CybrxAgent?](#what-is-cybrxagent)
- [📋 Prerequisites (all platforms)](#-prerequisites-all-platforms)
- [🪟 Windows](#-windows)
  - [Install](#install)
  - [Uninstall](#uninstall)
  - [Config location](#config-location)
- [🐧 Linux](#-linux)
  - [Option 1 — \`.rpm\`](#option-1--rpm-rocky--rhel--centos--fedora--almalinux)
  - [Option 2 — \`.deb\`](#option-2--deb-ubuntu--debian--mint)
  - [Option 3 — \`.tar.gz\`](#option-3--targz-portable-for-any-linux)
  - [Option 4 — AppImage](#option-4--appimage-desktop-testing)
- [🔧 Install script summary](#-install-script-summary)
- [🍎 macOS](#-macos)
- [🏗️ Build from Source](#️-build-from-source)
- [⚠️ Common mistakes](#️-common-mistakes)
- [📁 Config file locations](#-config-file-locations)
- [Installation Flow for Linux](#installation-flow-for-linux)
- [📂 Build folder structure](#-build-folder-structure)
- [🧪 Testing & Debugging Commands](#-testing--debugging-commands)
- [Electron Store](#electron-store)

---

## 📋 Prerequisites (all platforms)

You need a **`license.conf`** file provided by CybrX at the time of licensing.
Keep it in a **permanent location** (e.g. `/root/license.conf` or `/etc/cybrx/license.conf` — **never** inside `dist/`).

---

## 🪟 Windows

### Install
1. Download `CybrxAgent-Setup-x.x.x.exe`
2. Run **as Administrator**
3. Browse to your `license.conf` when prompted
4. Complete the wizard — agent installs and starts automatically as a Windows Service

### Uninstall
```
Control Panel → Programs → CybrxAgent → Uninstall
```
Or silent: `"C:\Program Files\CybrxAgent\Uninstall CybrxAgent.exe" /S`

### Config location
```
%APPDATA%\CybrxAgent\license.conf
```

---

## 🐧 Linux

> **Which package?**
>
> | Distro family | Use |
> |---|---|
> | Rocky / RHEL / CentOS / Fedora / AlmaLinux | `.rpm` |
> | Ubuntu / Debian / Mint / Pop!_OS | `.deb` |
> | **SUSE / SLES 15 / openSUSE Leap** | **`.tar.gz`** (RPM names don't match SUSE) |
> | Arch / Alpine / Custom embedded (No package manager) | `.tar.gz` |
> | Quick desktop tests (FUSE required) | `.AppImage` |

---

### Option 1 — `.rpm` (Rocky / RHEL / CentOS / Fedora / AlmaLinux)

> **Note for RHEL 7 / CentOS 7 users:** Replace `dnf` with `yum` in the commands below.

```bash
# Pass the license path via env var (Required for automated installs)
sudo CYBRX_LICENSE=/root/license.conf dnf install -y ./CybrxAgent-1.0.0.rpm

# For older systems (RHEL 7 / CentOS 7):
sudo CYBRX_LICENSE=/root/license.conf yum install -y ./CybrxAgent-1.0.0.rpm
```

The `rpm/preInst` hook fires **automatically before any files are unpacked**. It strictly requires the `CYBRX_LICENSE` environment variable to be present. If missing, the installation instantly and cleanly aborts.
If successful, the `rpm/postInst` hook fires and calls `rpm/install.sh` which:
- Creates a dedicated **`cybrxagent` system user** (non-root, no login shell)
- Copies `license.conf` to `/var/lib/cybrxagent/.cybrxagent/license.conf`
- Installs optional hardware tools (`pciutils`, `usbutils`, `sysstat`) if not present
- Creates `/etc/udev/rules.d/99-cybrxagent-dmi.rules` (DMI serial/UUID read access)
- Creates `/etc/sudoers.d/cybrxagent` — grants service account passwordless `sudo` for self-cleanup only
- Writes a hardened **systemd unit** at `/etc/systemd/system/cybrxagent.service`
- Enables and starts the agent immediately

#### Uninstall (RPM)
```bash
sudo /opt/CybrxAgent/resources/linux/rpm/uninstall.sh
```

---

### Option 2 — `.deb` (Ubuntu / Debian / Mint)

> **Use `apt install`, not `dpkg -i`.**
> `dpkg` only checks dependencies — it does **not** fetch or install them. `apt install` reads the same package metadata but resolves and pulls in required deps (`sysstat`, `pciutils`, `usbutils`, GUI libs) from your configured repos automatically.

```bash
# ✅ Recommended — auto-installs all dependencies
sudo apt install ./CybrxAgent-1.0.0.deb

```

The leading `./` is required — without it, `apt` would search the package repos for a package literally named `CybrxAgent-1.0.0.deb` and fail.

<details>
<summary>Using <code>dpkg -i</code> directly (not recommended)</summary>

```bash
sudo dpkg -i CybrxAgent-1.0.0.deb
sudo apt-get install -f   # required — pulls in any missing deps
```
You **must** follow up with `apt-get install -f`, otherwise package commands like `mpstat` (from `sysstat`) will be missing and the agent's task-manager service will fall back / log warnings.
</details>

The `deb/preInst` hook fires automatically **before** files are extracted. If you omit the environment variable, it securely prompts you on the terminal. If you fail to provide a valid path, it aborts immediately, keeping your system 100% clean (preventing the dreaded `dpkg` "half-configured" state).
If successful, the `deb/postInst` hook fires — running the same production flow as RPM (dedicated user, `/var/lib/cybrxagent/`, hardened systemd unit).

#### Uninstall (DEB)
```bash
sudo /opt/CybrxAgent/resources/linux/deb/uninstall.sh
```

---

### Option 3 — `.tar.gz` (Portable for any Linux)

Use the portable tarball for distributions that don't use `rpm` or `apt` — including **SUSE/SLES**, Arch, Alpine, and any minimal/embedded Linux.

```bash
# 1. Extract the tarball
tar -xzf CybrxAgent-1.0.0.tar.gz
cd CybrxAgent-1.0.0

# 2. Run the portable installer
sudo ./resources/linux/tar/install.sh --config /path/to/license.conf
```

The installer handles three things tarballs can't do via package metadata:

1. **Installs Chromium runtime deps** — auto-detects `dnf` / `yum` / `apt` / `zypper` / `pacman` / `apk` and installs the same library set the `.rpm` / `.deb` would have pulled in.
2. **Restores SELinux contexts** — runs `restorecon -R /opt/CybrxAgent` so systemd can exec the binary on RHEL-family distros (without this, you hit `status=203/EXEC` because `cp -a` preserves `user_home_t` from the extraction folder).
3. **Delegates systemd / user / unit setup** to the shared `rpm/install.sh` (which is distro-agnostic — only the file path is RPM-flavored).

#### SUSE / SLES 15 / openSUSE Leap — Extra Steps

> **Why not `.rpm`?** The RPM package declares RHEL-style dependency names (e.g. `atk`, `glib2`) that do not exist in SUSE repos. Use `.tar.gz` instead.

**Step 1 — Enable zypper repos** (fresh minimal ISO only):
```bash
zypper repos   # list repos and their status
sudo zypper modifyrepo -e SLES15-SP6-15.6-0
sudo zypper modifyrepo -e Basesystem-Module_15.6-0
sudo zypper modifyrepo -e Server-Applications-Module_15.6-0
sudo zypper modifyrepo -e Desktop-Applications-Module_15.6-0
sudo zypper refresh
```
> Adjust the version suffix (e.g. `15.6-0` → `15.5-0`) to match your SP. Use `zypper repos` to see exact names.

**Step 2 — Install runtime dependencies** (correct SUSE package names):
```bash
sudo zypper install -y \
  mozilla-nss libgbm1 libXtst6 libXrandr2 libXcomposite1 \
  libXdamage1 libXfixes3 libxkbcommon0 libdrm2 \
  libatk-1_0-0 libatk-bridge-2_0-0 libgtk-3-0 \
  libasound2 pciutils usbutils sysstat
```

**Step 3 — Apply required patch** (current builds only — will be fixed in next release):
```bash
# Fixes a false-positive "libffmpeg.so missing" error — confirmed on SP5, SP6, SP7, Leap
sed -i 's|find /usr/lib /usr/lib64 /lib /lib64 /usr/local/lib \\|find /usr/lib /usr/lib64 /lib /lib64 /usr/local/lib "$INSTALL_DIR" \\|' \
  resources/linux/tar/install.sh

# Verify patch applied
grep -n "INSTALL_DIR" resources/linux/tar/install.sh
```

**Step 4 — Run the installer**:
```bash
sudo ./resources/linux/tar/install.sh --config /home/pawan/agent.config
```

> For full details (static network setup, DNS via `netconfig`, SSH, firewall) see [`build/linux/SESU_Linux.md`](build/linux/SESU_Linux.md).

#### Uninstall (.tar.gz)
```bash
sudo /opt/CybrxAgent/resources/linux/tar/uninstall.sh
```

---

### Option 4 — AppImage (Desktop testing)

```bash
chmod +x CybrxAgent-1.0.0.AppImage

# System-wide install (root required)
sudo /opt/CybrxAgent/resources/linux/appimage/install.sh \
  --config /root/license.conf

# User install (no root)
/opt/CybrxAgent/resources/linux/appimage/install.sh \
  --config ~/license.conf --user-install
```

#### Uninstall (AppImage)
```bash
sudo /opt/CybrxAgent/resources/linux/appimage/uninstall.sh
# OR for user install:
/opt/CybrxAgent/resources/linux/appimage/uninstall.sh --user-install
```

---

### Linux — Service user & config locations

| Install type | Runs as | Config / data location |
|---|---|---|
| System (RPM/DEB) | `cybrxagent` (dedicated system user) | `/var/lib/cybrxagent/.cybrxagent/` (logs, license, state) |
| System — electron-store | `cybrxagent` | `/var/lib/cybrxagent/.config/CybrxAgent/` (agent-state, config JSON) |
| User (`--user-install`) | Current user | `~/.cybrxagent/` · `~/.config/CybrxAgent/` |

The uninstall removes **all** of the above paths, the sudoers rule (`/etc/sudoers.d/cybrxagent`), and the udev rule.

---

### Linux — Auto-start behaviour
| Trigger | Behaviour |
|---|---|
| System boot | systemd starts agent automatically (`WantedBy=multi-user.target`) |
| Agent crash or clean exit | `Restart=always` + `RestartSec=10s` brings it back |
| Runaway restart loop | `StartLimitBurst=5` per `StartLimitIntervalSec=300` prevents it |
| Headless server (no display) | `--ozone-platform=headless --disable-gpu --disable-dev-shm-usage` |
| GTK accessibility warning | Suppressed via `GTK_A11Y=none` environment variable |

---

## 🔧 Install script summary

| Platform | Script fired automatically | Script to run manually |
|---|---|---|
| **Linux RPM** | `build/linux/rpm/preInst` + `postInst` → `rpm/install.sh` | `rpm/uninstall.sh` |
| **Linux DEB** | `build/linux/deb/preInst` + `postInst` → `deb/install.sh` | `deb/uninstall.sh` |
| **Linux Tarball**| ❌ None (Extract manually) | `tar/install.sh` · `tar/uninstall.sh` |
| **Linux AppImage** | ❌ None | `appimage/install.sh` · `appimage/uninstall.sh` |
| **macOS PKG** | `build/mac/pkg-scripts/postinstall` | `mac/uninstall.sh` |
| **macOS DMG** | ❌ None — run `postinstall.sh` manually | `mac/uninstall.sh` |
| **Windows EXE** | NSIS wizard | Control Panel |

---

## 🍎 macOS

### ✅ Recommended: `.pkg` (auto-runs setup)

Double-click `CybrxAgent-x.x.x.pkg`. The installer automatically:
1. Places app in `/Applications`
2. Shows a GUI file-picker for `license.conf`
3. Copies config to `~/Library/Application Support/CybrxAgent/`
4. Registers **LaunchAgent** for auto-start on every login

### Alternative: `.dmg` (manual)
```bash
open CybrxAgent-x.x.x.dmg
# Drag to /Applications, then:
bash /Applications/CybrxAgent.app/Contents/Resources/postinstall.sh
```

### macOS — Auto-start behaviour
LaunchAgent (`~/Library/LaunchAgents/com.cybrx.agent.plist`):
- `RunAtLoad=true` → starts at every login (including after reboot)
- `KeepAlive=true` → launchd restarts on any exit
- `ThrottleInterval=10` → waits 10 s between restarts

### macOS — Verify
```bash
launchctl list | grep cybrx
ls ~/Library/Application\ Support/CybrxAgent/license.conf
```

### macOS — Uninstall
```bash
bash /Applications/CybrxAgent.app/Contents/Resources/uninstall.sh
```

### macOS — Config location
```
~/Library/Application Support/CybrxAgent/license.conf
```

---

## 🏗️ Build from Source

> Builds must run on the **target platform** — no cross-compilation.

| Build | Required machine |
|---|---|
| Windows `.exe` | Windows |
| Linux `.deb` `.rpm` `.AppImage` | Linux (Rocky / Ubuntu) |
| macOS `.dmg` `.pkg` | macOS |

### Build commands
```bash
npm install            # install dependencies (once)

npm run dist           # Windows → CybrxAgent-Setup-x.x.x.exe
npm run dist:linux     # Linux  → .AppImage + .deb + .rpm  (auto-installs build deps)
npm run dist:mac       # macOS  → .dmg + .pkg
npm run clean          # wipe dist/ — ⚠️ do not store license.conf here
```

### Build output
```
dist/
├── CybrxAgent-Setup-1.0.0.exe        ← Windows NSIS installer
├── CybrxAgent-1.0.0.AppImage         ← Linux universal
├── CybrxAgent-1.0.0.deb              ← Linux Debian/Ubuntu
├── CybrxAgent-1.0.0.rpm              ← Linux Rocky/RHEL/Fedora
├── CybrxAgent-1.0.0.dmg             ← macOS (manual drag)
└── CybrxAgent-1.0.0.pkg             ← macOS (auto-install) ← share this
```

### Build notes
- **Linux PNG icon** — `build/linux/audix.png` must exist. Convert: `magick build/audix.ico[0] -resize 512x512 build/linux/audix.png`
- **Build deps** — `prebuild.sh` installs `libxcrypt-compat` + `rpm-build` automatically on dnf systems.
- **macOS signing** — `gatekeeperAssess: false` for unsigned dev builds. Set `CSC_LINK` + `CSC_KEY_PASSWORD` for signed releases.

---

## ⚠️ Common mistakes

| Mistake | Fix |
|---|---|
| Stored `license.conf` in `dist/` | `npm run clean` wipes `dist/`. Use `/root/` or `/etc/cybrx/`. |
| Ran `dnf install` without `CYBRX_LICENSE` | RPM strictly requires the env var. Add `sudo CYBRX_LICENSE=/path dnf...`. |
| Ran `dpkg -i` and terminal prompt failed | The `preInst` hook safely aborted the install. Re-run and enter a valid path. |
| `sysstat` / `pciutils` not installed after `.deb` install | Used `dpkg -i` (doesn't auto-resolve deps). Use `sudo apt install ./CybrxAgent-1.0.0.deb` instead, or run `sudo apt-get install -f` after `dpkg -i`. |
| `Can not load RPM file` | Wrong path. Make sure you're pointing to `dist/CybrxAgent-1.0.0.rpm`. |
| `Package already installed` after manual file delete | Run `rpm -e CybrxAgent` to clear the RPM database first. |
| `systemctl status` still shows inactive after uninstall | `systemctl reset-failed cybrxagent` clears it from systemd memory. |
| `/var/lib/cybrxagent` not deleted after uninstall | Sudoers rule missing (old install). Run `sudo rm -rf /var/lib/cybrxagent` manually. |
| GTK errors in journal (`GtkStyleContext`) | Expected on headless servers. Suppressed by `GTK_A11Y=none` in service. |
| D-Bus errors in journal | Expected on headless servers. Suppressed by `DBUS_SESSION_BUS_ADDRESS=disabled:`. |

---

## 📁 Config file locations

| OS | `license.conf` path |
|----|---------------------|
| Windows | `%APPDATA%\CybrxAgent\license.conf` |
| macOS | `~/Library/Application Support/CybrxAgent/license.conf` |
| Linux (system install) | `/var/lib/cybrxagent/.cybrxagent/license.conf` |
| Linux (user install) | `~/.cybrxagent/license.conf` |

---


## Installation Flow for Linux
```
    dnf install -y ./CybrxAgent-1.0.0.rpm
          ↓
    preInst runs automatically (BEFORE files are extracted)
      • checks CYBRX_LICENSE env var
      • walks process ancestry for env var (catches CYBRX_LICENSE=... sudo dnf)
      • (For DEB only) Prompts interactively if not found
      • IF MISSING: Aborts transaction completely (system stays clean)
      • IF FOUND: Saves valid path to /tmp/ and proceeds
          ↓
    Files are unpacked to /opt/CybrxAgent
          ↓
    postInst runs automatically
      • reads verified path from /tmp/ and deletes temp file
          ↓
    install.sh runs
      • creates cybrxagent system user
      • sets up /var/lib/cybrxagent/ directories
      • copies license.conf
      • installs optional hardware tools (pciutils, usbutils, sysstat)
      • creates /etc/udev/rules.d/99-cybrxagent-dmi.rules
      • creates /etc/sudoers.d/cybrxagent (cleanup permissions)
      • writes hardened systemd unit
      • enables + starts agent
          ↓
    Agent runs as cybrxagent user (headless, background)
          ↓
    uninstall.sh removes:
      /opt/CybrxAgent, /var/lib/cybrxagent (all contents),
      systemd unit, udev rule, sudoers rule, cybrxagent user
```

## 📂 Build folder structure

```
build/
├── installer.nsh                    ← Windows NSIS script
├── audix.ico                        ← Windows icon
├── license.txt                      ← Shared license text
│
├── mac/                             ← macOS
│   ├── postinstall.sh               ← Manual DMG post-install
│   ├── uninstall.sh                 ← macOS uninstaller
│   ├── entitlements.mac.plist
│   ├── entitlements.mac.inherit.plist
│   └── pkg-scripts/
│       └── postinstall              ← Auto-runs after .pkg install
│
└── linux/                           ← Linux
    ├── prebuild.sh                  ← Auto-installs build deps (dnf systems)
    ├── audix.png                    ← Linux icon (512x512 PNG)
    │
    ├── rpm/                         ← RPM (Rocky/RHEL/Fedora)
    │   ├── postInst                 ← Runs automatically after dnf/rpm install
    │   ├── install.sh               ← Creates service user, copies config, writes systemd unit
    │   └── uninstall.sh             ← Removes via dnf + service + user + config
    │
    ├── deb/                         ← DEB (Ubuntu/Debian)
    │   ├── postInst                 ← Runs automatically after dpkg/apt install
    │   ├── install.sh               ← Creates service user, copies config, writes systemd unit
    │   └── uninstall.sh             ← Removes via dpkg + service + user + config
    │
    └── appimage/                    ← AppImage (any Linux)
        ├── install.sh               ← Copies AppImage + license + systemd
        └── uninstall.sh             ← Removes files + service (no package DB)
```

---

## 🧪 Testing & Debugging Commands

### Linux — Service management

```bash
# ── Status & logs ───────────────────────────────────────────────────────────
systemctl status cybrxagent                    # current state + last 10 log lines
journalctl -t cybrxagent -f                    # live filtered logs (recommended)
journalctl -u cybrxagent --since "10 min ago"  # last 10 minutes
journalctl -u cybrxagent -n 100                # last 100 lines
journalctl -u cybrxagent -p err                # errors only

# ── Start / stop / restart ───────────────────────────────────────────────────
systemctl start   cybrxagent
systemctl stop    cybrxagent
systemctl restart cybrxagent
systemctl reload  cybrxagent        # sends SIGHUP (config reload without full restart)

# ── Enable / disable auto-start ───────────────────────────────────────────────
systemctl enable  cybrxagent        # start on boot
systemctl disable cybrxagent        # remove from boot

# ── Inspect the installed service unit ──────────────────────────────────────
systemctl cat cybrxagent            # print the .service file as systemd sees it
systemctl show cybrxagent           # all systemd properties (detailed)
```

### Linux — Process & resource checks

```bash
# Is the process actually running?
ps aux | grep cybrxagent

# How many file descriptors is it using?
ls /proc/$(pgrep -f cybrxagent | head -1)/fd | wc -l

# Memory + CPU live view
top -p $(pgrep -d',' -f cybrxagent)

# Which files/sockets does it have open?
lsof -p $(pgrep -f cybrxagent | head -1)

# Threads spawned (Electron forks several)
ps -L -p $(pgrep -f cybrxagent | head -1)
```

### Linux — Config & file verification

```bash
# ── Production install (system service) ────────────────────────────────────
id cybrxagent                                           # confirm service user exists
ls -la /var/lib/cybrxagent/.cybrxagent/license.conf     # license in place?
cat /var/lib/cybrxagent/.cybrxagent/install_info.conf   # install metadata
stat /etc/systemd/system/cybrxagent.service             # service file present?

# ── User install ────────────────────────────────────────────────────────────
ls -la ~/.cybrxagent/license.conf
cat ~/.cybrxagent/install_info.conf

# ── Binary ──────────────────────────────────────────────────────────────────
ls -la /opt/CybrxAgent/cybrxagent                       # binary + permissions
/opt/CybrxAgent/cybrxagent --version 2>/dev/null        # version check
```

### Linux — Run the agent manually (headless, foreground)

> Useful for watching console output without systemd, or quick smoke-tests.

```bash
# Run as the cybrxagent service user (matches production environment exactly)
sudo -u cybrxagent HOME=/var/lib/cybrxagent \
  /opt/CybrxAgent/cybrxagent \
    --no-sandbox \
    --ozone-platform=headless \
    --disable-gpu \
    --disable-software-rasterizer \
    --disable-dev-shm-usage

# Run as current user (quick test)
npm run start:headless
```

### Linux — Clean uninstall & full purge

```bash
# To watch the automated API background uninstall live:
tail -f /var/log/cybrxagent_uninstall.log

# Via the built-in uninstall script (recommended)
sudo /opt/CybrxAgent/resources/linux/rpm/uninstall.sh   # RPM
sudo /opt/CybrxAgent/resources/linux/deb/uninstall.sh   # DEB

# Manual emergency purge (if script is unavailable)
systemctl stop    cybrxagent
systemctl disable cybrxagent
rm -f  /etc/systemd/system/cybrxagent.service
systemctl daemon-reload
systemctl reset-failed cybrxagent           # clears from systemd memory
rm -rf /opt/CybrxAgent                      # binary + resources
rm -rf /var/lib/cybrxagent                  # ALL data: logs, license, electron-store
rm -f  /etc/udev/rules.d/99-cybrxagent-dmi.rules
udevadm control --reload-rules
rm -f  /etc/sudoers.d/cybrxagent            # cleanup privilege rule
userdel --remove cybrxagent 2>/dev/null || true
rpm -e CybrxAgent 2>/dev/null || true       # clear RPM DB
dpkg -r cybrxagent 2>/dev/null || true      # clear DEB DB

# Verify fully gone (all should fail or say "not found")
systemctl status cybrxagent
id cybrxagent
ls /opt/CybrxAgent
ls /var/lib/cybrxagent
ls /etc/sudoers.d/cybrxagent
rpm -q CybrxAgent
```

### Linux — Systemd journal maintenance

```bash
# Clear all journal logs (dev/test machines only)
sudo journalctl --rotate
sudo journalctl --vacuum-time=1s     # delete everything older than 1s (full clear)

# Size-based cleanup
sudo journalctl --vacuum-size=100M   # keep only last 100 MB of logs
```

### macOS — LaunchAgent testing

```bash
# Check if agent is registered with launchd
launchctl list | grep cybrx

# Start / stop manually
launchctl start  com.cybrx.agent
launchctl stop   com.cybrx.agent

# View stdout/stderr logs
tail -f ~/Library/Logs/cybrxagent-stdout.log
tail -f ~/Library/Logs/cybrxagent-stderr.log

# Print the plist launchd is using
cat ~/Library/LaunchAgents/com.cybrx.agent.plist

# Full manual unload + reload (for config changes)
launchctl bootout  "gui/$(id -u)/com.cybrx.agent"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.cybrx.agent.plist
```

### Windows — Service testing

```powershell
# Status
Get-Service -Name CybrxAgent

# Start / stop
Start-Service  CybrxAgent
Stop-Service   CybrxAgent
Restart-Service CybrxAgent

# View Windows event log entries
Get-EventLog -LogName Application -Source CybrxAgent -Newest 20

# Config location
ls $env:APPDATA\CybrxAgent\
```

### RPM database — repair stale installs

```bash
# Package shows "already installed" even though files were deleted?
rpm -q CybrxAgent            # check if RPM DB still has it
rpm -e CybrxAgent            # remove from DB without touching files
rpm -q CybrxAgent            # should now say: package CybrxAgent is not installed

# Reinstall cleanly after purge (installer will prompt for license)
dnf install -y ./dist/CybrxAgent-1.0.0.rpm

# OR pass license non-interactively
CYBRX_LICENSE=/root/license.conf dnf install -y ./dist/CybrxAgent-1.0.0.rpm
```



## Electron Store
```js
// electron-store automatically resolves the correct platform path:
//   Windows        →  %APPDATA%\CybrxAgent\agent-state.json
//   Linux (system) →  /var/lib/cybrxagent/.config/CybrxAgent/agent-state.json
//                     (because HOME=/var/lib/cybrxagent for the cybrxagent service user)
//   Linux (user)   →  ~/.config/CybrxAgent/agent-state.json
//   macOS          →  ~/Library/Application Support/CybrxAgent/agent-state.json
// All stores are cleared on uninstall via clearAllStores() + sudo rm -rf VAR_DIR.
```