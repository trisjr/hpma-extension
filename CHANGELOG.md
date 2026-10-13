# Changelog

All notable changes to this project will be documented in this file.

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
