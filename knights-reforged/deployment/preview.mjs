// Start inside an existing, approved cloud development environment.
// This script does not create a service, tunnel, Codespace, or public URL.
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const codespace = process.env.CODESPACE_NAME;
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const origin = process.env.APP_ORIGIN ?? (codespace && forwardingDomain
  ? `https://${codespace}-${port}.${forwardingDomain}` : `http://localhost:${port}`);
const parsed = new URL(origin);
if (['bluepawgames.com','storm8.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith('.' + host))) {
  throw new Error('A replacement origin is required.');
}
console.log('Starting the realm. Keep port visibility PRIVATE in the hosting UI.');
console.log('This script cannot verify the provider access setting. No demo accounts are seeded.');
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', HOST: '0.0.0.0', PORT: String(port), APP_ORIGIN: parsed.origin },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
