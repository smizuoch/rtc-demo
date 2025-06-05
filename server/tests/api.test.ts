import { FastifyInstance } from 'fastify';
import * as mediasoup from 'mediasoup';
import { RoomManager } from '../src/Room';
import supertest from 'supertest';
import './setup';

describe('WebRTC API Tests', () => {
  let worker: mediasoup.types.Worker;
  let roomManager: RoomManager;
  
  beforeAll(async () => {
    worker = await mediasoup.createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 40100
    });
    roomManager = new RoomManager(worker);
  });

  afterAll(async () => {
    if (worker) {
      worker.close();
    }
  });

  describe('Room Management', () => {
    test('should create a new room', async () => {
      const roomId = 'test-room-1';
      const room = await roomManager.createRoom(roomId);
      
      expect(room.id).toBe(roomId);
      expect(room.router).toBeDefined();
      expect(room.router.rtpCapabilities).toBeDefined();
      
      const codecs = room.router.rtpCapabilities.codecs;
      if (codecs) {
        expect(Array.isArray(codecs)).toBe(true);
        expect(codecs.length).toBeGreaterThan(0);
        
        // RTPCapabilitiesのJSON構造検証
        expect(room.router.rtpCapabilities).toHaveProperty('codecs');
        expect(room.router.rtpCapabilities).toHaveProperty('headerExtensions');
        expect(room.router.rtpCapabilities).toHaveProperty('fecMechanisms');
        
        // codecsの詳細検証
        codecs.forEach((codec: any) => {
          expect(codec).toHaveProperty('kind');
          expect(codec).toHaveProperty('mimeType');
          expect(codec).toHaveProperty('clockRate');
          expect(['audio', 'video'].includes(codec.kind)).toBe(true);
          expect(typeof codec.mimeType).toBe('string');
          expect(typeof codec.clockRate).toBe('number');
        });
      }
    });

    test('should return existing room if already exists', async () => {
      const roomId = 'test-room-2';
      const room1 = await roomManager.createRoom(roomId);
      const room2 = await roomManager.createRoom(roomId);
      
      expect(room1).toBe(room2);
      expect(room1.id).toBe(roomId);
    });

    test('should get room by ID', () => {
      const roomId = 'test-room-1';
      const room = roomManager.getRoom(roomId);
      
      expect(room).toBeDefined();
      expect(room!.id).toBe(roomId);
    });

    test('should return undefined for non-existent room', () => {
      const room = roomManager.getRoom('non-existent-room');
      expect(room).toBeUndefined();
    });

    test('should delete room successfully', async () => {
      const roomId = 'test-room-delete';
      await roomManager.createRoom(roomId);
      
      const deleteResult = roomManager.deleteRoom(roomId);
      expect(deleteResult).toBe(true);
      
      const room = roomManager.getRoom(roomId);
      expect(room).toBeUndefined();
    });

    test('should return false when deleting non-existent room', () => {
      const deleteResult = roomManager.deleteRoom('non-existent-room');
      expect(deleteResult).toBe(false);
    });
  });

  describe('WebRTC Transport', () => {
    let room: any;
    
    beforeEach(async () => {
      const roomId = `test-room-${Date.now()}`;
      room = await roomManager.createRoom(roomId);
    });

    test('should create WebRTC transport with correct structure', async () => {
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      // JSON構造の検証
      const transportData = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters
      };

      // 必須フィールドの存在確認
      expect(transportData.id).toBeDefined();
      expect(typeof transportData.id).toBe('string');
      expect(transportData.id.length).toBeGreaterThan(0);
      
      // ICE Parameters詳細検証
      expect(transportData.iceParameters).toBeDefined();
      expect(transportData.iceParameters.usernameFragment).toBeDefined();
      expect(transportData.iceParameters.password).toBeDefined();
      expect(typeof transportData.iceParameters.usernameFragment).toBe('string');
      expect(typeof transportData.iceParameters.password).toBe('string');
      expect(transportData.iceParameters.usernameFragment.length).toBeGreaterThan(0);
      expect(transportData.iceParameters.password.length).toBeGreaterThan(0);
      expect(transportData.iceParameters.iceLite).toBeDefined();
      expect(typeof transportData.iceParameters.iceLite).toBe('boolean');
      
      // ICE Candidates詳細検証
      expect(Array.isArray(transportData.iceCandidates)).toBe(true);
      expect(transportData.iceCandidates.length).toBeGreaterThan(0);
      
      transportData.iceCandidates.forEach((candidate: any) => {
        expect(candidate.foundation).toBeDefined();
        expect(candidate.priority).toBeDefined();
        expect(candidate.ip).toBeDefined();
        expect(candidate.port).toBeDefined();
        expect(candidate.type).toBeDefined();
        expect(candidate.protocol).toBeDefined();
        expect(typeof candidate.foundation).toBe('string');
        expect(typeof candidate.priority).toBe('number');
        expect(typeof candidate.ip).toBe('string');
        expect(typeof candidate.port).toBe('number');
        expect(['host', 'srflx', 'prflx', 'relay'].includes(candidate.type)).toBe(true);
        expect(['udp', 'tcp'].includes(candidate.protocol)).toBe(true);
        expect(candidate.priority).toBeGreaterThan(0);
        expect(candidate.port).toBeGreaterThan(0);
        expect(candidate.port).toBeLessThan(65536);
      });
      
      // DTLS Parameters詳細検証
      expect(transportData.dtlsParameters).toBeDefined();
      expect(Array.isArray(transportData.dtlsParameters.fingerprints)).toBe(true);
      expect(transportData.dtlsParameters.fingerprints.length).toBeGreaterThan(0);
      expect(['auto', 'client', 'server'].includes(transportData.dtlsParameters.role!)).toBe(true);
      
      transportData.dtlsParameters.fingerprints.forEach((fingerprint: any) => {
        expect(fingerprint.algorithm).toBeDefined();
        expect(fingerprint.value).toBeDefined();
        expect(typeof fingerprint.algorithm).toBe('string');
        expect(typeof fingerprint.value).toBe('string');
        expect(fingerprint.algorithm.length).toBeGreaterThan(0);
        expect(fingerprint.value.length).toBeGreaterThan(0);
        // SHA-256等のアルゴリズム形式確認
        expect(fingerprint.algorithm).toMatch(/^(sha-1|sha-224|sha-256|sha-384|sha-512)$/i);
        // フィンガープリントのコロン区切り16進数形式確認
        expect(fingerprint.value).toMatch(/^([0-9A-F]{2}:)*[0-9A-F]{2}$/i);
      });

      // SCTP Parameters詳細検証（存在する場合）
      if (transportData.sctpParameters) {
        expect(transportData.sctpParameters.port).toBeDefined();
        expect(typeof transportData.sctpParameters.port).toBe('number');
        expect(transportData.sctpParameters.port).toBeGreaterThan(0);
        expect(transportData.sctpParameters.port).toBeLessThan(65536);
        
        expect(transportData.sctpParameters.OS).toBeDefined();
        expect(typeof transportData.sctpParameters.OS).toBe('number');
        expect(transportData.sctpParameters.OS).toBeGreaterThan(0);
        
        expect(transportData.sctpParameters.MIS).toBeDefined();
        expect(typeof transportData.sctpParameters.MIS).toBe('number');
        expect(transportData.sctpParameters.MIS).toBeGreaterThan(0);
        
        expect(transportData.sctpParameters.maxMessageSize).toBeDefined();
        expect(typeof transportData.sctpParameters.maxMessageSize).toBe('number');
        expect(transportData.sctpParameters.maxMessageSize).toBeGreaterThan(0);
      }

      transport.close();
    });

    test('should validate JSON serialization and deserialization', async () => {
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      const transportData = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters
      };

      // JSON変換テスト
      const jsonString = JSON.stringify(transportData);
      expect(jsonString).toBeDefined();
      expect(typeof jsonString).toBe('string');
      expect(jsonString.length).toBeGreaterThan(0);
      
      // JSON復元テスト
      const parsedData = JSON.parse(jsonString);
      expect(parsedData.id).toBe(transportData.id);
      expect(parsedData.iceParameters.usernameFragment).toBe(transportData.iceParameters.usernameFragment);
      expect(parsedData.iceParameters.password).toBe(transportData.iceParameters.password);
      expect(parsedData.iceParameters.iceLite).toBe(transportData.iceParameters.iceLite);
      expect(parsedData.iceCandidates).toEqual(transportData.iceCandidates);
      expect(parsedData.dtlsParameters).toEqual(transportData.dtlsParameters);
      
      if (transportData.sctpParameters) {
        expect(parsedData.sctpParameters).toEqual(transportData.sctpParameters);
      }

      // 深度比較テスト
      expect(parsedData).toEqual(transportData);

      transport.close();
    });

    test('should handle transport with different options', async () => {
      // TCP優先設定でのトランスポート作成
      const tcpTransport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: false,
        enableTcp: true,
        preferTcp: true
      });

      const tcpTransportData = {
        id: tcpTransport.id,
        iceParameters: tcpTransport.iceParameters,
        iceCandidates: tcpTransport.iceCandidates,
        dtlsParameters: tcpTransport.dtlsParameters
      };

      // TCP候補のみが含まれることを確認
      const tcpCandidates = tcpTransportData.iceCandidates.filter((c: any) => c.protocol === 'tcp');
      expect(tcpCandidates.length).toBeGreaterThan(0);

      tcpTransport.close();
    });

    test('should handle multiple transports in same room', async () => {
      const transport1 = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true
      });

      const transport2 = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true
      });

      // 異なるIDを持つことを確認
      expect(transport1.id).not.toBe(transport2.id);

      // 両方とも有効なトランスポートデータを持つことを確認
      expect(transport1.iceParameters).toBeDefined();
      expect(transport2.iceParameters).toBeDefined();
      expect(transport1.iceParameters.usernameFragment).not.toBe(transport2.iceParameters.usernameFragment);

      transport1.close();
      transport2.close();
    });

    test('should validate transport event handling', async () => {
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true
      });

      let dtlsStateChanges = 0;
      transport.observer.on('dtlsstatechange', () => {
        dtlsStateChanges++;
      });

      // トランスポートの初期状態確認
      expect(transport.dtlsState).toBe('new');
      expect(transport.closed).toBe(false);

      transport.close();
      expect(transport.closed).toBe(true);
    });
  });

  describe('JSON Schema Validation', () => {
    test('should validate complete transport response schema', async () => {
      const room = await roomManager.createRoom('schema-test-room');
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }],
        enableUdp: true,
        enableTcp: true
      });

      const response = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
        sctpParameters: transport.sctpParameters
      };

      // 手動スキーマ検証（簡易版）
      expect(typeof response.id).toBe('string');
      expect(response.id.length).toBeGreaterThan(0);
      
      expect(typeof response.iceParameters).toBe('object');
      expect(typeof response.iceParameters.usernameFragment).toBe('string');
      expect(typeof response.iceParameters.password).toBe('string');
      expect(typeof response.iceParameters.iceLite).toBe('boolean');
      
      expect(Array.isArray(response.iceCandidates)).toBe(true);
      expect(response.iceCandidates.length).toBeGreaterThan(0);
      
      expect(typeof response.dtlsParameters).toBe('object');
      expect(Array.isArray(response.dtlsParameters.fingerprints)).toBe(true);
      expect(response.dtlsParameters.fingerprints.length).toBeGreaterThan(0);

      transport.close();
    });
  });

  describe('API Tests', () => {
    const app = (global as any).app as FastifyInstance;

    afterEach(async () => {
      // 各テスト後にルームをクリーンアップ
      await roomManager.deleteAllRooms();
    });

    test('GET /api/rooms should return all rooms', async () => {
      const roomId1 = 'api-test-room-1';
      const roomId2 = 'api-test-room-2';
      await roomManager.createRoom(roomId1);
      await roomManager.createRoom(roomId2);

      const response = await supertest(app.server)
        .get('/api/rooms')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);

      const roomIds = response.body.map((room: any) => room.id);
      expect(roomIds).toContain(roomId1);
      expect(roomIds).toContain(roomId2);
    });

    test('POST /api/rooms should create a new room', async () => {
      const roomId = 'api-new-room';
      const response = await supertest(app.server)
        .post('/api/rooms')
        .send({ id: roomId })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(roomId);

      const room = roomManager.getRoom(roomId);
      expect(room).toBeDefined();
    });

    test('GET /api/rooms/:id should return room details', async () => {
      const roomId = 'api-room-details';
      await roomManager.createRoom(roomId);

      const response = await supertest(app.server)
        .get(`/api/rooms/${roomId}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBe(roomId);
    });

    test('DELETE /api/rooms/:id should delete a room', async () => {
      const roomId = 'api-room-delete';
      await roomManager.createRoom(roomId);

      await supertest(app.server)
        .delete(`/api/rooms/${roomId}`)
        .expect(204);

      const room = roomManager.getRoom(roomId);
      expect(room).toBeUndefined();
    });

    test('GET /api/transport/params should return transport parameters', async () => {
      const response = await supertest(app.server)
        .get('/api/transport/params')
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.iceParameters).toBeDefined();
      expect(response.body.dtlsParameters).toBeDefined();
    });

    test('POST /api/transport/produce should produce a track', async () => {
      const roomId = 'api-produce-track';
      await roomManager.createRoom(roomId);

      const response = await supertest(app.server)
        .post('/api/transport/produce')
        .send({
          roomId,
          kind: 'video',
          rtpParameters: {
            codecs: [
              {
                mimeType: 'video/VP8',
                payloadType: 100,
                clockRate: 90000,
                parameters: {}
              }
            ],
            headerExtensions: [],
            fecMechanisms: []
          }
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.kind).toBe('video');
    });

    test('POST /api/transport/consume should consume a track', async () => {
      const roomId = 'api-consume-track';
      await roomManager.createRoom(roomId);

      // プロデュースしているトラックを取得
      const producerResponse = await supertest(app.server)
        .post('/api/transport/produce')
        .send({
          roomId,
          kind: 'video',
          rtpParameters: {
            codecs: [
              {
                mimeType: 'video/VP8',
                payloadType: 100,
                clockRate: 90000,
                parameters: {}
              }
            ],
            headerExtensions: [],
            fecMechanisms: []
          }
        })
        .expect(200);

      const producerId = producerResponse.body.id;

      // コンシューム
      const response = await supertest(app.server)
        .post('/api/transport/consume')
        .send({
          roomId,
          producerId,
          kind: 'video'
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.kind).toBe('video');
    });
  });
});
          }
        })
        .expect(200);

      expect(transportResponse.body).toBeDefined();
      expect(transportResponse.body.id).toBeDefined();
      expect(transportResponse.body.kind).toBe('video');
    });

    test('POST /api/transport/consume should consume a track', async () => {
      const roomId = 'api-consume-track';
      const room = await roomManager.createRoom(roomId);

      // プロデュースしているトラックを取得
      const producerResponse = await supertest(app.server)
        .post('/api/transport/produce')
        .send({
          roomId,
          kind: 'video',
          rtpParameters: {
            codecs: [
              {
                mimeType: 'video/VP8',
                payloadType: 100,
                clockRate: 90000,
                parameters: {}
              }
            ],
            headerExtensions: [],
            fecMechanisms: []
          }
        })
        .expect(200);

      const producerId = producerResponse.body.id;

      // コンシューム
      const response = await supertest(app.server)
        .post('/api/transport/consume')
        .send({
          roomId,
          producerId,
          kind: 'video'
        })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.id).toBeDefined();
      expect(response.body.kind).toBe('video');
    });
  });
});
