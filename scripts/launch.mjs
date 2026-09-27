/**
 * One-click launcher: installs dependencies if needed, starts the app and
 * opens it in the default browser.
 *
 *   node scripts/launch.mjs            dev server + browser
 *   node scripts/launch.mjs --no-open  start without opening a browser
 *   node scripts/launch.mjs --port 5200
 *   node scripts/launch.mjs --preview  serve the production build in dist/
 *
 * Ctrl+C stops the server and closes the window it was started from.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const c = {
  reset: '\u001b[0m', dim: '\u001b[2m', bold: '\u001b[1m',
  green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m', cyan: '\u001b[36m',
};
const say = (msg = '') => console.log(msg);
const step = (msg) => say(`${c.cyan}>${c.reset} ${msg}`);
const warn = (msg) => say(`${c.yellow}!${c.reset} ${msg}`);
const die = (msg) => { say(`${c.red}x${c.reset} ${msg}`); process.exit(1); };

// ---- 1. Node version ------------------------------------------------------
const [major, minor] = process.versions.node.split('.').map(Number);
// Vite 7 needs Node 20.19+ or 22.12+.
const tooOld = major < 20 || (major === 20 && minor < 19) || (major === 22 && minor < 12);
if (tooOld) {
  die(`Node ${process.versions.node} is too old. Install Node 20.19+ or 22.12+ from https://nodejs.org and double-click again.`);
}

// ---- 2. Dependencies ------------------------------------------------------
const require = createRequire(import.meta.url);
const hasDeps = ['vite', 'react', 'pdfjs-dist'].every((pkg) => {
  try { require.resolve(`${pkg}/package.json`); return true; } catch { return false; }
});
if (!hasDeps) {
  step('Installing dependencies for the first time. This takes a minute...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npm, ['install', '--no-fund', '--no-audit'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) die('npm install failed. Check your internet connection and try again.');
}
if (!existsSync(join(root, 'node_modules', 'vite'))) die('Vite is still missing from node_modules. Delete node_modules and double-click again.');

// ---- 3. Open a URL in the default browser ---------------------------------
const openBrowser = (url) => {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawnSync(cmd, cmdArgs, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    return true;
  } catch {
    return false;
  }
};

// ---- 4. Start the app -----------------------------------------------------
const { preview, createServer } = await import('vite');
const shared = {
  root,
  configFile: join(root, 'vite.config.js'),
  logLevel: 'warn',
  server: flag('--preview') ? { port: Number(value('--port', 4173)), open: false } : { port: Number(value('--port', 5173)), open: false },
};
if (flag('--preview') && !existsSync(join(root, 'dist', 'index.html'))) {
  die('There is no build in dist/ yet. Run "npm run build" first, or start normally.');
}

const server = flag('--preview')
  ? await preview({ ...shared, preview: shared.server })
  : await createServer(shared);

if (!flag('--preview')) await server.listen();
const raw = server.resolvedUrls?.local?.[0] || `http://localhost:${shared.server.port}/`;
const url = new URL(raw).href;

say();
say(`${c.bold}  Resume Rewriter Studio${c.reset}  ${c.dim}(local only - nothing is uploaded)${c.reset}`);
say();
say(`  ${c.green}Running at ${c.reset}${c.bold}${url}${c.reset}`);
say(`  ${c.dim}Your browser should open automatically. If it does not, paste the link above.${c.reset}`);
say();
say(`  ${c.dim}Press Ctrl+C in this window to stop the app.${c.reset}`);
say();

const opened = flag('--no-open') ? false : openBrowser(url);
if (!opened && !flag('--no-open')) warn('Could not open a browser automatically - use the link above.');

let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  say(`\n${c.dim}Stopping...${c.reset}`);
  try { await (server.close ? server.close() : server.httpServer.close()); } catch { /* already gone */ }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
