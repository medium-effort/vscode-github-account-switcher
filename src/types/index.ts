export interface GitHubAccount {
  /** The GitHub username */
  username: string;
  /** The host domain (e.g. github.com or enterprise domain) */
  host: string;
  /** Whether this account is currently active for the host */
  isActive: boolean;
  /** Git protocol configured (ssh or https) */
  protocol?: string;
  /** Storage mechanism for credentials (e.g., keyring, oauth_token, env) */
  tokenSource?: string;
  /** Granted OAuth / token scopes */
  scopes?: string[];
  /** Whether authentication token is valid or expired */
  isValid?: boolean;
  /** Any error message associated with this account */
  error?: string;
}

export interface HostAccounts {
  /** The hostname (e.g. github.com) */
  host: string;
  /** List of all authenticated accounts on this host */
  accounts: GitHubAccount[];
  /** The active account on this host, if any */
  activeAccount?: GitHubAccount;
}

export interface AuthStatusResult {
  /** Whether the CLI command executed successfully */
  success: boolean;
  /** List of hosts and accounts found */
  hosts: HostAccounts[];
  /** Primary active account across hosts (defaulting to github.com or first active) */
  activeAccount?: GitHubAccount;
  /** Raw standard output and standard error combined */
  rawOutput: string;
  /** Error message if execution or authentication failed */
  error?: string;
  /** True if the `gh` binary was not found on PATH or custom path */
  cliMissing?: boolean;
}

export interface ExtensionConfig {
  refreshInterval: number;
  statusBarAlignment: 'left' | 'right';
  statusBarPriority: number;
  showHost: boolean;
  ghPath: string;
}
