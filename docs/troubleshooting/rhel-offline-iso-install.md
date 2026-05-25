# Offline Installation of CybrxAgent on RHEL 7 / CentOS 7

## The Problem
When installing CybrxAgent on a fresh Red Hat Enterprise Linux (RHEL) machine that is **not registered with a Red Hat subscription server**, the installation will fail when trying to resolve dependencies (like `gtk3`, `cups-libs`, `libXdamage`). 

This occurs because `yum` requires an active subscription to download packages from the internet. However, all the necessary GUI libraries required by the agent are already present on the original RHEL installation ISO.

## The Solution: Using the ISO as a Local Repository
By mounting the RHEL installation ISO and configuring `yum` to use it as a local repository, you can completely bypass the need for an internet connection or a Red Hat subscription.

### Step 1: Connect the ISO
Ensure your RHEL/CentOS ISO is connected to your Virtual Machine.
- In VMware/VirtualBox, go to the VM settings, select the CD/DVD drive, attach your RHEL ISO file, and ensure it is marked as **Connected**.

### Step 2: Mount the ISO to the Filesystem
Open the terminal on your Linux machine and mount the CD-ROM to the `/mnt` directory:
```bash
sudo mount /dev/cdrom /mnt
```
*(Note: It is perfectly normal if the system returns a warning that the disk is mounted read-only).*

### Step 3: Configure the Local Repository
Create a temporary `yum` repository configuration file that points to the mounted ISO. You can do this by running the following block of code:

```bash
sudo sh -c 'cat > /etc/yum.repos.d/local.repo << EOF
[LocalRepo]
name=Local RHEL Offline Repository
baseurl=file:///mnt
enabled=1
gpgcheck=0
EOF'
```

### Step 4: Clear Cache and Install the Agent
Clear the old `yum` cache so it registers your new offline repository, and then run the installation command for the agent.

```bash
# 1. Clear the cache
sudo yum clean all

# 2. Install the agent (yum will automatically grab the dependencies from the ISO)
sudo CYBRX_LICENSE=agent.config yum install -y ./CybrxAgent-1.0.0.rpm
```

---

## ✅ Test Cases

### Test Case 1: Reproducing the initial error
**Steps:**
1. On an unregistered RHEL 7 VM, attempt to install without the ISO:
   `sudo CYBRX_LICENSE=agent.config yum install -y ./CybrxAgent-1.0.0.rpm`
**Expected Result:**
- Output should show `This system is not registered with an entitlement server.`
- Dependency resolution fails with `Requires: libXdamage`, `Requires: gtk3`, etc.

### Test Case 2: Verifying the ISO Mount
**Steps:**
1. Mount the CD-ROM using `sudo mount /dev/cdrom /mnt`
2. Run `ls /mnt`
**Expected Result:**
- The directory should list the contents of the RHEL installation disk (e.g., `Packages`, `repodata`, `images`).

### Test Case 3: Verifying the Local Repository configuration
**Steps:**
1. Create the `local.repo` file as instructed in Step 3.
2. Run `sudo yum repolist`
**Expected Result:**
- The output should list `LocalRepo` under the repo id column, showing that the offline repository is successfully recognized by `yum`.

### Test Case 4: Successful Offline Agent Installation
**Steps:**
1. Run the install command: `sudo CYBRX_LICENSE=agent.config yum install -y ./CybrxAgent-1.0.0.rpm`
**Expected Result:**
- `yum` successfully resolves dependencies (`gtk3`, `libXrandr`, etc.) from the `LocalRepo`.
- The `cybrxagent.service` starts successfully at the end of the installation.
- Running `systemctl status cybrxagent` shows the service is `active (running)`.
