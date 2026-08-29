import * as cp from 'child_process';
import * as vscode from 'vscode';
import { AuthStatusResult } from '../types';
import { parseGhAuthStatus } from '../utils/parser';

export class GhCliService {
  /**
   * Retrieves the configured executable path for GitHub CLI.
   */
  public getGhPath(): string {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    return config.get<string>('ghPath', 'gh').trim() || 'gh';
  }

  /**
   * Executes a command using the GitHub CLI binary.
   */
  private execGh(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
    const ghPath = this.getGhPath();

    return new Promise((resolve, reject) => {
      cp.execFile(ghPath, args, { encoding: 'utf8', windowsHide: true, shell: true }, (error, stdout, stderr) => {
        if (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            const err = new Error(`GitHub CLI executable not found at "${ghPath}"`);
            (err as NodeJS.ErrnoException).code = 'ENOENT';
            return reject(err);
          }
          return resolve({
            stdout: stdout || '',
            stderr: stderr || error.message,
            code: typeof error.code === 'number' ? error.code : 1,
          });
        }
        resolve({ stdout: stdout || '', stderr: stderr || '', code: 0 });
      });
    });
  }

  /**
   * Checks if GitHub CLI is installed and accessible.
   */
  public async isCliInstalled(): Promise<boolean> {
    try {
      const result = await this.execGh(['--version']);
      return result.stdout.toLowerCase().includes('gh version');
    } catch {
      return false;
    }
  }

  /**
   * Fetches current authentication status and accounts for all hosts.
   */
  public async getAuthStatus(): Promise<AuthStatusResult> {
    try {
      const { stdout, stderr } = await this.execGh(['auth', 'status']);
      const combinedOutput = `${stdout}\n${stderr}`.trim();
      return parseGhAuthStatus(combinedOutput);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return {
          success: false,
          hosts: [],
          rawOutput: '',
          error: `GitHub CLI ("${this.getGhPath()}") was not found in PATH.`,
          cliMissing: true,
        };
      }
      return {
        success: false,
        hosts: [],
        rawOutput: '',
        error: err.message || 'Failed to execute gh auth status',
      };
    }
  }

  private isSwitching = false;

  /**
   * Switches the active account for a given host using `gh auth switch`.
   */
  public async switchAccount(username: string, hostname: string = 'github.com'): Promise<{ success: boolean; error?: string }> {
    if (this.isSwitching) {
      await new Promise((r) => setTimeout(r, 200));
    }
    this.isSwitching = true;
    try {
      const args = ['auth', 'switch', '--hostname', hostname, '--user', username];
      const result = await this.execGh(args);

      if (result.code !== 0) {
        const errorMsg = result.stderr || result.stdout || `Exit code ${result.code}`;
        return { success: false, error: errorMsg.trim() };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || `Failed to switch to account ${username}`,
      };
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Spawns an integrated terminal and runs `gh auth login` for interactive authentication.
   */
  public launchLoginTerminal(hostname: string = 'github.com'): void {
    const ghPath = this.getGhPath();
    const terminal = vscode.window.createTerminal({
      name: 'GitHub CLI Login',
      iconPath: new vscode.ThemeIcon('github'),
    });

    terminal.show();
    const command = hostname === 'github.com' ? `${ghPath} auth login` : `${ghPath} auth login --hostname ${hostname}`;
    terminal.sendText(command);
  }

  /**
   * Fetches user profile info (name, email, id) from GitHub API for active account.
   */
  public async getUserProfile(hostname: string = 'github.com'): Promise<{ login: string; name?: string; email?: string; id?: number } | null> {
    try {
      const args = hostname === 'github.com' ? ['api', 'user'] : ['api', 'user', '--hostname', hostname];
      const result = await this.execGh(args);
      if (result.code === 0 && result.stdout) {
        return JSON.parse(result.stdout);
      }
    } catch {
      // Fallback silently if API call fails
    }
    return null;
  }

  /**
   * Executes a git command.
   */
  private execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve) => {
      cp.execFile('git', args, { cwd, encoding: 'utf8', windowsHide: true, shell: true }, (error, stdout, stderr) => {
        if (error) {
          resolve({ stdout: stdout || '', stderr: stderr || error.message, code: typeof error.code === 'number' ? error.code : 1 });
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '', code: 0 });
        }
      });
    });
  }

  /**
   * Synchronizes git config (user.name and user.email) with the active GitHub account.
   */
  public async syncGitConfig(account: { username: string; host: string }): Promise<{
    success: boolean;
    mode: 'local' | 'global' | 'off' | 'skipped';
    gitName?: string;
    gitEmail?: string;
    error?: string;
  }> {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const syncMode = config.get<string>('syncGitConfig', 'local');

    if (syncMode === 'off') {
      return { success: true, mode: 'off' };
    }

    const profile = await this.getUserProfile(account.host);
    const gitName = (profile?.name && profile.name.trim()) || account.username;

    // Determine email
    let gitEmail = profile?.email && profile.email.trim();
    if (!gitEmail) {
      const isEnterprise = account.host !== 'github.com';
      const emailDomain = isEnterprise ? `users.noreply.${account.host}` : 'users.noreply.github.com';
      gitEmail = profile?.id ? `${profile.id}+${account.username}@${emailDomain}` : `${account.username}@${emailDomain}`;
    }

    if (syncMode === 'local') {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return { success: true, mode: 'skipped' };
      }

      const cwd = workspaceFolder.uri.fsPath;
      const resName = await this.execGit(['config', '--local', 'user.name', gitName], cwd);
      const resEmail = await this.execGit(['config', '--local', 'user.email', gitEmail], cwd);

      if (resName.code !== 0 || resEmail.code !== 0) {
        // May not be a git repository
        return {
          success: false,
          mode: 'local',
          error: resName.stderr || resEmail.stderr || 'Failed to update local git config',
        };
      }

      return { success: true, mode: 'local', gitName, gitEmail };
    } else if (syncMode === 'global') {
      const resName = await this.execGit(['config', '--global', 'user.name', gitName]);
      const resEmail = await this.execGit(['config', '--global', 'user.email', gitEmail]);

      if (resName.code !== 0 || resEmail.code !== 0) {
        return {
          success: false,
          mode: 'global',
          error: resName.stderr || resEmail.stderr || 'Failed to update global git config',
        };
      }

      return { success: true, mode: 'global', gitName, gitEmail };
    }

    return { success: true, mode: 'off' };
  }

  /**
   * Reads current local repository git configuration (user.name, user.email, remote.origin.url).
   */
  public async getLocalGitConfig(): Promise<{ name?: string; email?: string; remoteUrl?: string } | null> {
    const activeDocUri = vscode.window.activeTextEditor?.document.uri;
    const workspaceFolder = (activeDocUri && vscode.workspace.getWorkspaceFolder(activeDocUri)) ||
      vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return null;
    }

    const cwd = workspaceFolder.uri.fsPath;
    const [nameRes, emailRes, remoteRes] = await Promise.all([
      this.execGit(['config', '--local', 'user.name'], cwd),
      this.execGit(['config', '--local', 'user.email'], cwd),
      this.execGit(['config', '--local', 'remote.origin.url'], cwd),
    ]);

    const name = nameRes.code === 0 ? nameRes.stdout.trim() : undefined;
    const email = emailRes.code === 0 ? emailRes.stdout.trim() : undefined;
    const remoteUrl = remoteRes.code === 0 ? remoteRes.stdout.trim() : undefined;

    if (!name && !email && !remoteUrl) {
      return null;
    }

    return { name, email, remoteUrl };
  }

  /**
   * Reads comprehensive workspace Git info across all remotes and effective configuration.
   */
  public async getWorkspaceGitInfo(): Promise<{
    localName?: string;
    localEmail?: string;
    effectiveName?: string;
    effectiveEmail?: string;
    remoteUrls: string[];
    isGitRepo: boolean;
  } | null> {
    const activeDocUri = vscode.window.activeTextEditor?.document.uri;
    const workspaceFolder = (activeDocUri && vscode.workspace.getWorkspaceFolder(activeDocUri)) ||
      vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      return null;
    }

    const cwd = workspaceFolder.uri.fsPath;
    const [
      localNameRes,
      localEmailRes,
      effectiveNameRes,
      effectiveEmailRes,
      remoteUrlsRes,
    ] = await Promise.all([
      this.execGit(['config', '--local', 'user.name'], cwd),
      this.execGit(['config', '--local', 'user.email'], cwd),
      this.execGit(['config', 'user.name'], cwd),
      this.execGit(['config', 'user.email'], cwd),
      this.execGit(['config', '--get-regexp', '^remote\\..*\\.url'], cwd),
    ]);

    const isGitRepo =
      localNameRes.code === 0 ||
      localEmailRes.code === 0 ||
      effectiveNameRes.code === 0 ||
      remoteUrlsRes.code === 0;

    const localName = localNameRes.code === 0 && localNameRes.stdout.trim() ? localNameRes.stdout.trim() : undefined;
    const localEmail = localEmailRes.code === 0 && localEmailRes.stdout.trim() ? localEmailRes.stdout.trim() : undefined;
    const effectiveName = effectiveNameRes.code === 0 && effectiveNameRes.stdout.trim() ? effectiveNameRes.stdout.trim() : undefined;
    const effectiveEmail = effectiveEmailRes.code === 0 && effectiveEmailRes.stdout.trim() ? effectiveEmailRes.stdout.trim() : undefined;

    const remoteUrls: string[] = [];
    if (remoteUrlsRes.code === 0 && remoteUrlsRes.stdout.trim()) {
      const lines = remoteUrlsRes.stdout.trim().split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^remote\.[^.]+\.url\s+(.+)$/i);
        if (match) {
          remoteUrls.push(match[1].trim());
        }
      }
    }

    return {
      localName,
      localEmail,
      effectiveName,
      effectiveEmail,
      remoteUrls,
      isGitRepo,
    };
  }

  /**
   * Matches the workspace git identity / remotes to an authenticated GitHub account and switches if necessary.
   */
  public async autoMatchAndSwitchAccount(status: AuthStatusResult): Promise<{
    switched: boolean;
    account?: { username: string; host: string };
    alreadyActive?: boolean;
    matchedBy?: string;
  }> {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const enabled = config.get<boolean>('autoSwitchOnWorkspaceOpen', true);

    if (!enabled || status.hosts.length === 0) {
      return { switched: false };
    }

    const gitInfo = await this.getWorkspaceGitInfo();
    if (!gitInfo || !gitInfo.isGitRepo) {
      return { switched: false };
    }

    // Collect all accounts across all hosts
    const allAccounts: { username: string; host: string; isActive: boolean }[] = [];
    for (const host of status.hosts) {
      for (const acc of host.accounts) {
        allAccounts.push(acc);
      }
    }

    const normalize = (str?: string) => (str ? str.toLowerCase().replace(/[\s-_.]/g, '') : '');

    let matchedAccount: { username: string; host: string; isActive: boolean } | null = null;
    let matchedBy = '';

    // Step 1: Check remote URLs (most definitive repository link)
    for (const acc of allAccounts) {
      const userLower = acc.username.toLowerCase();
      const userNorm = normalize(acc.username);

      for (const remoteUrl of gitInfo.remoteUrls) {
        const remoteLower = remoteUrl.toLowerCase();
        if (
          remoteLower.includes(`/${userLower}/`) ||
          remoteLower.includes(`:${userLower}/`) ||
          remoteLower.includes(`@${userLower}/`) ||
          remoteLower.includes(`/${userNorm}/`) ||
          remoteLower.includes(`:${userNorm}/`)
        ) {
          matchedAccount = acc;
          matchedBy = `remote URL "${remoteUrl}"`;
          break;
        }
      }
      if (matchedAccount) {
        break;
      }
    }

    // Step 2: Check Local Git Email
    if (!matchedAccount && gitInfo.localEmail) {
      const localEmailLower = gitInfo.localEmail.toLowerCase();
      for (const acc of allAccounts) {
        const userLower = acc.username.toLowerCase();
        const userNorm = normalize(acc.username);
        const emailPrefix = localEmailLower.split('@')[0] || '';
        const emailPrefixNorm = normalize(emailPrefix);

        if (
          localEmailLower.includes(`+${userLower}@`) ||
          localEmailLower.startsWith(`${userLower}@`) ||
          localEmailLower === `${userLower}@users.noreply.github.com` ||
          (userNorm.length >= 3 && emailPrefixNorm.includes(userNorm))
        ) {
          matchedAccount = acc;
          matchedBy = `local Git email "${gitInfo.localEmail}"`;
          break;
        }
      }
    }

    // Step 3: Check Local Git Name
    if (!matchedAccount && gitInfo.localName) {
      const localNameNorm = normalize(gitInfo.localName);
      for (const acc of allAccounts) {
        const userNorm = normalize(acc.username);
        if (localNameNorm === userNorm || gitInfo.localName.toLowerCase() === acc.username.toLowerCase()) {
          matchedAccount = acc;
          matchedBy = `local Git name "${gitInfo.localName}"`;
          break;
        }
      }
    }

    // Step 4: Check Effective Git Email (if no local email was configured)
    if (!matchedAccount && gitInfo.effectiveEmail) {
      const effectiveEmailLower = gitInfo.effectiveEmail.toLowerCase();
      for (const acc of allAccounts) {
        const userLower = acc.username.toLowerCase();
        const userNorm = normalize(acc.username);
        const emailPrefix = effectiveEmailLower.split('@')[0] || '';
        const emailPrefixNorm = normalize(emailPrefix);

        if (
          effectiveEmailLower.includes(`+${userLower}@`) ||
          effectiveEmailLower.startsWith(`${userLower}@`) ||
          effectiveEmailLower === `${userLower}@users.noreply.github.com` ||
          (userNorm.length >= 3 && emailPrefixNorm.includes(userNorm))
        ) {
          matchedAccount = acc;
          matchedBy = `effective Git email "${gitInfo.effectiveEmail}"`;
          break;
        }
      }
    }

    // Step 5: Check Effective Git Name (if no local name was configured)
    if (!matchedAccount && gitInfo.effectiveName) {
      const effectiveNameNorm = normalize(gitInfo.effectiveName);
      for (const acc of allAccounts) {
        const userNorm = normalize(acc.username);
        if (effectiveNameNorm === userNorm || gitInfo.effectiveName.toLowerCase() === acc.username.toLowerCase()) {
          matchedAccount = acc;
          matchedBy = `effective Git name "${gitInfo.effectiveName}"`;
          break;
        }
      }
    }

    if (!matchedAccount) {
      return { switched: false };
    }

    if (matchedAccount.isActive) {
      return { switched: false, account: matchedAccount, alreadyActive: true, matchedBy };
    }

    // Switch to matched account
    const result = await this.switchAccount(matchedAccount.username, matchedAccount.host);
    if (result.success) {
      return { switched: true, account: matchedAccount, matchedBy };
    }

    return { switched: false };
  }

  /**
   * Checks if current workspace is a git repository with no local user.name/user.email configured,
   * and automatically initializes local git config to match the active GitHub account.
   */
  public async ensureLocalGitConfigForActiveAccount(account: { username: string; host: string }): Promise<{
    initialized: boolean;
    gitName?: string;
    gitEmail?: string;
  }> {
    const config = vscode.workspace.getConfiguration('githubAccountSwitcher');
    const syncMode = config.get<string>('syncGitConfig', 'local');

    if (syncMode !== 'local') {
      return { initialized: false };
    }

    const localGit = await this.getLocalGitConfig();
    // If already has local email and name, do not overwrite
    if (localGit?.email && localGit?.name) {
      return { initialized: false };
    }

    const syncResult = await this.syncGitConfig(account);
    if (syncResult.success && syncResult.mode === 'local') {
      return {
        initialized: true,
        gitName: syncResult.gitName,
        gitEmail: syncResult.gitEmail,
      };
    }

    return { initialized: false };
  }

  /**
   * Reads the active Git author identity in the workspace (local or global fallback).
   */
  public async getEffectiveGitIdentity(): Promise<{
    name?: string;
    email?: string;
    isLocalName: boolean;
    isLocalEmail: boolean;
  } | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;

    let localName: string | undefined;
    let localEmail: string | undefined;

    if (cwd) {
      const [localNameRes, localEmailRes] = await Promise.all([
        this.execGit(['config', '--local', 'user.name'], cwd),
        this.execGit(['config', '--local', 'user.email'], cwd),
      ]);
      if (localNameRes.code === 0 && localNameRes.stdout.trim()) {
        localName = localNameRes.stdout.trim();
      }
      if (localEmailRes.code === 0 && localEmailRes.stdout.trim()) {
        localEmail = localEmailRes.stdout.trim();
      }
    }

    // Check global config
    const [globalNameRes, globalEmailRes] = await Promise.all([
      this.execGit(['config', '--global', 'user.name']),
      this.execGit(['config', '--global', 'user.email']),
    ]);

    const globalName = globalNameRes.code === 0 && globalNameRes.stdout.trim() ? globalNameRes.stdout.trim() : undefined;
    const globalEmail = globalEmailRes.code === 0 && globalEmailRes.stdout.trim() ? globalEmailRes.stdout.trim() : undefined;

    const name = localName || globalName;
    const email = localEmail || globalEmail;

    if (!name && !email) {
      return null;
    }

    return {
      name,
      email,
      isLocalName: Boolean(localName),
      isLocalEmail: Boolean(localEmail),
    };
  }

  /**
   * Prompts the user to install GitHub CLI with a direct link.
   */
  public async promptInstallCli(): Promise<void> {
    const downloadAction = 'Download GitHub CLI';
    const configureAction = 'Configure Custom Path';

    const selection = await vscode.window.showWarningMessage(
      'GitHub CLI (gh) is not installed or not in PATH. Please install it to use GitHub Account Switcher.',
      downloadAction,
      configureAction
    );

    if (selection === downloadAction) {
      vscode.env.openExternal(vscode.Uri.parse('https://cli.github.com/'));
    } else if (selection === configureAction) {
      vscode.commands.executeCommand('workbench.action.openSettings', 'githubAccountSwitcher.ghPath');
    }
  }
}
