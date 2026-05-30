import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { Game } from "./game.js";
import dispatch from "./dispatcher.js";
const app = new Hono();
export let game = null;
export function setGame(nextGame) {
    game = nextGame;
}
app.get("/ws", upgradeWebSocket(() => {
    return {
        onOpen(event, ws) {
            console.log("WebSocket connection opened");
            console.log(ws);
            console.log(wss);
        },
        onMessage(event, ws) {
            console.log(`Message from client: ${event.data}`);
            const data = JSON.parse(event.data.toString());
            dispatch(data, ws);
        },
        onClose: () => {
            console.log("Connection closed");
        },
        onError: () => {
            console.log("Connection error");
        },
    };
}));
export const wss = new WebSocketServer({ noServer: true });
serve({
    fetch: app.fetch,
    port: 3000,
    websocket: { server: wss },
}, (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
});
