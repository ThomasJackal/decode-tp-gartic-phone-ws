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

import type { WSContext } from "hono/ws";
import type { DrawingEvent, NamingEvent } from "./dispatcher.js";
import broadcast from "./utils/broadcast.js";
import wait from "./utils/wait.js";

export class Game {
    public gameId: string;
    private threads: Thread[] = [];
    public players: Player[] = [];
    private round: number = 1;
    private config = {
        drawDuration: 60000,
        namingDuration: 20000,
    }

    constructor(gameId: string, host: Player) {
        this.gameId = gameId;
        console.log("Game " + this.gameId + " created");

        this.join(host);
    }

    public join(player: Player) {
        this.players.push(player);

        console.log("Player " + player.username + " joined game " + this.gameId);
        this.sendLobbyPlayers();
    }

    public leave(player: Player) {
        this.players = this.players.filter(p => p !== player);
        console.log("Player " + player.username + " left game " + this.gameId);
        this.sendLobbyPlayers();
    }

    private sendLobbyPlayers() {
        for (const player of this.players) {
            player.ws.send(JSON.stringify({
                type: "players",
                players: this.players.map(p => p.username),
                isHost: player === this.players[0],
            }));
        }
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

    public threadReady(threadId: number, initialWord: string) {
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
        this.round = 1;
        while (this.round < this.players.length) {
            if (this.round % 2 === 1) {
                await this.drawPhase();
            } else {
                await this.namePhase();
            }
            this.round++;
        }
        console.log("Game " + this.gameId + " ended");
        // TODO: show all drawings, controlled by host
    }

    async drawPhase() {
        for (let playerId = 0; playerId < this.players.length; playerId++) {
            const threadId = (playerId + this.round) % this.players.length;
            const player = this.players[playerId];
            const drawing = new Drawing(this.round);
            drawing.setAuthor(player.username);

            const prompt = this.threads[threadId].getCurrentPrompt();
            this.threads[threadId].drawings.push(drawing);
            player.ws.send(JSON.stringify({
                type: "drawingPhase",
                duration: this.config.drawDuration,
                prompt,
                round: this.round,
            }));
        }
        await wait(this.config.drawDuration);
    }

    public registerDrawingEvent(event: DrawingEvent, ws: WSContext<WebSocket>) {
        const playerId = this.players.findIndex(p => p.ws === ws);
        if (playerId === -1) return;

        const threadId = (playerId + this.round) % this.players.length;
        const thread = this.threads[threadId];
        const drawing = thread.drawings[thread.drawings.length - 1];
        drawing.addEvent(event);
    }

    async namePhase() {
        for (let playerId = 0; playerId < this.players.length; playerId++) {
            const threadId = (playerId - this.round + this.players.length) % this.players.length;
            const player = this.players[playerId];
            const drawing = this.threads[threadId].drawings[this.threads[threadId].drawings.length - 1];

            player.ws.send(JSON.stringify({
                type: "namingPhase",
                duration: this.config.namingDuration,
                drawing,
            }));
        }
        await wait(this.config.namingDuration);
    }

    public registerNamingEvent(event: NamingEvent, ws: WSContext<WebSocket>) {
        const playerId = this.players.findIndex(p => p.ws === ws);
        if (playerId === -1) return;

        const threadId = (playerId - this.round + this.players.length) % this.players.length;
        const drawing = this.threads[threadId].drawings[this.threads[threadId].drawings.length - 1];
        drawing.setName(event.name);
    }
}

class Drawing {
    public events: DrawingEvent[] = [];
    public named: string | null = null;
    public author: string | null = null;
    public createdAtRound: number;

    constructor(createdAtRound: number) {
        this.createdAtRound = createdAtRound;
    }

    public setName(name: string) {
        this.named = name;
    }

    public setAuthor(author: string) {
        this.author = author;
    }

    public addEvent(event: DrawingEvent) {
        this.events.push(event);
    }
}

class Thread {
    public word: string = "";
    public drawings: Drawing[] = [];

    constructor() {
    }

    public getCurrentPrompt(): string {
        return this.drawings[this.drawings.length - 1]?.named ?? this.word;
    }
}

export class Player {
    public username: string = "";
    public ws: WSContext<WebSocket>;

    constructor(username: string, ws: WSContext<WebSocket>) {
        this.username = username;
        this.ws = ws;
    }
}