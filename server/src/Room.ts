import * as mediasoup from 'mediasoup';

export class Room {
  public id: string;
  public router: mediasoup.types.Router;
  public transports: Map<string, mediasoup.types.Transport>;
  public producers: Map<string, mediasoup.types.Producer>;
  public consumers: Map<string, mediasoup.types.Consumer>;
  public peers: Map<string, any>; // ピア情報を管理

  constructor(id: string, router: mediasoup.types.Router) {
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
