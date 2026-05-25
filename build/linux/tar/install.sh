#!/usr/bin/env bash
# =============================================================================
#  CybrxAgent Portable Tarball (.tar.gz) Installer
#
#  Usage:
#    sudo ./resources/linux/tar/install.sh --config /path/to/license.conf
# =============================================================================
set -euo pipefail

APP_NAME="CybrxAgent"
INSTALL_DIR="/opt/$APP_NAME"

# =============================================================================
#  Ctrl+C / SIGTERM handler — clean up any partial install and exit clearly.
#  Without this, pressing Ctrl+C during a zypper loop leaves the script running
#  because the signal hits the child process (zypper), not the bash script.
# =============================================================================
_cleanup_on_interrupt() {
  echo ""
  echo "[WARN] Installation interrupted by user."
  if [[ -d "$INSTALL_DIR" ]]; then
    echo "[INFO] Removing partially copied files from $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
  fi
  echo "[INFO] System is clean. Re-run the installer when ready."
  exit 130   # 128 + 2 (SIGINT) — standard Ctrl+C exit code
}
trap '_cleanup_on_interrupt' INT TERM


# =============================================================================
#  Runtime dependency installer.
#
#  Installs all shared libraries required by the Electron binary at ELF level.
#  Even though the agent runs headless (--ozone-platform=headless --disable-gpu),
#  the Electron binary has hard ELF links to GTK, X11, ATK, DRM, etc.
#  The Linux dynamic linker requires all NEEDED .so files to be present on disk
#  at process start — even if those code paths are never reached at runtime.
#
#  Tested on: RHEL 8/9, Rocky 8/9, AlmaLinux 8/9, Amazon Linux 2023,
#             Amazon Linux 2, Ubuntu 20/22/24, Debian 11/12,
#             SLES 15 SP5/SP6/SP7, openSUSE Leap.
# =============================================================================
install_runtime_deps() {
  echo "[INFO] Checking/installing runtime dependencies..."

  # Helper: install a single package; warn and continue if unavailable.
  pkg_install() {
    local pm="$1"; shift
    "$pm" "$@" 2>/dev/null \
      || echo "[WARN] Package unavailable via $pm — continuing."
  }

  if command -v dnf >/dev/null 2>&1; then
    # ── RHEL / Rocky / AlmaLinux / Fedora / Amazon Linux ─────────────────────
    # Full list required — Amazon Linux 2023 EC2 minimal images have none of
    # these pre-installed. usbutils is absent on AL2023; pkg_install tolerates it.
    for pkg in \
      glib2 nss \
      atk at-spi2-atk at-spi2-core \
      cairo pango \
      gtk3 \
      libX11 libXcomposite libXdamage libXext libXfixes libXrandr libxcb \
      libxkbcommon \
      libdrm mesa-libgbm \
      alsa-lib \
      cups-libs \
      pciutils usbutils sysstat; do
      pkg_install dnf install -y "$pkg"
    done

  elif command -v yum >/dev/null 2>&1; then
    # ── RHEL 7 / CentOS 7 ────────────────────────────────────────────────────
    for pkg in \
      glib2 nss \
      atk at-spi2-atk at-spi2-core \
      cairo pango \
      gtk3 \
      libX11 libXcomposite libXdamage libXext libXfixes libXrandr libxcb \
      libxkbcommon \
      libdrm mesa-libgbm \
      alsa-lib \
      cups-libs \
      pciutils usbutils sysstat; do
      pkg_install yum install -y "$pkg"
    done

  elif command -v apt-get >/dev/null 2>&1; then
    # ── Debian / Ubuntu / Mint / Pop!_OS ─────────────────────────────────────
    DEBIAN_FRONTEND=noninteractive apt-get update -qq 2>/dev/null || true
    for pkg in \
      libglib2.0-0 libnss3 \
      libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
      libcairo2 libpango-1.0-0 \
      libgtk-3-0 \
      libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libxcb1 \
      libxkbcommon0 \
      libdrm2 libgbm1 \
      libasound2 \
      libcups2 \
      pciutils usbutils sysstat; do
      pkg_install apt-get install -y --no-install-recommends "$pkg"
    done

  elif command -v zypper >/dev/null 2>&1; then
    # ── SUSE Linux Enterprise / openSUSE ─────────────────────────────────────
    # SUSE uses different package names from RHEL — confirmed from live SLES 12
    # SP5 testing. Each package is installed individually so a single already-
    # installed or unavailable package never aborts the whole installation.
    declare -A SUSE_PKGS=(
      # Core runtime
      [glib2]="libglib-2_0-0"
      [nss]="mozilla-nss"
      # X11 / display (pre-installed on most SUSE systems, different naming)
      [libXcomposite]="libXcomposite1"
      [libXdamage]="libXdamage1"
      [libXfixes]="libXfixes3"
      [libXrandr]="libXrandr2"
      [libXtst]="libXtst6"
      [libxkbcommon]="libxkbcommon0"
      # Accessibility / graphics
      [atk]="libatk-1_0-0"
      [at-spi2-atk]="libatk-bridge-2_0-0"
      [libdrm]="libdrm2"
      [mesa-libgbm]="libgbm1"
      [alsa-lib]="libasound2"
      [gtk3]="libgtk-3-0"
      # Hardware monitoring (same names on SUSE)
      [pciutils]="pciutils"
      [usbutils]="usbutils"
      [sysstat]="sysstat"
    )
    for logical in "${!SUSE_PKGS[@]}"; do
      suse_pkg="${SUSE_PKGS[$logical]}"
      zypper --non-interactive install --no-recommends "$suse_pkg" 2>/dev/null \
        || echo "[WARN] '$suse_pkg' already present or unavailable — skipping."
    done

  elif command -v pacman >/dev/null 2>&1; then
    # ── Arch Linux / Manjaro ──────────────────────────────────────────────────
    for pkg in glib2 nss pciutils usbutils sysstat; do
      pkg_install pacman -S --noconfirm --needed "$pkg"
    done

  elif command -v apk >/dev/null 2>&1; then
    # ── Alpine Linux ──────────────────────────────────────────────────────────
    for pkg in glib nss pciutils usbutils; do
      pkg_install apk add --no-cache "$pkg"
    done

  else
    echo "[WARN] No supported package manager found (dnf/yum/apt/zypper/pacman/apk)."
    echo "       Agent will still run if nss and glib2 are already installed."
    echo "       For full hardware metrics: install pciutils, usbutils, sysstat manually."
  fi

  echo "[INFO] Dependency check complete."
}

