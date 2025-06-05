import { FastifyInstance } from 'fastify';
import * as mediasoup from 'mediasoup';
import { RoomManager } from '../src/Room';
import supertest from 'supertest';
import './setup';

describe('WebRTC API Tests', () => {
  let request: ReturnType<typeof supertest>;

  afterEach(async () => {
    if (global.cleanup) {
      await global.cleanup();
    }
  });

  describe('Room Management', () => {
    test('should create a new room', async () => {
      const roomId = 'test-room-1';
      const room = await global.roomManager.createRoom(roomId);
      expect(room).toBeDefined();
      expect(room.id).toBe(roomId);
    });
  });

  describe('JSON Schema Validation', () => {
    test('should validate complete transport response schema', async () => {
      const room = await global.roomManager.createRoom('schema-test-room');
      const transport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          },
          {
            protocol: 'tcp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
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

      // ICE候補の検証
      expect(Array.isArray(response.iceCandidates)).toBe(true);
      expect(response.iceCandidates.length).toBeGreaterThan(0);
      
      response.iceCandidates.forEach((candidate: any) => {
        expect(typeof candidate.foundation).toBe('string');
        expect(typeof candidate.ip).toBe('string');
        expect(typeof candidate.port).toBe('number');
        expect(['host', 'srflx', 'prflx', 'relay'].includes(candidate.type)).toBe(true);
        expect(['udp', 'tcp'].includes(candidate.protocol)).toBe(true);
        expect(candidate.priority).toBeGreaterThan(0);
        expect(candidate.port).toBeGreaterThan(0);
        expect(candidate.port).toBeLessThan(65536);
      });

      // DTLS パラメータの検証
      expect(response.dtlsParameters).toBeDefined();
      expect(Array.isArray(response.dtlsParameters.fingerprints)).toBe(true);
      expect(response.dtlsParameters.fingerprints.length).toBeGreaterThan(0);
      expect(['auto', 'client', 'server'].includes(response.dtlsParameters.role!)).toBe(true);

      response.dtlsParameters.fingerprints.forEach((fingerprint: any) => {
        expect(typeof fingerprint.algorithm).toBe('string');
        expect(typeof fingerprint.value).toBe('string');
        expect(fingerprint.algorithm.length).toBeGreaterThan(0);
        expect(fingerprint.value.length).toBeGreaterThan(0);
        // SHA-256フィンガープリントの形式を検証
        if (fingerprint.algorithm === 'sha-256') {
          expect(fingerprint.value).toMatch(/^[A-F0-9]{2}(:[A-F0-9]{2}){31}$/);
        }
      });

      // SCTP パラメータの検証（存在する場合）
      if (response.sctpParameters) {
        expect(response.sctpParameters.port).toBeDefined();
        expect(typeof response.sctpParameters.port).toBe('number');
        expect(response.sctpParameters.port).toBeGreaterThan(0);
        expect(response.sctpParameters.port).toBeLessThan(65536);

        expect(response.sctpParameters.OS).toBeDefined();
        expect(typeof response.sctpParameters.OS).toBe('number');
        expect(response.sctpParameters.OS).toBeGreaterThan(0);

        expect(response.sctpParameters.MIS).toBeDefined();
        expect(typeof response.sctpParameters.MIS).toBe('number');
        expect(response.sctpParameters.MIS).toBeGreaterThan(0);

        expect(response.sctpParameters.maxMessageSize).toBeDefined();
        expect(typeof response.sctpParameters.maxMessageSize).toBe('number');
        expect(response.sctpParameters.maxMessageSize).toBeGreaterThan(0);
      }

      transport.close();
    });

    test('should validate transport event handling', async () => {
      const room = await global.roomManager.createRoom('event-test-room');
      const transport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          },
          {
            protocol: 'tcp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true
      });

      expect(transport.dtlsState).toBe('new');
      expect(transport.closed).toBe(false);

      transport.close();
      expect(transport.closed).toBe(true);
    });

    test('should handle transport configuration variations', async () => {
      const room = await global.roomManager.createRoom('config-test-room');
      
      // TCP優先トランスポート
      const tcpTransport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          },
          {
            protocol: 'tcp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferTcp: true
      });

      expect(tcpTransport.id).toBeDefined();
      expect(tcpTransport.iceParameters).toBeDefined();
      expect(tcpTransport.iceCandidates).toBeDefined();
      expect(tcpTransport.dtlsParameters).toBeDefined();

      tcpTransport.close();
    });

    test('should handle multiple transports', async () => {
      const room = await global.roomManager.createRoom('multi-transport-room');
      
      const transport1 = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true
      });

      const transport2 = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true
      });

      expect(transport1.id).not.toBe(transport2.id);
      expect(transport1.iceParameters.usernameFragment).not.toBe(transport2.iceParameters.usernameFragment);

      transport1.close();
      transport2.close();
    });

    test('should validate transport stats', async () => {
      const room = await global.roomManager.createRoom('stats-test-room');
      const transport = await room.router.createWebRtcTransport({
        listenInfos: [
          {
            protocol: 'udp' as const,
            ip: '0.0.0.0',
            announcedAddress: '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true
      });

      const stats = await transport.getStats();
      expect(Array.isArray(stats)).toBe(true);

      transport.close();
    });
  });

  describe('API Endpoints', () => {
    let roomId: string;
    
    beforeEach(async () => {
      roomId = `test-room-api-${Date.now()}`;
      await global.roomManager.createRoom(roomId);
      request = supertest(global.app.server);
    });
    
    test('should create producer transport via API', async () => {
      const transportResponse = await request
        .post(`/rooms/${roomId}/transports`)
        .send({
          type: 'producer',
          forceTcp: false,
          producing: true,
          consuming: false
        })
        .expect(200);
        
      expect(transportResponse.body).toBeDefined();
      expect(transportResponse.body.id).toBeDefined();
      expect(transportResponse.body.iceParameters).toBeDefined();
      expect(transportResponse.body.iceCandidates).toBeDefined();
      expect(transportResponse.body.dtlsParameters).toBeDefined();
    });
    
    test('should create consumer transport via API', async () => {
      const transportResponse = await request
        .post(`/rooms/${roomId}/transports`)
        .send({
          type: 'consumer',
          forceTcp: false,
          producing: false,
          consuming: true
        })
        .expect(200);
      expect(transportResponse.body.dtlsParameters).toBeDefined();
    });
    
    test('should create video producer via API', async () => {
      // まず、プロデューサートランスポートを作成
      const transportResponse = await request
        .post(`/rooms/${roomId}/transports`)
        .send({
          type: 'producer',
          forceTcp: false,
          producing: true,
          consuming: false
        })
        .expect(200);
      
      const transportId = transportResponse.body.id;
      
      // プロデューサーを作成
      const producerResponse = await request
        .post(`/rooms/${roomId}/transports/${transportId}/producers`)
        .send({
          kind: 'video',
          rtpParameters: {
            mid: '0',
            codecs: [
              {
                mimeType: 'video/VP8',
                payloadType: 101,
                clockRate: 90000,
                parameters: {},
                rtcpFeedback: [
                  { type: 'nack' },
                  { type: 'nack', parameter: 'pli' },
                  { type: 'ccm', parameter: 'fir' }
                ]
              }
            ],
            headerExtensions: [
              { uri: 'urn:ietf:params:rtp-hdrext:sdes:mid', id: 1 }
            ],
            encodings: [
              {
                ssrc: 12345678,
                rtx: {
                  ssrc: 12345679
                }
              }
            ],
            rtcp: {
              cname: 'test-cname',
              reducedSize: true
            }
          }
        })
        .expect(200);
      
      expect(producerResponse.body).toBeDefined();
      expect(producerResponse.body.id).toBeDefined();
      expect(producerResponse.body.kind).toBe('video');
    });
  });
});
