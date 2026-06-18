import { serve, upgradeWebSocket } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer } from "ws";
import dispatch from "./dispatcher.js";

const app = new Hono();

app.get(
  "/ws",
  upgradeWebSocket(() => {
    return {
      onOpen(event, ws) {
        console.log("WebSocket connection opened");
      },
      onMessage(event, ws) {
        console.log(`Message from client: ${event.data}`);
        const data = JSON.parse(event.data.toString());
        dispatch(data, ws);
      },
      onClose: (event, ws) => {
        const data = { type: "leave" };
        dispatch(data, ws);
        console.log("Connection closed");
      },
      onError: () => {
        console.log("Connection error");
      },
    };
  }),
);

const wss = new WebSocketServer({ noServer: true });

serve(
  {
    fetch: app.fetch,
    port: 3000,
    websocket: { server: wss },
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
