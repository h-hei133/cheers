// Accept the request, send nothing: the turn stays in flight.
import http from 'node:http';
let requests = 0;
const server = http.createServer((request, response) => {
  requests += 1;
  process.stderr.write('request ' + requests + ' ' + request.method + ' ' + request.url + '\n');
  // Answer the readiness probe so the CLI can start a real turn, but hold the
  // chat completion open so that turn stays in flight.
  if (!request.url.includes('chat/completions')) {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'slow-model', object: 'model' }] }));
    });
    return;
  }
  request.resume();
  request.on('end', () => { /* deliberately never respond */ });
});
server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ port: server.address().port }) + '\n');
});
process.on('SIGTERM', () => { server.close(); process.exit(0); });
