import * as mediasoup from 'mediasoup';
import { EventEmitter } from 'events';

export interface Peer {
  id: string;
  socket?: any;
  transports: Map<string, mediasoup.types.Transport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

export class Room extends EventEmitter {
  public id: string;
  public router: mediasoup.types.Router;
  public transports: Map<string, mediasoup.types.Transport>;
  public producers: Map<string, mediasoup.types.Producer>;
  public consumers: Map<string, mediasoup.types.Consumer>;
  public peers: Map<string, Peer>; 

  constructor(id: string, router: mediasoup.types.Router) {
    super();
    this.id = id;
    this.router = router;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
    this.peers = new Map(); // ピアマップを初期化
  }

  /**
   * トランスポートを作成して保存
   */
  async createTransport(options: mediasoup.types.WebRtcTransportOptions): Promise<mediasoup.types.WebRtcTransport> {
    const transport = await this.router.createWebRtcTransport(options);
    this.transports.set(transport.id, transport);
    
    // トランスポートが閉じられたとき、マップから削除
    transport.on('@close', () => {
      this.transports.delete(transport.id);
    });
    
    return transport;
  }

  /**
   * トランスポートを取得
   */
  getTransport(transportId: string): mediasoup.types.Transport | undefined {
    return this.transports.get(transportId);
  }

  /**
   * プロデューサーを保存
   */
  addProducer(producer: mediasoup.types.Producer): void {
    this.producers.set(producer.id, producer);
    
    // プロデューサーが閉じられたとき、マップから削除
    producer.on('@close', () => {
      this.producers.delete(producer.id);
    });
  }

  /**
   * コンシューマーを保存
   */
  addConsumer(consumer: mediasoup.types.Consumer): void {
    this.consumers.set(consumer.id, consumer);
    
    // コンシューマーが閉じられたとき、マップから削除
    consumer.on('@close', () => {
      this.consumers.delete(consumer.id);
    });
  }

  /**
   * プロデューサーを取得
   */
  getProducer(producerId: string): mediasoup.types.Producer | undefined {
    return this.producers.get(producerId);
  }

  /**
   * コンシューマーを取得
   */
  getConsumer(consumerId: string): mediasoup.types.Consumer | undefined {
    return this.consumers.get(consumerId);
  }

  /**
   * ピアを追加
   */
  addPeer(peerId: string, socket?: any): Peer {
    const peer: Peer = {
      id: peerId,
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    };
    
    this.peers.set(peerId, peer);
    this.emit('peerJoined', peerId, peer);
    return peer;
  }

  /**
   * ピアを削除
   */
  removePeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (peer) {
      // ピアの全リソースを削除
      peer.transports.forEach(transport => transport.close());
      peer.producers.forEach(producer => producer.close());
      peer.consumers.forEach(consumer => consumer.close());
      
      this.peers.delete(peerId);
      this.emit('peerLeft', peerId);
      return true;
    }
    return false;
  }

  /**
   * ピアを取得
   */
  getPeer(peerId: string): Peer | undefined {
    return this.peers.get(peerId);
  }

  /**
   * プロデューサーをピアに関連付けて保存
   */
  addProducerForPeer(peerId: string, producer: mediasoup.types.Producer): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.producers.set(producer.id, producer);
    }
    this.addProducer(producer);
    
    // 他のピアに新しいプロデューサーを通知
    this.notifyPeersAboutNewProducer(peerId, producer);
  }

  /**
   * コンシューマーをピアに関連付けて保存
   */
  addConsumerForPeer(peerId: string, consumer: mediasoup.types.Consumer): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.consumers.set(consumer.id, consumer);
    }
    this.addConsumer(consumer);
  }

  /**
   * 新しいプロデューサーを他のピアに通知
   */
  private notifyPeersAboutNewProducer(producerPeerId: string, producer: mediasoup.types.Producer): void {
    this.peers.forEach((peer, peerId) => {
      if (peerId !== producerPeerId && peer.socket) {
        peer.socket.emit('newProducer', {
          producerId: producer.id,
          producerPeerId,
          kind: producer.kind
        });
      }
    });
  }

  /**
   * 全プロデューサー情報を取得（特定のピア以外）
   */
  getProducersForPeer(excludePeerId?: string): Array<{ id: string, peerId: string, kind: mediasoup.types.MediaKind }> {
    const producers: Array<{ id: string, peerId: string, kind: mediasoup.types.MediaKind }> = [];
    
    this.peers.forEach((peer, peerId) => {
      if (peerId !== excludePeerId) {
        peer.producers.forEach((producer) => {
          producers.push({
            id: producer.id,
            peerId,
            kind: producer.kind
          });
        });
      }
    });
    
    return producers;
  }
}

export class RoomManager {
  private worker: mediasoup.types.Worker;
  private rooms: Map<string, Room> = new Map();

  constructor(worker: mediasoup.types.Worker) {
    this.worker = worker;
    this.rooms = new Map();
  }

  async createRoom(roomId: string): Promise<Room> {
    let room = this.rooms.get(roomId);
    
    if (!room) {
      const router = await this.worker.createRouter({
        mediaCodecs: [
          {
            kind: 'audio',
            mimeType: 'audio/opus',
            clockRate: 48000,
            channels: 2
          },
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            parameters: {
              'x-google-start-bitrate': 1000
            }
          }
        ]
      });
      
      room = new Room(roomId, router);
      this.rooms.set(roomId, room);
    }
    
    return room;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    
    if (room) {
      room.router.close();
      this.rooms.delete(roomId);
      return true;
    }
    
    return false;
  }

  /**
   * 管理しているすべてのルームを配列として取得
   * @returns Room配列
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }
}
