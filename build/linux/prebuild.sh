#!/usr/bin/env bash
# =============================================================================
#  CybrxAgent — Linux Build Prerequisites
#  Called automatically by "npm run dist:linux" before electron-builder runs.
#
#  WHY THIS EXISTS:
#    electron-builder bundles a Ruby binary (fpm) to create .deb and .rpm
#    packages. That Ruby binary needs libcrypt.so.1, which was removed from
#    RHEL/Rocky/Alma 9+ in favour of libcrypt.so.2.
#    libxcrypt-compat provides the missing symlink.
#    rpm-build is required to produce .rpm packages.
#     
#    To give the executable permission to linux install and uninstall shell scripts
#  This script is a NO-OP on Ubuntu/Debian (they already have what's needed).
# =============================================================================

set -euo pipefail

echo ""
echo "======================================================"
echo "  CybrxAgent — Checking Linux build prerequisites"
echo "======================================================"

# ── DNF-based systems (Rocky / RHEL / CentOS / Fedora) ────────────────────
if command -v dnf &>/dev/null; then
  echo "[dnf] Detected RHEL/Rocky/Fedora system."

  PKGS=()

  if ! ldconfig -p 2>/dev/null | grep -q "libcrypt\.so\.1"; then
    echo "[dnf] libcrypt.so.1 not found — will install libxcrypt-compat."
    PKGS+=("libxcrypt-compat")
  else
    echo "[dnf] libcrypt.so.1 already present. ✓"
  fi

  if ! command -v rpmbuild &>/dev/null; then
    echo "[dnf] rpmbuild not found — will install rpm-build."
    PKGS+=("rpm-build")
  else
    echo "[dnf] rpmbuild already present. ✓"
  fi

  if [[ ${#PKGS[@]} -gt 0 ]]; then
    echo "[dnf] Installing: ${PKGS[*]}"
    dnf install -y "${PKGS[@]}"
    echo "[dnf] Done. ✓"
  fi

# ── APT-based systems (Ubuntu / Debian) ────────────────────────────────────
elif command -v apt-get &>/dev/null; then
  echo "[apt] Detected Debian/Ubuntu system."

  # rpm is only needed if building .rpm output on ubuntu
  if ! command -v rpmbuild &>/dev/null; then
    echo "[apt] rpmbuild not found — installing rpm package for cross-build."
    apt-get install -y rpm
  else
    echo "[apt] rpmbuild already present. ✓"
  fi

else
  echo "[WARN] Unknown package manager — skipping dependency check."
  echo "       Make sure libcrypt.so.1 and rpmbuild are available."
fi

# ── Ensure scripts are executable ──────────────────────────────────────────
echo "[fix] Setting executable permissions for Linux scripts..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
find "$SCRIPT_DIR" -name "*.sh" -exec chmod +x {} \;
find "$SCRIPT_DIR" -name "postInst" -exec chmod +x {} \;
find "$SCRIPT_DIR" -name "preInst" -exec chmod +x {} \;
find "$SCRIPT_DIR/tar" -type f -exec chmod +x {} \; 2>/dev/null || true
echo "[fix] Permissions applied. ✓"

echo ""
echo "  Prerequisites OK — starting electron-builder ..."
echo "======================================================"
echo ""
