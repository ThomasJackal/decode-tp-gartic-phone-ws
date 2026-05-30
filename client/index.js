document.addEventListener("DOMContentLoaded", () => {

  const ws = new WebSocket("ws://localhost:3000/ws");

  const refs = {
    connectionStatus: document.getElementById("connectionStatus"),
    username: document.getElementById("username"),
    gameId: document.getElementById("gameId"),
    joinGameBtn: document.getElementById("joinGameBtn"),
    createGameBtn: document.getElementById("createGameBtn"),
    lobbyGameId: document.getElementById("lobbyGameId"),
    playersList: document.getElementById("playersList"),
    startGameBtn: document.getElementById("startGameBtn"),
    firstWordInput: document.getElementById("firstWordInput"),
    submitFirstWordBtn: document.getElementById("submitFirstWordBtn"),
    firstWordWaiting: document.getElementById("firstWordWaiting"),
    firstWordForm: document.getElementById("firstWordForm"),
    drawingCanvas: document.getElementById("drawingCanvas"),
    drawingWord: document.getElementById("drawingWord"),
    drawingTimer: document.getElementById("drawingTimer"),
    drawColor: document.getElementById("drawColor"),
    drawThickness: document.getElementById("drawThickness"),
    clearDrawingBtn: document.getElementById("clearDrawingBtn"),
    namingCanvas: document.getElementById("namingCanvas"),
    namingInput: document.getElementById("namingInput"),
    submitNamingBtn: document.getElementById("submitNamingBtn"),
    namingTimer: document.getElementById("namingTimer"),
    namingWaiting: document.getElementById("namingWaiting"),
  };

  const screens = {
    "menu": document.getElementById("screen-menu"),
    "pre-start": document.getElementById("screen-pre-start"),
    "first-word": document.getElementById("screen-first-word"),
    "drawing": document.getElementById("screen-drawing"),
    "naming": document.getElementById("screen-naming"),
  };

  let currentScreen = null;
  let screenState = null;

  const screenControllers = {
    "menu": {
      init() {
        return {};
      },
    },
    "pre-start": {
      init({ gameId } = {}) {
        if (gameId) {
          refs.lobbyGameId.textContent = gameId;
        }
        refs.playersList.replaceChildren();
        return {
          gameId: gameId ?? refs.lobbyGameId.textContent,
        };
      },
    },
    "first-word": {
      init() {
        refs.firstWordInput.value = "";
        refs.firstWordForm.hidden = false;
        refs.firstWordWaiting.hidden = true;
        return {
          submitted: false,
        };
      },
    },
    "drawing": {
      init({ prompt, duration } = {}) {
        const ctx = refs.drawingCanvas.getContext("2d");
        ctx.clearRect(0, 0, refs.drawingCanvas.width, refs.drawingCanvas.height);
        refs.drawingWord.textContent = prompt ?? "-";
        refs.drawingTimer.textContent = duration ? Math.ceil(duration / 1000) : "60";
        refs.drawColor.value = "#111111";
        refs.drawThickness.value = "4";

        return {
          isDrawing: false,
          lastX: 0,
          lastY: 0,
          color: refs.drawColor.value,
          thickness: Number(refs.drawThickness.value),
        };
      },
    },
    "naming": {
      init({ drawing, duration } = {}) {
        const ctx = refs.namingCanvas.getContext("2d");
        ctx.clearRect(0, 0, refs.namingCanvas.width, refs.namingCanvas.height);
        refs.namingInput.value = "";
        refs.namingWaiting.hidden = true;
        refs.namingTimer.textContent = duration ? Math.ceil(duration / 1000) : "10";
        if (drawing) {
          drawCompleteDrawing(ctx, drawing);
        }

        return {
          submitted: false,
        };
      },
    },
  };

  function changeScreen(name, options = {}) {
    Object.values(screens).forEach((screen) => {
      screen.hidden = true;
    });
    screens[name].hidden = false;

    currentScreen = name;
    screenState = screenControllers[name].init(options);
  }

  function drawCompleteDrawing(ctx, drawing) {
    drawing.forEach((line) => {
      drawLine(ctx, line);
    });
  }

  function drawLine(ctx, data) {
    ctx.beginPath();
    ctx.moveTo(data.fromX, data.fromY);
    ctx.lineTo(data.toX, data.toY);
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.thickness;
    ctx.stroke();
  }

  refs.drawingCanvas.addEventListener("mousedown", (e) => {
    if (currentScreen !== "drawing") return;
    screenState.isDrawing = true;
    [screenState.lastX, screenState.lastY] = [e.offsetX, e.offsetY];
  });

  refs.drawingCanvas.addEventListener("mousemove", (e) => {
    if (currentScreen !== "drawing" || !screenState.isDrawing) return;

    const x = e.offsetX;
    const y = e.offsetY;
    const ctx = refs.drawingCanvas.getContext("2d");
    const data = {
      type: "draw",
      color: screenState.color,
      thickness: screenState.thickness,
      fromX: screenState.lastX,
      fromY: screenState.lastY,
      toX: x,
      toY: y,
    };

    drawLine(ctx, data);
    ws.send(JSON.stringify(data));
    [screenState.lastX, screenState.lastY] = [x, y];
  });

  refs.drawingCanvas.addEventListener("mouseup", () => {
    if (currentScreen !== "drawing") return;
    screenState.isDrawing = false;
  });

  refs.drawColor.addEventListener("input", () => {
    if (currentScreen !== "drawing") return;
    screenState.color = refs.drawColor.value;
  });

  refs.drawThickness.addEventListener("input", () => {
    if (currentScreen !== "drawing") return;
    screenState.thickness = Number(refs.drawThickness.value);
  });

  refs.clearDrawingBtn.addEventListener("click", () => {
    if (currentScreen !== "drawing") return;
    const ctx = refs.drawingCanvas.getContext("2d");
    ctx.clearRect(0, 0, refs.drawingCanvas.width, refs.drawingCanvas.height);
  });

  changeScreen("menu");
});
