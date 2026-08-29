import * as assert from 'assert';
import { parseGhAuthStatus, stripAnsi } from '../src/utils/parser';

function runTests() {
  console.log('--- Running Parser Unit Tests ---');

  // Test 1: Strip ANSI escape sequences
  {
    const rawAnsi = '\u001b[32m✓\u001b[0m Logged in to \u001b[1mgithub.com\u001b[0m account \u001b[36moctocat\u001b[0m (keyring)';
    const clean = stripAnsi(rawAnsi);
    assert.strictEqual(clean, '✓ Logged in to github.com account octocat (keyring)');
    console.log('✓ Test 1: stripAnsi passed');
  }

  // Test 2: Multi-account on github.com
  {
    const multiAccountOutput = `
github.com
  ✓ Logged in to github.com account octocat (keyring)
  - Active account: true
  - Git operations protocol: ssh
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'

  ✓ Logged in to github.com account work-dev (keyring)
  - Active account: false
  - Git operations protocol: https
  - Token: gho_************************************
`;
    const result = parseGhAuthStatus(multiAccountOutput);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hosts.length, 1);
    assert.strictEqual(result.hosts[0].host, 'github.com');
    assert.strictEqual(result.hosts[0].accounts.length, 2);

    const octocat = result.hosts[0].accounts[0];
    assert.strictEqual(octocat.username, 'octocat');
    assert.strictEqual(octocat.isActive, true);
    assert.strictEqual(octocat.protocol, 'ssh');
    assert.strictEqual(octocat.tokenSource, 'keyring');
    assert.deepStrictEqual(octocat.scopes, ['gist', 'read:org', 'repo', 'workflow']);

    const workDev = result.hosts[0].accounts[1];
    assert.strictEqual(workDev.username, 'work-dev');
    assert.strictEqual(workDev.isActive, false);
    assert.strictEqual(workDev.protocol, 'https');

    assert.strictEqual(result.activeAccount?.username, 'octocat');
    console.log('✓ Test 2: Multi-account parsing passed');
  }

  // Test 3: Multiple hosts (github.com and Enterprise)
  {
    const multiHostOutput = `
github.com
  ✓ Logged in to github.com account personal-user (keyring)
  - Active account: true
  - Git operations protocol: ssh

ghe.enterprise.corp
  ✓ Logged in to ghe.enterprise.corp account corp-user (hosts.yml)
  - Active account: true
  - Git operations protocol: https
`;
    const result = parseGhAuthStatus(multiHostOutput);
    assert.strictEqual(result.hosts.length, 2);
    assert.strictEqual(result.hosts[0].host, 'github.com');
    assert.strictEqual(result.hosts[0].activeAccount?.username, 'personal-user');
    assert.strictEqual(result.hosts[1].host, 'ghe.enterprise.corp');
    assert.strictEqual(result.hosts[1].activeAccount?.username, 'corp-user');
    assert.strictEqual(result.activeAccount?.username, 'personal-user');
    console.log('✓ Test 3: Multi-host parsing passed');
  }

  // Test 4: Single account without explicit Active flag (defaults to active)
  {
    const singleAccountOutput = `
github.com
  ✓ Logged in to github.com account solo-dev (keyring)
  - Git operations protocol: https
`;
    const result = parseGhAuthStatus(singleAccountOutput);
    assert.strictEqual(result.hosts.length, 1);
    assert.strictEqual(result.hosts[0].accounts.length, 1);
    assert.strictEqual(result.hosts[0].accounts[0].isActive, true);
    assert.strictEqual(result.activeAccount?.username, 'solo-dev');
    console.log('✓ Test 4: Single account default-active passed');
  }

  // Test 5: Not logged in
  {
    const notLoggedIn = 'You are not logged into any GitHub hosts. Run gh auth login to authenticate.';
    const result = parseGhAuthStatus(notLoggedIn);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.hosts.length, 0);
    assert.strictEqual(result.activeAccount, undefined);
    console.log('✓ Test 5: Not logged in state passed');
  }

  // Test 6: Invalid token status
  {
    const invalidTokenOutput = `
github.com
  X Logged in to github.com account expired-user (keyring)
  - Active account: true
  - The token in keyring is invalid.
`;
    const result = parseGhAuthStatus(invalidTokenOutput);
    assert.strictEqual(result.hosts.length, 1);
    const acc = result.hosts[0].accounts[0];
    assert.strictEqual(acc.isValid, false);
    assert.strictEqual(acc.username, 'expired-user');
    console.log('✓ Test 6: Invalid token detection passed');
  }

  console.log('--- All Tests Passed Successfully! ---');
}

runTests();
