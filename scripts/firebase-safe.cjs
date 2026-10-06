// Suppress CLI debug/API bodies, which can include stored authentication data.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const localCli = `${process.cwd()}/.tools/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js`;
const cli = fs.existsSync(localCli) ? localCli : `${process.env.APPDATA}/npm/node_modules/firebase-tools/lib/bin/firebase.js`;
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'], env: { ...process.env, DEBUG: '', FIREBASE_CLI_DISABLE_TELEMETRY: '1' } });
function forward(stream) {
  let pending = '';
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/); pending = lines.pop();
    for (const line of lines) {
      const clean = line.replace(/\u001b\[[0-9;]*m/g, '');
      if (!clean.startsWith('[') && /^(?:[+!i] |===|Running command|> |Error:|Function URL|Project Console|\s*$)/.test(clean)) console.log(clean.replace(/(?:sk|whsec)_[\w]+/g, '[redacted]'));
    }
  });
}
forward(child.stdout); forward(child.stderr);
child.on('error', () => { console.error('Firebase CLI could not start.'); process.exitCode = 1; });
child.on('exit', code => { console.log(`Firebase CLI exited ${code}.`); process.exitCode = code || 0; });
