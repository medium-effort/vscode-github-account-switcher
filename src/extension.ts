import * as vscode from 'vscode';
import { GhCliService } from './services/ghCliService';
import { AccountQuickPick } from './ui/quickPick';
import { StatusBarManager } from './ui/statusBar';

let statusBarManager: StatusBarManager | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const ghCliService = new GhCliService();
  statusBarManager = new StatusBarManager();

  let focusDebounceTimer: NodeJS.Timeout | null = null;

  const refreshStatus = async (isFocusEvent: boolean = false): Promise<void> => {
    if (!statusBarManager) {
      return;
    }

    if (isFocusEvent) {
      if (focusDebounceTimer) {
        clearTimeout(focusDebounceTimer);
      }
      focusDebounceTimer = setTimeout(async () => {
        const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
        const autoSwitchOnFocus = config.get<boolean>('autoSwitchOnWindowFocus', true);

        if (autoSwitchOnFocus) {
          const currentStatus = await ghCliService.getAuthStatus();
          const match = await ghCliService.autoMatchAndSwitchAccount(currentStatus);
          if (match.switched && match.account) {
            vscode.window.setStatusBarMessage(
              `$(github) Auto-switched to GitHub account "${match.account.username}" (matched ${match.matchedBy})`,
              5000
            );
          }
        }

        const [status, gitIdentity] = await Promise.all([
          ghCliService.getAuthStatus(),
          ghCliService.getEffectiveGitIdentity(),
        ]);
        statusBarManager?.update(status, gitIdentity);
      }, 150);
      return;
    }

    const [status, gitIdentity] = await Promise.all([
      ghCliService.getAuthStatus(),
      ghCliService.getEffectiveGitIdentity(),
    ]);
    statusBarManager.update(status, gitIdentity);
  };

  const quickPick = new AccountQuickPick(ghCliService, statusBarManager, refreshStatus);

  // Register commands
  const switchCmd = vscode.commands.registerCommand('github-account-switcher.switchAccount', async () => {
    await quickPick.show();
  });

  const refreshCmd = vscode.commands.registerCommand('github-account-switcher.refresh', async () => {
    statusBarManager?.setLoading('Refreshing...');
    await refreshStatus();
    vscode.window.setStatusBarMessage('$(sync) GitHub accounts refreshed', 3000);
  });

  const loginCmd = vscode.commands.registerCommand('github-account-switcher.login', async () => {
    const hostname = await vscode.window.showInputBox({
      prompt: 'Enter GitHub hostname (press Enter for github.com)',
      value: 'github.com',
      placeHolder: 'github.com or your-enterprise-domain.com',
    });
    if (hostname) {
      ghCliService.launchLoginTerminal(hostname.trim());
    }
  });

  // Watch for configuration updates
  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('githubAccountSwitcher')) {
      statusBarManager?.recreateIfConfigChanged();
      statusBarManager?.setupAutoRefresh(refreshStatus);
      refreshStatus();
    }
  });

  // Setup auto-refresh polling and focus listeners
  statusBarManager.setupAutoRefresh(refreshStatus);

  // Register all disposables
  context.subscriptions.push(
    statusBarManager,
    switchCmd,
    refreshCmd,
    loginCmd,
    configListener
  );

  // Initial authentication check & workspace auto-match
  const initialStatus = await ghCliService.getAuthStatus();
  const autoMatch = await ghCliService.autoMatchAndSwitchAccount(initialStatus);

  if (autoMatch.switched && autoMatch.account) {
    vscode.window.setStatusBarMessage(
      `$(github) Auto-switched to GitHub account "${autoMatch.account.username}" (matched repository ${autoMatch.matchedBy})`,
      5000
    );
  }
  await refreshStatus();

  // Check workspace identity when opened folders change
  const folderListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
    const currentStatus = await ghCliService.getAuthStatus();
    const match = await ghCliService.autoMatchAndSwitchAccount(currentStatus);
    if (match.switched && match.account) {
      vscode.window.setStatusBarMessage(
        `$(github) Auto-switched to GitHub account "${match.account.username}" (matched repository ${match.matchedBy})`,
        5000
      );
      await refreshStatus();
    }
  });

  // Watch for git repository config changes (e.g. user runs 'git init', edits .git/config, etc.)
  const gitConfigWatcher = vscode.workspace.createFileSystemWatcher('**/.git/config');
  const gitInitDisposable = gitConfigWatcher.onDidCreate(async () => {
    setTimeout(async () => {
      const status = await ghCliService.getAuthStatus();
      if (status.activeAccount) {
        const result = await ghCliService.ensureLocalGitConfigForActiveAccount(status.activeAccount);
        if (result.initialized) {
          vscode.window.setStatusBarMessage(
            `$(git-commit) Initialized local Git identity for active account "${status.activeAccount.username}" (${result.gitName} <${result.gitEmail}>)`,
            6000
          );
        }
      }
      await refreshStatus();
    }, 300);
  });

  const gitChangeDisposable = gitConfigWatcher.onDidChange(async () => {
    setTimeout(async () => {
      await refreshStatus();
    }, 300);
  });

  const gitDeleteDisposable = gitConfigWatcher.onDidDelete(async () => {
    setTimeout(async () => {
      await refreshStatus();
    }, 300);
  });

  const editorListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (editor && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
      await refreshStatus(true);
    }
  });

  context.subscriptions.push(
    folderListener,
    editorListener,
    gitConfigWatcher,
    gitInitDisposable,
    gitChangeDisposable,
    gitDeleteDisposable
  );
}

export function deactivate(): void {
  if (statusBarManager) {
    statusBarManager.dispose();
    statusBarManager = null;
  }
}
