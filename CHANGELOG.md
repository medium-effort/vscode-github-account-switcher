# Change Log

All notable changes to the "GitHub Account Switcher" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.5] - 2026-08-29

### Added
- **Open-source & Open VSX release readiness**:
  - Full CI/CD GitHub Actions for testing, bundling, and automated dual-publishing to Open VSX and VS Code Marketplace.
  - Added MIT License, detailed `CONTRIBUTING.md`, `SECURITY.md`, and structured GitHub issue templates.
  - Official high-resolution extension branding icon (`icon.png`).
- Direct `publish:ovsx` and `publish:vsce` scripts.

---

## [0.1.4] - 2026-08-29

### Added
- **Workspace Identity Auto-Detection**:
  - Automatically detects local repository Git identity (`user.email`, `user.name`, or remote origin URL) and switches to the matching GitHub account when opening a workspace or switching window focus.
  - Auto-configures local repository git identity on `git init` using the currently active GitHub account.
- **Git Config Synchronization**:
  - Option to synchronize local (`.git/config`) or global Git config when switching accounts (`githubAccountSwitcher.syncGitConfig`).

---

## [0.1.3] - 2026-08-29

### Added
- **Rich Status Tooltip**:
  - Displays host domain, Git operations protocol (SSH / HTTPS), token source (keyring / hosts.yml), OAuth scopes, and the active workspace author name & email (local vs global fallback).

---

## [0.1.2] - 2026-08-29

### Added
- Multi-host support for GitHub Enterprise instances alongside `github.com`.
- Status bar prefix option for enterprise hosts (`githubAccountSwitcher.showHost`).

---

## [0.1.1] - 2026-08-29

### Added
- Integrated terminal login command (`github-account-switcher.login`) to trigger `gh auth login` directly inside VS Code.
- Debounced window focus listener for automatic refresh when returning to VS Code.

---

## [0.1.0] - 2026-08-29

### Added
- Initial release.
- Status bar item displaying active GitHub account.
- Interactive QuickPick menu for switching between multiple GitHub accounts.
- Background polling status refresh.
