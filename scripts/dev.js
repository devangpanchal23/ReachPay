import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = new Set();
let stopping = false;

function start(name, args, env = process.env, cwd = projectRoot) {
  const child = spawn(process.execPath, args, { stdio: 'inherit', env, cwd });
  children.add(child);
  child.once('error', (error) => {
    console.error(`[dev] Could not start ${name}: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(`[dev] ${name} stopped${signal ? ` (${signal})` : ` with exit code ${code ?? 'unknown'}`}. Stopping the other development service.`);
      stop(code || 1);
    }
  });
  return child;
}

function reservePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => {
      const selectedPort = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(selectedPort));
    });
  });
}

async function chooseApiPort(preferredPort) {
  try {
    return await reservePort(preferredPort);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const fallback = await reservePort(0);
    console.warn(`[dev] API port ${preferredPort} is occupied; using ${fallback} for this session.`);
    return fallback;
  }
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const forceExit = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 3000);
  forceExit.unref();
  if (!children.size) process.exit(exitCode);
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

const preferredPort = Number(process.env.PORT || 8788);
if (!Number.isInteger(preferredPort) || preferredPort < 0 || preferredPort > 65535) {
  console.error('[dev] PORT must be a valid TCP port number.');
  process.exit(1);
}
const apiPort = await chooseApiPort(preferredPort);
const childEnv = { ...process.env, PORT: String(apiPort), REACHPAY_API_PORT: String(apiPort) };
const localEnvPath = path.resolve(projectRoot, '.env');
const rootEnvPath = path.resolve(projectRoot, '..', '.env');
start(`ReachPay API (${apiPort})`, [`--env-file-if-exists=${rootEnvPath}`, `--env-file-if-exists=${localEnvPath}`, 'server/index.js'], childEnv);
start('Vite frontend', ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], childEnv);
console.log(`[dev] Started the API on ${apiPort} and Vite. Use Ctrl+C to stop both.`);

