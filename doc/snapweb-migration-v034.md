# Snapweb Migration for Snapcast v0.34+

## Owner
- Robbie De Wet

## What changed
- In Snapcast `v0.34+`, the repository contains a placeholder page in `server/etc/snapweb/index.html`.
- The real Snapweb UI is now distributed as a separate project release (`badaix/snapweb`).
- This means Snapserver/Snapclient upgrades and Snapweb upgrades are now separate operations.

## Target layout on DietPi
- Snapserver package/service installed normally.
- Snapweb extracted to doc root, usually:
  - `/usr/share/snapserver/snapweb`, or
  - `/usr/share/snapweb`
- Custom files stored in overlay directory:
  - `/opt/snapweb-custom-overlay`

## Migration steps from old custom UI
1. Backup old web root from existing Pi.
2. Install latest Snapweb release into doc root.
3. Reapply only your custom files using overlay.
4. Restart Snapserver and verify.

## Helper scripts in this repo
- `scripts/snapcast_upgrade_preserve_snapweb.sh`
  - Upgrades Snapserver/Snapclient packages.
  - Reapplies overlay to existing doc root.
- `scripts/update_snapweb_release_with_overlay.sh`
  - Downloads latest `snapweb.zip` from GitHub releases.
  - Installs it into doc root.
  - Reapplies overlay and restarts Snapserver.

## Recommended workflow per upgrade cycle
1. Update Snapserver/Snapclient:
   - `sudo scripts/snapcast_upgrade_preserve_snapweb.sh`
2. Update Snapweb:
   - `sudo scripts/update_snapweb_release_with_overlay.sh`
3. Hard refresh browser cache (`Ctrl+F5`).
4. Validate:
   - custom theme/logo present,
   - Follow Me toggle (when implemented) still appears,
   - room/group controls behave as expected.

## Overlay best practices
- Keep only edited files in overlay.
- Avoid copying entire upstream web root into overlay.
- Keep overlay under git in a private repo/branch.
- For JS-heavy customizations, prefer additive files/hooks when possible.

## Rollback
- Both scripts write timestamped backups under:
  - `/var/backups/snapcast/<timestamp>`
  - `/var/backups/snapweb/<timestamp>`
- Restore by copying backup back to doc root, then restart Snapserver.
