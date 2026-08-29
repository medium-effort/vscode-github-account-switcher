# Contributing to GitHub Account Switcher

Thank you for your interest in contributing to **GitHub Account Switcher**! We welcome bug reports, feature suggestions, documentation improvements, and code contributions.

---

## 🛠️ Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or later recommended)
- [npm](https://www.npmjs.com/)
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and configured
- [Visual Studio Code](https://code.visualstudio.com/)

### Clone and Install
```bash
git clone https://github.com/medium-effort/vscode-github-account-switcher.git
cd vscode-github-account-switcher
npm install
```

---

## 🚀 Development Workflow

### 1. Build and Watch
Start esbuild in watch mode to automatically recompile on changes:
```bash
npm run watch
```

### 2. Launch Extension Development Host
1. Open the project folder in VS Code.
2. Press `F5` (or go to **Run and Debug** -> select **Run Extension**).
3. A new **[Extension Development Host]** window will open with the extension loaded.
4. Test commands and status bar interactions in the new window.
5. After modifying code, reload the development window (`Ctrl+R` / `Cmd+R`).

### 3. Running Typecheck and Tests
Run the TypeScript compiler check:
```bash
npm run check-types
```

Run the unit test suite:
```bash
npm test
```

### 4. Packaging Extension Locally
To verify packaging into a `.vsix` file:
```bash
npm run package
```

---

## 📂 Project Architecture

```text
├── src/
│   ├── extension.ts        # Main entry point, lifecycle, and event listeners
│   ├── services/
│   │   └── ghCliService.ts # GitHub CLI runner, parser caller, and git config manager
│   ├── ui/
│   │   ├── statusBar.ts    # Status bar controller and tooltip builder
│   │   └── quickPick.ts    # Interactive quick pick account switcher menu
│   ├── utils/
│   │   └── parser.ts       # Output parser for `gh auth status`
│   └── types/
│       └── index.ts        # TypeScript interfaces and data models
├── test/
│   └── parser.test.ts      # Unit tests for CLI parsing logic
├── esbuild.js              # High-performance bundling configuration
└── package.json            # Extension manifest and contributions
```

---

## 📝 Pull Request Guidelines

1. **Create a Topic Branch**: Fork the repo and create a branch like `feature/my-feature` or `fix/issue-description`.
2. **Adhere to Code Standards**: Follow existing TypeScript formatting and conventions.
3. **Add / Update Tests**: If you are adding features or altering parsing logic, ensure unit tests cover the new behavior.
4. **Verify Clean Build**: Ensure `npm run check-types` and `npm test` pass before opening your PR.
5. **Describe Your Changes**: Explain the motivation and provide screenshots/recordings for UI modifications.

---

## 📜 License

By contributing to this repository, you agree that your contributions will be licensed under the [MIT License](LICENSE).
