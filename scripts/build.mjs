import { readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const [html, css, js, worker] = await Promise.all([
  readFile(resolve(root, 'worker/page.html'), 'utf8'),
  readFile(resolve(root, 'worker/style.css'), 'utf8'),
  readFile(resolve(root, 'worker/client.js'), 'utf8'),
  readFile(resolve(root, 'worker/index.js'), 'utf8')
]);
const page = html.replace('/* APP_CSS */', css).replace('/* APP_JS */', js);
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
await writeFile(resolve(dist, 'server/index.js'), worker.replace('__PAGE__', JSON.stringify(page)));
await cp(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
console.log('Built ' + dist);
