import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'path';

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
  }
});

fastify.get('/', async (request, reply) => {
  return { message: 'WebRTC Demo Server' };
});

fastify.get('/health', () => ({ status: 'ok' }));

const start = async () => {
  try {
    await fastify.listen({ port: 8443, host: '0.0.0.0' });
    console.log('Server is running on https://localhost:8443');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
