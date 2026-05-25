# CybrxAgent — SUSE Linux Enterprise Server (SLES) Installation Guide

> **Applies to:** SLES 15 SP5, SP6, SP7 (minimal server ISO, no Desktop GUI)
> **Package format:** `.tar.gz` portable installer (preferred for SUSE — avoids RPM dependency name mismatches)
> **Maintained by:** Update this file whenever new SUSE-specific issues are discovered.

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Step 1 — Enable zypper Repositories](#2-step-1--enable-zypper-repositories)
3. [Step 2 — Install Runtime Dependencies](#3-step-2--install-runtime-dependencies)
4. [Step 3 — Configure Static Network](#4-step-3--configure-static-network)
5. [Step 4 — Configure DNS](#5-step-4--configure-dns)
6. [Step 5 — Install and Enable SSH](#6-step-5--install-and-enable-ssh)
7. [Step 6 — Configure Firewall for SSH](#7-step-6--configure-firewall-for-ssh)
8. [Step 7 — Install CybrxAgent](#8-step-7--install-cybrxagent)
9. [Step 8 — Verify the Service](#9-step-8--verify-the-service)
10. [Troubleshooting Reference](#10-troubleshooting-reference)

---

## 1. Prerequisites

Before starting, you need:

| Item | Detail |
|---|---|
| SLES ISO | Minimal server installation (no Desktop GUI required) |
| License file | `agent.config` — your CybrX license configuration |
| CybrxAgent package | `CybrxAgent-1.0.0.tar.gz` |
| Root access | All commands require `root` or `sudo` |
| Network | Static IP configured (see Step 3) |

> **Why `.tar.gz` instead of `.rpm`?**
> SUSE uses different library package names from RHEL (e.g. `libatk-1_0-0` vs `atk`). The RPM package declares RHEL-style dependency names which zypper cannot resolve. The `.tar.gz` installer installs all dependencies directly using correct SUSE package names.

---

## 2. Step 1 — Enable zypper Repositories

On a freshly installed minimal SLES, repositories may be disabled. Enable them first or zypper will fail to install any packages.

```bash
# List all available repositories and their status
zypper repos
```

Enable the required modules:

```bash
zypper modifyrepo -e SLES15-SP6-15.6-0
zypper modifyrepo -e Basesystem-Module_15.6-0
zypper modifyrepo -e Server-Applications-Module_15.6-0
zypper modifyrepo -e Desktop-Applications-Module_15.6-0
zypper modifyrepo -e Python-3-Module_15.6-0
```

> **Note:** Repository names vary by SP version. Adjust the version suffix (e.g. `15.6-0` → `15.5-0`) to match your installation. Use `zypper repos` to see the exact names.

Refresh repository metadata:

```bash
zypper refresh
```

---

## 3. Step 2 — Install Runtime Dependencies

The agent runs fully headless (`--ozone-platform=headless --disable-gpu`) but Electron's binary is dynamically linked against these system libraries. They must be present on disk even though no GUI is displayed.

```bash
sudo zypper install -y \
  mozilla-nss \
  libgbm1 \
  libXtst6 \
  libXrandr2 \
  libXcomposite1 \
  libXdamage1 \
  libXfixes3 \
  libxkbcommon0 \
  libdrm2 \
  libatk-1_0-0 \
  libatk-bridge-2_0-0 \
  libgtk-3-0 \
  libasound2 \
  pciutils \
  usbutils \
  sysstat
```

> **Why are GUI libraries required on a headless server?**
> See `build/linux/dependecies.md` for a full explanation. Short answer: Electron's binary has ELF-level hard links to these `.so` files. The Linux dynamic linker requires them to be on disk at process startup — even if the code path that uses them is never reached.

> **`cups-libs` / `libcups2` note:** SLES 12 does not have this package. On SLES 15 it may be available, but it is not required — Electron handles its absence gracefully (lazy-loaded). Do not add it to the install command unless you see a specific `libcups.so.2` error.

### Verify Installation

```bash
# Confirm all key libraries are resolvable by the dynamic linker
ldconfig -p | grep -E "libatk|libgtk|libgbm|libnss"
```

---

## 4. Step 3 — Configure Static Network

SUSE uses `wicked` (not NetworkManager) as its network manager on SLES 15 server editions.

### Configure the Network Interface

```bash
sudo vim /etc/sysconfig/network/ifcfg-eth0
```

Add/set these values (adjust `IPADDR` to your environment):

```ini
BOOTPROTO='static'
STARTMODE='auto'
IPADDR='192.168.21.222/24'
NAME='eth0'
DEVICE='eth0'
```

> Replace `eth0` with your actual interface name. Run `ip addr` to see available interfaces (e.g. `ens33`, `ens3`, `eth0`).

### Configure Default Gateway

```bash
sudo vim /etc/sysconfig/network/routes
```

Add:

```
default 192.168.21.99 - eth0
```

### Disable IPv6 (Optional but Recommended for Minimal Installs)

```bash
sudo vim /etc/sysctl.conf
```

Add:

```ini
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
```

Apply immediately:

```bash
sudo sysctl -p
```

### Apply Network Configuration

```bash
sudo systemctl restart wicked
sudo wicked ifreload all
```

### Verify

```bash
ip addr          # confirm IP address is assigned
ip route         # confirm default gateway appears
ping -c 4 192.168.21.99   # ping your gateway
```

---

## 5. Step 4 — Configure DNS

SUSE manages DNS through `netconfig` — do **not** edit `/etc/resolv.conf` directly (wicked overwrites it on every network change).

### Set Static DNS Servers

```bash
sudo bash -c 'echo "NETCONFIG_DNS_STATIC_SERVERS=\"8.8.8.8 8.8.4.4\"" \
  >> /etc/sysconfig/network/config'

sudo bash -c 'echo "NETCONFIG_DNS_POLICY=\"STATIC\"" \
  >> /etc/sysconfig/network/config'
```

### Apply DNS Configuration

```bash
sudo netconfig update -f
sudo systemctl restart wicked
```

### Verify

```bash
cat /etc/resolv.conf
# Expected output:
# nameserver 8.8.8.8
# nameserver 8.8.4.4
```

### Test Connectivity

```bash
ping -c 4 8.8.8.8     # tests raw internet (no DNS)
ping -c 4 google.com  # tests DNS resolution
```

**Diagnosis matrix:**

| 8.8.8.8 ping | google.com ping | Meaning |
|---|---|---|
| ✅ Works | ✅ Works | Fully connected |
| ✅ Works | ❌ Fails | DNS-only issue — check `resolv.conf` |
| ❌ Fails | ❌ Fails | Routing or firewall issue — check gateway, VMware network adapter |

### Emergency DNS Fix (if `netconfig` fails)

If the above doesn't work, you can temporarily overwrite `resolv.conf` directly:

```bash
sudo rm -f /etc/resolv.conf
sudo bash -c 'echo -e "nameserver 8.8.8.8\nnameserver 8.8.4.4" > /etc/resolv.conf'
ping google.com
```

> **Warning:** This is temporary. `wicked` will overwrite it on next network restart. Prefer the `netconfig` approach above for a permanent fix.

---

## 6. Step 5 — Install and Enable SSH

SSH is not always installed on a minimal SLES ISO. Install and enable it for remote management.

```bash
sudo zypper install -y openssh

sudo systemctl enable sshd
sudo systemctl start sshd

systemctl status sshd
```

---

## 7. Step 6 — Configure Firewall for SSH

SLES 15 enables `firewalld` by default. Check if it's running and open the SSH port.

```bash
# Check firewall status
sudo firewall-cmd --state
# Expected: running
```

```bash
# Open SSH permanently
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# Confirm SSH is allowed
sudo firewall-cmd --list-services
# Expected: ssh (among others)

# Confirm SSH is listening
ss -tulpn | grep 22
# Expected: 0.0.0.0:22 or :::22
```

### Test from Windows

In PowerShell on your Windows machine:

```powershell
# Test network reachability
ping 192.168.21.222

# Test SSH port specifically
Test-NetConnection 192.168.21.222 -Port 22
# Expected: TcpTestSucceeded : True
```

---

## 8. Step 7 — Install CybrxAgent

Once network and dependencies are in place, run the portable tarball installer.

### Transfer the Package to SUSE

```bash
# From Windows (PowerShell) — SCP the files to SUSE
scp CybrxAgent-1.0.0.tar.gz pawan@192.168.21.222:/home/pawan/
scp agent.config pawan@192.168.21.222:/home/pawan/
```

### Extract and Install

```bash
# SSH into SUSE machine
ssh pawan@192.168.21.222

# Extract
tar -xzf CybrxAgent-1.0.0.tar.gz
cd CybrxAgent-1.0.0

# Run the installer
sudo ./resources/linux/tar/install.sh --config /home/pawan/agent.config
```

### What the Installer Does

1. **Dependency check** — Installs any missing packages via `zypper` using correct SUSE package names
2. **Copy files** — Copies application to `/opt/CybrxAgent/`
3. **Library verification** — Uses `readelf` (safe for Electron) to verify all `.so` files are resolvable
4. **Service setup** — Creates `cybrxagent` system user, writes hardened systemd unit, starts service

### ⚠️ Required Patch Before Running (All Current Builds)

> **Affects:** SLES 15 SP5, SP6, SP7, openSUSE Leap — confirmed across all versions.

The current `.tar.gz` build has a known issue where the library verifier does not search
the application's own directory for bundled Electron libraries (`libffmpeg.so`, `libEGL.so`, etc.).
This causes a false-positive failure. Apply this one-line patch **before** running the installer:

```bash
# Apply patch: tell the verifier to also search /opt/CybrxAgent for bundled Electron libs
sed -i 's|find /usr/lib /usr/lib64 /lib /lib64 /usr/local/lib \\|find /usr/lib /usr/lib64 /lib /lib64 /usr/local/lib "$INSTALL_DIR" \\|' \
  resources/linux/tar/install.sh

# Confirm the patch was applied (should show a line containing "$INSTALL_DIR")
grep -n "INSTALL_DIR" resources/linux/tar/install.sh
```

This patch is already fixed in the source repository. It will be included automatically in the
next build (`npm run dist:linux`). Until then, apply it manually every time you extract a new tarball.

---

## 9. Step 8 — Verify the Service

```bash
# Check service status
systemctl status cybrxagent

# Follow live logs
journalctl -t cybrxagent -f

# Check electron-store data files (created after first successful startup)
ls -la /var/lib/cybrxagent/.config/CybrxAgent/
```

### Expected Healthy State

```
Active: active (running) since ...
```

### Expected (Benign) Log Warnings on Minimal SUSE

These warnings appear on any minimal headless server and do NOT indicate a problem:

| Warning | Reason | Impact |
|---|---|---|
| `logname: no login name` | Running as system service | None |
| `dpkg-query: command not found` | SUSE uses rpm, not dpkg | Software inventory uses fallback |
| `xrandr: command not found` | No X11 display | Monitor info → N/A |
| `xinput: command not found` | No X11 display | Input device info → N/A |
| `lpstat: command not found` | CUPS tools not installed | Printer info → N/A |
| `aplay: command not found` | `alsa-utils` not installed | Sound card info → N/A |
| `/var/log/Xorg.0.log: No such file` | No X11 server running | Display driver info → N/A |

---

## 10. Troubleshooting Reference

### Agent fails with `EAI_AGAIN` (DNS error)

```
"error": "getaddrinfo EAI_AGAIN cybrx.ai"
```

The agent cannot resolve the server hostname. Fix DNS as per Step 4 above, then:

```bash
sudo systemctl restart cybrxagent
journalctl -t cybrxagent -f
```

### Agent starts then immediately stops (status=127)

`exit code 127` means a shared library is missing. Run `readelf` to find which one:

```bash
readelf -d /opt/CybrxAgent/cybrxagent | grep NEEDED | awk -F'[[]' '{print $2}' | tr -d ']' | while read lib; do
  ldconfig -p | grep -q "$lib" || echo "MISSING: $lib"
done
```

Install whichever package provides the missing `.so` using the table in `build/linux/dependecies.md`.

### `ldd` hangs when run on `cybrxagent`

This is expected — Electron's binary hooks into `LD_TRACE_LOADED_OBJECTS` and hangs. Always use `readelf -d` instead of `ldd` for Electron binaries. The installer already does this.

### Heartbeat skipped — missing assetId

```
"Heartbeat skipped - missing assetId"
```

The agent has not yet successfully registered with the CybrX backend. Usually caused by:
1. No DNS/network → fix Step 4
2. First install: wait 1–2 minutes after network is fixed, then: `sudo systemctl restart cybrxagent`

### zypper shows `Nothing to do` but install still fails

All packages are already installed with correct SUSE names but the RPM-named dependency check still fails. Use the `.tar.gz` installer (not `.rpm`) which bypasses RHEL-style dependency declarations.

### `libffmpeg.so` reported as missing by installer

This is Electron's own bundled FFmpeg — it ships inside the tarball at `/opt/CybrxAgent/libffmpeg.so`. The installer now correctly looks in the application directory for bundled libs. If you see this with an older build, apply the patch from Step 7 above.
