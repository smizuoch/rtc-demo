import fastify, { FastifyInstance } from 'fastify';
import { RoomManager } from './Room';
import * as mediasoup from 'mediasoup';
import cors from '@fastify/cors';

interface ServerOptions {
  roomManager: RoomManager;
}

export async function createServer(options: ServerOptions): Promise<FastifyInstance> {
  const { roomManager } = options;
  const app = fastify({ 
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info'
    },
    // SupertestとFastifyを互換性を持たせるためのオプション
    forceCloseConnections: true
  });

  // CORSを設定
  await app.register(cors, {
    origin: true, // すべてのオリジンを許可。本番環境では適切に制限すること
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  // ルームの作成・取得
  app.post<{ Params: { roomId: string } }>('/rooms/:roomId', async (request, reply) => {
    const { roomId } = request.params;
    const room = await roomManager.createRoom(roomId);
    
    return {
      roomId: room.id,
      rtpCapabilities: room.router.rtpCapabilities
    };
  });

  // ルームの取得
  app.get<{ Params: { roomId: string } }>('/rooms/:roomId', async (request, reply) => {
    const { roomId } = request.params;
    const room = roomManager.getRoom(roomId);
    
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    return {
      roomId: room.id,
      rtpCapabilities: room.router.rtpCapabilities
    };
  });

  // トランスポート作成
  app.post<{ 
    Params: { roomId: string },
    Body: { type: 'producer' | 'consumer', forceTcp: boolean, producing: boolean, consuming: boolean }
  }>('/rooms/:roomId/transports', async (request, reply) => {
    const { roomId } = request.params;
    const { type, forceTcp, producing, consuming } = request.body;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const transport = await room.createTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: !forceTcp,
      enableTcp: true,
      preferUdp: !forceTcp,
      appData: { type, producing, consuming }
    });
    
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    };
  });

  // プロデューサー作成
  app.post<{ 
    Params: { roomId: string, transportId: string },
    Body: { kind: mediasoup.types.MediaKind, rtpParameters: mediasoup.types.RtpParameters }
  }>('/rooms/:roomId/transports/:transportId/producers', async (request, reply) => {
    const { roomId, transportId } = request.params;
    const { kind, rtpParameters } = request.body;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const transport = room.getTransport(transportId);
    if (!transport) {
      reply.code(404).send({ error: 'Transport not found' });
      return;
    }
    
    const producer = await (transport as mediasoup.types.WebRtcTransport).produce({
      kind,
      rtpParameters
    });
    
    room.addProducer(producer);
    
    return {
      id: producer.id,
      kind: producer.kind
    };
  });

  // トランスポート接続
  app.post<{ 
    Params: { roomId: string, transportId: string },
    Body: { dtlsParameters: mediasoup.types.DtlsParameters }
  }>('/rooms/:roomId/transports/:transportId/connect', async (request, reply) => {
    const { roomId, transportId } = request.params;
    const { dtlsParameters } = request.body;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const transport = room.getTransport(transportId);
    if (!transport) {
      reply.code(404).send({ error: 'Transport not found' });
      return;
    }
    
    await (transport as mediasoup.types.WebRtcTransport).connect({ dtlsParameters });
    
    return { success: true };
  });

  // コンシューマー作成
  app.post<{ 
    Params: { roomId: string, transportId: string },
    Body: { producerId: string, rtpCapabilities: mediasoup.types.RtpCapabilities }
  }>('/rooms/:roomId/transports/:transportId/consumers', async (request, reply) => {
    const { roomId, transportId } = request.params;
    const { producerId, rtpCapabilities } = request.body;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const transport = room.getTransport(transportId);
    if (!transport) {
      reply.code(404).send({ error: 'Transport not found' });
      return;
    }
    
    // プロデューサーが存在するかチェック
    const producer = room.getProducer(producerId);
    if (!producer) {
      reply.code(404).send({ error: 'Producer not found' });
      return;
    }
    
    // コンシューマーを作成
    const consumer = await (transport as mediasoup.types.WebRtcTransport).consume({
      producerId,
      rtpCapabilities,
      paused: true
    });
    
    room.addConsumer(consumer);
    
    return {
      id: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    };
  });

  // コンシューマー再開
  app.post<{ 
    Params: { roomId: string, consumerId: string }
  }>('/rooms/:roomId/consumers/:consumerId/resume', async (request, reply) => {
    const { roomId, consumerId } = request.params;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const consumer = room.getConsumer(consumerId);
    if (!consumer) {
      reply.code(404).send({ error: 'Consumer not found' });
      return;
    }
    
    await consumer.resume();
    
    return { success: true };
  });

  // プロデューサー一覧取得
  app.get<{ Params: { roomId: string } }>('/rooms/:roomId/producers', async (request, reply) => {
    const { roomId } = request.params;
    
    const room = roomManager.getRoom(roomId);
    if (!room) {
      reply.code(404).send({ error: 'Room not found' });
      return;
    }
    
    const producers = Array.from(room.producers.values()).map(producer => ({
      id: producer.id,
      kind: producer.kind,
      paused: producer.paused
    }));
    
    return { producers };
  });

  return app;
}

// テスト環境でサーバーを起動するためのヘルパー関数


// テスト環境でサーバーを起動するためのヘルパー関数
export async function startServer(options: ServerOptions, port = 3000): Promise<FastifyInstance> {
  const server = await createServer(options);
  await server.listen({ port, host: '0.0.0.0' });
  return server;
}
