import fastify from 'fastify';
import fs from 'fs';
import path from 'path';

const server = fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
  }
});

server.get('/', async (request, reply) => {
  return { message: 'WebRTC Demo Server' };
});

const start = async () => {
  try {
    await server.listen({ port: 8443, host: '0.0.0.0' });
    console.log('Server is running on https://localhost:8443');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
