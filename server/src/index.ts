import { createWebRTCRoutes } from './server';
import * as mediasoup from 'mediasoup';
import { RoomManager } from './Room';
import fs from 'node:fs';
import path from 'path';
import fastify from 'fastify';
import cors from '@fastify/cors';
import { Server as IOServer } from 'socket.io';

// mediasoup Worker初期化
let worker: mediasoup.types.Worker;
let roomManager: RoomManager;

async function initMediasoup() {
  try {
    worker = await mediasoup.createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 40100
    });
    
    console.log(`mediasoup Worker created with PID: ${worker.pid}`);
    
    roomManager = new RoomManager(worker);
    
    console.log('mediasoup initialized');
  } catch (error) {
    console.error('Failed to initialize mediasoup:', error);
    throw error;
  }
}

const start = async () => {
  try {
    // mediasoup初期化
    await initMediasoup();
    
    // HTTPS設定でFastifyアプリを作成
    const httpsOptions = {
      key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
      cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
    };
    
    // Fastifyアプリケーションを作成
    const app = fastify({
      logger: {
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'info'
      },
      https: httpsOptions
    });

    // CORSを設定
    await app.register(cors, {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    });

    // Socket.IOサーバーをアタッチ
    const io = new IOServer(app.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // WebSocketシグナリング
    io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      let currentRoom: string | null = null;
      let currentPeerId: string | null = null;

      socket.on('joinRoom', async ({ roomId, peerId }) => {
        try {
          currentRoom = roomId;
          currentPeerId = peerId;
          
          const room = await roomManager.createRoom(roomId);
          const peer = room.addPeer(peerId, socket);
          
          socket.join(roomId);
          
          const existingProducers = room.getProducersForPeer(peerId);
          socket.emit('existingProducers', existingProducers);
          
          console.log(`Peer ${peerId} joined room ${roomId}`);
        } catch (error) {
          socket.emit('error', { message: 'Failed to join room' });
        }
      });

      socket.on('leaveRoom', () => {
        if (currentRoom && currentPeerId) {
          const room = roomManager.getRoom(currentRoom);
          if (room) {
            room.removePeer(currentPeerId);
          }
          socket.leave(currentRoom);
          currentRoom = null;
          currentPeerId = null;
        }
      });

      socket.on('disconnect', () => {
        if (currentRoom && currentPeerId) {
          const room = roomManager.getRoom(currentRoom);
          if (room) {
            room.removePeer(currentPeerId);
          }
        }
        console.log(`Client disconnected: ${socket.id}`);
      });
    });

    // WebRTCルートを登録
    const webrtcRoutes = await createWebRTCRoutes({ roomManager });
    await app.register(webrtcRoutes);
    
    // 静的ファイル配信
    await app.register(require('@fastify/static'), {
      root: path.join(__dirname, '../public'),
      prefix: '/'
    });

    app.get('/api', async (request, reply) => {
      return { message: 'WebRTC Demo Server API' };
    });

    app.get('/health', () => ({ status: 'ok' }));

    // favicon.ico ルート追加
    app.get('/favicon.ico', async (request, reply) => {
      try {
        const faviconPath = path.join(__dirname, '../public/favicon.ico');
        if (fs.existsSync(faviconPath)) {
          reply.type('image/x-icon');
          return fs.createReadStream(faviconPath);
        } else {
          reply.code(204).send(); // No Content
        }
      } catch (error) {
        reply.code(204).send();
      }
    });

    app.get('/webrtc', async (request, reply) => {
      try {
        const htmlContent = fs.readFileSync(path.join(__dirname, '../public/webrtc-client.html'), 'utf-8');
        reply.type('text/html').send(htmlContent);
      } catch (error) {
        reply.code(404).send({ error: 'File not found' });
      }
    });

    // ルーム一覧取得API
    app.get('/rooms', async (request, reply) => {
      const rooms = roomManager.getAllRooms().map(room => ({
        id: room.id,
        peersCount: room.peers.size,
        transportsCount: room.transports.size,
        producersCount: room.producers.size,
        consumersCount: room.consumers.size
      }));
      
      return { rooms };
    });

    // サーバー起動
    await app.listen({ 
      port: 8443, 
      host: '0.0.0.0'
    });

    console.log('Server is running on https://localhost:8443');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// テスト用にexport
export { roomManager };

start();
