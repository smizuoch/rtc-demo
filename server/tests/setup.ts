import * as mediasoup from 'mediasoup';
import { RoomManager } from '../src/Room';
import Fastify, { FastifyInstance } from 'fastify';

declare global {
  var app: FastifyInstance;
  var worker: mediasoup.types.Worker;
  var roomManager: RoomManager;
}

beforeAll(async () => {
  // mediasoup Worker初期化
  global.worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 40100
  });
  
  global.roomManager = new RoomManager(global.worker);
  
  // Fastifyアプリケーション初期化
  global.app = Fastify({ logger: false });
  
  // API routes
  global.app.get('/api/rooms', async (request, reply) => {
    const rooms = global.roomManager.getAllRooms().map(room => ({
      id: room.id,
      peersCount: room.peers.size,
      transportsCount: room.transports.size,
      producersCount: room.producers.size,
      consumersCount: room.consumers.size
    }));
    return rooms;
  });

  global.app.post<{ Body: { id: string } }>('/api/rooms', async (request, reply) => {
    const { id } = request.body;
    const room = await global.roomManager.createRoom(id);
    reply.code(201);
    return { id: room.id };
  });

  global.app.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;
    const room = global.roomManager.getRoom(id);
    if (!room) {
      reply.code(404);
      return { error: 'Room not found' };
    }
    return { id: room.id };
  });

  global.app.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = global.roomManager.deleteRoom(id);
    if (!deleted) {
      reply.code(404);
      return { error: 'Room not found' };
    }
    reply.code(204);
    return;
  });

  global.app.get('/api/transport/params', async (request, reply) => {
    // デフォルトルームを作成してトランスポートパラメータを返す
    const room = await global.roomManager.createRoom('default');
    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true
    });

    const params = {
      iceParameters: transport.iceParameters,
      dtlsParameters: transport.dtlsParameters
    };

    transport.close();
    return params;
  });

  global.app.post<{ 
    Body: { 
      roomId: string; 
      kind: string; 
      rtpParameters: any; 
    } 
  }>('/api/transport/produce', async (request, reply) => {
    const { roomId, kind, rtpParameters } = request.body;
    const room = global.roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404);
      return { error: 'Room not found' };
    }

    // モックプロデューサーレスポンス
    return {
      id: `producer-${Date.now()}`,
      kind
    };
  });

  global.app.post<{ 
    Body: { 
      roomId: string; 
      producerId: string; 
      kind: string; 
    } 
  }>('/api/transport/consume', async (request, reply) => {
    const { roomId, producerId, kind } = request.body;
    const room = global.roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404);
      return { error: 'Room not found' };
    }

    // モックコンシューマーレスポンス
    return {
      id: `consumer-${Date.now()}`,
      kind
    };
  });

  await global.app.ready();
});

afterAll(async () => {
  if (global.app) {
    await global.app.close();
  }
  if (global.worker) {
    global.worker.close();
  }
});
