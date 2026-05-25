# CybrxAgent — Linux Runtime Dependencies

> **Developer note:** Update this file whenever dependencies are added, removed, or changed.

---

## ⚠️ Critical Concept: Headless ≠ No Libraries Required

CybrxAgent runs in **fully headless mode** — it has **no visible desktop window, no GUI, no screen**. When you install SUSE/RHEL with a minimal ISO and no Desktop GUI, the application still works perfectly because it uses these flags:

```
--ozone-platform=headless
--disable-gpu
--no-sandbox
--disable-dev-shm-usage
--disable-software-rasterizer
```

**However**, Electron is built on top of Chromium, and Chromium's binary is **compiled and dynamically linked** against many system libraries — including X11, GTK, and ATK — even if it never renders a window. The Linux dynamic linker (`ld.so`) requires every linked `.so` file to be **physically present on disk** before the process can even start, regardless of whether the code path using that library is ever executed.

**This is why `libatk-1.0.so.0` caused a crash on a minimal SLES 15 SP5** — not because the app tried to use the accessibility toolkit, but because the Electron binary has a hard link to it at the ELF level.

---

## 📋 Table of Contents

- [Category 1 — Core Runtime (Always Required)](#category-1--core-runtime-always-required)
- [Category 2 — X11 Shared Libraries (ELF Link Requirement)](#category-2--x11-shared-libraries-elf-link-requirement)
- [Category 3 — Accessibility & UI Toolkit (ELF Link Requirement)](#category-3--accessibility--ui-toolkit-elf-link-requirement)
- [Category 4 — Graphics / GPU Infrastructure (ELF Link Requirement)](#category-4--graphics--gpu-infrastructure-elf-link-requirement)
- [Category 5 — Audio (ELF Link Requirement)](#category-5--audio-elf-link-requirement)
- [Category 6 — Printing (ELF Link Requirement)](#category-6--printing-elf-link-requirement)
- [Category 7 — Hardware Inventory Tools (Agent Feature)](#category-7--hardware-inventory-tools-agent-feature)
- [Package Name Reference by Distro](#-package-name-reference-by-distro)
- [How to Check What Is Missing](#-how-to-check-what-is-missing)
- [Minimal OS Install Checklist](#-minimal-os-install-checklist)

---

## Category 1 — Core Runtime (Always Required)

These libraries are fundamental to Node.js/Electron itself and are used by the agent's actual JavaScript code paths.

---

### `glib2` — GLib Core Library

| Property | Detail |
|---|---|
| `.so` file | `libglib-2.0.so.0`, `libgio-2.0.so.0`, `libgobject-2.0.so.0` |
| RHEL/Rocky package | `glib2` |
| SUSE package | `libglib-2_0-0` |
| Debian/Ubuntu package | `libglib2.0-0` |

**What it is:**
GLib is the foundational C library that underpins the entire GNOME ecosystem and many system-level applications. It provides essential data structures (hash tables, linked lists, arrays), a main event loop, file system abstraction (GIO), and cross-platform threading primitives.

**Where it's used:**
Electron uses GLib's event loop (`GMainLoop`) internally to integrate with the OS event system. Node.js uses GLib for async I/O operations through libuv. Every single network call, file read, and timer in the agent ultimately passes through GLib primitives.

**What happens if missing:**
```
error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
```
The agent **cannot start at all**. This is the most critical dependency.

---

### `nss` — Network Security Services

| Property | Detail |
|---|---|
| `.so` file | `libnss3.so`, `libnssutil3.so`, `libsmime3.so`, `libssl3.so` |
| RHEL/Rocky package | `nss` |
| SUSE package | `mozilla-nss` |
| Debian/Ubuntu package | `libnss3` |

**What it is:**
NSS is Mozilla's library implementing cryptographic standards — TLS/SSL, X.509 certificate parsing, PKCS, SHA, RSA. It is the same library used inside Firefox.

**Where it's used:**
Electron uses NSS for **all HTTPS connections**. Every API call the agent makes to the CybrX backend (license verification, data upload, config fetch) goes through NSS. The agent's `configService.js` reads an encrypted config using a `.pem` public key — the RSA decryption internally relies on NSS.

**What happens if missing:**
```
error while loading shared libraries: libnss3.so: cannot open shared object file
```
The agent cannot start. Even if it did, all HTTPS calls would fail silently.

---

## Category 2 — X11 Shared Libraries (ELF Link Requirement)

> **Important:** The agent never connects to an X11 display server. These libraries are required **only because Electron's binary has hard ELF-level links to them**. On a minimal server without a desktop, these `.so` files still need to exist on disk — they just won't do anything at runtime.

---

### `libXcomposite` — X11 Compositing Extension

| Property | Detail |
|---|---|
| `.so` file | `libXcomposite.so.1` |
| RHEL/Rocky package | `libXcomposite` |
| SUSE package | `libXcomposite1` |
| Debian/Ubuntu package | `libxcomposite1` |

**What it is:**
Provides the X11 Composite extension — the mechanism that allows window managers to redirect window rendering to off-screen buffers for effects like transparency and blur.

**Why Electron links it:**
Chromium uses this when running on X11 to perform hardware-accelerated compositing of web content layers. The link exists at compile time for all Electron builds targeting Linux, regardless of whether the final deployment uses X11.

**What happens if missing:**
```
error while loading shared libraries: libXcomposite.so.1: cannot open shared object file
```
The agent **cannot start**. Even though compositing is never used in headless mode.

---

### `libXdamage` — X11 Damage Extension

| Property | Detail |
|---|---|
| `.so` file | `libXdamage.so.1` |
| RHEL/Rocky package | `libXdamage` |
| SUSE package | `libXdamage1` |
| Debian/Ubuntu package | `libxdamage1` |

**What it is:**
Tracks which regions of the screen have been "damaged" (changed), enabling efficient redraws. Used by compositing window managers to know which areas to repaint.

**Why Electron links it:**
Chromium's paint system uses damage tracking to optimize rendering — it only repaints changed screen regions rather than the whole viewport. The link exists even in headless mode because Chromium's rendering pipeline was compiled with this optimization path included.

**What happens if missing:**
Agent crashes on startup with a shared library error.

---

### `libXfixes` — X11 Fixes Extension

| Property | Detail |
|---|---|
| `.so` file | `libXfixes.so.3` |
| RHEL/Rocky package | `libXfixes` |
| SUSE package | `libXfixes3` |
| Debian/Ubuntu package | `libxfixes3` |

**What it is:**
A collection of patches and fixes to the core X11 protocol — most notably providing a proper cursor image API and region management.

**Why Electron links it:**
Chromium uses XFixes for cursor management and region-based clipping in its compositor. Hard-linked at build time.

**What happens if missing:**
Agent crashes on startup.

---

### `libXrandr` — X11 Resize and Rotate Extension

| Property | Detail |
|---|---|
| `.so` file | `libXrandr.so.2` |
| RHEL/Rocky package | `libXrandr` |
| SUSE package | `libXrandr2` |
| Debian/Ubuntu package | `libxrandr2` |

**What it is:**
Manages screen resolution, rotation, and multi-monitor layouts on X11 systems.

**Why Electron links it:**
Chromium queries display resolution and DPI via XRandR to correctly scale web content and UI elements. Linked at compile time for all Linux Electron builds.

**What happens if missing:**
Agent crashes on startup.

---

### `libXtst` — X11 Testing Extension

| Property | Detail |
|---|---|
| `.so` file | `libXtst.so.6` |
| RHEL/Rocky package | `libXtst` |
| SUSE package | `libXtst6` |
| Debian/Ubuntu package | `libxtst6` |

**What it is:**
Provides the XTEST extension — allows programs to inject synthetic keyboard/mouse events into X11 for testing automation purposes.

**Why Electron links it:**
Chromium links against this for its remote debugging and testing infrastructure (`--remote-debugging-port`). The link is present in all Linux builds regardless of whether testing features are used.

**What happens if missing:**
Agent crashes on startup.

---

### `libxkbcommon` — Keyboard Handling

| Property | Detail |
|---|---|
| `.so` file | `libxkbcommon.so.0` |
| RHEL/Rocky package | `libxkbcommon` |
| SUSE package | `libxkbcommon0` |
| Debian/Ubuntu package | `libxkbcommon0` |

**What it is:**
Handles keyboard layout parsing and key event translation independently of X11. Supports both X11 and Wayland/Ozone backends.

**Why Electron links it:**
This one is **genuinely used even in headless mode**. Electron's Ozone platform (`--ozone-platform=headless`) initializes a virtual keyboard mapping for processing any potential key events from IPC or remote debugging. xkbcommon is the library that handles this mapping on all Linux platforms.

**What happens if missing:**
Agent crashes on startup. This library is actually functional in headless mode, not just a link artifact.

---

## Category 3 — Accessibility & UI Toolkit (ELF Link Requirement)

> **Note:** Accessibility and GTK libraries are never functionally used in headless server mode. They are present only due to ELF-level dynamic links in the Electron binary.

---

### `atk` — Accessibility Toolkit

| Property | Detail |
|---|---|
| `.so` file | `libatk-1.0.so.0` |
| RHEL/Rocky package | `atk` |
| SUSE package | `libatk-1_0-0` |
| Debian/Ubuntu package | `libatk1.0-0` |

**What it is:**
ATK (Accessibility ToolKit) is the GNOME accessibility API. It provides a standard interface for screen readers (like Orca) to query information about UI elements — button labels, text content, widget roles.

**Why Electron links it:**
GTK3 (which Electron links) is built with ATK support compiled in. Electron includes GTK for some low-level UI primitives, and GTK itself hard-links to ATK. This creates a transitive dependency chain: `Electron → GTK3 → ATK`.

**What happens if missing:**
```
error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file
```
This is **exactly the error seen on the minimal SLES 15 SP5 install**. The agent cannot start despite never using any accessibility features, because the linker requires the `.so` to be present.

---

### `at-spi2-atk` — Accessibility Bridge

| Property | Detail |
|---|---|
| `.so` file | `libatk-bridge-2.0.so.0` |
| RHEL/Rocky package | `at-spi2-atk` |
| SUSE package | `libatk-bridge-2_0-0` |
| Debian/Ubuntu package | `libatk-bridge2.0-0` |

**What it is:**
The bridge between ATK (the toolkit API) and AT-SPI2 (the D-Bus accessibility protocol). Translates ATK accessibility events into D-Bus signals that screen readers can consume.

**Why Electron links it:**
Same transitive chain as ATK above. GTK3 loads this bridge automatically. When Electron initializes GTK, this bridge is loaded even though no screen reader is present and no accessibility events are ever emitted.

**What happens if missing:**
Agent crashes on startup.

---

### `gtk3` — GTK3 Widget Toolkit

| Property | Detail |
|---|---|
| `.so` file | `libgtk-3.so.0` |
| RHEL/Rocky package | `gtk3` |
| SUSE package | `libgtk-3-0` |
| Debian/Ubuntu package | `libgtk-3-0` |

**What it is:**
GTK3 is the widget toolkit used by GNOME applications to build user interfaces — buttons, dialogs, menus, text inputs.

**Why Electron links it:**
Electron uses GTK3 for several low-level OS integration tasks that are not purely GUI: file chooser dialogs (native OS dialogs), desktop notifications, tray icons, and clipboard integration. Even in headless mode, Electron initializes a minimal GTK context at startup for these subsystems. The binary is hard-linked against GTK3.

**What happens if missing:**
Agent crashes on startup.

---

## Category 4 — Graphics / GPU Infrastructure (ELF Link Requirement)

---

### `libdrm` — Direct Rendering Manager

| Property | Detail |
|---|---|
| `.so` file | `libdrm.so.2` |
| RHEL/Rocky package | `libdrm` |
| SUSE package | `libdrm2` |
| Debian/Ubuntu package | `libdrm2` |

**What it is:**
The Linux DRM (Direct Rendering Manager) subsystem userspace library. It provides an interface to communicate with GPU kernel drivers for operations like memory allocation, command submission, and buffer management.

**Why Electron links it:**
Chromium enumerates available GPU devices at startup, even when `--disable-gpu` is specified, to populate its GPU feature list. This enumeration goes through `libdrm`. The `--disable-gpu` flag disables hardware-accelerated rendering, but not the device discovery step.

**What happens if missing:**
Agent crashes on startup. The `--disable-gpu` flag does **not** bypass the library link requirement.

---

### `mesa-libgbm` — Generic Buffer Management

| Property | Detail |
|---|---|
| `.so` file | `libgbm.so.1` |
| RHEL/Rocky package | `mesa-libgbm` |
| SUSE package | `libgbm1` |
| Debian/Ubuntu package | `libgbm1` |

**What it is:**
GBM (Generic Buffer Management) is a Mesa library providing an abstraction layer for GPU memory buffer allocation, independent of any specific rendering API (OpenGL, Vulkan, etc.).

**Why Electron links it:**
Chromium's GPU process uses GBM as a backend for Ozone's buffer management, even in headless mode. The Ozone headless platform initializes a GBM device to have a valid buffer allocator context, even though no pixels are ever displayed.

**What happens if missing:**
Agent crashes on startup.

---

## Category 5 — Audio (ELF Link Requirement)

---

### `alsa-lib` — Advanced Linux Sound Architecture

| Property | Detail |
|---|---|
| `.so` file | `libasound.so.2` |
| RHEL/Rocky package | `alsa-lib` |
| SUSE package | `libasound2` |
| Debian/Ubuntu package | `libasound2` |

**What it is:**
The ALSA (Advanced Linux Sound Architecture) userspace library. Provides an API for audio playback, recording, and MIDI on Linux.

**Why Electron links it:**
Chromium's WebAudio implementation links against ALSA for audio output. Even though the CybrxAgent never plays any audio, Chromium initializes its audio subsystem at startup — and this initialization code has a hard link to ALSA.

**What happens if missing:**
Agent crashes on startup.

---

## Category 6 — Printing (ELF Link Requirement)

---

### `cups-libs` — CUPS Printing Libraries

| Property | Detail |
|---|---|
| `.so` file | `libcups.so.2` |
| RHEL/Rocky package | `cups-libs` |
| SUSE package | `libcups2` *(not available on SLES 12, optional on SLES 15)* |
| Debian/Ubuntu package | `libcups2` |

**What it is:**
The CUPS (Common Unix Printing System) client library. Provides an API for listing printers, submitting print jobs, and managing print queues.

**Why Electron links it:**
Chromium has a built-in print-to-PDF feature and print preview. The CUPS library is used for sending print jobs to physical printers. The link exists even when printing is never used.

**Current status:**
`cups-libs`/`libcups2` is **removed from the CybrxAgent RPM/DEB dependency list** because:
1. It does not exist on SLES 12 at all
2. Its name varies significantly across distros
3. On most modern Linux installs it is already present transitively
4. If missing, Electron handles it gracefully via a lazy load on RHEL/Rocky (unlike other libraries which are hard-linked)

**What happens if missing:**
On most systems: agent works normally. On some older minimal installs: may print a warning to stderr but does not prevent startup.

---

## Category 7 — Hardware Inventory Tools (Agent Feature)

These are **not** Electron dependencies — they are external CLI tools that the agent's JavaScript code calls via `child_process.execSync()` to collect hardware inventory data.

---

### `pciutils` — PCI Device Utilities

| Property | Detail |
|---|---|
| Command | `lspci` |
| Package name (all distros) | `pciutils` |

**What it is:**
A collection of utilities for displaying information about PCI buses and devices in the system.

**Where it's used in code:**
`src/services/systemInfoService.js` — the hardware inventory service calls `lspci` to enumerate:
- Network interface cards (NICs)
- GPU/display adapters
- Storage controllers (SATA, NVMe)
- USB host controllers

**What happens if missing:**
The agent starts and runs normally. The `lspci`-dependent hardware metrics are omitted from the inventory report, or the field is populated with `"Unknown"`. No crash.

---

### `usbutils` — USB Device Utilities

| Property | Detail |
|---|---|
| Command | `lsusb` |
| Package name (all distros) | `usbutils` |

**What it is:**
Utilities for displaying information about USB buses and connected devices.

**Where it's used in code:**
`src/services/systemInfoService.js` calls `lsusb` to enumerate:
- USB storage devices
- USB input devices (keyboards, mice)
- USB network adapters
- Any other USB peripherals

**What happens if missing:**
The agent starts and runs normally. USB device inventory is omitted or shows `"Unknown"`. No crash.

---

### `sysstat` — System Statistics Utilities

| Property | Detail |
|---|---|
| Commands | `iostat`, `mpstat`, `sar` |
| Package name (all distros) | `sysstat` |

**What it is:**
A collection of performance monitoring utilities that collect and report on CPU usage, disk I/O, memory, and network statistics.

**Where it's used in code:**
`src/services/systemInfoService.js` uses:
- `iostat` → disk read/write throughput per device
- `mpstat` → per-CPU utilization metrics

**What happens if missing:**
The agent starts and runs normally. I/O and per-CPU metrics are omitted from performance reports. No crash.

---

## 📦 Package Name Reference by Distro

| Library | RHEL/Rocky/AlmaLinux | SUSE/openSUSE | Debian/Ubuntu | Arch | Alpine |
|---|---|---|---|---|---|
| GLib2 | `glib2` | `libglib-2_0-0` | `libglib2.0-0` | `glib2` | `glib` |
| NSS | `nss` | `mozilla-nss` | `libnss3` | `nss` | `nss` |
| ATK | `atk` | `libatk-1_0-0` | `libatk1.0-0` | `at-spi2-core` | `at-spi2-core` |
| ATK Bridge | `at-spi2-atk` | `libatk-bridge-2_0-0` | `libatk-bridge2.0-0` | `at-spi2-atk` | `at-spi2-atk` |
| GTK3 | `gtk3` | `libgtk-3-0` | `libgtk-3-0` | `gtk3` | `gtk+3.0` |
| libXcomposite | `libXcomposite` | `libXcomposite1` | `libxcomposite1` | `libxcomposite` | `libxcomposite` |
| libXdamage | `libXdamage` | `libXdamage1` | `libxdamage1` | `libxdamage` | `libxdamage` |
| libXfixes | `libXfixes` | `libXfixes3` | `libxfixes3` | `libxfixes` | `libxfixes` |
| libXrandr | `libXrandr` | `libXrandr2` | `libxrandr2` | `libxrandr` | `libxrandr` |
| libXtst | `libXtst` | `libXtst6` | `libxtst6` | `libxtst` | `libxtst` |
| libxkbcommon | `libxkbcommon` | `libxkbcommon0` | `libxkbcommon0` | `libxkbcommon` | `libxkbcommon` |
| libdrm | `libdrm` | `libdrm2` | `libdrm2` | `libdrm` | `libdrm` |
| mesa-gbm | `mesa-libgbm` | `libgbm1` | `libgbm1` | `libgbm` | `mesa-gbm` |
| ALSA | `alsa-lib` | `libasound2` | `libasound2` | `alsa-lib` | `alsa-lib` |
| CUPS | `cups-libs` | `libcups2` *(SLES15+)* | `libcups2` | `libcups` | `cups-libs` |
| PCI tools | `pciutils` | `pciutils` | `pciutils` | `pciutils` | `pciutils` |
| USB tools | `usbutils` | `usbutils` | `usbutils` | `usbutils` | `usbutils` |
| Sys stats | `sysstat` | `sysstat` | `sysstat` | `sysstat` | *(unavailable)* |

---

## 🔍 How to Check What Is Missing

Before installing, run `ldd` on the binary to see every missing `.so` at once — instead of discovering them one by one via crash loops:

```bash
# After extracting the tarball:
ldd ./cybrxagent | grep "not found"

# After system install:
ldd /opt/CybrxAgent/cybrxagent | grep "not found"
```

**Example output on a minimal SLES 15 SP5 install:**
```
libatk-1.0.so.0 => not found
libatk-bridge-2.0.so.0 => not found
libgbm.so.1 => not found
```

Each `not found` entry maps directly to a package in the table above.

---

## ✅ Minimal OS Install Checklist

If you are deploying on a **minimal server ISO** (no Desktop GUI selected during OS installation), run these commands **before** running the CybrxAgent installer:

### SUSE Linux Enterprise / openSUSE (zypper)
```bash
sudo zypper install -y \
  libglib-2_0-0 mozilla-nss \
  libatk-1_0-0 libatk-bridge-2_0-0 libgtk-3-0 \
  libXcomposite1 libXdamage1 libXfixes3 libXrandr2 libXtst6 \
  libxkbcommon0 libdrm2 libgbm1 libasound2 \
  pciutils usbutils sysstat
```

### RHEL / Rocky / AlmaLinux / Fedora (dnf)
```bash
sudo dnf install -y \
  glib2 nss \
  atk at-spi2-atk gtk3 \
  libXcomposite libXdamage libXfixes libXrandr libXtst \
  libxkbcommon libdrm mesa-libgbm alsa-lib \
  pciutils usbutils sysstat
```

### Debian / Ubuntu / Mint (apt)
```bash
sudo apt-get install -y \
  libglib2.0-0 libnss3 \
  libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libxtst6 \
  libxkbcommon0 libdrm2 libgbm1 libasound2 \
  pciutils usbutils sysstat
```

> **Note:** On a standard server install (not absolute bare-minimum), most of these libraries will already be present. Run `ldd /opt/CybrxAgent/cybrxagent | grep "not found"` first — you may not need to install anything at all.
