/**
 * - créer une room:
 *  - ça donne un code
 * - on join une room avec un code et un pseudo
 * - le host démare
 * - on donne un 1er mot
 * loop de jeu:
 *  - on reçois un mot précédent au hasard
 *  - on dessine le mot
 * fin: (quand tout les round on été joué)
 * - on affiche tout les fils
 * - on affiche les dessins 1 à 1, c'est l'host qui envoie l'event next
 * - tout les dessin on été montré, fin de game
 */
import broadcast, { broadcastTo } from "./utils/broadcast.js";
import wait from "./utils/wait.js";
export class Game {
    gameId;
    threads = [];
    players = [];
    round = 0;
    config = {
        drawDuration: 60000,
        namingDuration: 10000,
    };
    constructor(gameId, host) {
        this.gameId = gameId;
        this.players.push(host);
        console.log("Game created with id " + this.gameId);
    }
    join(player) {
        this.players.push(player);
        player.ws.send(JSON.stringify({ type: "players", players: this.players.map(player => player.username) }));
        console.log("Player " + player.username + " joined game with id " + this.gameId);
    }
    // thread creation
    async initializeGame() {
        for (let threadId = 0; threadId < this.players.length; threadId++) {
            this.threads.push(new Thread());
        }
        for (let playerId = 0; playerId < this.players.length; playerId++) {
            this.players[playerId].ws.send(JSON.stringify({ type: "threadReady", threadId: playerId }));
        }
        console.log("Game " + this.gameId + " initialized");
    }
    threadReady(threadId, initialWord) {
        this.threads[threadId].word = initialWord;
        console.log("Thread " + threadId + " of game " + this.gameId + " ready with word " + initialWord);
        if (this.threads.every(thread => thread.word)) {
            broadcast({ type: "startGame" });
            this.startGame();
        }
    }
    // game loop
    async startGame() {
        console.log("Game " + this.gameId + " started");
        for (this.round = 0; this.round < this.players.length;) {
            await this.drawPhase();
            this.round++;
            await this.namePhase();
        }
        console.log("Game " + this.gameId + " ended");
    }
    async namePhase() {
        for (let threadId = 0; threadId < this.threads.length; threadId++) {
            const thread = this.threads[threadId];
            const drawing = thread.drawings[thread.drawings.length - 1];
            broadcastTo(this.players[this.round + threadId % this.players.length], {
                type: "namingPhase",
                duration: this.config.namingDuration,
                drawing: drawing,
            });
        }
        await wait(this.config.namingDuration);
    }
    async drawPhase() {
        for (let threadId = 0; threadId < this.threads.length; threadId++) {
            const thread = this.threads[threadId];
            const drawing = thread.drawings[thread.drawings.length - 1];
            broadcastTo(this.players[this.round + threadId % this.players.length], {
                type: "drawingPhase",
                duration: this.config.drawDuration,
                prompt: thread.getCurrentPrompt(),
            });
        }
        await wait(this.config.drawDuration);
    }
}
class Drawing {
    events = [];
    named = null;
    author = null;
    createdAtRound;
    constructor(createdAtRound) {
        this.createdAtRound = createdAtRound;
    }
    setName(name) {
        this.named = name;
    }
    setAuthor(author) {
        this.author = author;
    }
    addEvent(event) {
        this.events.push(event);
    }
}
class Thread {
    word = "";
    drawings = [];
    constructor() {
    }
    getCurrentPrompt() {
        return this.drawings[this.drawings.length - 1]?.named ?? this.word;
    }
}
export class Player {
    username = "";
    ws;
    constructor(username, ws) {
        this.username = username;
        this.ws = ws;
    }
}
