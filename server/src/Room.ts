import * as mediasoup from 'mediasoup';

export interface RoomData {
  id: string;
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  consumers: Map<string, mediasoup.types.Consumer>;
  producers: Map<string, mediasoup.types.Producer>;
  peers: Set<string>;
}

export class RoomManager {
  private rooms = new Map<string, RoomData>();
  private worker: mediasoup.types.Worker;

  constructor(worker: mediasoup.types.Worker) {
    this.worker = worker;
  }

  async createRoom(roomId: string): Promise<RoomData> {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    const router = await this.worker.createRouter({
      mediaCodecs: [
        { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
        { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 }
      ]
    });

    const roomData: RoomData = {
      id: roomId,
      router,
      transports: new Map(),
      consumers: new Map(),
      producers: new Map(),
      peers: new Set()
    };

    this.rooms.set(roomId, roomData);
    return roomData;
  }

  getRoom(roomId: string): RoomData | undefined {
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

  getAllRooms(): RoomData[] {
    return Array.from(this.rooms.values());
  }

  async deleteAllRooms(): Promise<void> {
    for (const [roomId, room] of this.rooms) {
      room.router.close();
    }
    this.rooms.clear();
  }
}
