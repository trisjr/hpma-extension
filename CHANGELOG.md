# Changelog

All notable changes to this project will be documented in this file.

## v0.8.0

### What's Changed

- feat(remote): Remote jobs from Firebase: the extension relays a heartbeat, lists pending jobs in the popup and side panel, claims and runs them (Dry-run, plus Full for approved jobs behind the probe gate, daily cap and rules), and shows the running job with progress
- feat(remote): A partner-assign job can declare a chain; when Meta reports "Approval needed", the job result records `awaitingApproval` so the coordinator can create the follow-up approve job
- feat(remote): The daily Full job cap is configurable in options, unlimited by default; the popup shows why the machine is blocked while a job stays pending
- feat(coordinator): New coordinator package with ops CLI (assign, scan, approve, cancel, status, kill-switch, janitor), Firebase rules and emulator tests; `ops assign --chain-partner --chain-requester` declares an assign → approve chain
- feat(engine): Full mode for partner assign behind the probe gate and approval; the engine records the matched danger keyword and can unlock a rate limit
- fix(flow): Meta's "Approval needed" dialog is treated as pending-approval, dismissed after the request is sent, including a stacked dialog over the wizard
- fix(remote): The dispatcher fails closed when the kill-switch listener dies, and the rate-limit unlock keeps checkpoint incidents
- fix(popup): The middle area scrolls and the block banner no longer collapses into columns

Full Changelog: Compare v0.7.0...v0.8.0

## v0.7.0

### What's Changed

- feat(engine): New flow "Approve partner requests" for the second admin: scan Settings › Requests › Needs review for access requests from a partner BM (exact BM name match), review the list, then Dry-run or Assist (you click Approve yourself, the engine verifies the request left the list); Decline is never touched and Full stays locked
- feat(probe): The probe now checks the Requests list and an opened request, so the readiness gate shows "incomplete" until both pages are probed once
- fix(engine): The Needs review tab is located on the real Requests page, where its label is repeated in three spans

Full Changelog: Compare v0.6.2...v0.7.0

## v0.6.2

### What's Changed

- feat(safety): The BM guard is bound to the Business Manager the ad accounts were picked for; a run is refused (Dry-run and Assist) if the tab is on another BM, and the panel no longer sends it when the loaded BM differs
- feat(safety): A run stops with `ERR_BM_CHANGED` when `business_id` stays missing from the URL for about 3 seconds
- fix(safety): The saved draft remembers the BM of the selected ad accounts and drops an older selection that belongs to another BM

Full Changelog: Compare v0.6.1...v0.6.2

## v0.6.1

### What's Changed

- fix(flow): A partner with no assigned assets shows two "Assign assets" buttons; the flow now uses the one inside the verified partner details instead of stopping, and stops if the button is outside them
- fix(probe): Partial-access and cancel keys no longer count against the dialog hit-rate, because the current Meta UI has no partial-access option and names the secondary button "Back"

Full Changelog: Compare v0.6.0...v0.6.1

## v0.6.0

### What's Changed

- feat(safety): Kill-switch button in the side panel and popup stops the active run and locks Assist until cleared in Options
- feat(safety): A run stops with `ERR_BM_CHANGED` when the BM tab switches to another business
- feat(probe): Probe measures 6 screens (page, menu, 3 dialog wizard steps, partner detail), detects the screen automatically or lets you pick it, and copies all reports at once

Full Changelog: Compare v0.5.1...v0.6.0

## v0.5.1

### What's Changed

- feat(sidepanel): Log screen can pause auto-scroll and copy the log, and shows compact step chips
- fix(sidepanel): An open flow no longer hides the Log and Probe tabs

Full Changelog: Compare v0.5.0...v0.5.1

## v0.5.0

### What's Changed

- feat(sidepanel): Run log screen in the side panel
- feat(sidepanel): Selector probe tab that measures selector hit-rate on the live page, shown only when the Devtest flag `ui.probeTab` is on
- fix(partner): Hidden loading indicators no longer block reading partner search results, and a stuck indicator no longer turns "no partner" into a timeout

Full Changelog: Compare v0.4.0...v0.5.0

## v0.4.0

### What's Changed

- **Requires Firefox 128 or later.** Graph is an optional host permission on Firefox too, so an update does not disable the extension behind a new permission prompt
- fix(ui): Montserrat is self-hosted instead of loaded from Google Fonts

Full Changelog: Compare v0.3.0...v0.4.0

## v0.3.0

### What's Changed

- feat(ad-accounts): Load ad accounts into the side panel and feed them into the partner assign wizard
- feat(partner): Assign assets to existing partners, with an account selection step in the wizard
- feat(sidepanel): Navigate to the required Business Manager settings page before a flow runs, and re-check it at run time
- feat(options): Amber warning when delay base is below the recommended value, without blocking save
- feat(ad-accounts): On Chrome, access to Meta's Graph API is an optional permission requested from the side panel, so updating does not disable the extension behind a new permission prompt (Firefox still requests it at install)
- fix(ad-accounts): Session token is read only from inline page scripts, and the Assign click refuses to run while a checkbox picker dialog is open

Full Changelog: Compare v0.2.0...v0.3.0

## v0.2.0

### What's Changed

- feat(engine): DOM automation engine with dry-run, pacing, and human confirmation
- feat(flows): Partner asset assignment flow for Facebook Business Manager
- feat(sidepanel): Copilot side panel with workflow execution, diff preview, and audit logging
- feat(options): Settings page with pacing configurations, safety curfews, and audit log viewer
- feat(popup): Quick status and navigation popup

Full Changelog: Compare v0.1.0...v0.2.0

## v0.1.0

### What's Changed

- Initial release.
