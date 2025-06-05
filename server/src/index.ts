import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import fs from 'node:fs';
import path from 'path';
import * as mediasoup from 'mediasoup';

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
  }
});

// mediasoup Worker初期化
let worker: mediasoup.types.Worker;
let router: mediasoup.types.Router;

async function initMediasoup() {
  try {
    worker = await mediasoup.createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 40100
    });
    
    console.log(`mediasoup Worker created with PID: ${worker.pid}`);
    
    router = await worker.createRouter({ 
      mediaCodecs: [
        { kind:'audio', mimeType:'audio/opus', clockRate:48000, channels:2 },
        { kind:'video', mimeType:'video/VP8',  clockRate:90000 }
      ]
    });
    
    console.log('mediasoup Router created');
  } catch (error) {
    console.error('Failed to initialize mediasoup:', error);
    throw error;
  }
}

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
    // mediasoup初期化
    await initMediasoup();
    
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
