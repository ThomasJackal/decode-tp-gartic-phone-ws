import type { WSContext } from "hono/ws";
import { Player } from "./game.js";
import { gameRepository } from "./GameRepository.js";
import { rateLimiter } from "./rateLimiter.js";
import {
    validate,
    UsernameSchema,
    WordSchema,
    RoomCodeSchema,
    DrawingEventSchema,
    NamingEventSchema,
} from "./validation.js";

export interface DrawingEvent {
    type: "drawing";
    username?: string;
    color: string;
    thickness: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
}

export interface NamingEvent {
    type: "naming";
    username?: string;
    name: string;
}

function sendError(ws: any, message: string): void {
    try {
        ws.send(JSON.stringify({ type: "error", message }));
    } catch {
    }
}

function getWsKey(ws: any): string {
    try {
        return JSON.stringify(ws).slice(0, 20);
    } catch {
        return String(Math.random());
    }
}

function isHost(game: any, ws: any): boolean {
    return game.players[0]?.ws === ws;
}

export default function dispatch(payload: any, ws: any = null) {
    switch (payload.type) {

        case "createRoom": {
            const v = validate(UsernameSchema, payload.username);
            if (!v.ok) { sendError(ws, v.error); return; }

            const player = new Player(v.data, ws as WSContext<WebSocket>);
            const roomCode = gameRepository.createRoom(player);
            ws.send(JSON.stringify({ type: "roomCreated", roomCode }));
            break;
        }
        case "joinRoom": {
            const vu = validate(UsernameSchema, payload.username);
            if (!vu.ok) { sendError(ws, vu.error); return; }

            const vc = validate(RoomCodeSchema, payload.roomCode?.toUpperCase());
            if (!vc.ok) { sendError(ws, vc.error); return; }

            const player = new Player(vu.data, ws as WSContext<WebSocket>);
            const success = gameRepository.joinRoom(vc.data, player);
            if (!success) {
                sendError(ws, "Room not found");
            }
            break;
        }
        case "leave":
            gameRepository.removePlayer(ws);
            break;
        case "drawing": {
            const v = validate(DrawingEventSchema, payload);
            if (!v.ok) { sendError(ws, v.error); return; }

            const game = gameRepository.getGameByWs(ws);
            if (!game) return;

            if (!rateLimiter.checkDrawing(getWsKey(ws))) {
                sendError(ws, "Too many drawing events");
                return;
            }

            game.registerDrawingEvent(v.data, ws as WSContext<WebSocket>);
            break;
        }
        case "naming": {
            const v = validate(NamingEventSchema, payload);
            if (!v.ok) { sendError(ws, v.error); return; }

            const game = gameRepository.getGameByWs(ws);
            if (!game) return;

            if (!rateLimiter.checkNaming(getWsKey(ws))) {
                sendError(ws, "Too many naming events");
                return;
            }

            game.registerNamingEvent(v.data, ws as WSContext<WebSocket>);
            break;
        }
        case "startGame": {
            const game = gameRepository.getGameByWs(ws);
            if (!game) return;
            if (!isHost(game, ws)) { sendError(ws, "Only the host can start the game"); return; }
            game.initializeGame();
            break;
        }
        case "threadReady": {
            const v = validate(WordSchema, payload.initialWord);
            if (!v.ok) { sendError(ws, v.error); return; }

            const game = gameRepository.getGameByWs(ws);
            if (!game) return;
            game.threadReady(payload.threadId, v.data);
            break;
        }
        case "nextResult": {
            const game = gameRepository.getGameByWs(ws);
            if (!game) return;
            if (!isHost(game, ws)) { sendError(ws, "Only the host can advance results"); return; }
            game.nextResult();
            break;
        }
        case "restartGame": {
            const game = gameRepository.getGameByWs(ws);
            if (!game) return;
            if (!isHost(game, ws)) { sendError(ws, "Only the host can restart"); return; }
            game.restartGame();
            break;
        }
    }
}
