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

  return app;
}

// テスト環境でサーバーを起動するためのヘルパー関数


// テスト環境でサーバーを起動するためのヘルパー関数
export async function startServer(options: ServerOptions, port = 3000): Promise<FastifyInstance> {
  const server = await createServer(options);
  await server.listen({ port, host: '0.0.0.0' });
  return server;
}
