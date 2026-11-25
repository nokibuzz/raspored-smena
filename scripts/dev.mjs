import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from '../dist/server/index.js';

const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body });
    const response = await worker.fetch(request, {}, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
  } catch (error) { res.writeHead(500); res.end(String(error)); }
}).listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
