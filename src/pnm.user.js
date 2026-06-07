(() => {
  "use strict";

  const APP_ID = "pnm-panel";
  const APP_VERSION = "0.6.1";
  const APP_AUTHOR_URL = "https://jduong.me";

  const SELECTORS = {
    openCreatorSettings: 'button[aria-label="Open creator email settings"]',
    closeCreatorSettings: 'button[aria-label="Close creator email settings"]',
    switches: 'button[role="switch"][aria-checked]'
  };

  const PATREON_NOTIFICATION_RULES = [
    { key: "newPaidPosts", label: "New posts", idIncludes: "emailAboutNewPaidPosts", desiredMessagesOnly: false },
    { key: "newQuips", label: "New quips", idIncludes: "isEmailNewQuickPostsEnabled", desiredMessagesOnly: false },
    { key: "postPreviews", label: "Previews of posts not included in your membership", idIncludes: "emailAboutNewPosts", desiredMessagesOnly: false },
    { key: "creatorMessages", label: "When this creator messages you", idIncludes: "emailOnMessageFromCampaign", desiredMessagesOnly: true },
    { key: "newMerchBenefit", label: "When a new merch benefit is added", idIncludes: "emailAboutNewMerchAdded", desiredMessagesOnly: false },
    { key: "merchStatusUpdates", label: "Updates and reminders about my eligibility for Merch by Patreon", idIncludes: "emailAboutMerchStatusUpdates", desiredMessagesOnly: false },
    { key: "creatorUpdates", label: "Creator updates", idIncludes: "creatorUpdates", desiredMessagesOnly: false },
    { key: "creatorRecommendations", label: "Creator recommendations", idIncludes: "recommendations", desiredMessagesOnly: false },
    { key: "lives", label: "Lives", idIncludes: "lives", desiredMessagesOnly: false }
  ];

  const TARGET_PROFILES = {
    messagesOnly: { key: "messagesOnly", label: "Messages Only" },
    allOff: { key: "allOff", label: "All Off" },
    allOn: { key: "allOn", label: "All On" },
    custom: { key: "custom", label: "Custom" }
  };

  const DEFAULT_CUSTOM_PROFILE = {
    newPaidPosts: false,
    newQuips: false,
    postPreviews: false,
    creatorMessages: true,
    newMerchBenefit: false,
    merchStatusUpdates: false,
    creatorUpdates: false,
    creatorRecommendations: false,
    lives: false
  };

  const TIMING = {
    openSettingsDelayMs: 1800,
    closeSettingsDelayMs: 1200,
    toggleSaveDelayMs: 1400,
    betweenCreatorsDelayMs: 1000,
    waitTimeoutMs: 12000
  };

  const DB_CONFIG = {
    name: "PatreonNotificationManagerDB",
    version: 2,
    storeName: "memberships",
    metaStoreName: "meta"
  };

  const DEFAULT_RUN_LIMIT = 5;
  const LOG_LIMIT = 300;

  let activeTargetProfileKey = "messagesOnly";
  let customTargetProfile = { ...DEFAULT_CUSTOM_PROFILE };
  let runLimit = DEFAULT_RUN_LIMIT;
  let runStartIndex = 0;

  let automationRunning = false;
  let panelOpen = false;
  let activePanelTab = "main";
  let highlightingEnabled = true;
  let storedStatusBadgesEnabled = true;
  let currentSettingsBadgesEnabled = true;
  let selectionModeEnabled = false;
  let selectAllCreatorsEnabled = false;
  let selectedMembershipKeys = new Set();
  let firstAuditCompleted = false;
  let firstAuditMeta = null;

  let lastViewMode = "unknown";
  let lastCreatorName = null;
  let lastLiveSummarySignature = "";

  let liveSummaryTimer = null;
  let membershipCardsRefreshObserver = null;
  let membershipCardsRefreshTimer = null;
  let creatorVisualRefreshTimer = null;
  let browserResizeHideTimer = null;
  let browserIsResizing = false;

  let logEntries = [];


  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function log(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const entry = { timestamp, message, data };

    logEntries.unshift(entry);

    if (logEntries.length > LOG_LIMIT) {
      logEntries = logEntries.slice(0, LOG_LIMIT);
    }

    if (data) console.log(`[PNM] ${message}`, data);
    else console.log(`[PNM] ${message}`);

    if (activePanelTab === "log") renderLogTab();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeKey(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  // ---------------------------------------------------------------------------
  // Panel construction
  // ---------------------------------------------------------------------------

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #${APP_ID} {
        position: fixed;
        top: 120px;
        right: 0;
        z-index: 1000005;
        width: 460px;
        height: 75vh;
        transform: translateX(412px);
        transition: transform 160ms ease;
        background: #111;
        color: #f5f5f5;
        border: 1px solid #444;
        border-right: none;
        border-radius: 12px 0 0 12px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 8px 30px rgba(0,0,0,.35);
        overflow: hidden;
      }

      #${APP_ID}.pnm-open { transform: translateX(0); }

      #${APP_ID}-tab {
        position: absolute;
        left: 0;
        top: 0;
        width: 48px;
        height: 100%;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        align-items: center;
        justify-items: center;
        gap: 8px;
        padding: 8px 0;
        box-sizing: border-box;
        background: #222;
        color: #fff;
        border-right: 1px solid #444;
        user-select: none;
      }

      .pnm-tab-icon {
        width: 30px !important;
        height: 30px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 1px solid #555 !important;
        border-radius: 8px !important;
        background: #111 !important;
        color: #fff !important;
        cursor: pointer;
        font-size: 15px !important;
        line-height: 1 !important;
        display: flex !important;
        align-items: center;
        justify-content: center;
      }

      .pnm-tab-icon:hover { background: #333 !important; }
      .pnm-tab-icon.pnm-tab-active { background: #333 !important; border-color: #888 !important; }

      .pnm-panel-toggle-button {
        width: 36px !important;
        height: auto !important;
        min-height: 30px !important;
        padding: 5px 3px !important;
        font-size: 10px !important;
        line-height: 1.1 !important;
        writing-mode: vertical-rl;
        text-orientation: mixed;
      }

      #${APP_ID}-toggle { grid-row: 1; }
      #${APP_ID}-tab-actions { grid-row: 2; }

      .pnm-tab-actions {
        display: none;
        flex-direction: column;
        gap: 6px;
        align-items: center;
      }

      #${APP_ID}.pnm-open .pnm-tab-actions { display: flex; }

      .pnm-tab-bottom-actions {
        grid-row: 4;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: center;
      }

      #${APP_ID}-tab-label {
        grid-row: 3;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-size: 12px;
        letter-spacing: .12em;
        line-height: 1;
        align-self: center;
        justify-self: center;
      }

      #${APP_ID}.pnm-open #${APP_ID}-tab-label { display: none; }

      #${APP_ID}-content {
        margin-left: 48px;
        padding: 12px;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      #${APP_ID}-panel-title {
        display: none;
        margin: 8px 0 18px;
        padding: 0 0 14px;
        text-align: center;
        font-size: 15px;
        font-weight: 800;
        color: #f5f5f5;
        letter-spacing: .02em;
        line-height: 1.2;
        border-bottom: 1px solid #333;
        white-space: nowrap;
      }

      #${APP_ID}.pnm-open #${APP_ID}-panel-title { display: block; }

      .pnm-view-title {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
      }

      #${APP_ID} button {
        width: 100%;
        margin: 4px 0;
        padding: 8px 10px;
        border: 1px solid #555;
        border-radius: 8px;
        background: #1f1f1f;
        color: #fff;
        cursor: pointer;
        font-size: 13px;
      }

      #${APP_ID} button:hover { background: #2b2b2b; }

      #${APP_ID}-summary {
        margin: 8px 0;
        padding: 8px;
        max-height: none;
        overflow: visible;
        border: 1px solid #333;
        border-radius: 8px;
        background: #181818;
        font-size: 12px;
        line-height: 1.35;
      }

      #${APP_ID}-footer {
        flex: 0 0 auto;
        margin-top: auto;
        padding: 10px 2px 0;
        text-align: right;
        color: #9a9a9a;
        font-size: 10px;
        line-height: 1.2;
        background: #111;
      }

      #${APP_ID}-footer a { color: #cfcfcf; text-decoration: none; }
      #${APP_ID}-footer a:hover { text-decoration: underline; }

      .pnm-hidden { display: none !important; }

      .pnm-run-controls-disabled {
        opacity: .45;
      }

      .pnm-run-controls-disabled input {
        cursor: not-allowed;
      }
      .pnm-panel-view {
        display: block;
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding-bottom: 12px;
      }

      .pnm-panel-view.pnm-hidden { display: none !important; }


      .pnm-control-group {
        margin: 8px 0;
        padding: 8px;
        border: 1px solid #333;
        border-radius: 8px;
        background: #181818;
      }

      .pnm-control-group label {
        display: block;
        margin-bottom: 5px;
        color: #cfcfcf;
        font-size: 11px;
        letter-spacing: .04em;
        text-transform: uppercase;
      }

      .pnm-control-group select {
        width: 100%;
        padding: 7px 60px 7px 8px;
        border: 1px solid #555;
        border-radius: 8px;
        background-color: #101010;
        background-image:
          linear-gradient(45deg, transparent 50%, #cfcfcf 50%),
          linear-gradient(135deg, #cfcfcf 50%, transparent 50%);
        background-position:
          calc(100% - 20px) 50%,
          calc(100% - 14px) 50%;
        background-size: 6px 6px, 6px 6px;
        background-repeat: no-repeat;
        color: #fff;
        font-size: 13px;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
      }

      .pnm-custom-header { margin-bottom: 8px; color: #f5f5f5; font-size: 12px; font-weight: 700; }
      .pnm-custom-help { margin: 8px 0 0; color: #a8a8a8; font-size: 11px; line-height: 1.25; }

      .pnm-toggle-row {
        display: flex !important;
        align-items: center;
        gap: 8px;
        margin: 6px 0 !important;
        color: #d8d8d8 !important;
        font-size: 12px !important;
        line-height: 1.25;
        text-transform: none !important;
        letter-spacing: 0 !important;
      }

      .pnm-toggle-row input { flex: 0 0 auto; }
      .pnm-toggle-row span { flex: 1; }
      .pnm-toggle-row.pnm-hidden { display: none !important; }


      .pnm-custom-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
      .pnm-custom-actions button { margin: 0 !important; padding: 7px 8px !important; font-size: 12px !important; }

      .pnm-run-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .pnm-run-controls label { display: block !important; margin: 0 !important; text-transform: none !important; letter-spacing: 0 !important; }
      .pnm-run-controls span { display: block; margin-bottom: 5px; color: #cfcfcf; font-size: 11px; }
      .pnm-run-controls input {
        width: 100%; box-sizing: border-box; padding: 7px 8px; border: 1px solid #555;
        border-radius: 8px; background: #101010; color: #fff; font-size: 13px;
      }


      .pnm-selection-row input:disabled,
      .pnm-selection-row input:disabled + span {
        opacity: .45;
        cursor: not-allowed;
      }

      .pnm-run-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
      }

      .pnm-run-actions button {
        margin: 0 !important;
      }

      .pnm-selection-row {
        display: flex !important;
        align-items: center;
        gap: 8px;
        margin: 0 0 8px !important;
        text-transform: none !important;
        letter-spacing: 0 !important;
        color: #d8d8d8 !important;
        font-size: 12px !important;
      }

      .pnm-selection-row input { flex: 0 0 auto; }
      .pnm-selection-count { margin-top: 8px; color: #aaa; font-size: 11px; }

      .pnm-danger-button { border-color: #8b2c2c !important; }

      .pnm-card-stored { outline: 2px solid #3fb950 !important; outline-offset: 3px !important; }
      .pnm-card-new { outline: 2px solid #f2cc60 !important; outline-offset: 3px !important; }
      .pnm-card-needs-change { outline: 2px solid #ff424d !important; outline-offset: 3px !important; }
      .pnm-card-highlight { outline: 2px solid #ff424d !important; outline-offset: 3px !important; }

      .pnm-card-index-badge {
        position: absolute;
        left: 8px;
        top: 8px;
        z-index: 20;
        min-width: 42px;
        max-width: 42px;
        padding: 5px 7px;
        border: 1px solid #555;
        border-radius: 9px;
        background: #111;
        color: #f5f5f5;
        font-size: 11px;
        line-height: 1.2;
        text-align: center;
        box-shadow: 0 4px 16px rgba(0,0,0,.35);
        white-space: nowrap;
        overflow: hidden;
        cursor: default;
      }

      .pnm-card-index-badge:hover { max-width: 240px; width: max-content; text-align: left; }
      .pnm-card-index-badge .pnm-card-index-detail { display: none; margin-top: 4px; color: #cfcfcf; }
      .pnm-card-index-badge:hover .pnm-card-index-detail { display: block; }
      .pnm-card-index-badge-new { border-color: #f2cc60; }
      .pnm-card-index-badge-stored { border-color: #3fb950; }
      .pnm-card-index-badge-needs-change { border-color: #ff424d; }

      .pnm-card-status-badges {
        position: absolute;
        left: 132px;
        right: 58px;
        bottom: 14px;
        z-index: 20;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        align-items: center;
      }

      .pnm-card-status-pill {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 4px 7px;
        border: 1px solid #555;
        border-radius: 999px;
        background: #111;
        color: #f5f5f5;
        font-size: 11px;
        line-height: 1.1;
        box-shadow: 0 4px 16px rgba(0,0,0,.25);
        white-space: nowrap;
      }

      .pnm-card-status-pill-stored { border-color: #3fb950; }
      .pnm-card-status-pill-new { border-color: #f2cc60; }
      .pnm-card-status-pill-needs-change { border-color: #ff424d; }
      .pnm-card-status-pill-muted { border-color: #555; color: #cfcfcf; }


      .pnm-current-settings-badge {
        position: absolute;
        z-index: 1000001;
        width: 250px;
        box-sizing: border-box;
        padding: 8px;
        border: 1px solid #555;
        border-radius: 10px;
        background: #111;
        color: #f5f5f5;
        font-size: 10.5px;
        line-height: 1.2;
        box-shadow: 0 4px 16px rgba(0,0,0,.35);
        overflow: hidden;
      }

      .pnm-current-settings-badge strong {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
      }

      .pnm-current-settings-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 5px 7px;
        align-items: start;
      }

      .pnm-current-settings-item {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .pnm-current-settings-empty {
        color: #aaa;
        font-size: 11px;
      }

      .pnm-card-select-badge {
        position: absolute;
        z-index: 1000001;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #555;
        border-radius: 9px;
        background: #111;
        color: #f5f5f5;
        box-shadow: 0 4px 16px rgba(0,0,0,.35);
        cursor: pointer;
      }

      .pnm-card-select-badge input {
        width: 16px;
        height: 16px;
        margin: 0;
        cursor: pointer;
      }

      .pnm-card-select-badge.pnm-card-select-badge-selected {
        border-color: #8ab4f8;
      }

      .pnm-card-overlay-anchor {
        position: relative !important;
        overflow: visible !important;
      }

      .pnm-status-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .pnm-status-table th, .pnm-status-table td {
        padding: 8px 6px;
        border-bottom: 1px solid #252525;
        text-align: left;
        vertical-align: top;
      }
      .pnm-status-table th { color: #cfcfcf; background: #181818; font-weight: 700; }
      .pnm-status-table th:nth-child(1), .pnm-status-table td:nth-child(1) { width: 42%; }
      .pnm-status-table th:nth-child(2), .pnm-status-table td:nth-child(2),
      .pnm-status-table th:nth-child(3), .pnm-status-table td:nth-child(3),
      .pnm-status-table th:nth-child(4), .pnm-status-table td:nth-child(4) { width: 12%; text-align: center; }
      .pnm-status-table th:nth-child(5), .pnm-status-table td:nth-child(5) { width: 22%; }

      .pnm-muted { color: #aaa; }

      .pnm-readme-box {
        margin: 0 0 10px;
        padding: 10px;
        border: 1px solid #333;
        border-radius: 8px;
        background: #181818;
        font-size: 12px;
        line-height: 1.45;
      }

      .pnm-readme-box strong {
        color: #f5f5f5;
      }
      .pnm-modal-button-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
      .pnm-log-row { padding: 6px 0; border-bottom: 1px solid #252525; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    if (document.querySelector(`#${APP_ID}`)) return;

    const panel = document.createElement("div");
    panel.id = APP_ID;
    panel.innerHTML = `
      <div id="${APP_ID}-tab" title="Patreon Notification Manager">
        <button id="${APP_ID}-toggle" class="pnm-tab-icon" type="button" title="Open Panel" aria-label="Open panel">⮜</button>

        <div id="${APP_ID}-tab-actions" class="pnm-tab-actions">
          <button id="${APP_ID}-tab-main" class="pnm-tab-icon" type="button" title="Main Controls" aria-label="Main Controls">⚙</button>
          <button id="${APP_ID}-tab-data" class="pnm-tab-icon" type="button" title="Data Tools" aria-label="Data Tools">🖫</button>
          <button id="${APP_ID}-tab-log" class="pnm-tab-icon" type="button" title="Log" aria-label="Log">🖹</button>
          <button id="${APP_ID}-tab-readme" class="pnm-tab-icon" type="button" title="README" aria-label="README">?</button>
        </div>

        <span id="${APP_ID}-tab-label">Patreon Notification Manager</span>

        <div class="pnm-tab-bottom-actions">
          <button id="${APP_ID}-toggle-current-settings-badges" class="pnm-tab-icon pnm-after-baseline" type="button" title="Hide Last Audit Settings Badges" aria-label="Hide Last Audit Settings Badges">☷</button>
          <button id="${APP_ID}-toggle-stored-badges" class="pnm-tab-icon pnm-after-baseline" type="button" title="Hide Stored Status Badges" aria-label="Hide Stored Status Badges">▤</button>
          <button id="${APP_ID}-toggle-highlights" class="pnm-tab-icon pnm-after-baseline" type="button" title="Hide Highlights" aria-label="Hide Highlights">👁</button>
        </div>
      </div>

      <div id="${APP_ID}-content">
        <div id="${APP_ID}-panel-title">Patreon Notification Manager</div>
        <div id="${APP_ID}-view-main" class="pnm-panel-view">
          <h3 class="pnm-view-title">Main Controls</h3>
          <div id="${APP_ID}-first-audit-group" class="pnm-control-group">
            <div class="pnm-custom-header">Baseline Audit</div>
            <div id="${APP_ID}-first-audit-message" class="pnm-readme-box">
              Run a read-only baseline audit first. This opens each creator, records the current email notification settings locally, and does not change Patreon settings.<br><br>
              If the audit is interrupted, the tool resumes from creators that do not have a stored audit record yet instead of starting over.<br><br>
              After the first audit completes, target profiles, run controls, highlights, stored status badges, new-creator auditing, and apply actions will unlock.
            </div>
            <button id="${APP_ID}-first-audit" type="button">Run First Audit</button>
          </div>

          <div class="pnm-control-group pnm-after-baseline">
            <label for="${APP_ID}-profile-select">Target Profile</label>
            <select id="${APP_ID}-profile-select">
              <option value="messagesOnly">Messages Only</option>
              <option value="allOff">All Off</option>
              <option value="allOn">All On</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div id="${APP_ID}-custom-profile" class="pnm-control-group pnm-hidden pnm-after-baseline">
            <div class="pnm-custom-header">Custom Target Profile</div>
            <div class="pnm-custom-help">Checked = target ON · Unchecked = target OFF</div>

            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="newPaidPosts"><span>New posts</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="newQuips"><span>New quips</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="postPreviews"><span>Previews of posts not included in your membership</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="creatorMessages"><span>When this creator messages you</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="newMerchBenefit"><span>New merch benefit</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="merchStatusUpdates"><span>Merch status / eligibility updates</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="creatorUpdates"><span>Creator updates</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="creatorRecommendations"><span>Creator recommendations</span></label>
            <label class="pnm-toggle-row"><input type="checkbox" data-pnm-custom-key="lives"><span>Lives</span></label>

            <div class="pnm-custom-actions">
              <button id="${APP_ID}-custom-all-off" type="button">Set Target: All Off</button>
              <button id="${APP_ID}-custom-messages-only" type="button">Set Target: Messages Only</button>
            </div>
          </div>

          <div id="${APP_ID}-run-controls-group" class="pnm-control-group pnm-after-baseline">
            <div class="pnm-custom-header">Run Controls</div>

            <label class="pnm-selection-row">
              <input id="${APP_ID}-selection-mode" type="checkbox">
              <span>Select Specific Creators</span>
            </label>

            <label class="pnm-selection-row">
              <input id="${APP_ID}-select-all-creators" type="checkbox">
              <span>Select All Creators</span>
            </label>

            <div id="${APP_ID}-run-limit-controls">
              <div class="pnm-run-controls">
                <label><span>Run limit</span><input id="${APP_ID}-run-limit" type="number" min="1" step="1" value="${DEFAULT_RUN_LIMIT}"></label>
                <label><span>Skip first</span><input id="${APP_ID}-run-start" type="number" min="0" step="1" value="0"></label>
              </div>
              <div class="pnm-custom-help">Default scope is Needs Target Update. Skip first ignores matching creators in the current run scope before processing. Limit controls how many matching creators are processed.</div>
            </div>

            <div id="${APP_ID}-selection-count" class="pnm-selection-count">Scope: Needs Review. Run limit / skip first are active.</div>

            <div class="pnm-run-actions">
              <button id="${APP_ID}-audit-new-creators" type="button" class="pnm-hidden">Audit New Creators</button>
              <button id="${APP_ID}-run-apply" type="button" class="pnm-danger-button">Apply Target Profile</button>
            </div>
          </div>

          <button id="${APP_ID}-apply-current" class="pnm-after-baseline">Apply Target Profile to Current View</button>
          <button id="${APP_ID}-stop">Stop Automation</button>

          <div id="${APP_ID}-summary">Ready.</div>
        </div>

        <div id="${APP_ID}-view-data" class="pnm-panel-view pnm-hidden"></div>
        <div id="${APP_ID}-view-log" class="pnm-panel-view pnm-hidden"></div>
        <div id="${APP_ID}-view-readme" class="pnm-panel-view pnm-hidden"></div>

        <input id="${APP_ID}-import-file" type="file" accept="application/json,.json" class="pnm-hidden">

        <div id="${APP_ID}-footer">
          created by <a href="${APP_AUTHOR_URL}" target="_blank" rel="noopener noreferrer">jduong.me</a> · v${APP_VERSION}
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    function bindClick(id, handler) {
      const button = document.querySelector(`#${APP_ID}-${id}`);

      if (!button) {
        log(`Button not found, listener skipped: ${id}`);
        return;
      }

      button.addEventListener("click", handler);
    }

    bindClick("toggle", togglePanel);
    bindClick("tab-main", () => setActivePanelTab("main"));
    bindClick("tab-data", () => setActivePanelTab("data"));
    bindClick("tab-log", () => setActivePanelTab("log"));
    bindClick("tab-readme", () => setActivePanelTab("readme"));
    bindClick("toggle-current-settings-badges", toggleCurrentSettingsBadges);
    bindClick("toggle-stored-badges", toggleStoredStatusBadges);
    bindClick("toggle-highlights", toggleHighlights);

    bindClick("apply-current", applyTargetProfileToCurrentView);
    bindClick("first-audit", runFirstAudit);
    bindClick("audit-new-creators", runAuditNewCreatorsFromControls);
    bindClick("run-apply", runApplyTargetProfileFromControls);

    bindClick("stop", () => {
      automationRunning = false;
      log("Stop requested. Automation will stop after the current step.");
    });

    const profileSelect = document.querySelector(`#${APP_ID}-profile-select`);

    if (profileSelect) {
      profileSelect.addEventListener("change", event => {
        activeTargetProfileKey = event.target.value;
        updateCustomProfileVisibility();
        syncCustomProfileInputs();
        log(`Target profile changed to: ${getActiveTargetProfile().label}`);

        if (isCreatorSettingsView()) refreshLiveSettingsSummary();
        else refreshListDashboard();
      });
    }

    const importFileInput = document.querySelector(`#${APP_ID}-import-file`);
    if (importFileInput) importFileInput.addEventListener("change", importStoredJsonFromFile);

    log("Panel loaded.");
    updateFirstAuditUi();

    loadFirstAuditState().then(() => {
      updateFirstAuditUi();
      refreshPanelForCurrentView();
    });

    syncCustomProfileInputs();
    updateCustomProfileVisibility();
    attachCustomProfileListeners();
    attachRunControlListeners();
    attachSelectionModeListener();
    readRunControls();
    setCurrentSettingsBadgeButtonText();
    setStoredStatusBadgeButtonText();
    setHighlightButtonText();

    updateContextualButtons();
    startContextWatcher();
    startPatreonNavigationWatcher();

    window.addEventListener("resize", handleBrowserResize);

    window.addEventListener("scroll", () => {
      scheduleCreatorCardVisualRefresh(150);
    }, true);

    setActivePanelTab("main");
    waitForMembershipCardsThenRefresh();
  }

  function setActivePanelTab(nextTab) {
    activePanelTab = nextTab;
    const views = ["main", "data", "log", "readme"];

    views.forEach(view => {
      const viewEl = document.querySelector(`#${APP_ID}-view-${view}`);
      const button = document.querySelector(`#${APP_ID}-tab-${view}`);
      if (viewEl) viewEl.classList.toggle("pnm-hidden", view !== nextTab);
      if (button) button.classList.toggle("pnm-tab-active", view === nextTab);
    });

    if (nextTab === "main") refreshPanelForCurrentView();
    if (nextTab === "data") renderDataToolsTab();
    if (nextTab === "log") renderLogTab();
    if (nextTab === "readme") renderReadmeTab();

    log(`Panel tab changed to: ${nextTab}`);
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const panel = document.querySelector(`#${APP_ID}`);
    const toggle = document.querySelector(`#${APP_ID}-toggle`);
    if (!panel) return;

    panel.classList.toggle("pnm-open", panelOpen);

    if (toggle) {
      toggle.textContent = panelOpen ? "⮞" : "⮜";
      toggle.title = panelOpen ? "Close Panel" : "Open Panel";
      toggle.setAttribute("aria-label", panelOpen ? "Close panel" : "Open panel");
    }

    log(panelOpen ? "Panel opened." : "Panel closed.");
    scheduleCreatorCardVisualRefresh(200);
  }

  function updateSummary(html) {
    const summary = document.querySelector(`#${APP_ID}-summary`);
    if (summary) summary.innerHTML = html;
  }


  // ---------------------------------------------------------------------------
  // Visual layer controls
  // ---------------------------------------------------------------------------

  function setHighlightButtonText() {
    const button = document.querySelector(`#${APP_ID}-toggle-highlights`);
    if (!button) return;

    button.textContent = highlightingEnabled ? "👁" : "⬭";
    button.title = highlightingEnabled ? "Hide Highlights" : "Show Highlights";
    button.setAttribute("aria-label", highlightingEnabled ? "Hide Highlights" : "Show Highlights");
  }

  function setStoredStatusBadgeButtonText() {
    const button = document.querySelector(`#${APP_ID}-toggle-stored-badges`);
    if (!button) return;

    button.textContent = storedStatusBadgesEnabled ? "⛃" : "⛁";
    button.title = storedStatusBadgesEnabled ? "Hide Stored Status Badges" : "Show Stored Status Badges";
    button.setAttribute(
      "aria-label",
      storedStatusBadgesEnabled ? "Hide Stored Status Badges" : "Show Stored Status Badges"
    );
  }

  function setCurrentSettingsBadgeButtonText() {
    const button = document.querySelector(`#${APP_ID}-toggle-current-settings-badges`);
    if (!button) return;

    button.textContent = currentSettingsBadgesEnabled ? "☷" : "☰";
    button.title = currentSettingsBadgesEnabled
      ? "Hide Last Audit Settings Badges"
      : "Show Last Audit Settings Badges";
    button.setAttribute(
      "aria-label",
      currentSettingsBadgesEnabled
        ? "Hide Last Audit Settings Badges"
        : "Show Last Audit Settings Badges"
    );
  }

  function toggleCurrentSettingsBadges() {
    if (!firstAuditCompleted) {
      log("Last audit settings badges are locked until the first audit completes.");
      return;
    }

    currentSettingsBadgesEnabled = !currentSettingsBadgesEnabled;
    setCurrentSettingsBadgeButtonText();

    if (!currentSettingsBadgesEnabled) {
      clearCurrentSettingsBadges();
      log("Last audit settings badges hidden.");
      return;
    }

    log("Last audit settings badges enabled.");
    refreshCreatorCardVisuals();
  }

  function toggleHighlights() {
    if (!firstAuditCompleted) {
      log("Highlights are locked until the first audit completes.");
      return;
    }

    highlightingEnabled = !highlightingEnabled;
    setHighlightButtonText();

    if (!highlightingEnabled) {
      clearHighlights();
      log("Highlights hidden.");
      return;
    }

    log("Highlights enabled.");
    refreshCreatorCardVisuals();
  }

  function toggleStoredStatusBadges() {
    if (!firstAuditCompleted) {
      log("Stored status badges are locked until the first audit completes.");
      return;
    }

    storedStatusBadgesEnabled = !storedStatusBadgesEnabled;
    setStoredStatusBadgeButtonText();

    if (!storedStatusBadgesEnabled) {
      clearStoredStatusBadges();
      log("Stored status badges hidden.");
      return;
    }

    log("Stored status badges enabled.");
    refreshCreatorCardVisuals();
  }


  // ---------------------------------------------------------------------------
  // Baseline and contextual UI
  // ---------------------------------------------------------------------------

  function isCreatorSettingsView() { return Boolean(document.querySelector(SELECTORS.closeCreatorSettings)); }

  function updateContextualButtons() {
    const inCreatorSettings = isCreatorSettingsView();
    const detailOnlyButtons = [`#${APP_ID}-apply-current`];
    const listOnlyButtons = [`#${APP_ID}-run-apply`];
    const runControlsGroup = document.querySelector(`#${APP_ID}-run-controls-group`);

    for (const selector of detailOnlyButtons) {
      const button = document.querySelector(selector);
      if (button) {
        button.classList.toggle("pnm-hidden", !firstAuditCompleted || !inCreatorSettings);
      }
    }

    for (const selector of listOnlyButtons) {
      const button = document.querySelector(selector);
      if (button) {
        button.classList.toggle("pnm-hidden", !firstAuditCompleted || inCreatorSettings);
      }
    }

    if (runControlsGroup) {
      runControlsGroup.classList.toggle("pnm-hidden", !firstAuditCompleted || inCreatorSettings);
    }

    updateCustomProfileVisibility();
  }

  function updateFirstAuditUi(results = null) {
    const firstAuditGroup = document.querySelector(`#${APP_ID}-first-audit-group`);
    const afterBaselineEls = document.querySelectorAll(".pnm-after-baseline");

    if (firstAuditGroup) firstAuditGroup.classList.toggle("pnm-hidden", firstAuditCompleted);
    afterBaselineEls.forEach(el => el.classList.toggle("pnm-hidden", !firstAuditCompleted));
    updateCustomProfileVisibility();
    updateContextualButtons();

    const firstAuditButton = document.querySelector(`#${APP_ID}-first-audit`);
    const firstAuditMessage = document.querySelector(`#${APP_ID}-first-audit-message`);

    if (!results?.length) {
      updateContextualButtons();
      return;
    }

    const totalCount = results.length;
    const unauditedCount = results.filter(item => item.state === "new").length;
    const auditedCount = totalCount - unauditedCount;
    const hasPartialBaseline = auditedCount > 0 && unauditedCount > 0;

    if (firstAuditButton) {
      if (unauditedCount === 0) {
        firstAuditButton.textContent = `Complete First Audit (${auditedCount}/${totalCount} audited)`;
      } else if (hasPartialBaseline) {
        firstAuditButton.textContent = `Resume First Audit (${unauditedCount} remaining)`;
      } else {
        firstAuditButton.textContent = `Run First Audit (${totalCount} creators)`;
      }
    }

    if (firstAuditMessage && !firstAuditCompleted) {
      firstAuditMessage.innerHTML = `
        Run a read-only baseline audit first. This opens each creator, records the current email notification settings locally, and does not change Patreon settings.<br><br>
        <strong>Progress:</strong> ${auditedCount}/${totalCount} creators audited locally.<br>
        <strong>Remaining:</strong> ${unauditedCount}<br><br>
        ${hasPartialBaseline ? "The first audit was started earlier. Click <strong>Resume First Audit</strong> to continue from unaudited creators instead of starting over.<br><br>" : "If the audit is interrupted, the tool will resume from unaudited creators instead of starting over.<br><br>"}
        After the first audit completes, target profiles, custom targets, run controls, highlights, stored status badges, new-creator auditing, and apply actions will unlock.
      `;
    }

    updateContextualButtons();
  }

  async function loadFirstAuditState() {
    firstAuditMeta = await dbGetMeta("firstAudit");
    firstAuditCompleted = Boolean(firstAuditMeta?.firstAuditCompleted);
    return firstAuditCompleted;
  }


  // ---------------------------------------------------------------------------
  // Profile and run controls
  // ---------------------------------------------------------------------------

  function getActiveTargetProfile() { return TARGET_PROFILES[activeTargetProfileKey] || TARGET_PROFILES.messagesOnly; }

  function getDesiredStateForRule(rule) {
    const activeProfile = getActiveTargetProfile();
    if (!rule) return null;

    switch (activeProfile.key) {
      case "allOff": return false;
      case "allOn": return true;
      case "custom": return Boolean(customTargetProfile[rule.key]);
      case "messagesOnly":
      default: return Boolean(rule.desiredMessagesOnly);
    }
  }

  function updateCustomProfileVisibility() {
    const editor = document.querySelector(`#${APP_ID}-custom-profile`);
    if (!editor) return;

    const shouldShow = firstAuditCompleted && activeTargetProfileKey === "custom";
    editor.classList.toggle("pnm-hidden", !shouldShow);

    if (shouldShow) {
      updateCustomProfileAvailableToggles();
    }
  }

  function syncCustomProfileInputs() {
    document.querySelectorAll("[data-pnm-custom-key]").forEach(input => {
      const key = input.getAttribute("data-pnm-custom-key");
      input.checked = Boolean(customTargetProfile[key]);
    });
  }

  function setCustomProfile(nextProfile) {
    customTargetProfile = { ...DEFAULT_CUSTOM_PROFILE, ...nextProfile };
    syncCustomProfileInputs();

    if (activeTargetProfileKey === "custom") {
      if (isCreatorSettingsView()) forceRefreshLiveSettingsSummary();
      else refreshListDashboard();
    }

    log("Custom profile updated.", customTargetProfile);
  }

  function attachCustomProfileListeners() {
    document.querySelectorAll("[data-pnm-custom-key]").forEach(input => {
      input.addEventListener("change", event => {
        const key = event.target.getAttribute("data-pnm-custom-key");
        customTargetProfile = { ...customTargetProfile, [key]: event.target.checked };
        log(`Custom profile changed: ${key} = ${event.target.checked ? "ON" : "OFF"}`);

        if (activeTargetProfileKey === "custom") {
          if (isCreatorSettingsView()) forceRefreshLiveSettingsSummary();
          else refreshListDashboard();
        }
      });
    });

    document.querySelector(`#${APP_ID}-custom-all-off`)?.addEventListener("click", () => {
      setCustomProfile({
        newPaidPosts: false,
        newQuips: false,
        postPreviews: false,
        creatorMessages: false,
        newMerchBenefit: false,
        merchStatusUpdates: false,
        creatorUpdates: false,
        creatorRecommendations: false,
        lives: false
      });
    });

    document.querySelector(`#${APP_ID}-custom-messages-only`)?.addEventListener("click", () => {
      setCustomProfile({ ...DEFAULT_CUSTOM_PROFILE });
    });
  }

  function readRunControls() {
    const limitInput = document.querySelector(`#${APP_ID}-run-limit`);
    const startInput = document.querySelector(`#${APP_ID}-run-start`);
    const parsedLimit = Number.parseInt(limitInput?.value, 10);
    const parsedStart = Number.parseInt(startInput?.value, 10);

    runLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : DEFAULT_RUN_LIMIT;
    runStartIndex = Number.isFinite(parsedStart) && parsedStart >= 0 ? parsedStart : 0;

    return { runLimit, runStartIndex };
  }

  function attachRunControlListeners() {
    const limitInput = document.querySelector(`#${APP_ID}-run-limit`);
    const startInput = document.querySelector(`#${APP_ID}-run-start`);

    [limitInput, startInput].forEach(input => {
      if (!input) return;
      input.addEventListener("change", () => {
        const controls = readRunControls();
        log(`Run controls updated: skip first ${controls.runStartIndex}, limit ${controls.runLimit}.`);
        if (activePanelTab === "main" && !isCreatorSettingsView()) refreshListDashboard();
      });
    });
  }

  function attachSelectionModeListener() {
    const selectionModeInput = document.querySelector(`#${APP_ID}-selection-mode`);
    const selectAllInput = document.querySelector(`#${APP_ID}-select-all-creators`);

    if (selectionModeInput) {
      selectionModeInput.checked = selectionModeEnabled;
      selectionModeInput.addEventListener("change", event => {
        selectionModeEnabled = event.target.checked;

        if (selectionModeEnabled) {
          selectAllCreatorsEnabled = false;
          if (selectAllInput) selectAllInput.checked = false;
        } else {
          selectedMembershipKeys.clear();
          clearCreatorSelectionBadges();
        }

        updateRunControlsVisibility();
        log(`Select Specific Creators ${selectionModeEnabled ? "enabled" : "disabled"}.`);
        refreshListDashboard();
      });
    }

    if (selectAllInput) {
      selectAllInput.checked = selectAllCreatorsEnabled;
      selectAllInput.addEventListener("change", event => {
        selectAllCreatorsEnabled = event.target.checked;

        if (selectAllCreatorsEnabled) {
          selectionModeEnabled = false;
          selectedMembershipKeys.clear();
          clearCreatorSelectionBadges();
          if (selectionModeInput) selectionModeInput.checked = false;
        }

        updateRunControlsVisibility();
        log(`Select All Creators ${selectAllCreatorsEnabled ? "enabled" : "disabled"}.`);
        refreshListDashboard();
      });
    }

    updateRunControlsVisibility();
  }

  function updateRunControlsVisibility() {
    const runLimitControls = document.querySelector(`#${APP_ID}-run-limit-controls`);
    const limitInput = document.querySelector(`#${APP_ID}-run-limit`);
    const startInput = document.querySelector(`#${APP_ID}-run-start`);
    const selectionCount = document.querySelector(`#${APP_ID}-selection-count`);
    const selectionModeInput = document.querySelector(`#${APP_ID}-selection-mode`);
    const selectAllInput = document.querySelector(`#${APP_ID}-select-all-creators`);

    const selectedCount = selectedMembershipKeys.size;
    const disableRunControls = selectionModeEnabled || selectAllCreatorsEnabled;

    if (selectionModeInput) {
      selectionModeInput.checked = selectionModeEnabled;
      selectionModeInput.disabled = selectAllCreatorsEnabled;
    }

    if (selectAllInput) {
      selectAllInput.checked = selectAllCreatorsEnabled;
      selectAllInput.disabled = selectionModeEnabled;
    }

    if (runLimitControls) {
      runLimitControls.classList.toggle("pnm-run-controls-disabled", disableRunControls);
    }

    [limitInput, startInput].forEach(input => {
      if (input) input.disabled = disableRunControls;
    });

    if (selectionCount) {
      if (selectAllCreatorsEnabled) {
        selectionCount.textContent = "Scope: All Creators. Run limit / skip first are disabled.";
      } else if (selectionModeEnabled) {
        selectionCount.textContent = selectedCount > 0
          ? `Scope: ${selectedCount} selected creator(s). Run limit / skip first are disabled.`
          : "Scope: Select Specific Creators. Use card checkboxes to choose creators.";
      } else {
        selectionCount.textContent = "Scope: Needs Review. Run limit / skip first are active.";
      }
    }
  }

  function getCurrentRunScopeLabel(action = "apply") {
    if (selectAllCreatorsEnabled) return "all creators";
    if (selectionModeEnabled) return "selected creators";
    return action === "audit" ? "new creators" : "needs target update";
  }

  function getCurrentRunScopeFilter(action = "apply") {
    if (selectAllCreatorsEnabled) return () => true;

    if (selectionModeEnabled) {
      return item => selectedMembershipKeys.has(item.membershipKey);
    }

    return action === "audit"
      ? item => item.isNew
      : item => item.isNotClean;
  }

  function sliceTargetsByRunControls(targets) {
    if (selectionModeEnabled || selectAllCreatorsEnabled) {
      return targets;
    }

    const controls = readRunControls();
    return targets.slice(controls.runStartIndex, controls.runStartIndex + controls.runLimit);
  }


  // ---------------------------------------------------------------------------
  // Navigation and wait helpers
  // ---------------------------------------------------------------------------

  function startContextWatcher() {
    const observer = new MutationObserver(() => {
      clearTimeout(liveSummaryTimer);
      liveSummaryTimer = setTimeout(() => refreshPanelForCurrentView(), 250);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-checked", "class"]
    });

    refreshPanelForCurrentView();
  }

  function startPatreonNavigationWatcher() {
    document.addEventListener("click", event => {
      const openButton = event.target.closest?.(SELECTORS.openCreatorSettings);
      const closeButton = event.target.closest?.(SELECTORS.closeCreatorSettings);

      if (openButton) {
        if (activePanelTab !== "main") setActivePanelTab("main");
        resetDetailSummary("Opening creator...");
        setTimeout(() => forceRefreshLiveSettingsSummary(), TIMING.openSettingsDelayMs);
        return;
      }

      if (closeButton) {
        lastLiveSummarySignature = "";
        lastCreatorName = null;
        updateSummary(`<strong>Membership list view</strong><br>Returning to membership list...`);
        setTimeout(() => waitForMembershipCardsThenRefresh(), TIMING.closeSettingsDelayMs);
      }
    }, true);
  }

  function refreshPanelForCurrentView() {
    const inCreatorSettings = isCreatorSettingsView();
    const currentViewMode = inCreatorSettings ? "detail" : "list";

    updateContextualButtons();
    updateCustomProfileAvailableToggles();

    if (activePanelTab !== "main") return;

    if (currentViewMode !== lastViewMode) {
      lastViewMode = currentViewMode;
      lastLiveSummarySignature = "";

      if (!inCreatorSettings) {
        updateCustomProfileAvailableToggles();
        waitForMembershipCardsThenRefresh();
        return;
      }

      resetDetailSummary("Opening creator...");
    }

    if (inCreatorSettings) forceRefreshLiveSettingsSummary();
  }

  function forceRefreshLiveSettingsSummary() {
    lastLiveSummarySignature = "";
    refreshLiveSettingsSummary();
  }

  function refreshLiveSettingsSummary() {
    if (activePanelTab !== "main") return;

    if (!isCreatorSettingsView()) {
      lastLiveSummarySignature = "";
      lastCreatorName = null;
      updateCustomProfileAvailableToggles();
      return;
    }

    if (!firstAuditCompleted) {
      lastLiveSummarySignature = "";
      const creatorName = getCurrentCreatorNameFromSettingsView();
      updateSummary(`
        <strong>Baseline audit required</strong><br>
        ${creatorName ? `<strong>Creator:</strong> ${escapeHtml(creatorName)}<br>` : ""}
        Target profile comparison and apply actions are locked until the first audit completes.<br><br>
        Return to the creator list and run <strong>Run First Audit</strong> to unlock target profiles, highlights, stored badges, run controls, new-creator auditing, and apply actions.
      `);
      return;
    }

    const creatorName = getCurrentCreatorNameFromSettingsView();
    const rows = getNotificationRows();

    if (!rows.length || !creatorName) {
      lastLiveSummarySignature = "";
      updateCustomProfileAvailableToggles();
      resetDetailSummary();
      return;
    }

    if (creatorName !== lastCreatorName) {
      lastCreatorName = creatorName;
      lastLiveSummarySignature = "";
      resetDetailSummary(`Loading ${creatorName}...`);
    }

    const status = readCurrentSettingsStatus();
    const signature = getCurrentSettingsSignature(status);

    updateCustomProfileAvailableToggles();

    if (signature === lastLiveSummarySignature) return;

    lastLiveSummarySignature = signature;
    renderStatusSummary(status, creatorName);
  }

  function resetDetailSummary(message = "Loading creator notification settings...") {
    lastLiveSummarySignature = "";
    updateSummary(`<strong>${escapeHtml(message)}</strong><br>Waiting for Patreon to render the current creator settings.`);
  }

  function waitForCondition(checkFn, timeoutMs = TIMING.waitTimeoutMs, intervalMs = 150) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        try {
          if (checkFn()) {
            clearInterval(timer);
            resolve(true);
            return;
          }
        } catch {
          // keep waiting
        }

        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Timed out waiting for condition."));
        }
      }, intervalMs);
    });
  }

  async function waitForSettingsView() {
    await waitForCondition(() => document.querySelectorAll(SELECTORS.switches).length > 0 && document.querySelector(SELECTORS.closeCreatorSettings));
  }

  async function waitForMembershipListView() {
    await waitForCondition(() => document.querySelectorAll(SELECTORS.openCreatorSettings).length > 0);
  }

  async function ensureMembershipListView() {
    if (!isCreatorSettingsView()) return true;

    const closeButton = document.querySelector(SELECTORS.closeCreatorSettings);

    if (!closeButton) {
      throw new Error("Currently inside a creator view, but the close button was not found.");
    }

    log("Returning to membership list before starting batch action.");
    closeButton.click();

    await waitForMembershipListView();
    await sleep(TIMING.closeSettingsDelayMs);

    return true;
  }

  function waitForMembershipCardsThenRefresh(timeoutMs = 8000) {
    if (isCreatorSettingsView()) return;
    clearTimeout(membershipCardsRefreshTimer);

    if (membershipCardsRefreshObserver) {
      membershipCardsRefreshObserver.disconnect();
      membershipCardsRefreshObserver = null;
    }

    const tryRefresh = () => {
      if (isCreatorSettingsView()) return false;
      const cards = findMembershipCards();
      if (cards.length > 0) {
        refreshListDashboard();
        return true;
      }
      return false;
    };

    if (tryRefresh()) return;

    updateSummary(`<strong>Membership list view</strong><br>Waiting for membership cards to render...`);

    membershipCardsRefreshObserver = new MutationObserver(() => {
      if (tryRefresh()) {
        membershipCardsRefreshObserver?.disconnect();
        membershipCardsRefreshObserver = null;
        clearTimeout(membershipCardsRefreshTimer);
        membershipCardsRefreshTimer = null;
      }
    });

    membershipCardsRefreshObserver.observe(document.body, { childList: true, subtree: true });

    membershipCardsRefreshTimer = setTimeout(() => {
      membershipCardsRefreshObserver?.disconnect();
      membershipCardsRefreshObserver = null;

      if (findMembershipCards().length > 0) {
        refreshListDashboard();
        return;
      }

      updateSummary(`<strong>Membership list view</strong><br>No membership cards found yet.<br><br>Patreon may still be loading, or this page may not be the membership card list.`);
      log("Timed out waiting for membership cards.");
    }, timeoutMs);
  }


  // ---------------------------------------------------------------------------
  // Patreon DOM readers
  // ---------------------------------------------------------------------------

  function extractCreatorNameFromCard(card) {
    if (!card) return null;
    const candidates = [...card.querySelectorAll("p")]
      .map(el => el.textContent.trim())
      .filter(text => text && text.length <= 100 && !text.toLowerCase().includes("membership") && !text.toLowerCase().includes("settings"));
    return candidates[0] || null;
  }

  function findMembershipCards() {
    const buttons = [...document.querySelectorAll(SELECTORS.openCreatorSettings)];

    return buttons
      .map((button, index) => {
        const card = button.closest('[class*="Card-module"]') || button.closest("div");
        const creatorName = extractCreatorNameFromCard(card);
        return { index, creatorName, membershipKey: normalizeKey(creatorName), button, card };
      })
      .filter(item => item.creatorName);
  }

  function extractNotificationLabel(row) {
    if (!row) return null;
    const heading = row.querySelector("h1, h2, h3");
    if (heading?.textContent.trim()) return heading.textContent.trim();
    const paragraph = [...row.querySelectorAll("p")].map(p => p.textContent.trim()).find(Boolean);
    return paragraph || null;
  }

  function getNotificationRows() {
    const toggles = [...document.querySelectorAll(SELECTORS.switches)];

    return toggles
      .map(toggle => {
        const row = toggle.closest("label") || toggle.closest('div[class*="Stack-module"][class*="flexDirectionRow"]');
        return {
          label: extractNotificationLabel(row),
          enabled: toggle.getAttribute("aria-checked") === "true",
          toggle,
          id: toggle.id || null
        };
      })
      .filter(row => row.label);
  }

  function identifyNotificationRule(row) {
    const id = row.id || "";
    const label = row.label || "";

    return PATREON_NOTIFICATION_RULES.find(rule => {
      const idMatches = rule.idIncludes && id.toLowerCase().includes(rule.idIncludes.toLowerCase());
      const labelMatches = rule.label && label.toLowerCase().startsWith(rule.label.toLowerCase());
      return idMatches || labelMatches;
    }) || null;
  }

  function getVisibleNotificationRuleKeys() {
    return new Set(getNotificationRows().map(row => identifyNotificationRule(row)).filter(Boolean).map(rule => rule.key));
  }

  function updateCustomProfileAvailableToggles() {
    const customRows = document.querySelectorAll(".pnm-toggle-row");
    const inCreatorSettings = isCreatorSettingsView();
    if (!customRows.length) return;
    const visibleKeys = inCreatorSettings ? getVisibleNotificationRuleKeys() : null;

    customRows.forEach(row => {
      const input = row.querySelector("[data-pnm-custom-key]");
      if (!input) return;
      const key = input.getAttribute("data-pnm-custom-key");
      const shouldShow = !visibleKeys || visibleKeys.has(key);
      row.classList.toggle("pnm-hidden", !shouldShow);
    });
  }

  function getCurrentCreatorNameFromSettingsView() {
    if (!isCreatorSettingsView()) return null;
    const creatorNameElement = document.querySelector('[elementtiming="User Settings : Email Notifications : Campaign : Content"][data-is-key-element="true"]');
    const creatorName = creatorNameElement?.textContent?.trim();
    return creatorName || null;
  }

  function getCurrentSettingsSignature(status) {
    if (!status) return "";
    return JSON.stringify({
      viewMode: isCreatorSettingsView() ? "detail" : "list",
      creatorName: getCurrentCreatorNameFromSettingsView(),
      profileKey: status.profileKey,
      customTargetProfile: { ...customTargetProfile },
      rows: status.rows.map(row => ({
        key: row.key,
        label: row.label,
        toggleId: row.toggleId,
        enabled: row.enabled,
        desiredState: row.desiredState,
        matchesTarget: row.matchesTarget
      }))
    });
  }

  function readCurrentSettingsStatus() {
    const rows = getNotificationRows();

    const statusRows = rows.map(row => {
      const rule = identifyNotificationRule(row);
      const desiredState = rule ? getDesiredStateForRule(rule) : null;
      return {
        key: rule?.key || "unknown",
        label: row.label,
        enabled: row.enabled,
        desiredState,
        matchesTarget: rule ? row.enabled === desiredState : null,
        toggleId: row.id,
        known: Boolean(rule)
      };
    });

    const statusByKey = {};
    for (const item of statusRows) {
      statusByKey[item.key] = {
        label: item.label,
        enabled: item.enabled,
        desiredState: item.desiredState,
        matchesTarget: item.matchesTarget,
        toggleId: item.toggleId,
        known: item.known
      };
    }

    return {
      profileKey: getActiveTargetProfile().key,
      profileLabel: getActiveTargetProfile().label,
      rows: statusRows,
      statusByKey,
      visibleToggleCount: statusRows.length,
      recognizedToggleCount: statusRows.filter(item => item.known).length,
      matchesTargetCount: statusRows.filter(item => item.matchesTarget === true).length,
      needsChangeCount: statusRows.filter(item => item.matchesTarget === false).length,
      unknownCount: statusRows.filter(item => !item.known).length
    };
  }

  function readCurrentSettingsView() {
    const rows = getNotificationRows();
    if (!rows.length) {
      updateSummary("No notification toggles found on the current view.");
      log("No notification toggles found. Open one creator email settings card first.");
      return;
    }

    const status = readCurrentSettingsStatus();
    renderStatusSummary(status, getCurrentCreatorNameFromSettingsView());
    log(`Read ${status.visibleToggleCount} notification toggle(s).`, status.rows);
  }

  function renderStatusSummary(status, creatorName = null) {
    updateSummary(`
      ${creatorName ? `<strong>Creator:</strong> ${escapeHtml(creatorName)}<br>` : ""}
      <strong>Selected target:</strong> ${escapeHtml(status.profileLabel)}<br>
      <strong>Visible toggles:</strong> ${status.visibleToggleCount}<br>
      <strong>Recognized:</strong> ${status.recognizedToggleCount}<br>
      <strong>Matches target:</strong> ${status.matchesTargetCount}<br>
      <strong>Needs change:</strong> ${status.needsChangeCount}<br>
      <strong>Unknown/skipped:</strong> ${status.unknownCount}<br><br>
      ${status.rows.map(item => {
        const state = item.enabled ? "ON" : "OFF";
        const desired = item.desiredState === null ? "?" : item.desiredState ? "ON" : "OFF";
        const marker = item.matchesTarget === true ? "✅" : item.matchesTarget === false ? "⚠️" : "❓";
        return `${marker} ${escapeHtml(item.label)}: ${state} / target ${desired}`;
      }).join("<br>")}
    `);
  }


  // ---------------------------------------------------------------------------
  // Stored-state evaluation
  // ---------------------------------------------------------------------------

  function evaluateStoredRecordAgainstActiveProfile(record) {
    if (!record?.status) return { canEvaluate: false, matchesTargetCount: 0, needsChangeCount: 0, unknownCount: record?.unknownCount ?? 0 };

    let matchesTargetCount = 0;
    let needsChangeCount = 0;
    let unknownCount = 0;

    for (const rule of PATREON_NOTIFICATION_RULES) {
      const storedToggle = record.status[rule.key];
      if (!storedToggle) continue;
      const desiredState = getDesiredStateForRule(rule);
      if (storedToggle.known === false || desiredState === null) { unknownCount++; continue; }
      if (storedToggle.enabled === desiredState) matchesTargetCount++;
      else needsChangeCount++;
    }

    return { canEvaluate: true, matchesTargetCount, needsChangeCount, unknownCount };
  }

  async function getVisibleCardStates() {
    const cards = findMembershipCards();
    const records = await dbGetAllMemberships();
    const storedByKey = new Map(records.map(record => [record.membershipKey, record]));

    return cards.map(card => {
      const stored = storedByKey.get(card.membershipKey) || null;
      let state = "new";
      let activeEvaluation = null;

      if (stored) {
        activeEvaluation = evaluateStoredRecordAgainstActiveProfile(stored);
        state = activeEvaluation.unknownCount > 0 || activeEvaluation.needsChangeCount > 0 ? "needsChange" : "stored";
      }

      return { ...card, stored, activeEvaluation, state, isNew: state === "new", isNotClean: state === "needsChange", shouldProcess: state === "new" || state === "needsChange" };
    });
  }

  function buildMembershipRecord(current, status) {
    return {
      membershipKey: current.membershipKey,
      creatorName: current.creatorName,
      profileKey: status.profileKey,
      profileLabel: status.profileLabel,
      lastSeenAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
      pageUrl: location.href,
      visibleToggleCount: status.visibleToggleCount,
      recognizedToggleCount: status.recognizedToggleCount,
      matchesTargetCount: status.matchesTargetCount,
      needsChangeCount: status.needsChangeCount,
      unknownCount: status.unknownCount,
      status: status.statusByKey
    };
  }


  // ---------------------------------------------------------------------------
  // Card visual layers and overlays
  // ---------------------------------------------------------------------------

  function getViewportOverlaySafetyRect(elementRect) {
    return {
      left: elementRect.left,
      right: elementRect.right,
      top: elementRect.top,
      bottom: elementRect.bottom
    };
  }

  function viewportRectsOverlap(a, b, padding = 0) {
    return !(
      a.right <= b.left - padding ||
      a.left >= b.right + padding ||
      a.bottom <= b.top - padding ||
      a.top >= b.bottom + padding
    );
  }

  function getReservedLeftOverlayBoundary() {
    const selectors = [
      '#main-app-navigation',
      '[data-tag="main-app-navigation"]'
    ];

    let boundary = 0;

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && rect.right > 0;
      if (!isVisible) continue;

      boundary = Math.max(boundary, rect.right);
    }

    return boundary;
  }


  function isDetachedOverlaySafe(overlayRect, options = {}) {
    const margin = options.margin ?? 8;
    const horizontalOnly = Boolean(options.horizontalOnly);
    const ignorePanel = Boolean(options.ignorePanel);
    const respectLeftNav = Boolean(options.respectLeftNav);

    // Detached overlays should only disappear because of horizontal crowding.
    // Vertical clipping during fast scrolling looked jumpy, so vertical checks are optional.
    if (overlayRect.left < margin) return false;
    if (overlayRect.right > window.innerWidth - margin) return false;

    if (!horizontalOnly) {
      if (overlayRect.top < margin) return false;
      if (overlayRect.bottom > window.innerHeight - margin) return false;
    }

    if (respectLeftNav) {
      const leftBoundary = getReservedLeftOverlayBoundary();
      const leftPadding = options.leftNavPadding ?? 8;

      if (leftBoundary && overlayRect.left < leftBoundary + leftPadding) {
        return false;
      }
    }

    if (!ignorePanel) {
      const panel = document.querySelector(`#${APP_ID}`);

      if (panel) {
        const panelRect = getViewportOverlaySafetyRect(panel.getBoundingClientRect());
        if (viewportRectsOverlap(overlayRect, panelRect, options.panelPadding ?? 8)) {
          return false;
        }
      }
    }

    return true;
  }

  function getCardOverlayAnchor(card) {
    if (!card) return null;

    const cardRect = card.getBoundingClientRect();
    let bestAnchor = card.parentElement;
    let current = card.parentElement;

    while (current && current !== document.body) {
      const rect = current.getBoundingClientRect();
      const containsCard =
        rect.left <= cardRect.left + 1 &&
        rect.right >= cardRect.right - 1 &&
        rect.top <= cardRect.top + 1 &&
        rect.bottom >= cardRect.bottom - 1;

      if (containsCard) {
        bestAnchor = current;

        const heightDelta = Math.abs(rect.height - cardRect.height);
        const widthDelta = Math.abs(rect.width - cardRect.width);

        // Prefer the smallest outer wrapper that behaves like the card row.
        // This keeps detached badges moving with the card during browser resize,
        // without placing the badges inside the clipped card itself.
        if (heightDelta <= 48 && widthDelta <= 96) {
          break;
        }
      }

      current = current.parentElement;
    }

    if (!bestAnchor) return null;

    bestAnchor.classList.add("pnm-card-overlay-anchor");
    bestAnchor.style.overflow = "visible";

    const computed = window.getComputedStyle(bestAnchor);
    if (computed.position === "static") {
      bestAnchor.style.position = "relative";
    }

    return bestAnchor;
  }

  function getAnchoredOverlayGeometry(card, overlayWidth, overlayHeight, side = "left", gap = 18) {
    const anchor = getCardOverlayAnchor(card);
    if (!anchor) return null;

    const cardRect = card.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();

    const viewportLeft = side === "left"
      ? cardRect.left - overlayWidth - gap
      : cardRect.right + gap;

    const viewportTop = cardRect.top + (cardRect.height / 2) - (overlayHeight / 2);

    return {
      anchor,
      cardRect,
      anchorRect,
      viewportRect: {
        left: viewportLeft,
        right: viewportLeft + overlayWidth,
        top: viewportTop,
        bottom: viewportTop + overlayHeight
      },
      anchorLeft: viewportLeft - anchorRect.left,
      anchorTop: viewportTop - anchorRect.top
    };
  }

  function clearHighlights(options = {}) {
    document.querySelectorAll(".pnm-card-highlight, .pnm-card-stored, .pnm-card-new, .pnm-card-needs-change").forEach(el => {
      el.classList.remove("pnm-card-highlight", "pnm-card-stored", "pnm-card-new", "pnm-card-needs-change");
    });

    clearCardIndexBadges();
    if (!options.silent) log("Highlights cleared.");
  }

  function clearCardIndexBadges() {
    document.querySelectorAll(".pnm-card-index-badge").forEach(el => el.remove());
  }

  function clearStoredStatusBadges() {
    document.querySelectorAll(".pnm-card-status-badges").forEach(el => el.remove());
  }

  function clearCurrentSettingsBadges() {
    document.querySelectorAll(".pnm-current-settings-badge").forEach(el => el.remove());
  }

  function clearCreatorSelectionBadges() {
    document
      .querySelectorAll(".pnm-card-select-badge")
      .forEach(el => el.remove());
  }

  function renderCardIndexBadges(results) {
    clearCardIndexBadges();
    if (!firstAuditCompleted) return;
    if (!highlightingEnabled) return;

    results.forEach((item, displayIndex) => {
      if (!item.card) return;
      const visibleIndex = displayIndex + 1;
      const computed = window.getComputedStyle(item.card);
      if (computed.position === "static") item.card.style.position = "relative";

      const badge = document.createElement("div");
      const stateClass = item.state === "stored" ? "pnm-card-index-badge-stored" : item.state === "needsChange" ? "pnm-card-index-badge-needs-change" : "pnm-card-index-badge-new";
      const stateLabel = item.state === "stored" ? "clean" : item.state === "needsChange" ? "needs review" : "new";
      const evaluation = item.activeEvaluation;

      badge.className = `pnm-card-index-badge ${stateClass}`;
      badge.innerHTML = `
        <strong>#${visibleIndex}</strong>
        <div class="pnm-card-index-detail">
          ${escapeHtml(item.creatorName)}<br>
          state: ${escapeHtml(stateLabel)}<br>
          ${evaluation ? `match: ${evaluation.matchesTargetCount ?? 0} · needs: ${evaluation.needsChangeCount ?? 0}` : "not audited"}
        </div>
      `;

      item.card.appendChild(badge);
    });
  }

  function renderStoredStatusBadges(results) {
    clearStoredStatusBadges();

    if (!firstAuditCompleted) return;
    if (!storedStatusBadgesEnabled) return;

    results.forEach(item => {
      if (!item.card) return;

      const computed = window.getComputedStyle(item.card);
      if (computed.position === "static") item.card.style.position = "relative";

      const wrapper = document.createElement("div");

      const stateClass =
        item.state === "stored"
          ? "pnm-card-status-pill-stored"
          : item.state === "needsChange"
            ? "pnm-card-status-pill-needs-change"
            : "pnm-card-status-pill-new";

      const stateLabel =
        item.state === "stored"
          ? "Clean"
          : item.state === "needsChange"
            ? "Needs review"
            : "New";

      const evaluation = item.activeEvaluation;
      const matchText = evaluation
        ? `${evaluation.matchesTargetCount}/${item.stored?.visibleToggleCount ?? "?"} match`
        : "Not audited";

      const needsText = evaluation?.needsChangeCount
        ? `<span class="pnm-card-status-pill pnm-card-status-pill-needs-change">Needs ${evaluation.needsChangeCount}</span>`
        : "";

      const unknownText = evaluation?.unknownCount
        ? `<span class="pnm-card-status-pill pnm-card-status-pill-muted">Unknown ${evaluation.unknownCount}</span>`
        : "";

      wrapper.className = "pnm-card-status-badges";
      wrapper.innerHTML = `
        <span class="pnm-card-status-pill ${stateClass}">${stateLabel}</span>
        <span class="pnm-card-status-pill pnm-card-status-pill-muted">${matchText}</span>
        ${needsText}
        ${unknownText}
      `;

      item.card.appendChild(wrapper);
    });
  }

  function getShortNotificationLabel(rule) {
    const shortLabels = {
      newPaidPosts: "Posts",
      newQuips: "Quips",
      postPreviews: "Previews",
      creatorMessages: "Messages",
      newMerchBenefit: "Merch+",
      merchStatusUpdates: "Merch status",
      creatorUpdates: "Updates",
      creatorRecommendations: "Recs",
      lives: "Lives"
    };

    return shortLabels[rule.key] || rule.label;
  }

  function handleBrowserResize() {
    browserIsResizing = true;

    // Last Audit Settings badges sit in the left gutter. During active resize,
    // clipping/position math can visibly lag behind Patreon's layout, so hide
    // them until the browser settles. Right-side selection checkboxes stay
    // anchored to the card wrapper and continue to render normally.
    clearCurrentSettingsBadges();

    clearTimeout(browserResizeHideTimer);
    browserResizeHideTimer = setTimeout(() => {
      browserIsResizing = false;
      scheduleCreatorCardVisualRefresh(40);
    }, 220);
  }

  function renderCurrentSettingsBadges(results) {
    clearCurrentSettingsBadges();

    if (!firstAuditCompleted) return;
    if (!currentSettingsBadgesEnabled) return;
    if (browserIsResizing) return;

    results.forEach(item => {
      if (!item.card) return;

      const badgeWidth = 250;
      const badgeHeight = Math.max(84, item.card.getBoundingClientRect().height - 6);
      const geometry = getAnchoredOverlayGeometry(item.card, badgeWidth, badgeHeight, "left", 18);
      if (!geometry) return;

      // Failsafe: hide this left-gutter badge when horizontal space is unsafe
      // or when it would overlap Patreon's official left navigation pane.
      // Avoid clipping during resize because it creates visible lag/jitter.
      if (!isDetachedOverlaySafe(geometry.viewportRect, {
        horizontalOnly: true,
        ignorePanel: true,
        respectLeftNav: true,
        leftNavPadding: 8,
        margin: 0
      })) return;

      const badge = document.createElement("div");
      const storedStatus = item.stored?.status;

      const rows = storedStatus
        ? PATREON_NOTIFICATION_RULES
            .filter(rule => storedStatus[rule.key])
            .map(rule => {
              const enabled = storedStatus[rule.key].enabled;
              const marker = enabled ? "✅" : "❌";
              return `<div class="pnm-current-settings-item" title="${escapeHtml(rule.label)}">${marker} ${escapeHtml(getShortNotificationLabel(rule))}</div>`;
            })
            .join("")
        : `<div class="pnm-current-settings-empty">No audit record</div>`;

      badge.className = "pnm-current-settings-badge";
      badge.style.left = `${geometry.anchorLeft}px`;
      badge.style.top = `${geometry.anchorTop}px`;
      badge.style.height = `${badgeHeight}px`;

      badge.innerHTML = `
        <strong>Last audit settings</strong>
        <div class="pnm-current-settings-grid">
          ${rows}
        </div>
      `;

      geometry.anchor.appendChild(badge);
    });
  }

  function renderCreatorSelectionBadges(results) {
    clearCreatorSelectionBadges();

    if (!selectionModeEnabled) {
      updateRunControlsVisibility();
      return;
    }

    const visibleKeys = new Set(results.map(item => item.membershipKey));
    selectedMembershipKeys = new Set(
      [...selectedMembershipKeys].filter(key => visibleKeys.has(key))
    );

    results.forEach(item => {
      if (!item.card) return;

      const badgeSize = 36;
      const geometry = getAnchoredOverlayGeometry(item.card, badgeSize, badgeSize, "right", 36);
      if (!geometry) return;

      // Failsafe: detached checkbox badges should only disappear when the browser
      // is too narrow. The PNM panel has higher z-index and will cover them if needed.
      if (!isDetachedOverlaySafe(geometry.viewportRect, { horizontalOnly: true, ignorePanel: true })) return;

      const label = document.createElement("label");
      const selected = selectedMembershipKeys.has(item.membershipKey);

      label.className = `pnm-card-select-badge${selected ? " pnm-card-select-badge-selected" : ""}`;
      label.title = selected ? `Deselect ${item.creatorName}` : `Select ${item.creatorName}`;
      label.style.left = `${geometry.anchorLeft}px`;
      label.style.top = `${geometry.anchorTop}px`;
      label.innerHTML = `<input type="checkbox" ${selected ? "checked" : ""} aria-label="Select ${escapeHtml(item.creatorName)}">`;

      const input = label.querySelector("input");
      input.addEventListener("change", event => {
        if (event.target.checked) {
          selectedMembershipKeys.add(item.membershipKey);
        } else {
          selectedMembershipKeys.delete(item.membershipKey);
        }

        updateRunControlsVisibility();
        renderCreatorSelectionBadges(results);
        refreshListDashboard();
      });

      geometry.anchor.appendChild(label);
    });

    updateRunControlsVisibility();
  }

  function scheduleCreatorCardVisualRefresh(delayMs = 120) {
    clearTimeout(creatorVisualRefreshTimer);

    creatorVisualRefreshTimer = setTimeout(() => {
      if (!isCreatorSettingsView()) {
        refreshCreatorCardVisuals();
      }
    }, delayMs);
  }

  async function refreshCreatorCardVisuals() {
    if (isCreatorSettingsView()) return;

    const results = await getVisibleCardStates();

    if (!results.length) return;

    if (!firstAuditCompleted) {
      clearHighlights({ silent: true });
      clearStoredStatusBadges();
      clearCurrentSettingsBadges();
      clearCreatorSelectionBadges();
      return;
    }

    if (highlightingEnabled) {
      clearHighlights({ silent: true });
      results.forEach(item => {
        if (item.state === "new") item.card?.classList.add("pnm-card-new");
        if (item.state === "stored") item.card?.classList.add("pnm-card-stored");
        if (item.state === "needsChange") item.card?.classList.add("pnm-card-needs-change");
      });
      renderCardIndexBadges(results);
    } else {
      document.querySelectorAll(".pnm-card-highlight, .pnm-card-stored, .pnm-card-new, .pnm-card-needs-change").forEach(el => {
        el.classList.remove("pnm-card-highlight", "pnm-card-stored", "pnm-card-new", "pnm-card-needs-change");
      });
      clearCardIndexBadges();
    }

    renderStoredStatusBadges(results);
    renderCurrentSettingsBadges(results);
    renderCreatorSelectionBadges(results);
  }

  async function refreshListDashboard() {
    if (activePanelTab !== "main") return;
    if (isCreatorSettingsView()) return;

    const results = await getVisibleCardStates();

    if (!results.length) {
      updateSummary(`<strong>Membership list view</strong><br>No creator cards found.`);
      return;
    }

    const newCount = results.filter(item => item.state === "new").length;
    const storedCount = results.filter(item => item.state === "stored").length;
    const needsChangeCount = results.filter(item => item.state === "needsChange").length;
    const controls = readRunControls();
    const selectedCount = selectedMembershipKeys.size;

    updateFirstAuditUi(results);

    const auditNewButton = document.querySelector(`#${APP_ID}-audit-new-creators`);
    if (auditNewButton) {
      auditNewButton.classList.toggle("pnm-hidden", !firstAuditCompleted || newCount === 0 || isCreatorSettingsView());
      auditNewButton.textContent = newCount > 0 ? `Audit New Creators (${newCount})` : "Audit New Creators";
    }

    if (!firstAuditCompleted) {
      clearHighlights({ silent: true });
      clearStoredStatusBadges();
      clearCreatorSelectionBadges();

      updateSummary(`
        <strong>Baseline audit required</strong><br>
        <strong>All creators:</strong> ${results.length}<br>
        <strong>Audited locally:</strong> ${results.length - newCount}<br><br>
        Run the first audit to build a local baseline. It reads each creator's current notification settings and does not change Patreon settings.<br><br>
        After it completes, the tool unlocks target profiles, custom targets, run controls, highlights, stored status badges, new-creator auditing, and apply actions.
      `);
      return;
    }

    if (highlightingEnabled) {
      clearHighlights({ silent: true });
      results.forEach(item => {
        if (item.state === "new") item.card?.classList.add("pnm-card-new");
        if (item.state === "stored") item.card?.classList.add("pnm-card-stored");
        if (item.state === "needsChange") item.card?.classList.add("pnm-card-needs-change");
      });
      renderCardIndexBadges(results);
    } else {
      clearCardIndexBadges();
    }

    renderStoredStatusBadges(results);
    renderCurrentSettingsBadges(results);
    renderCreatorSelectionBadges(results);

    const runControlText = selectAllCreatorsEnabled
      ? "all creators"
      : selectionModeEnabled
        ? `selected creators ${selectedCount}`
        : `needs target update, skip first ${controls.runStartIndex}, limit ${controls.runLimit}`;

    updateSummary(`
      <strong>Membership list view</strong><br>
      <strong>Baseline audit:</strong> complete${firstAuditMeta?.firstAuditCompletedAt ? ` (${escapeHtml(new Date(firstAuditMeta.firstAuditCompletedAt).toLocaleString())})` : ""}<br>
      <strong>Selected target:</strong> ${escapeHtml(getActiveTargetProfile().label)}<br>
      <strong>All creators:</strong> ${results.length}<br>
      <strong>Clean for selected target:</strong> ${storedCount}<br>
      <strong>New creators needing audit:</strong> ${newCount}<br>
      <strong>Needs target update:</strong> ${needsChangeCount}<br>
      <strong>Run scope:</strong> ${escapeHtml(runControlText)}<br>
      <strong>Indexes:</strong> creator card order, starting at 1<br>
      <strong>Highlighting:</strong> ${highlightingEnabled ? "ON" : "OFF"}<br>
      <strong>Stored badges:</strong> ${storedStatusBadgesEnabled ? "ON" : "OFF"}<br>
      <strong>Last audit settings badges:</strong> ${currentSettingsBadgesEnabled ? "ON" : "OFF"}<br><br>
      <div><strong>Legend:</strong></div>
      <div>🟢 Stored clean</div>
      <div>🟡 New creator / needs audit</div>
      <div>🔴 Needs target update</div>
    `);
  }


  // ---------------------------------------------------------------------------
  // IndexedDB persistence
  // ---------------------------------------------------------------------------

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(DB_CONFIG.storeName)) {
          const store = db.createObjectStore(DB_CONFIG.storeName, { keyPath: "membershipKey" });
          store.createIndex("creatorName", "creatorName", { unique: false });
          store.createIndex("lastCheckedAt", "lastCheckedAt", { unique: false });
          store.createIndex("needsChangeCount", "needsChangeCount", { unique: false });
        }

        if (!db.objectStoreNames.contains(DB_CONFIG.metaStoreName)) {
          db.createObjectStore(DB_CONFIG.metaStoreName, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function dbPutMembership(record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.storeName, "readwrite");
      const store = tx.objectStore(DB_CONFIG.storeName);
      store.put(record);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function dbPutMemberships(records) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.storeName, "readwrite");
      const store = tx.objectStore(DB_CONFIG.storeName);
      for (const record of records) store.put(record);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function dbGetAllMemberships() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.storeName, "readonly");
      const store = tx.objectStore(DB_CONFIG.storeName);
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result || []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function dbClearAllMemberships() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.storeName, "readwrite");
      const store = tx.objectStore(DB_CONFIG.storeName);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function dbGetMeta(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.metaStoreName, "readonly");
      const store = tx.objectStore(DB_CONFIG.metaStoreName);
      const request = store.get(key);
      request.onsuccess = () => { db.close(); resolve(request.result || null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  }

  async function dbPutMeta(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.metaStoreName, "readwrite");
      const store = tx.objectStore(DB_CONFIG.metaStoreName);
      store.put({ key, ...value });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function dbClearMeta() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_CONFIG.metaStoreName, "readwrite");
      const store = tx.objectStore(DB_CONFIG.metaStoreName);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }


  // ---------------------------------------------------------------------------
  // Audit and apply automation
  // ---------------------------------------------------------------------------

  async function runFirstAudit() {
    if (automationRunning) { log("Automation is already running."); return; }

    try {
      await ensureMembershipListView();
    } catch (error) {
      window.alert(`Could not return to the membership list.

${error.message}`);
      log(`First audit blocked: ${error.message}`);
      return;
    }

    const cardStates = await getVisibleCardStates();

    if (!cardStates.length) {
      window.alert("No creator cards found. Return to the membership list and wait for Patreon to finish loading, then try again.");
      return;
    }

    const remainingTargets = cardStates.filter(item => item.state === "new");
    const alreadyAuditedCount = cardStates.length - remainingTargets.length;
    const isResume = alreadyAuditedCount > 0 && remainingTargets.length > 0;

    if (!remainingTargets.length) {
      const confirmed = window.confirm(
        `All ${cardStates.length} creator(s) already have local audit records.\n\n` +
        "Mark the first baseline audit as complete and unlock target controls?"
      );

      if (!confirmed) {
        log("First audit completion cancelled by user.");
        return;
      }

      await dbPutMeta("firstAudit", {
        firstAuditCompleted: true,
        firstAuditCompletedAt: new Date().toISOString(),
        firstAuditCreatorCount: cardStates.length,
        firstAuditAuditedCount: cardStates.length,
        firstAuditRemainingCount: 0,
        firstAuditLastUpdatedAt: new Date().toISOString()
      });

      await loadFirstAuditState();
      updateFirstAuditUi(cardStates);
      window.alert(`First audit marked complete.\n\nAudited creators: ${cardStates.length}`);
      await refreshListDashboard();
      return;
    }

    const confirmed = window.confirm(
      `${isResume ? "Resume" : "Run"} the first baseline audit?\n\n` +
      `All creators found: ${cardStates.length}\n` +
      `Already audited locally: ${alreadyAuditedCount}\n` +
      `Remaining to audit: ${remainingTargets.length}\n\n` +
      "This opens each remaining creator settings view, reads current notification toggles, stores the results locally, and does NOT change Patreon settings."
    );

    if (!confirmed) {
      log("First audit cancelled by user.");
      return;
    }

    await dbPutMeta("firstAudit", {
      firstAuditCompleted: false,
      firstAuditStartedAt: firstAuditMeta?.firstAuditStartedAt || new Date().toISOString(),
      firstAuditCreatorCount: cardStates.length,
      firstAuditAuditedCount: alreadyAuditedCount,
      firstAuditRemainingCount: remainingTargets.length,
      firstAuditLastUpdatedAt: new Date().toISOString()
    });

    firstAuditMeta = await dbGetMeta("firstAudit");

    const result = await auditVisibleCardsByFilter(
      item => item.state === "new",
      isResume ? "first audit resume" : "first audit",
      { ignoreRunControls: true }
    );

    const refreshedStates = await getVisibleCardStates();
    const remainingAfterRun = refreshedStates.filter(item => item.state === "new").length;
    const auditedAfterRun = refreshedStates.length - remainingAfterRun;

    await dbPutMeta("firstAudit", {
      firstAuditCompleted: remainingAfterRun === 0,
      firstAuditCompletedAt: remainingAfterRun === 0 ? new Date().toISOString() : null,
      firstAuditStartedAt: firstAuditMeta?.firstAuditStartedAt || new Date().toISOString(),
      firstAuditCreatorCount: refreshedStates.length,
      firstAuditAuditedCount: auditedAfterRun,
      firstAuditRemainingCount: remainingAfterRun,
      firstAuditLastUpdatedAt: new Date().toISOString()
    });

    await loadFirstAuditState();
    updateFirstAuditUi(refreshedStates);

    if (remainingAfterRun === 0) {
      window.alert(`First audit complete.\n\nAudited creators: ${auditedAfterRun}`);
      await refreshListDashboard();
      return;
    }

    window.alert(
      `First audit did not complete.\n\n` +
      `This run processed: ${result.processed}/${result.total}\n` +
      `Audited locally: ${auditedAfterRun}/${refreshedStates.length}\n` +
      `Remaining: ${remainingAfterRun}\n\n` +
      "Click Resume First Audit to continue."
    );

    await refreshListDashboard();
  }

  async function reAuditSelectedCreators() {
    if (!selectedMembershipKeys.size) {
      window.alert("No selected creators found. Enable Select Specific Creators on the Main Controls tab and select one or more creators first.");
      return;
    }

    const confirmed = window.confirm(`Re-audit ${selectedMembershipKeys.size} selected creator(s)?\n\nThis is read-only and will refresh their stored settings.`);
    if (!confirmed) return;

    await auditVisibleCardsByFilter(
      item => selectedMembershipKeys.has(item.membershipKey),
      "selected creators re-audit",
      { ignoreRunControls: true }
    );
  }

  async function reAuditAllCreators() {
    try {
      await ensureMembershipListView();
    } catch (error) {
      window.alert(`Could not return to the membership list.\n\n${error.message}`);
      log(`Re-audit all blocked: ${error.message}`);
      return;
    }

    const cards = findMembershipCards();
    const confirmed = window.confirm(`Re-audit all ${cards.length} creator(s)?\n\nThis is read-only and will refresh stored settings.`);
    if (!confirmed) return;

    await auditVisibleCardsByFilter(
      () => true,
      "all creators re-audit",
      { ignoreRunControls: true }
    );
  }

  async function runAuditNewCreatorsFromControls() {
    if (!firstAuditCompleted) {
      window.alert("Run the first audit before using follow-up audits.");
      return;
    }

    await auditVisibleCardsByFilter(
      item => item.isNew,
      "new creators",
      { ignoreRunControls: true }
    );
  }



  async function auditVisibleCardsByFilter(filterFn, runLabel = "filtered", options = {}) {
    if (automationRunning) { log("Automation is already running."); return { completed: false, processed: 0, total: 0 }; }

    try {
      await ensureMembershipListView();
    } catch (error) {
      window.alert(`Could not return to the membership list.

${error.message}`);
      log(`Audit run blocked: ${error.message}`);
      return { completed: false, processed: 0, total: 0 };
    }

    automationRunning = true;
    const cardStates = await getVisibleCardStates();
    const allTargets = cardStates.filter(filterFn);
    const targets = options.ignoreRunControls ? allTargets : sliceTargetsByRunControls(allTargets);
    const total = targets.length;
    let processed = 0;
    let stopped = false;

    if (!total) {
      automationRunning = false;
      log(`No ${runLabel} membership cards found to audit with current run controls.`);
      await refreshListDashboard();
      return { completed: false, processed: 0, total: 0, matching: allTargets.length };
    }

    const runScopeText = options.ignoreRunControls
      ? "all matching creators"
      : selectAllCreatorsEnabled
        ? "all creators"
        : selectionModeEnabled
          ? `selected creators ${selectedMembershipKeys.size}`
          : `skip first ${runStartIndex}`;
    log(`Starting ${runLabel} audit run for ${total}/${allTargets.length} matching card(s), ${runScopeText}.`);

    for (let index = 0; index < total; index++) {
      if (!automationRunning) { log("Audit stopped."); stopped = true; break; }
      const target = targets[index];
      const freshCards = findMembershipCards();
      const current = freshCards.find(card => card.membershipKey === target.membershipKey);

      if (!current) { log(`Could not find ${target.creatorName} after refresh. Skipping.`); continue; }

      log(`Auditing ${index + 1}/${total}: ${current.creatorName}`);

      try {
        current.button.click();
        await waitForSettingsView();
        await sleep(TIMING.openSettingsDelayMs);

        const status = readCurrentSettingsStatus();
        const record = buildMembershipRecord(current, status);
        await dbPutMembership(record);
        processed++;
        log(`Stored ${current.creatorName}: ${status.needsChangeCount} need change, ${status.unknownCount} unknown.`, record);

        const closeButton = document.querySelector(SELECTORS.closeCreatorSettings);
        if (!closeButton) throw new Error("Close creator email settings button not found.");
        closeButton.click();
        await waitForMembershipListView();
        await sleep(TIMING.closeSettingsDelayMs);
      } catch (error) {
        log(`Error auditing ${current.creatorName}: ${error.message}`);
        log("Stopping audit to avoid messy state.");
        automationRunning = false;
        stopped = true;
        break;
      }
    }

    automationRunning = false;
    log(`${runLabel} audit run complete. Processed ${processed}/${total}.`);
    await refreshListDashboard();

    return {
      completed: !stopped && processed === total,
      processed,
      total,
      matching: allTargets.length
    };
  }

  function confirmApplyRun(runLabel, targetCount) {
    const activeProfile = getActiveTargetProfile();
    const baseMessage = `Apply target profile "${activeProfile.label}" to ${targetCount} ${runLabel} membership card(s)?\n\nPatreon auto-saves after each toggle change.`;

    if (activeProfile.key === "allOn") {
      return window.confirm(baseMessage + "\n\nWARNING: All On may enable every known notification toggle for each processed creator.\n\nThis may significantly increase Patreon email notifications. Continue?");
    }

    if (runLabel.includes("all creators")) return window.confirm(baseMessage + "\n\nThis can change multiple creators. Continue?");
    return window.confirm(baseMessage + "\n\nContinue?");
  }

  async function applyTargetProfileToCurrentView() {
    const rows = getNotificationRows();
    if (!rows.length) {
      updateSummary("No notification toggles found on the current view.");
      log("Apply skipped. Open one creator email settings card first.");
      return;
    }

    const knownRows = rows.map(row => ({ ...row, rule: identifyNotificationRule(row) })).filter(row => row.rule);
    const unknownRows = rows.length - knownRows.length;
    if (unknownRows > 0) log(`Found ${unknownRows} unknown toggle(s). Unknown toggles will not be changed.`);

    const mismatches = knownRows.filter(row => row.enabled !== getDesiredStateForRule(row.rule));

    if (!mismatches.length) {
      log(`Current view already matches target profile: ${getActiveTargetProfile().label}.`);
      readCurrentSettingsView();
      return;
    }

    if (getActiveTargetProfile().key === "allOn") {
      const confirmed = window.confirm(`Apply "All On" to this creator?\n\nThis will change ${mismatches.length} toggle(s) and Patreon will auto-save each change.`);
      if (!confirmed) {
        log("Current view apply cancelled by user.");
        readCurrentSettingsView();
        return;
      }
    }

    log(`Applying target profile "${getActiveTargetProfile().label}". Changing ${mismatches.length} toggle(s).`);

    for (const row of mismatches) {
      const desired = getDesiredStateForRule(row.rule);
      const desiredText = desired ? "ON" : "OFF";
      const currentText = row.enabled ? "ON" : "OFF";
      log(`Changing "${row.label}" from ${currentText} to ${desiredText}.`);

      try {
        await setToggleState(row.toggle, desired);
        await sleep(TIMING.toggleSaveDelayMs);
        log(`Confirmed "${row.label}" is now ${desiredText}.`);
      } catch (error) {
        log(`Failed to change "${row.label}": ${error.message}`);
        break;
      }
    }

    await sleep(1000);
    readCurrentSettingsView();
  }

  async function setToggleState(toggle, desiredEnabled) {
    const currentEnabled = toggle.getAttribute("aria-checked") === "true";
    if (currentEnabled === desiredEnabled) return false;
    toggle.click();
    await waitForToggleState(toggle, desiredEnabled);
    return true;
  }

  function waitForToggleState(toggle, desiredEnabled, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const currentEnabled = toggle.getAttribute("aria-checked") === "true";
        if (currentEnabled === desiredEnabled) { clearInterval(timer); resolve(true); return; }
        if (Date.now() - started > timeoutMs) { clearInterval(timer); reject(new Error("Timed out waiting for toggle state change.")); }
      }, 150);
    });
  }

  async function runApplyTargetProfileFromControls() {
    if (!firstAuditCompleted) {
      window.alert("Run the first audit before applying a target profile.");
      return;
    }

    await applyTargetProfileToVisibleCardsByFilter(
      getCurrentRunScopeFilter("apply"),
      getCurrentRunScopeLabel("apply")
    );
  }



  async function applyTargetProfileToVisibleCardsByFilter(filterFn, runLabel = "filtered") {
    if (automationRunning) { log("Automation is already running."); return; }

    try {
      await ensureMembershipListView();
    } catch (error) {
      window.alert(`Could not return to the membership list.

${error.message}`);
      log(`Apply run blocked: ${error.message}`);
      return;
    }

    automationRunning = true;
    const cardStates = await getVisibleCardStates();
    const allTargets = cardStates.filter(filterFn);
    const targets = sliceTargetsByRunControls(allTargets);
    const total = targets.length;

    if (!total) {
      automationRunning = false;
      log(`No ${runLabel} membership cards found to apply with current run controls.`);
      await refreshListDashboard();
      return;
    }

    const confirmed = confirmApplyRun(runLabel, total);
    if (!confirmed) {
      automationRunning = false;
      log(`${runLabel} apply run cancelled by user.`);
      await refreshListDashboard();
      return;
    }

    const runScopeText = selectAllCreatorsEnabled
      ? "all creators"
      : selectionModeEnabled
        ? `selected creators ${selectedMembershipKeys.size}`
        : `needs target update, skip first ${runStartIndex}`;
    log(`Starting ${runLabel} apply run for ${total}/${allTargets.length} matching card(s), ${runScopeText}.`);

    for (let index = 0; index < total; index++) {
      if (!automationRunning) { log("Apply run stopped."); break; }
      const target = targets[index];
      const freshCards = findMembershipCards();
      const current = freshCards.find(card => card.membershipKey === target.membershipKey);

      if (!current) { log(`Could not find ${target.creatorName} after refresh. Skipping.`); continue; }

      log(`Applying target to ${index + 1}/${total}: ${current.creatorName}`);

      try {
        current.button.click();
        await waitForSettingsView();
        await sleep(TIMING.openSettingsDelayMs);
        await applyTargetProfileToCurrentView();
        await sleep(TIMING.betweenCreatorsDelayMs);

        const status = readCurrentSettingsStatus();
        const record = buildMembershipRecord(current, status);
        await dbPutMembership(record);
        log(`Updated stored record for ${current.creatorName}: ${status.needsChangeCount} need change, ${status.unknownCount} unknown.`, record);

        const closeButton = document.querySelector(SELECTORS.closeCreatorSettings);
        if (!closeButton) throw new Error("Close creator email settings button not found.");
        closeButton.click();
        await waitForMembershipListView();
        await sleep(TIMING.closeSettingsDelayMs);
      } catch (error) {
        log(`Error applying target to ${current.creatorName}: ${error.message}`);
        log("Stopping apply run to avoid messy state.");
        automationRunning = false;
        break;
      }
    }

    automationRunning = false;
    log(`${runLabel} apply run complete.`);
    await refreshListDashboard();
  }


  // ---------------------------------------------------------------------------
  // Tabs, README, import/export
  // ---------------------------------------------------------------------------

  function renderDataToolsTab() {
    const view = document.querySelector(`#${APP_ID}-view-data`);
    if (!view) return;

    view.innerHTML = `
      <h3 class="pnm-view-title">Data Tools</h3>
      <div class="pnm-modal-button-grid">
        <button id="${APP_ID}-view-export-json" type="button">Export Stored JSON</button>
        <button id="${APP_ID}-view-import-json" type="button">Import Stored JSON</button>
        <button id="${APP_ID}-view-reaudit-selected" type="button">Re-audit Selected Creators</button>
        <button id="${APP_ID}-view-reaudit-all" type="button">Re-audit All Creators</button>
        <button id="${APP_ID}-view-clear-db" type="button" class="pnm-danger-button">Clear Stored Database</button>
      </div>
      <br>
      <p class="pnm-muted">Stored audit data lives in this browser via IndexedDB. Export before clearing browser or site data.</p>
    `;

    document.querySelector(`#${APP_ID}-view-export-json`)?.addEventListener("click", exportStoredJson);
    document.querySelector(`#${APP_ID}-view-import-json`)?.addEventListener("click", openImportJsonPicker);
    document.querySelector(`#${APP_ID}-view-reaudit-selected`)?.addEventListener("click", reAuditSelectedCreators);
    document.querySelector(`#${APP_ID}-view-reaudit-all`)?.addEventListener("click", reAuditAllCreators);
    document.querySelector(`#${APP_ID}-view-clear-db`)?.addEventListener("click", clearStoredDatabaseWithConfirm);
  }

  function renderLogTab() {
    const view = document.querySelector(`#${APP_ID}-view-log`);
    if (!view) return;

    const rows = logEntries.length
      ? logEntries.map(entry => `<div class="pnm-log-row"><span class="pnm-muted">[${escapeHtml(entry.timestamp)}]</span> ${escapeHtml(entry.message)}</div>`).join("")
      : `<p>No log entries yet.</p>`;

    view.innerHTML = `<h3 class="pnm-view-title">Log</h3><button id="${APP_ID}-view-clear-log" type="button">Clear Log</button><div id="${APP_ID}-view-log-list">${rows}</div>`;
    document.querySelector(`#${APP_ID}-view-clear-log`)?.addEventListener("click", () => { logEntries = []; renderLogTab(); });
  }

  function renderReadmeTab() {
    const view = document.querySelector(`#${APP_ID}-view-readme`);
    if (!view) return;

    view.innerHTML = `
      <h3 class="pnm-view-title">README</h3>

      <div class="pnm-readme-box">
        <strong>What this tool does</strong><br>
        Patreon Notification Manager is a local userscript for the Patreon email settings page. It opens creator email settings views, reads notification toggle states, stores the results in this browser's IndexedDB, and can apply a selected target profile later.<br><br>
        The first baseline audit is read-only. It does not change Patreon settings.
      </div>

      <div class="pnm-readme-box">
        <strong>Baseline-first workflow</strong><br>
        1. Run the first baseline audit before using target profiles or apply actions.<br>
        2. The first audit opens each creator, records current settings, and stores them locally.<br>
        3. Once the baseline is complete, target profiles, custom targets, run controls, highlights, stored status badges, new-creator auditing, and apply actions unlock.<br>
        4. Choose a target profile and use the dashboard to see which creators already match it and which need updates.<br>
        5. Apply the target profile only when you are ready to change Patreon settings.
      </div>

      <div class="pnm-readme-box">
        <strong>Resume first audit</strong><br>
        If the first audit is interrupted, records already saved in IndexedDB are kept. The baseline panel will show progress and the button changes to <strong>Resume First Audit</strong> when some creators are already audited but others remain.<br><br>
        Resume audits only creators that do not have a stored local audit record yet. It does not restart from creator #1 unless the database is cleared.
      </div>

      <div class="pnm-readme-box">
        <strong>New creators after baseline</strong><br>
        After the first audit is complete, any creator without a stored record appears as a new creator needing audit. Use <strong>Audit New Creators</strong> to add those creators to the local baseline.<br><br>
        Apply actions do not target unaudited new creators by default. Audit new creators first, then apply target profiles if their stored settings need changes.
      </div>

      <div class="pnm-readme-box">
        <strong>Target profiles</strong><br>
        <strong>Messages Only</strong>: only “When this creator messages you” should be ON.<br>
        <strong>All Off</strong>: all known creator email toggles should be OFF.<br>
        <strong>All On</strong>: all known creator email toggles should be ON.<br>
        <strong>Custom</strong>: checked custom options are target ON; unchecked options are target OFF.<br><br>
        Target profiles compare against stored audit records. Changing the selected target dynamically updates highlights and stored status badges.
      </div>

      <div class="pnm-readme-box">
        <strong>Run controls and scopes</strong><br>
        If neither selection option is enabled, <strong>Apply Target Profile</strong> defaults to creators that need a target update and uses <strong>Run limit</strong> / <strong>Skip first</strong>. Skip first applies to the matching run scope, not necessarily the visible badge number.<br><br>
        <strong>Select Specific Creators</strong> shows checkbox badges beside creator cards and disables Run limit / Skip first. Apply actions use only checked creators.<br><br>
        <strong>Select All Creators</strong> processes every creator and disables Select Specific Creators plus Run limit / Skip first.
      </div>

      <div class="pnm-readme-box">
        <strong>Visual markers</strong><br>
        🟢 Clean means stored settings match the selected target profile.<br>
        🟡 New creator / needs audit means no stored audit record exists for that creator.<br>
        🔴 Needs target update means stored settings do not match the selected target profile.<br>
        Index badges use visible creator card order, starting at 1. Run controls use the current matching scope, so Skip first may not match the badge number unless the run scope includes all creators.<br>
        Stored status badges and last audit settings badges can be toggled from the side rail and update against the selected target profile. Last audit settings badges show the most recently stored ON/OFF notification state from the local audit record. While the browser is being resized, left-side last audit settings badges temporarily hide and then re-render when the layout settles. When horizontal space is too tight, they hide instead of covering Patreon’s navigation pane.
      </div>

      <div class="pnm-readme-box">
        <strong>Data tools</strong><br>
        <strong>Export Stored JSON</strong> downloads local audit records and metadata as a backup.<br>
        <strong>Import Stored JSON</strong> restores a previous export and marks the baseline as restored/completed.<br>
        <strong>Re-audit Selected Creators</strong> refreshes stored settings for selected creators without changing Patreon settings.<br>
        <strong>Re-audit All Creators</strong> refreshes every visible creator's stored settings without changing Patreon settings.<br>
        <strong>Clear Stored Database</strong> removes local audit records and resets the first-audit state.
      </div>

      <div class="pnm-readme-box">
        <strong>Safety notes</strong><br>
        Audit and re-audit actions are read-only. Apply actions change Patreon toggles and Patreon auto-saves each toggle change.<br><br>
        Unknown toggles are skipped and are not changed. Apply actions ask for confirmation before making batch changes, especially when the selected target is All On.
      </div>
    `;
  }

  async function exportStoredJson() {
    const records = await dbGetAllMemberships();
    if (!records.length) { window.alert("No stored records found. Run an audit first."); log("Export skipped. No stored records found."); return; }

    const payload = { app: "Patreon Notification Manager", appVersion: APP_VERSION, exportedAt: new Date().toISOString(), activeTargetProfileKey, activeTargetProfileLabel: getActiveTargetProfile().label, customTargetProfile, recordCount: records.length, records };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const filename = `patreon-notification-manager-export-${timestamp}.json`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    window.alert(`Export complete.\n\nRecords: ${records.length}\nFile: ${filename}`);
    log(`Exported ${records.length} stored membership record(s) to ${filename}.`, payload);
  }

  function openImportJsonPicker() {
    const input = document.querySelector(`#${APP_ID}-import-file`);
    if (!input) { window.alert("Import failed. File input was not found."); log("Import file input not found."); return; }
    input.value = "";
    input.click();
  }

  function isValidImportPayload(payload) { return payload && typeof payload === "object" && Array.isArray(payload.records); }

  function normalizeImportedRecord(record) {
    if (!record || typeof record !== "object") return null;
    if (!record.membershipKey || !record.creatorName) return null;
    return {
      membershipKey: String(record.membershipKey),
      creatorName: String(record.creatorName),
      profileKey: record.profileKey || null,
      profileLabel: record.profileLabel || null,
      lastSeenAt: record.lastSeenAt || null,
      lastCheckedAt: record.lastCheckedAt || null,
      pageUrl: record.pageUrl || null,
      visibleToggleCount: Number(record.visibleToggleCount || 0),
      recognizedToggleCount: Number(record.recognizedToggleCount || 0),
      matchesTargetCount: Number(record.matchesTargetCount || 0),
      needsChangeCount: Number(record.needsChangeCount || 0),
      unknownCount: Number(record.unknownCount || 0),
      status: record.status && typeof record.status === "object" ? record.status : {}
    };
  }

  async function importStoredJsonFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) { log("Import cancelled. No file selected."); return; }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!isValidImportPayload(payload)) { window.alert("Import failed. The selected file does not look like a Patreon Notification Manager export."); log("Import failed. Invalid payload shape.", payload); return; }
      const normalizedRecords = payload.records.map(normalizeImportedRecord).filter(Boolean);
      if (!normalizedRecords.length) { window.alert("Import failed. No valid membership records were found in the selected file."); log("Import failed. No valid records found.", payload); return; }
      const existingRecords = await dbGetAllMemberships();
      const confirmed = window.confirm(`Import ${normalizedRecords.length} membership record(s) from:\n\n${file.name}\n\nExisting local records: ${existingRecords.length}\n\nRecords with the same membership key will be replaced. Continue?`);
      if (!confirmed) { log("Import cancelled by user."); return; }
      await dbPutMemberships(normalizedRecords);
      await dbPutMeta("firstAudit", {
        firstAuditCompleted: true,
        firstAuditCompletedAt: new Date().toISOString(),
        firstAuditCreatorCount: normalizedRecords.length,
        restoredFromImport: true
      });
      firstAuditCompleted = true;
      firstAuditMeta = await dbGetMeta("firstAudit");
      updateFirstAuditUi();
      window.alert(`Import complete.\n\nImported records: ${normalizedRecords.length}\nFile: ${file.name}`);
      log(`Imported ${normalizedRecords.length} membership record(s) from ${file.name}.`, normalizedRecords);
      await refreshListDashboard();
    } catch (error) {
      window.alert(`Import failed.\n\n${error.message}`);
      log(`Import failed: ${error.message}`);
    }
  }

  async function clearStoredDatabaseWithConfirm() {
    const records = await dbGetAllMemberships();
    if (!records.length) { window.alert("No stored records found. There is nothing to clear."); log("Clear database skipped. No stored records found."); return; }
    const confirmed = window.confirm(`Clear ${records.length} stored Patreon membership audit record(s)?\n\nThis only clears this userscript's local IndexedDB data. It does NOT change Patreon settings.\n\nExport JSON first if you want a backup.`);
    if (!confirmed) { log("Clear database cancelled."); return; }
    await dbClearAllMemberships();
    await dbClearMeta();
    firstAuditCompleted = false;
    firstAuditMeta = null;
    clearHighlights();
    clearStoredStatusBadges();
    clearCurrentSettingsBadges();
    clearCreatorSelectionBadges();
    window.alert(`Stored database cleared.\n\nRecords removed: ${records.length}\nPatreon settings were not changed.`);
    log(`Cleared ${records.length} stored membership record(s).`);
    updateFirstAuditUi();
    await refreshListDashboard();
  }


  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function boot() {
    injectStyles();
    createPanel();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
