import * as vscode from 'vscode';
import { AuthStatusResult, GitHubAccount } from '../types';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private refreshTimer: NodeJS.Timeout | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.statusBarItem = this.createStatusBarItem();
    this.statusBarItem.command = 'github-account-switcher.switchAccount';
    this.statusBarItem.show();
  }

  private createStatusBarItem(): vscode.StatusBarItem {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const alignmentSetting = config.get<string>('statusBarAlignment', 'right');
    const priority = config.get<number>('statusBarPriority', 100);

    const alignment =
      alignmentSetting === 'left' ? vscode.StatusBarAlignment.Left : vscode.StatusBarAlignment.Right;

    return vscode.window.createStatusBarItem(alignment, priority);
  }

  /**
   * Recreates the status bar item if alignment or priority setting changes.
   */
  public recreateIfConfigChanged(): void {
    const oldItem = this.statusBarItem;
    const text = oldItem.text;
    const tooltip = oldItem.tooltip;
    const command = oldItem.command;

    oldItem.dispose();

    this.statusBarItem = this.createStatusBarItem();
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.command = command;
    this.statusBarItem.show();
  }

  /**
   * Shows a loading spinner state in the status bar.
   */
  public setLoading(message: string = 'Switching...'): void {
    this.statusBarItem.text = `$(sync~spin) ${message}`;
    this.statusBarItem.tooltip = 'Switching GitHub account...';
  }

  /**
   * Updates the status bar representation based on current authentication state.
   */
  public update(
    status: AuthStatusResult,
    gitIdentity?: { name?: string; email?: string; isLocalName: boolean; isLocalEmail: boolean } | null
  ): void {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const showHost = config.get<boolean>('showHost', true);

    if (status.cliMissing) {
      this.statusBarItem.text = '$(warning) gh CLI Missing';
      this.statusBarItem.tooltip = new vscode.MarkdownString(
        '**GitHub CLI Not Found**\n\nGitHub CLI (`gh`) is not installed or not in PATH.\n\n[Click to Install / Configure](command:github-account-switcher.switchAccount)'
      );
      this.statusBarItem.tooltip.isTrusted = true;
      return;
    }

    if (!status.activeAccount) {
      if (status.hosts.length === 0) {
        this.statusBarItem.text = '$(github) No GitHub Account';
        this.statusBarItem.tooltip = new vscode.MarkdownString(
          '**No Authenticated Accounts**\n\nNo GitHub accounts logged in via `gh`.\n\n[Click to Log In](command:github-account-switcher.switchAccount)'
        );
      } else {
        this.statusBarItem.text = '$(github) Inactive';
        this.statusBarItem.tooltip = new vscode.MarkdownString(
          '**GitHub Account Inactive**\n\nClick to select an active account.'
        );
      }
      this.statusBarItem.tooltip.isTrusted = true;
      return;
    }

    const account: GitHubAccount = status.activeAccount;
    const isEnterprise = account.host !== 'github.com';
    const displayText = isEnterprise && showHost
      ? `$(github) ${account.host}:${account.username}`
      : `$(github) ${account.username}`;

    this.statusBarItem.text = displayText;

    // Rich Markdown Tooltip
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**Active GitHub Account:** \`${account.username}\`\n\n`);
    md.appendMarkdown(`- **Host:** \`${account.host}\`\n`);
    if (account.protocol) {
      md.appendMarkdown(`- **Protocol:** \`${account.protocol.toUpperCase()}\`\n`);
    }
    if (account.tokenSource) {
      md.appendMarkdown(`- **Token Source:** ${account.tokenSource}\n`);
    }
    if (account.scopes && account.scopes.length > 0) {
      md.appendMarkdown(`- **Scopes:** ${account.scopes.map(s => `\`${s}\``).join(', ')}\n`);
    }

    // Git Identity section in tooltip
    md.appendMarkdown(`\n---\n**Git Author Identity:**\n`);
    if (gitIdentity && (gitIdentity.name || gitIdentity.email)) {
      if (gitIdentity.name) {
        const sourceName = gitIdentity.isLocalName ? '*(local repository)*' : '*(global fallback)*';
        md.appendMarkdown(`- **Name:** \`${gitIdentity.name}\` ${sourceName}\n`);
      }
      if (gitIdentity.email) {
        const sourceEmail = gitIdentity.isLocalEmail ? '*(local repository)*' : '*(global fallback)*';
        md.appendMarkdown(`- **Email:** \`${gitIdentity.email}\` ${sourceEmail}\n`);
      }
    } else {
      md.appendMarkdown(`- *(Not configured in local or global Git config)*\n`);
    }

    md.appendMarkdown(`\n---\n[Click to Switch Account](command:github-account-switcher.switchAccount)`);

    this.statusBarItem.tooltip = md;
  }

  /**
   * Sets up periodic background polling and window focus change refresh.
   */
  public setupAutoRefresh(onRefresh: (isFocusEvent?: boolean) => void): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const intervalSeconds = config.get<number>('refreshInterval', 60);

    if (intervalSeconds > 0) {
      this.refreshTimer = setInterval(() => {
        onRefresh(false);
      }, intervalSeconds * 1000);
    }

    // Refresh when user returns to VS Code window
    const focusDisposable = vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        onRefresh(true);
      }
    });
    this.disposables.push(focusDisposable);
  }

  public dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.statusBarItem.dispose();
  }
}
