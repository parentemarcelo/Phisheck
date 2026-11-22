// Serves the E2E fixture pages on http://localhost:8080 for manual checks.
//   /signin/                  phishing-like page (release model: P ≈ 0.9995 at this URL)
//   /blog/spring-planting/    benign page        (P ≈ 0.15)
// Usage: node extension/scripts/serve-fixtures.mjs [port]
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const fixture = (name) =>
  readFileSync(fileURLToPath(new URL(`../e2e/fixtures/${name}`, import.meta.url)));
const pages = {
  '/signin/': fixture('phishing.html'),
  '/blog/spring-planting/': fixture('benign.html'),
};
const port = Number(process.argv[2] ?? 8080);

createServer((req, res) => {
  const body = pages[new URL(req.url ?? '/', 'http://localhost').pathname];
  if (body === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
}).listen(port, '127.0.0.1', () => {
  console.log(`phishing-like: http://localhost:${port}/signin/`);
  console.log(`benign:        http://localhost:${port}/blog/spring-planting/`);
});