# =============================================================================
#  SELinux context restore.
#  cp -a preserves the source label (typically user_home_t when extracted under
#  /home), which systemd refuses to exec. restorecon reapplies the policy-
#  defined context for /opt/* (bin_t). No-op on systems without SELinux.
# =============================================================================
apply_selinux_context() {
  local target="$1"
  if command -v restorecon >/dev/null 2>&1; then
    echo "[INFO] Restoring SELinux contexts for $target..."
    restorecon -R "$target" 2>/dev/null || true
  elif command -v chcon >/dev/null 2>&1; then
    chcon -R -t bin_t "$target" 2>/dev/null || true
  fi
}

echo ""
echo "======================================================"
echo "  $APP_NAME — Portable Tarball Installer"
echo "======================================================"

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] This installer must be run as root (use sudo)."
  exit 1
fi

CONFIG_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config|-c) CONFIG_FILE="$2"; shift 2 ;;
    *) echo "[ERROR] Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$CONFIG_FILE" || ! -f "$CONFIG_FILE" ]]; then
  echo "[ERROR] You must provide a valid license file."
  echo "Usage: sudo $0 --config /path/to/license.conf"
  exit 1
fi

# Find the root of the extracted tarball (3 levels up from this script:
#   resources/linux/tar/install.sh → resources/linux/tar → resources/linux → resources → root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARBALL_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Verify this looks like the correct directory
if [[ ! -f "$TARBALL_ROOT/cybrxagent" && ! -d "$TARBALL_ROOT/resources" ]]; then
  echo "[ERROR] Could not detect extracted application root at: $TARBALL_ROOT"
  echo "        Make sure you are running this from inside the extracted tarball."
  exit 1
fi

# Install runtime deps BEFORE copying — fail fast if pkg manager is offline
# rather than leaving a half-installed system with a broken systemd unit.
install_runtime_deps

echo "[INFO] Copying application files to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -a "$TARBALL_ROOT/"* "$INSTALL_DIR/"
chown -R root:root "$INSTALL_DIR"
apply_selinux_context "$INSTALL_DIR"

