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
import broadcast, { broadcastTo } from "./utils/broadcast.js";
import wait from "./utils/wait.js";

export class Game {
    private gameId: string;
    private threads: Thread[] = [];
    public players: Player[] = [];
    private round: number = 0;
    private config = {
        drawDuration: 60000,
        namingDuration: 10000,
    }

    constructor(gameId: string, host: Player) {
        this.gameId = gameId;
        this.players.push(host);

        console.log("Game created with id " + this.gameId);
    }

    public join(player: Player) {
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
        for (this.round = 0; this.round < this.players.length;) {
            await this.drawPhase();
            this.round++;
            await this.namePhase();
        }
        console.log("Game " + this.gameId + " ended");
    }

    async namePhase() {
        for (let threadId = 0; threadId < this.threads.length; threadId++) {
            const drawing = this.threads[threadId].drawings[this.threads[threadId].drawings.length - 1];
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
            const drawing = new Drawing(this.round);
            const player = this.players[this.round + threadId % this.players.length];
            drawing.setAuthor(player.username);

            this.threads[threadId].drawings.push(drawing);
            broadcastTo(player, {
                type: "drawingPhase",
                duration: this.config.drawDuration,
                prompt: this.threads[threadId].getCurrentPrompt(),
            });

        }
        await wait(this.config.drawDuration);
    }

    public registerDrawingEvent(event: DrawingEvent) {
        const thread = this.threads[this.round];
        const drawing = thread.drawings[thread.drawings.length - 1];
        drawing.addEvent(event);
    }

    public registerNamingEvent(event: NamingEvent) {
        const drawing = this.threads[this.round].drawings[this.threads[this.round].drawings.length - 1];
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