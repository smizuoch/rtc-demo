import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import fs from 'node:fs';
import path from 'path';

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
  }
});

// 静的ファイル配信
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/'
});

fastify.get('/api', async (request, reply) => {
  return { message: 'WebRTC Demo Server API' };
});

fastify.get('/health', () => ({ status: 'ok' }));

const start = async () => {
  try {
    await fastify.listen({ port: 8443, host: '0.0.0.0' });

    // Socket.IOサーバーをFastifyサーバーにアタッチ
    const io = new IOServer(fastify.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      socket.on('ping', (data) => {
        console.log('Received ping:', data);
        socket.emit('pong', { ...data, server_time: Date.now() });
      });
      
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    console.log('Server is running on https://localhost:8443');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
