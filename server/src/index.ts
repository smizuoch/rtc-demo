import Fastify from 'fastify';
import { Server as IOServer } from 'socket.io';
import fs from 'node:fs';
import path from 'path';
import * as mediasoup from 'mediasoup';
import { RoomManager } from './Room';

const fastify = Fastify({
  logger: true,
  https: {
    key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem'))
  }
});

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
    
    console.log('mediasoup Router created');
  } catch (error) {
    console.error('Failed to initialize mediasoup:', error);
    throw error;
  }
}

const start = async () => {
  try {
    // 静的ファイル配信を登録
    await fastify.register(require('@fastify/static'), {
      root: path.join(__dirname, '../public'),
      prefix: '/'
    });

    fastify.get('/api', async (request, reply) => {
      return { message: 'WebRTC Demo Server API' };
    });

    fastify.get('/health', () => ({ status: 'ok' }));

    fastify.get('/webrtc', async (request, reply) => {
      try {
        const htmlContent = fs.readFileSync(path.join(__dirname, '../public/webrtc-client.html'), 'utf-8');
        reply.type('text/html').send(htmlContent);
      } catch (error) {
        reply.code(404).send({ error: 'File not found' });
      }
    });

    // ルーム作成API
    fastify.post<{ Params: { id: string } }>('/rooms/:id', async (request, reply) => {
      try {
        const roomId = request.params.id;
        const room = await roomManager.createRoom(roomId);
        
        return {
          roomId: room.id,
          rtpCapabilities: room.router.rtpCapabilities
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to create room' });
      }
    });

    // WebRTCトランスポート作成API
    fastify.post<{ 
      Params: { id: string };
      Body: { forceTcp?: boolean; producing?: boolean; consuming?: boolean } 
    }>('/rooms/:id/transports', async (request, reply) => {
      try {
        const roomId = request.params.id;
        const { forceTcp = false, producing = false, consuming = false } = request.body || {};
        
        const room = roomManager.getRoom(roomId);
        if (!room) {
          return reply.code(404).send({ error: 'Room not found' });
        }

        const transport = await room.router.createWebRtcTransport({
          listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
          enableUdp: !forceTcp,
          enableTcp: true,
          preferUdp: !forceTcp
        });

        room.transports.set(transport.id, transport);

        return {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
          sctpParameters: transport.sctpParameters
        };
      } catch (error) {
        fastify.log.error(error);
        reply.code(500).send({ error: 'Failed to create transport' });
      }
    });

    // ルーム一覧取得API
    fastify.get('/rooms', async (request, reply) => {
      const rooms = roomManager.getAllRooms().map(room => ({
        id: room.id,
        peersCount: room.peers.size,
        transportsCount: room.transports.size,
        producersCount: room.producers.size,
        consumersCount: room.consumers.size
      }));
      
      return { rooms };
    });
    
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

// テスト用にexport
export { fastify, roomManager };

start();
