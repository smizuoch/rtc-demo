import { FastifyInstance } from 'fastify';
import { RoomManager } from './Room';
import * as mediasoup from 'mediasoup';

interface ServerOptions {
  roomManager: RoomManager;
}

// WebRTCルートを独立したプラグインとして作成
export async function createWebRTCRoutes(options: ServerOptions) {
  const { roomManager } = options;
  
  return async function routes(fastify: FastifyInstance) {
    // ルームの作成・取得
    fastify.post<{ Params: { roomId: string } }>('/rooms/:roomId', async (request, reply) => {
      const { roomId } = request.params;
      const room = await roomManager.createRoom(roomId);
      
      return {
        roomId: room.id,
        rtpCapabilities: room.router.rtpCapabilities
      };
    });

    // ルームの取得
    fastify.get<{ Params: { roomId: string } }>('/rooms/:roomId', async (request, reply) => {
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

    // トランスポート作成（ピア情報を含める）
    fastify.post<{ 
      Params: { roomId: string },
      Body: { type: 'producer' | 'consumer', forceTcp: boolean, producing: boolean, consuming: boolean, peerId: string }
    }>('/rooms/:roomId/transports', async (request, reply) => {
      const { roomId } = request.params;
      const { type, forceTcp, producing, consuming, peerId } = request.body;
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        reply.code(404).send({ error: 'Room not found' });
        return;
      }
      
      let peer = room.getPeer(peerId);
      if (!peer) {
        peer = room.addPeer(peerId);
      }
      
      const transport = await room.createTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: !forceTcp,
        enableTcp: true,
        preferUdp: !forceTcp,
        appData: { type, producing, consuming, peerId }
      });
      
      peer.transports.set(transport.id, transport);
      
      return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters
      };
    });

    // プロデューサー作成（ピア情報を含める）
    fastify.post<{ 
      Params: { roomId: string, transportId: string },
      Body: { kind: mediasoup.types.MediaKind, rtpParameters: mediasoup.types.RtpParameters, peerId: string }
    }>('/rooms/:roomId/transports/:transportId/producers', async (request, reply) => {
      const { roomId, transportId } = request.params;
      const { kind, rtpParameters, peerId } = request.body;
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        reply.code(404).send({ error: 'Room not found' });
        return;
      }
      
      const peer = room.getPeer(peerId);
      if (!peer) {
        reply.code(404).send({ error: 'Peer not found' });
        return;
      }
      
      const transport = peer.transports.get(transportId);
      if (!transport) {
        reply.code(404).send({ error: 'Transport not found' });
        return;
      }
      
      const producer = await (transport as mediasoup.types.WebRtcTransport).produce({
        kind,
        rtpParameters
      });
      
      room.addProducerForPeer(peerId, producer);
      
      return {
        id: producer.id,
        kind: producer.kind
      };
    });

    // トランスポート接続
    fastify.post<{ 
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

    // コンシューマー作成（ピア情報を含める）
    fastify.post<{ 
      Params: { roomId: string, transportId: string },
      Body: { producerId: string, rtpCapabilities: mediasoup.types.RtpCapabilities, peerId: string }
    }>('/rooms/:roomId/transports/:transportId/consumers', async (request, reply) => {
      const { roomId, transportId } = request.params;
      const { producerId, rtpCapabilities, peerId } = request.body;
      
      const room = roomManager.getRoom(roomId);
      if (!room) {
        reply.code(404).send({ error: 'Room not found' });
        return;
      }
      
      const peer = room.getPeer(peerId);
      if (!peer) {
        reply.code(404).send({ error: 'Peer not found' });
        return;
      }
      
      const transport = peer.transports.get(transportId);
      if (!transport) {
        reply.code(404).send({ error: 'Transport not found' });
        return;
      }
      
      const producer = room.getProducer(producerId);
      if (!producer) {
        reply.code(404).send({ error: 'Producer not found' });
        return;
      }
      
      const consumer = await (transport as mediasoup.types.WebRtcTransport).consume({
        producerId,
        rtpCapabilities,
        paused: true
      });
      
      room.addConsumerForPeer(peerId, consumer);
      
      return {
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters
      };
    });

    // コンシューマー再開
    fastify.post<{ 
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
    fastify.get<{ Params: { roomId: string } }>('/rooms/:roomId/producers', async (request, reply) => {
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
  };
}

// テスト用にlegacy関数を保持
export async function createServer(options: ServerOptions) {
  throw new Error('createServer is deprecated, use createWebRTCRoutes instead');
}

export async function startServer(options: ServerOptions, port = 3000) {
  throw new Error('startServer is deprecated, use index.ts instead');
}
