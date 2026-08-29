import { AuthStatusResult, GitHubAccount, HostAccounts } from '../types';

/**
 * Strips ANSI escape codes from CLI terminal output.
 */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Parses the raw stdout/stderr output from `gh auth status`.
 */
export function parseGhAuthStatus(rawOutput: string): AuthStatusResult {
  const cleanText = stripAnsi(rawOutput).trim();

  // Check for explicit "not logged in" messages
  if (
    !cleanText ||
    cleanText.includes('You are not logged into any GitHub hosts') ||
    cleanText.includes('No GitHub hosts are authenticated')
  ) {
    return {
      success: true,
      hosts: [],
      rawOutput: cleanText,
    };
  }

  const lines = cleanText.split(/\r?\n/);
  const hosts: HostAccounts[] = [];

  let currentHost: HostAccounts | null = null;
  let currentAccount: Partial<GitHubAccount> | null = null;

  function commitCurrentAccount() {
    if (currentHost && currentAccount && currentAccount.username) {
      const account: GitHubAccount = {
        username: currentAccount.username,
        host: currentHost.host,
        isActive: currentAccount.isActive ?? false,
        protocol: currentAccount.protocol,
        tokenSource: currentAccount.tokenSource,
        scopes: currentAccount.scopes,
        isValid: currentAccount.isValid ?? true,
        error: currentAccount.error,
      };

      currentHost.accounts.push(account);
      if (account.isActive) {
        currentHost.activeAccount = account;
      }
      currentAccount = null;
    }
  }

  function commitCurrentHost() {
    commitCurrentAccount();
    if (currentHost && currentHost.accounts.length > 0) {
      // If no account was explicitly marked active, but there's only one account, treat it as active
      if (!currentHost.activeAccount && currentHost.accounts.length === 1) {
        currentHost.accounts[0].isActive = true;
        currentHost.activeAccount = currentHost.accounts[0];
      }
      hosts.push(currentHost);
      currentHost = null;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Host header line: typically non-indented host domain (e.g., "github.com", "ghe.mycompany.com")
    // or line ending with a colon / standard domain pattern
    const isIndented = line.startsWith(' ') || line.startsWith('\t');
    if (!isIndented && /^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}(:\d+)?$/.test(trimmed)) {
      commitCurrentHost();
      currentHost = {
        host: trimmed,
        accounts: [],
      };
      continue;
    }

    // Account header line: e.g. "✓ Logged in to github.com account octocat (keyring)"
    // or "X Logged in to github.com account octocat (hosts.yml)"
    const accountMatch = trimmed.match(
      /(?:✓|X|!|\*|-)?\s*Logged in to\s+([^\s]+)\s+account\s+([a-zA-Z0-9_.-]+)(?:\s+\(([^)]+)\))?/i
    );

    if (accountMatch) {
      commitCurrentAccount();
      const hostFromLine = accountMatch[1];
      const username = accountMatch[2];
      const tokenSource = accountMatch[3];

      if (!currentHost) {
        currentHost = {
          host: hostFromLine,
          accounts: [],
        };
      }

      currentAccount = {
        username,
        host: currentHost.host,
        tokenSource,
        isActive: false,
        isValid: !trimmed.startsWith('X'),
      };
      continue;
    }

    // Secondary details for the current account
    if (currentAccount) {
      // Active account status
      const activeMatch = trimmed.match(/- Active account:\s*(true|false)/i);
      if (activeMatch) {
        currentAccount.isActive = activeMatch[1].toLowerCase() === 'true';
        continue;
      }

      // Git protocol: ssh vs https
      const protocolMatch = trimmed.match(/- Git operations protocol:\s*([a-zA-Z0-9_-]+)/i);
      if (protocolMatch) {
        currentAccount.protocol = protocolMatch[1].toLowerCase();
        continue;
      }

      // Token scopes
      const scopesMatch = trimmed.match(/- Token scopes:\s*(.+)/i);
      if (scopesMatch) {
        currentAccount.scopes = scopesMatch[1]
          .split(',')
          .map((s) => s.replace(/['"]/g, '').trim())
          .filter(Boolean);
        continue;
      }

      // Token invalid or error
      if (trimmed.includes('The token in') && trimmed.includes('invalid')) {
        currentAccount.isValid = false;
        currentAccount.error = trimmed.replace(/^[-X!*]\s*/, '');
        continue;
      }
    }
  }

  // Commit any remaining account/host
  commitCurrentHost();

  // Find overall active account: prefer active on github.com, or the first active account found
  let activeAccount: GitHubAccount | undefined;
  const githubCom = hosts.find((h) => h.host === 'github.com');
  if (githubCom?.activeAccount) {
    activeAccount = githubCom.activeAccount;
  } else {
    for (const host of hosts) {
      if (host.activeAccount) {
        activeAccount = host.activeAccount;
        break;
      }
    }
  }

  return {
    success: true,
    hosts,
    activeAccount,
    rawOutput: cleanText,
  };
}
