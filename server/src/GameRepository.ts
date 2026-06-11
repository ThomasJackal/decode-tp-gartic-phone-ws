import type { WSContext } from "hono/ws";
import { Game, Player } from "./game.js";

class GameRepository {
    private games: Map<string, Game> = new Map();
    private playerRooms: Map<WSContext<WebSocket>, string> = new Map();

    createRoom(host: Player): string {
        const roomCode = this.generateRoomCode();
        const game = new Game(roomCode, host);
        this.games.set(roomCode, game);
        this.playerRooms.set(host.ws, roomCode);
        console.log(`Room ${roomCode} created by ${host.username}`);
        return roomCode;
    }

    joinRoom(roomCode: string, player: Player): boolean {
        const game = this.games.get(roomCode);
        if (!game) {
            console.log(`Room ${roomCode} not found`);
            return false;
        }
        game.join(player);
        this.playerRooms.set(player.ws, roomCode);
        return true;
    }

    getGameByWs(ws: WSContext<WebSocket>): Game | null {
        const roomCode = this.playerRooms.get(ws);
        if (!roomCode) return null;
        return this.games.get(roomCode) ?? null;
    }

    removePlayer(ws: WSContext<WebSocket>): void {
        const roomCode = this.playerRooms.get(ws);
        if (!roomCode) return;

        const game = this.games.get(roomCode);
        if (game) {
            const player = game.players.find(p => p.ws === ws);
            if (player) {
                game.leave(player);
            }
            if (game.players.length === 0) {
                console.log(`Room ${roomCode} destroyed (no players left)`);
                this.games.delete(roomCode);
            }
        }
        this.playerRooms.delete(ws);
    }

    private generateRoomCode(): string {
        let code: string;
        do {
            code = Math.random().toString(36).substring(2, 8).toUpperCase();
        } while (this.games.has(code));
        return code;
    }
}

export const gameRepository = new GameRepository();
