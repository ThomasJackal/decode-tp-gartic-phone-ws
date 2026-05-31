import type { WSContext } from "hono/ws";
import { Game, Player } from "./game.js";
import { game, setGame } from "./index.js";

interface GameEvent {
    type: string;
}

interface JoinEvent extends GameEvent {
    type: "join";
    username: string;
}

// Player events
export interface DrawingEvent extends GameEvent {
    type: "drawing";
    username: string;
    color: string;
    thickness: number;
    fromX: number;
    fromY: number;
}

export interface NamingEvent extends GameEvent {
    type: "naming";
    username: string;
    name: string;
}

// Host events
interface NewGameEvent extends GameEvent {
    type: "newGame";
    hostUsername: string;
}

interface StartGameEvent extends GameEvent {
    type: "startGame";
}

interface ThreadReadyEvent extends GameEvent {
    type: "threadReady";
    threadId: number;
    initialWord: string;
}

export default function dispatch(payload: any, ws: any = null) {
    switch (payload.type) {

        case "join": {
            const joinEvent = payload as JoinEvent;
            const player = new Player(joinEvent.username, ws as WSContext<WebSocket>);
            if (!game) {
                setGame(new Game("1", player));
            } else {
                game.join(player);
            }
            break;
        }
        case "leave": {
            const player = game?.players.find(p => p.ws === ws);
            if (player) {
                game?.leave(player);
            }
            if (game?.players.length === 0) {
                console.log("Game " + game?.gameId + " destroyed");
                setGame(null);
            }
            break;
        }
        case "drawing":
            const drawingEvent = payload as DrawingEvent;
            game?.registerDrawingEvent(drawingEvent, ws as WSContext<WebSocket>);
            break;
        case "naming":
            const namingEvent = payload as NamingEvent;
            game?.registerNamingEvent(namingEvent, ws as WSContext<WebSocket>);
            break;
        case "startGame":
            game?.initializeGame();
            break;
        case "threadReady": {
            const threadReadyEvent = payload as ThreadReadyEvent;
            game?.threadReady(threadReadyEvent.threadId, threadReadyEvent.initialWord);
            break;
        }
    }
}
