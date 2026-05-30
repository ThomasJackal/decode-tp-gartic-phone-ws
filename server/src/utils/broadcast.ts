import { wss } from "../index.js";
import { Player } from "../game.js";

export default function broadcast(payload: any): void {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

export function broadcastTo(player: Player, payload: any): void {
    player.ws.send(JSON.stringify(payload));
}