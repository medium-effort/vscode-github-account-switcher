import * as vscode from 'vscode';
import { GhCliService } from '../services/ghCliService';
import { GitHubAccount } from '../types';
import { StatusBarManager } from './statusBar';

interface AccountQuickPickItem extends vscode.QuickPickItem {
  account?: GitHubAccount;
  action?: 'login' | 'refresh' | 'settings' | 'install';
}

export class AccountQuickPick {
  constructor(
    private ghCliService: GhCliService,
    private statusBar: StatusBarManager,
    private refreshStatus: () => Promise<void>
  ) {}

  /**
   * Displays the QuickPick menu allowing the user to select an account or trigger an action.
   */
  public async show(): Promise<void> {
    const status = await this.ghCliService.getAuthStatus();

    // Handle CLI missing
    if (status.cliMissing) {
      await this.ghCliService.promptInstallCli();
      return;
    }

    const items: AccountQuickPickItem[] = [];

    // Collect all accounts across all hosts
    const allAccounts: GitHubAccount[] = [];
    for (const host of status.hosts) {
      for (const acc of host.accounts) {
        allAccounts.push(acc);
      }
    }

    if (allAccounts.length > 0) {
      // Group accounts by host if multiple hosts exist
      const multipleHosts = status.hosts.length > 1;

      for (const hostGroup of status.hosts) {
        if (multipleHosts) {
          items.push({
            label: hostGroup.host,
            kind: vscode.QuickPickItemKind.Separator,
          });
        }

        for (const account of hostGroup.accounts) {
          const icon = account.isActive ? '$(check)' : '$(circle-outline)';
          const activeSuffix = account.isActive ? '(Active)' : '';
          const hostLabel = multipleHosts ? '' : ` • ${account.host}`;

          let details = '';
          if (account.protocol) {
            details += `Protocol: ${account.protocol.toUpperCase()}`;
          }
          if (account.tokenSource) {
            details += (details ? ' | ' : '') + `Source: ${account.tokenSource}`;
          }
          if (account.error) {
            details += (details ? ' | ' : '') + `⚠️ ${account.error}`;
          }

          items.push({
            label: `${icon} ${account.username}`,
            description: `${activeSuffix}${hostLabel}`.trim(),
            detail: details || undefined,
            account,
          });
        }
      }

      // Actions section
      items.push({
        label: 'Actions',
        kind: vscode.QuickPickItemKind.Separator,
      });
    }

    // Always available actions
    items.push({
      label: '$(add) Log in new account',
      description: 'Run gh auth login in terminal',
      action: 'login',
    });

    items.push({
      label: '$(refresh) Refresh accounts',
      description: 'Re-check authentication status',
      action: 'refresh',
    });

    items.push({
      label: '$(gear) Configure Settings',
      description: 'Open extension settings',
      action: 'settings',
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: allAccounts.length > 0
        ? 'Select a GitHub account to switch to, or choose an action'
        : 'No accounts logged in. Choose an action:',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return;
    }

    if (selected.action) {
      await this.handleAction(selected.action);
    } else if (selected.account) {
      await this.handleAccountSwitch(selected.account);
    }
  }

  private async handleAction(action: 'login' | 'refresh' | 'settings' | 'install'): Promise<void> {
    switch (action) {
      case 'login': {
        const hostname = await vscode.window.showInputBox({
          prompt: 'Enter GitHub hostname (leave default for github.com)',
          value: 'github.com',
          placeHolder: 'github.com or your-enterprise-domain.com',
        });
        if (hostname) {
          this.ghCliService.launchLoginTerminal(hostname.trim());
        }
        break;
      }
      case 'refresh': {
        await this.refreshStatus();
        vscode.window.setStatusBarMessage('$(sync) GitHub accounts refreshed', 3000);
        break;
      }
      case 'settings': {
        vscode.commands.executeCommand('workbench.action.openSettings', 'githubAccountSwitcher');
        break;
      }
    }
  }

  private async handleAccountSwitch(account: GitHubAccount): Promise<void> {
    if (account.isActive) {
      const gitSync = await this.ghCliService.syncGitConfig(account);
      if (gitSync.mode === 'local' && gitSync.success) {
        vscode.window.setStatusBarMessage(
          `$(check) GitHub account "${account.username}" is active • Synced Local Git: ${gitSync.gitName} <${gitSync.gitEmail}>`,
          5000
        );
      } else if (gitSync.mode === 'global' && gitSync.success) {
        vscode.window.setStatusBarMessage(
          `$(check) GitHub account "${account.username}" is active • Synced Global Git: ${gitSync.gitName} <${gitSync.gitEmail}>`,
          5000
        );
      } else {
        vscode.window.showInformationMessage(`GitHub account "${account.username}" on ${account.host} is already active.`);
      }
      return;
    }

    this.statusBar.setLoading(`Switching to ${account.username}...`);

    const result = await this.ghCliService.switchAccount(account.username, account.host);

    if (result.success) {
      // Synchronize git config (user.name and user.email)
      const gitSync = await this.ghCliService.syncGitConfig(account);
      await this.refreshStatus();

      let syncNote = '';
      if (gitSync.mode === 'local' && gitSync.success) {
        syncNote = ` • Local Git Identity: ${gitSync.gitName} <${gitSync.gitEmail}>`;
      } else if (gitSync.mode === 'global' && gitSync.success) {
        syncNote = ` • Global Git Identity: ${gitSync.gitName} <${gitSync.gitEmail}>`;
      }

      vscode.window.setStatusBarMessage(
        `$(check) Switched active GitHub account to ${account.username} (${account.host})${syncNote}`,
        6000
      );
    } else {
      await this.refreshStatus();
      vscode.window.showErrorMessage(
        `Failed to switch account to "${account.username}": ${result.error || 'Unknown error'}`
      );
    }
  }
}
