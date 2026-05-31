document.addEventListener("DOMContentLoaded", () => {

  const ws = new WebSocket("ws://localhost:3000/ws");

  const refs = {
    connectionStatus: document.getElementById("connectionStatus"),
    username: document.getElementById("username"),
    joinGameBtn: document.getElementById("joinGameBtn"),
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
    namingCanvas: document.getElementById("namingCanvas"),
    namingInput: document.getElementById("namingInput"),
    namingForm: document.getElementById("namingForm"),
    namingTimer: document.getElementById("namingTimer"),
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
  let activeTimer = null;
  let username = "";

  const screenControllers = {
    "menu": {
      init() {
        return {};
      },
    },
    "pre-start": {
      init({ players = [], isHost = false } = {}) {
        renderPlayersList(players);
        refs.startGameBtn.hidden = !isHost;
        return { players, isHost };
      },
    },
    "first-word": {
      init({ threadId } = {}) {
        refs.firstWordInput.value = "";
        refs.firstWordForm.hidden = false;
        refs.firstWordWaiting.hidden = true;
        return {
          threadId,
          submitted: false,
        };
      },
    },
    "drawing": {
      init({ prompt, duration, round } = {}) {
        const ctx = refs.drawingCanvas.getContext("2d");
        ctx.clearRect(0, 0, refs.drawingCanvas.width, refs.drawingCanvas.height);
        refs.drawingWord.textContent = prompt ?? "-";
        refs.drawColor.value = "#111111";
        refs.drawThickness.value = "4";
        startCountdown(refs.drawingTimer, duration ?? 60000);

        return {
          round: round ?? 1,
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
        startCountdown(refs.namingTimer, duration ?? 10000);
        if (drawing?.events) {
          drawCompleteDrawing(ctx, drawing.events);
        }

        return {};
      },
    },
  };

  function clearCountdown() {
    if (activeTimer) {
      clearInterval(activeTimer);
      activeTimer = null;
    }
  }

  function startCountdown(element, durationMs) {
    clearCountdown();
    const endAt = Date.now() + durationMs;

    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      element.textContent = secondsLeft;
      if (secondsLeft <= 0) {
        clearCountdown();
      }
    };

    tick();
    activeTimer = setInterval(tick, 250);
  }

  function renderPlayersList(players) {
    refs.playersList.replaceChildren();
    players.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      refs.playersList.appendChild(li);
    });
  }

  function submitFirstWord() {
    if (currentScreen !== "first-word" || screenState.submitted) return;

    const initialWord = refs.firstWordInput.value.trim();
    if (!initialWord) return;

    ws.send(JSON.stringify({
      type: "threadReady",
      threadId: screenState.threadId,
      initialWord,
    }));

    screenState.submitted = true;
    refs.firstWordForm.hidden = true;
    refs.firstWordWaiting.hidden = false;
  }

  function sendNaming() {
    if (currentScreen !== "naming") return;

    ws.send(JSON.stringify({
      type: "naming",
      username,
      name: refs.namingInput.value,
    }));
  }

  function handleMessage(data) {
    switch (data.type) {
      case "players": {
        const { players, isHost } = data;
        if (currentScreen !== "pre-start") {
          changeScreen("pre-start", { players, isHost });
        } else {
          screenState.players = players;
          screenState.isHost = isHost;
          renderPlayersList(players);
          refs.startGameBtn.hidden = !isHost;
        }
        break;
      }
      case "threadReady":
        changeScreen("first-word", { threadId: data.threadId });
        break;
      case "drawingPhase":
        changeScreen("drawing", {
          prompt: data.prompt,
          duration: data.duration,
          round: data.round,
        });
        break;
      case "namingPhase":
        changeScreen("naming", {
          drawing: data.drawing,
          duration: data.duration,
        });
        break;
    }
  }

  function changeScreen(name, options = {}) {
    clearCountdown();
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

  function getCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  refs.drawingCanvas.addEventListener("mousedown", (e) => {
    if (currentScreen !== "drawing") return;
    screenState.isDrawing = true;
    const point = getCanvasPoint(refs.drawingCanvas, e);
    [screenState.lastX, screenState.lastY] = [point.x, point.y];
  });

  refs.drawingCanvas.addEventListener("mousemove", (e) => {
    if (currentScreen !== "drawing" || !screenState.isDrawing) return;

    const { x, y } = getCanvasPoint(refs.drawingCanvas, e);
    const ctx = refs.drawingCanvas.getContext("2d");
    const data = {
      type: "drawing",
      username,
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

  refs.joinGameBtn.addEventListener("click", () => {
    username = refs.username.value.trim();
    if (!username) return;
    ws.send(JSON.stringify({ type: "join", username }));
  });

  refs.startGameBtn.addEventListener("click", () => {
    ws.send(JSON.stringify({ type: "startGame" }));
  });

  refs.submitFirstWordBtn.addEventListener("click", submitFirstWord);

  refs.firstWordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitFirstWord();
  });

  refs.namingInput.addEventListener("input", sendNaming);

  ws.addEventListener("open", () => {
    refs.connectionStatus.textContent = "Connected";
  });

  ws.addEventListener("close", () => {
    refs.connectionStatus.textContent = "Disconnected";
  });

  ws.addEventListener("message", (event) => {
    handleMessage(JSON.parse(event.data));
  });

  changeScreen("menu");
});
