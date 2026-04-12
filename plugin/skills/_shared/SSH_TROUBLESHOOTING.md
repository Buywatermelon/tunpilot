# SSH & Systemd Troubleshooting (Shared)

Generic failure modes that apply to any SSH-driven TunPilot skill. Protocol-specific issues stay in each skill's own troubleshooting table.

| Symptom | Cause | Fix |
|---------|-------|-----|
| `SSH command failed (exit 255)` | SSH connection refused or auth failed | Verify `ssh_alias`/`ssh_user`, SSH key setup, node reachability. Test: `ssh <server> "echo ok"` |
| `SSH command failed (exit 1)` with empty stdout | SSH connected but remote command failed | Run the offending command interactively to see stderr: `ssh <server> "<command>"` |
| `Permission denied (publickey)` | SSH key not authorised on remote | Copy key: `ssh-copy-id <server>` or append the pubkey to `~/.ssh/authorized_keys` on the node |
| `Host key verification failed` | Remote key changed (reinstall, IP reuse) | Remove stale entry: `ssh-keygen -R <host>` then re-accept on next connect |
| `sudo: a password is required` | Non-root user without passwordless sudo | Either SSH as root or grant `NOPASSWD` in `/etc/sudoers.d/` |
| Service `failed` state after install | Config syntax error or port conflict | `ssh <server> "journalctl -u <service> --no-pager -n 50"` to read the failure reason |
| `Address already in use` | Port 443/80 occupied by nginx/apache/other | `ssh <server> "ss -tlnp | grep -E ':80|:443'"` — stop or move the conflicting service |
| Service restart loop | Dependency crash or file permission | Check `ReadWritePaths` in the systemd hardening drop-in — it must include every path the service writes to |
| `apt-get install` hangs | Interactive prompt (e.g. sshd config) | Ensure `DEBIAN_FRONTEND=noninteractive` is set, or append `-o Dpkg::Options::="--force-confold"` |
