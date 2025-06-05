import * as mediasoup from 'mediasoup';
import { RoomManager } from '../src/Room';
import { FastifyInstance } from 'fastify';
import { createServer } from '../src/server';

// グローバル変数の型定義
declare global {
  // NodeJSのグローバル名前空間を拡張
  var roomManager: RoomManager;
  var worker: mediasoup.types.Worker;
  var app: FastifyInstance;
  var cleanup: () => Promise<void>;
}

beforeAll(async () => {
  // MediaSoupワーカーを作成
  const worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 40100
  });
  
  // RoomManagerを作成してグローバルに設定
  const roomManager = new RoomManager(worker);
  global.roomManager = roomManager;
  global.worker = worker;
  
  // サーバーアプリケーションを作成
  const app = await createServer({ roomManager });
  global.app = app;
  
  // テスト終了時のクリーンアップ関数
  global.cleanup = async () => {
    // 全ルームの情報をログ出力
    const rooms = global.roomManager.getAllRooms().map(room => ({
      id: room.id,
      transports: room.transports ? room.transports.size : 0,
      producers: room.producers ? room.producers.size : 0,
      consumers: room.consumers ? room.consumers.size : 0
    }));
    
    console.log('Cleaning up rooms:', rooms);
    
    // すべてのルームを削除
    for (const room of global.roomManager.getAllRooms()) {
      global.roomManager.deleteRoom(room.id);
    }
  };

  // ルーム削除エンドポイント
  global.app.delete<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const { id } = request.params;
    
    const deleted = global.roomManager.deleteRoom(id);
    
    if (!deleted) {
      reply.status(404).send({
        error: 'Room not found'
      });
      return;
    }
    
    reply.status(200).send({ success: true });
    return;
  });

  // トランスポートパラメータ取得エンドポイント
  global.app.get('/api/transport/params', async (request, reply) => {
    // デフォルトルームを取得または作成
    const room = await global.roomManager.createRoom('default');
    
    // WebRTCトランスポートを作成
    const transport = await room.router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true
    });
    
    reply.send({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters
    });
  });

  // プロデューサー作成エンドポイント
  global.app.post<{
    Body: {
      transportId: string;
      kind: mediasoup.types.MediaKind;
      rtpParameters: mediasoup.types.RtpParameters;
      roomId: string;
    }
  }>('/api/transport/produce', async (request, reply) => {
    const { transportId, kind, rtpParameters, roomId } = request.body;
    
    const room = global.roomManager.getRoom(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }
    
    const transport = room.transports?.get(transportId);
    if (!transport) {
      return reply.status(404).send({ error: 'Transport not found' });
    }
    
    const producer = await transport.produce({ kind, rtpParameters });
    
    return {
      id: producer.id,
      kind: producer.kind
    };
  });

  // コンシューマー作成エンドポイント
  global.app.post<{
    Body: {
      transportId: string;
      producerId: string;
      rtpCapabilities: mediasoup.types.RtpCapabilities;
      roomId: string;
    }
  }>('/api/transport/consume', async (request, reply) => {
    const { transportId, producerId, rtpCapabilities, roomId } = request.body;
    
    const room = global.roomManager.getRoom(roomId);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }
    
    const transport = room.transports?.get(transportId);
    if (!transport) {
      return reply.status(404).send({ error: 'Transport not found' });
    }
    
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true
    });
    
    return {
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerId: consumer.producerId
    };
  });

  await global.app.ready();
});

afterAll(async () => {
  if (global.cleanup) {
    await global.cleanup();
  }
  
  if (global.app) {
    await global.app.close();
  }
  
  if (global.worker) {
    global.worker.close();
  }
});
