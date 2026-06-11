import type { WSContext } from "hono/ws";
import type { DrawingEvent, NamingEvent } from "./dispatcher.js";
import wait from "./utils/wait.js";

export interface ThreadStep {
    type: "word" | "drawing" | "name";
    author: string;
    content: string | DrawingEvent[];
}

export interface ThreadResult {
    threadId: number;
    steps: ThreadStep[];
}

export class Game {
    public gameId: string;
    private threads: Thread[] = [];
    public players: Player[] = [];
    private round: number = 1;
    private config = {
        drawDuration: 60000,
        namingDuration: 20000,
    };
    private resultState: { currentThread: number; currentStep: number } | null = null;
    public currentPhase: "lobby" | "initial" | "drawing" | "naming" | "results" = "lobby";
    private static readonly MAX_DRAWING_EVENTS = 5000;
    private static readonly CANVAS_WIDTH = 800;
    private static readonly CANVAS_HEIGHT = 500;

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
                drawDuration: this.config.drawDuration,
                namingDuration: this.config.namingDuration,
            }));
        }
    }

    public updateSettings(settings: { drawDuration?: number; namingDuration?: number }): void {
        if (settings.drawDuration !== undefined) this.config.drawDuration = settings.drawDuration;
        if (settings.namingDuration !== undefined) this.config.namingDuration = settings.namingDuration;
        this.broadcastToPlayers({
            type: "settingsUpdated",
            drawDuration: this.config.drawDuration,
            namingDuration: this.config.namingDuration,
        });
    }

    async initializeGame() {
        this.currentPhase = "initial";
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
            this.broadcastToPlayers({ type: "startGame" });
            this.startGame();
        }
    }

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

        this.currentPhase = "results";
        this.resultState = { currentThread: 0, currentStep: -1 };
        const threadsData = this.serializeThreads();
        this.broadcastToPlayers({ type: "gameEnd", threads: threadsData });
    }

    async drawPhase() {
        this.currentPhase = "drawing";
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
        if (this.currentPhase !== "drawing") return;

        const playerId = this.players.findIndex(p => p.ws === ws);
        if (playerId === -1) return;

        event.username = this.players[playerId].username;
        if (!isFinite(event.fromX) || !isFinite(event.fromY) ||
            !isFinite(event.toX) || !isFinite(event.toY)) return;
        if (event.fromX < 0 || event.fromX > Game.CANVAS_WIDTH ||
            event.fromY < 0 || event.fromY > Game.CANVAS_HEIGHT ||
            event.toX < 0 || event.toX > Game.CANVAS_WIDTH ||
            event.toY < 0 || event.toY > Game.CANVAS_HEIGHT) return;

        const threadId = (playerId + this.round) % this.players.length;
        const thread = this.threads[threadId];
        const drawing = thread.drawings[thread.drawings.length - 1];

        if (drawing.events.length >= Game.MAX_DRAWING_EVENTS) return;

        drawing.addEvent(event);
    }

    async namePhase() {
        this.currentPhase = "naming";
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
        if (this.currentPhase !== "naming") return;

        const playerId = this.players.findIndex(p => p.ws === ws);
        if (playerId === -1) return;

        const threadId = (playerId - this.round + this.players.length) % this.players.length;
        const drawing = this.threads[threadId].drawings[this.threads[threadId].drawings.length - 1];
        drawing.setName(event.name);
        drawing.setNamedBy(this.players[playerId].username);
    }

    private broadcastToPlayers(payload: any): void {
        for (const player of this.players) {
            player.ws.send(JSON.stringify(payload));
        }
    }

    private serializeThreads(): ThreadResult[] {
        return this.threads.map((thread, threadIndex) => {
            const steps: ThreadStep[] = [
                {
                    type: "word",
                    author: this.players[threadIndex]?.username ?? "unknown",
                    content: thread.word,
                },
            ];

            for (const drawing of thread.drawings) {
                steps.push({
                    type: "drawing",
                    author: drawing.author ?? "unknown",
                    content: drawing.events,
                });
                if (drawing.named !== null) {
                    steps.push({
                        type: "name",
                        author: drawing.namedBy ?? "unknown",
                        content: drawing.named,
                    });
                }
            }

            return { threadId: threadIndex, steps };
        });
    }

    public nextResult(): void {
        if (!this.resultState) return;

        const { currentThread, currentStep } = this.resultState;
        const serialized = this.serializeThreads();

        let nextThread = currentThread;
        let nextStep = currentStep + 1;

        const totalSteps = serialized[nextThread]?.steps.length ?? 0;
        if (nextStep >= totalSteps) {
            nextThread++;
            nextStep = 0;
        }

        if (nextThread >= serialized.length) {
            this.resultState = null;
            this.broadcastToPlayers({ type: "allResultsShown" });
            return;
        }

        this.resultState = { currentThread: nextThread, currentStep: nextStep };
        this.broadcastToPlayers({
            type: "showResult",
            threadIndex: nextThread,
            stepIndex: nextStep,
        });
    }

    public restartGame(): void {
        this.threads = [];
        this.round = 1;
        this.resultState = null;
        this.currentPhase = "lobby";
        this.sendLobbyPlayers();
    }
}

class Drawing {
    public events: DrawingEvent[] = [];
    public named: string | null = null;
    public namedBy: string | null = null;
    public author: string | null = null;
    public createdAtRound: number;

    constructor(createdAtRound: number) {
        this.createdAtRound = createdAtRound;
    }

    public setName(name: string) {
        this.named = name;
    }

    public setNamedBy(namedBy: string) {
        this.namedBy = namedBy;
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