# =============================================================================
#  Library validation gate — runs ldd on the binary AFTER files are copied
#  but BEFORE the service is registered/started. If any .so is missing the
#  installer prints exactly which libraries need to be installed and aborts
#  cleanly, leaving the system in a diagnosable state without a crash-looping
#  systemd unit.
# =============================================================================
verify_runtime_libs() {
  local binary="$INSTALL_DIR/cybrxagent"
  if [[ ! -f "$binary" ]]; then
    binary=$(find "$INSTALL_DIR" -maxdepth 1 -type f -executable ! -name "*.so*" | sort | head -1)
  fi

  if [[ -z "$binary" || ! -f "$binary" ]]; then
    echo "[WARN] Could not locate cybrxagent binary — skipping library check."
    return 0
  fi

  # ── Use readelf instead of ldd ──────────────────────────────────────────────
  # ldd partially executes the binary via LD_TRACE_LOADED_OBJECTS=1.
  # Electron/Chromium sandbox hooks intercept this and hang indefinitely.
  # readelf -d reads ELF NEEDED entries directly from headers — safe and instant.
  if ! command -v readelf >/dev/null 2>&1; then
    echo "[WARN] readelf not found — skipping library check (install binutils)."
    return 0
  fi

  echo "[INFO] Verifying runtime shared libraries (using readelf)..."

  # Build the ldconfig cache lookup once for efficiency
  local ldcache
  ldcache=$(ldconfig -p 2>/dev/null || true)

  local missing=()
  while IFS= read -r lib; do
    [[ -z "$lib" ]] && continue
    # Check ldconfig cache first (fastest path).
    # Use [[:space:]] not \s — POSIX-compliant, works on Alpine/BusyBox grep too.
    if echo "$ldcache" | grep -q "^[[:space:]]*${lib}[[:space:]]"; then
      continue
    fi
    # Fallback: search system library directories AND the app install dir.
    # $INSTALL_DIR is included because Electron bundles its own libs alongside
    # the binary (e.g. libffmpeg.so, libEGL.so) — these are never in /usr/lib.
    if find /usr/lib /usr/lib64 /lib /lib64 /usr/local/lib "$INSTALL_DIR" \
         -name "$lib" -maxdepth 3 2>/dev/null | grep -q .; then
      continue
    fi
    missing+=("$lib")
  done < <(readelf -d "$binary" 2>/dev/null \
             | grep NEEDED \
             | awk -F'[[]' '{print $2}' \
             | tr -d ']' \
             | sort -u)

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    echo "  ╔══════════════════════════════════════════════════════════╗"
    echo "  ║  [ERROR] Missing shared libraries — cannot start agent  ║"
    echo "  ╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "  The following .so files are not present on this system:"
    for lib in "${missing[@]}"; do
      echo "    • $lib"
    done
    echo ""
    echo "  On SUSE (zypper), install the missing packages and retry:"
    echo "    sudo zypper install -y libatk-1_0-0 libatk-bridge-2_0-0 \\"
    echo "      libglib-2_0-0 mozilla-nss libXcomposite1 libXdamage1 \\"
    echo "      libXfixes3 libXrandr2 libXtst6 libxkbcommon0 libdrm2 \\"
    echo "      libgbm1 libasound2 libgtk-3-0 pciutils usbutils sysstat"
    echo ""
    echo "  On RHEL/Rocky (dnf), install:"
    echo "    sudo dnf install -y atk at-spi2-atk glib2 nss libXcomposite \\"
    echo "      libXdamage libXfixes libXrandr libXtst libxkbcommon libdrm \\"
    echo "      mesa-libgbm alsa-lib gtk3 pciutils usbutils sysstat"
    echo ""
    echo "  After installing, re-run this installer:"
    echo "    sudo $0 --config $CONFIG_FILE"
    echo ""
    echo "[INFO] Removing copied files to keep system clean..."
    rm -rf "$INSTALL_DIR"
    exit 1
  fi

  echo "[INFO] All shared libraries verified. ✓"
}

verify_runtime_libs

echo "[INFO] Configuring background service..."

# Hand off to the standard RPM install script which handles:
#   - dedicated cybrxagent system user
#   - /var/lib/cybrxagent/ directories
#   - license.conf placement
#   - hardened systemd unit + enable/start
bash "$INSTALL_DIR/resources/linux/rpm/install.sh" --config "$CONFIG_FILE"

echo ""
echo "======================================================"
echo "  [SUCCESS] $APP_NAME installed and started!"
echo "======================================================"
