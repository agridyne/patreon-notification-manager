# Patreon Notification Manager
An overcomplicated userscript for auditing and managing Patreon creator email notification settings.

## What it does
Patreon Notification Manager helps you:
- Run a read-only baseline audit of creator email notification settings
- Store audit results locally in your browser using IndexedDB
- Compare stored settings against a selected target profile
- Apply a target profile to creators that need changes
- Re-audit selected creators, new creators, or all creators
- Export/import stored audit data as JSON
- Use visual badges/highlights to quickly understand creator status

## Target profiles
Available target profiles:
- Messages Only — only creator messages stay enabled
- All Off — all known notification toggles are disabled
- All On — all known notification toggles are enabled
- Custom — choose exactly which notification types should be enabled

## Safety notes
- The first audit and re-audit actions are read-only. They do not change Patreon settings.
- Apply actions change Patreon toggles, and Patreon auto-saves each toggle change. The script asks for confirmation before batch apply actions.
- Unknown toggles are skipped.

## Installation
1. Install Violentmonkey or Tampermonkey.
2. Open src/patreon-notification-manager.user.js.
3. Copy the script into a new userscript.
4. Save it.
5. Go to: https://www.patreon.com/settings/email

## Basic workflow
1. Open the Patreon email settings page.
2. Run First Audit.
3. Wait for the baseline audit to complete.
4. Select a target profile.
5. Review highlights and badges.
6. Use Apply Target Profile when ready.

## Data storage
- Audit data is stored locally in your browser using IndexedDB.
- Use Export Stored JSON before clearing browser/site data or moving browsers.

## Disclaimer
This is an unofficial tool and is not affiliated with Patreon.

**Use at your own risk.**
