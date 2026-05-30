import { Game, Player } from "./game.js";
import { game, setGame } from "./index.js";
export default function dispatch(payload, ws = null) {
    switch (payload.type) {
        case "join": {
            const joinEvent = payload;
            const player = new Player(joinEvent.username, ws);
            if (!game) {
                setGame(new Game("1", player));
            }
            else {
                game.join(player);
            }
            break;
        }
        case "drawing":
            const drawingEvent = payload;
            break;
        case "naming":
            break;
        case "startGame":
            game?.initializeGame();
            break;
        case "threadReady": {
            const threadReadyEvent = payload;
            game?.threadReady(threadReadyEvent.threadId, threadReadyEvent.initialWord);
            break;
        }
    }
}
