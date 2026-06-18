'use client'

import { useState, useEffect, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from 'react'

interface DrawingLine {
  type: string
  username: string
  color: string
  thickness: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface ThreadStep {
  type: 'word' | 'drawing' | 'name'
  author: string
  content: string | DrawingLine[]
}

interface ThreadResult {
  threadId: number
  steps: ThreadStep[]
}

type Screen = 'menu' | 'lobby' | 'first-word' | 'drawing' | 'naming' | 'results'

const AVATAR_COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#f97316']
const PRESET_COLORS = ['#111111', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#65a30d', '#0891b2']

function drawLine(ctx: CanvasRenderingContext2D, line: DrawingLine) {
  ctx.beginPath()
  ctx.moveTo(line.fromX, line.fromY)
  ctx.lineTo(line.toX, line.toY)
  ctx.strokeStyle = line.color
  ctx.lineWidth = line.thickness
  ctx.stroke()
}

function getCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

function PlayerAvatar({ name, index, size = 'md' }: { name: string; index: number; size?: 'sm' | 'md' }) {
  const initial = name.charAt(0).toUpperCase()
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length]
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initial}
    </div>
  )
}

function TimerBar({ timer, max }: { timer: number; max: number }) {
  if (timer <= 0) return null
  const pct = Math.max(0, (timer / max) * 100)
  const color = timer > 10 ? '#22c55e' : timer > 5 ? '#f59e0b' : '#ef4444'
  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3 animate-fadeIn">
      <div
        className="h-2.5 rounded-full transition-all duration-300 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [inputUsername, setInputUsername] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [isHost, setIsHost] = useState(false)
  const [threadId, setThreadId] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [timer, setTimer] = useState(0)
  const [timerMax, setTimerMax] = useState(0)
  const [drawingLines, setDrawingLines] = useState<DrawingLine[]>([])
  const [connected, setConnected] = useState(false)
  const [firstWordValue, setFirstWordValue] = useState('')
  const [namingValue, setNamingValue] = useState('')
  const [currentColor, setCurrentColor] = useState('#111111')

  const wsRef = useRef<WebSocket | null>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const namingCanvasRef = useRef<HTMLCanvasElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const screenRef = useRef<Screen>('menu')
  const isDrawingRef = useRef(false)
  const lastXRef = useRef(0)
  const lastYRef = useRef(0)
  const colorRef = useRef('#111111')
  const thicknessRef = useRef(4)
  const timerEndRef = useRef(0)

  const [drawDuration, setDrawDuration] = useState(60000)
  const [namingDuration, setNamingDuration] = useState(20000)
  const [gameEndData, setGameEndData] = useState<{ threads: ThreadResult[] } | null>(null)
  const [currentResult, setCurrentResult] = useState<{ threadIndex: number; stepIndex: number } | null>(null)
  const [allShown, setAllShown] = useState(false)
  const resultsCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => { screenRef.current = screen }, [screen])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback((durationMs: number) => {
    clearTimer()
    timerEndRef.current = Date.now() + durationMs
    setTimerMax(Math.ceil(durationMs / 1000))
    const tick = () => {
      const secondsLeft = Math.max(0, Math.ceil((timerEndRef.current - Date.now()) / 1000))
      setTimer(secondsLeft)
      if (secondsLeft <= 0) clearTimer()
    }
    tick()
    timerRef.current = setInterval(tick, 250)
  }, [clearTimer])

  const handleMessageRef = useRef<(data: Record<string, unknown>) => void>(() => {})

  const handleMessage = useCallback((data: Record<string, unknown>) => {
    switch (data.type) {
      case 'players': {
        const p = data.players as string[]
        const host = data.isHost as boolean
        setPlayers(p)
        setIsHost(host)
        setDrawDuration(data.drawDuration as number ?? 60000)
        setNamingDuration(data.namingDuration as number ?? 20000)
        setGameEndData(null)
        setCurrentResult(null)
        setAllShown(false)
        setError('')
        if (screenRef.current !== 'lobby') setScreen('lobby')
        break
      }
      case 'threadReady':
        setThreadId(data.threadId as number)
        setSubmitted(false)
        setFirstWordValue('')
        setScreen('first-word')
        break
      case 'drawingPhase': {
        setPrompt(data.prompt as string)
        const canvas = drawingCanvasRef.current
        if (canvas) {
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        }
        colorRef.current = '#111111'
        setCurrentColor('#111111')
        thicknessRef.current = 4
        setScreen('drawing')
        startTimer(data.duration as number)
        break
      }
      case 'namingPhase': {
        const drawing = data.drawing as { events?: DrawingLine[] } | undefined
        setDrawingLines(drawing?.events ?? [])
        setNamingValue('')
        const canvas = namingCanvasRef.current
        if (canvas && drawing?.events) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            for (const line of drawing.events) {
              drawLine(ctx, line)
            }
          }
        }
        setScreen('naming')
        startTimer(data.duration as number)
        break
      }
      case 'gameEnd': {
        const threads = data.threads as ThreadResult[]
        setGameEndData({ threads })
        setCurrentResult(null)
        setAllShown(false)
        setScreen('results')
        break
      }
      case 'showResult': {
        setCurrentResult({
          threadIndex: data.threadIndex as number,
          stepIndex: data.stepIndex as number,
        })
        break
      }
      case 'allResultsShown': {
        setCurrentResult(null)
        setAllShown(true)
        break
      }
      case 'roomCreated': {
        setRoomCode(data.roomCode as string)
        break
      }
      case 'settingsUpdated': {
        setDrawDuration(data.drawDuration as number)
        setNamingDuration(data.namingDuration as number)
        break
      }
      case 'kicked': {
        setError('You have been kicked from the room')
        setScreen('menu')
        break
      }
      case 'error': {
        setError(data.message as string)
        break
      }
    }
  }, [startTimer])

  useEffect(() => {
    handleMessageRef.current = handleMessage
  }, [handleMessage])

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/ws')
    wsRef.current = ws

    ws.addEventListener('open', () => setConnected(true))
    ws.addEventListener('close', () => setConnected(false))
    ws.addEventListener('message', (event) => {
      handleMessageRef.current(JSON.parse(event.data))
    })

    return () => { ws.close() }
  }, [])

  useEffect(() => {
    const canvas = drawingCanvasRef.current
    if (!canvas || screen !== 'drawing') return

    const handleMouseDown = (e: MouseEvent) => {
      isDrawingRef.current = true
      const point = getCanvasPoint(canvas, e.clientX, e.clientY)
      lastXRef.current = point.x
      lastYRef.current = point.y
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return
      const point = getCanvasPoint(canvas, e.clientX, e.clientY)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const line: DrawingLine = {
        type: 'drawing',
        username,
        color: colorRef.current,
        thickness: thicknessRef.current,
        fromX: lastXRef.current,
        fromY: lastYRef.current,
        toX: point.x,
        toY: point.y,
      }

      drawLine(ctx, line)
      wsRef.current?.send(JSON.stringify(line))
      lastXRef.current = point.x
      lastYRef.current = point.y
    }

    const handleMouseUp = () => { isDrawingRef.current = false }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
    }
  }, [screen, username])

  useEffect(() => {
    const canvas = namingCanvasRef.current
    if (!canvas || screen !== 'naming' || !drawingLines.length) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const line of drawingLines) {
      drawLine(ctx, line)
    }
  }, [screen, drawingLines])

  useEffect(() => {
    const canvas = resultsCanvasRef.current
    if (!canvas || !currentResult || !gameEndData) return

    const step = gameEndData.threads[currentResult.threadIndex].steps[currentResult.stepIndex]
    if (step.type !== 'drawing') return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const lines = step.content as DrawingLine[]
    for (const line of lines) {
      drawLine(ctx, line)
    }
  }, [currentResult, gameEndData])

  useEffect(() => () => clearTimer(), [clearTimer])

  const handleCreateRoom = () => {
    const name = inputUsername.trim()
    if (!name) return
    setError('')
    setUsername(name)
    wsRef.current?.send(JSON.stringify({ type: 'createRoom', username: name }))
  }

  const handleJoinRoom = () => {
    const name = inputUsername.trim()
    const code = roomCodeInput.trim().toUpperCase()
    if (!name || !code) return
    setError('')
    setRoomCode(code)
    setUsername(name)
    wsRef.current?.send(JSON.stringify({ type: 'joinRoom', username: name, roomCode: code }))
  }

  const handleStartGame = () => {
    wsRef.current?.send(JSON.stringify({ type: 'startGame' }))
  }

  const handleFirstWordSubmit = () => {
    if (submitted || threadId === null || !firstWordValue.trim()) return
    wsRef.current?.send(JSON.stringify({
      type: 'threadReady',
      threadId,
      initialWord: firstWordValue.trim(),
    }))
    setSubmitted(true)
  }

  const handleNextResult = () => {
    wsRef.current?.send(JSON.stringify({ type: 'nextResult' }))
  }

  const handleRestartGame = () => {
    wsRef.current?.send(JSON.stringify({ type: 'restartGame' }))
  }

  const handleSettingChange = (key: string, value: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'updateSettings', [key]: value }))
  }

  const handleKickPlayer = (username: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'kickPlayer', username }))
  }

  const handleNamingChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNamingValue(e.target.value)
    wsRef.current?.send(JSON.stringify({ type: 'naming', username, name: e.target.value }))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, action: () => void) => {
    if (e.key === 'Enter') action()
  }

  function renderResultStep(step: ThreadStep) {
    switch (step.type) {
      case 'word':
        return (
          <div className="p-8 bg-white rounded-2xl border border-gray-100 text-center shadow-sm animate-slideUp">
            <p className="text-sm text-gray-400 mb-2 font-medium">Initial word by {step.author}</p>
            <p className="text-3xl font-bold text-gray-800" style={{ fontFamily: 'var(--font-fredoka)' }}>
              &ldquo;{step.content as string}&rdquo;
            </p>
          </div>
        )
      case 'drawing':
        return (
          <div className="animate-slideUp">
            <p className="text-sm text-gray-400 mb-2 font-medium">Drawing by {step.author}</p>
            <div className="w-full max-w-[800px] rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-white">
              <canvas
                ref={resultsCanvasRef}
                width={800}
                height={500}
                className="block w-full h-auto"
              />
            </div>
          </div>
        )
      case 'name':
        return (
          <div className="p-8 bg-white rounded-2xl border border-gray-100 text-center shadow-sm animate-slideUp">
            <p className="text-sm text-gray-400 mb-2 font-medium">Named by {step.author}</p>
            <p className="text-2xl font-bold text-gray-800 italic" style={{ fontFamily: 'var(--font-fredoka)' }}>
              &ldquo;{step.content as string}&rdquo;
            </p>
          </div>
        )
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #f5f3ff 0%, #fdf2f8 50%, #eff6ff 100%)',
        fontFamily: 'var(--font-nunito)',
      }}
    >
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col">
        <header className="flex items-center justify-between mb-8">
          <h1
            className="text-2xl font-bold text-gray-800 m-0"
            style={{ fontFamily: 'var(--font-fredoka)' }}
          >
            Gartic Phone
          </h1>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </header>

        {screen === 'menu' && (
          <section className="bg-white rounded-3xl shadow-lg p-8 animate-fadeIn">
            <h2
              className="text-center text-2xl mb-6 text-gray-700"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              Join the game
            </h2>
            {error && (
              <p className="text-red-500 text-sm mb-4 text-center bg-red-50 py-2 px-4 rounded-lg">
                {error}
              </p>
            )}
            <div className="mb-4">
              <label className="text-sm text-gray-500 font-medium mb-1 block">Your name</label>
              <input
                type="text"
                value={inputUsername}
                onChange={(e) => setInputUsername(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleCreateRoom)}
                placeholder="enter your name"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              />
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCreateRoom}
                className="w-full py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              >
                Create Room
              </button>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">OR</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => handleKeyDown(e, handleJoinRoom)}
                  placeholder="ROOM CODE"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 uppercase text-center tracking-widest font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                  maxLength={6}
                />
                <button
                  onClick={handleJoinRoom}
                  className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  Join
                </button>
              </div>
            </div>
          </section>
        )}

        {screen === 'lobby' && (
          <section className="bg-white rounded-3xl shadow-lg p-8 animate-fadeIn">
            <h2
              className="text-center text-2xl mb-4 text-gray-700"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              Lobby
            </h2>
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="text-sm text-gray-400">Room:</span>
              <span className="bg-violet-100 text-violet-700 font-bold px-4 py-1.5 rounded-lg text-sm tracking-widest">
                {roomCode}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(roomCode)}
                className="text-xs text-gray-400 hover:text-violet-500 underline cursor-pointer transition-colors"
              >
                Copy
              </button>
            </div>

            <div className="space-y-2 mb-6">
              {players.map((name, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <PlayerAvatar name={name} index={i} />
                  <span className="text-gray-700 font-medium">{name}</span>
                  {i === 0 ? (
                    <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Host
                    </span>
                  ) : isHost ? (
                    <button
                      onClick={() => handleKickPlayer(name)}
                      className="ml-auto text-xs bg-red-100 text-red-500 hover:bg-red-200 hover:text-red-700 px-2.5 py-0.5 rounded-full font-medium cursor-pointer transition-colors"
                    >
                      Kick
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl mb-6">
              <h3 className="font-semibold text-gray-700 mb-3 text-sm" style={{ fontFamily: 'var(--font-fredoka)' }}>
                Settings
              </h3>
              {isHost ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-400 flex justify-between">
                      <span>Drawing timer</span>
                      <span className="font-medium text-gray-600">{drawDuration / 1000}s</span>
                    </label>
                    <input
                      type="range"
                      min={30}
                      max={180}
                      step={10}
                      value={drawDuration / 1000}
                      onChange={(e) => handleSettingChange('drawDuration', Number(e.target.value) * 1000)}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-300">
                      <span>30s</span>
                      <span>180s</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 flex justify-between">
                      <span>Naming timer</span>
                      <span className="font-medium text-gray-600">{namingDuration / 1000}s</span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      step={10}
                      value={namingDuration / 1000}
                      onChange={(e) => handleSettingChange('namingDuration', Number(e.target.value) * 1000)}
                      className="w-full accent-violet-500"
                    />
                    <div className="flex justify-between text-[10px] text-gray-300">
                      <span>10s</span>
                      <span>90s</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-sm text-gray-500">
                  <p>Drawing: <span className="font-medium text-gray-700">{drawDuration / 1000}s</span></p>
                  <p>Naming: <span className="font-medium text-gray-700">{namingDuration / 1000}s</span></p>
                </div>
              )}
            </div>

            {isHost ? (
              <button
                onClick={handleStartGame}
                className="w-full py-3.5 bg-gradient-to-r from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 text-white rounded-xl font-bold text-lg transition-all shadow-md active:scale-[0.98] animate-pulse-slow cursor-pointer"
              >
                Start Game
              </button>
            ) : (
              <p className="text-center text-gray-400 text-sm animate-pulse-slow">
                Waiting for host to start the game...
              </p>
            )}
          </section>
        )}

        {screen === 'first-word' && (
          <section className="bg-white rounded-3xl shadow-lg p-8 animate-fadeIn text-center">
            <h2
              className="text-2xl mb-2 text-gray-700"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              First word
            </h2>
            <p className="text-gray-400 mb-6">Give the first word of your thread.</p>
            {!submitted ? (
              <div className="max-w-sm mx-auto">
                <input
                  type="text"
                  value={firstWordValue}
                  onChange={(e) => setFirstWordValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, handleFirstWordSubmit)}
                  placeholder="banana wizard"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 text-center text-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                  autoFocus
                />
                <button
                  onClick={handleFirstWordSubmit}
                  className="mt-4 w-full py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                >
                  Submit word
                </button>
              </div>
            ) : (
              <div className="py-8">
                <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Waiting for all players...</p>
              </div>
            )}
          </section>
        )}

        {screen === 'drawing' && (
          <section className="bg-white rounded-3xl shadow-lg p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xl text-gray-700 m-0"
                style={{ fontFamily: 'var(--font-fredoka)' }}
              >
                Drawing
              </h2>
            </div>
            <TimerBar timer={timer} max={timerMax} />
            <p className="text-gray-500 mb-3">
              Draw: <span className="text-gray-800 font-bold">{prompt}</span>
            </p>
            <div className="w-full max-w-[800px] mx-auto rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-white">
              <canvas
                ref={drawingCanvasRef}
                width={800}
                height={500}
                className="block w-full h-auto cursor-crosshair"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => { colorRef.current = c; setCurrentColor(c) }}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                      currentColor === c ? 'border-gray-400 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label className="relative w-7 h-7 rounded-full overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer flex items-center justify-center">
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => { colorRef.current = e.target.value; setCurrentColor(e.target.value) }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                  <span className="text-gray-400 text-xs font-bold">+</span>
                </label>
              </div>
              <div className="flex-1" />
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <span>Size</span>
                <input
                  type="range"
                  min={1}
                  max={16}
                  defaultValue={4}
                  onChange={(e) => { thicknessRef.current = Number(e.target.value) }}
                  className="w-20 accent-violet-500"
                />
              </label>
            </div>
          </section>
        )}

        {screen === 'naming' && (
          <section className="bg-white rounded-3xl shadow-lg p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-xl text-gray-700 m-0"
                style={{ fontFamily: 'var(--font-fredoka)' }}
              >
                Naming
              </h2>
            </div>
            <TimerBar timer={timer} max={timerMax} />
            <div className="w-full max-w-[800px] mx-auto rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-white mb-4">
              <canvas
                ref={namingCanvasRef}
                width={800}
                height={500}
                className="block w-full h-auto"
              />
            </div>
            <input
              type="text"
              value={namingValue}
              onChange={handleNamingChange}
              placeholder="what is this drawing?"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-700 text-center text-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              autoFocus
            />
          </section>
        )}

        {screen === 'results' && gameEndData && (
          <section className="animate-fadeIn">
            <h2
              className="text-2xl text-center mb-6 text-gray-700"
              style={{ fontFamily: 'var(--font-fredoka)' }}
            >
              Results
            </h2>

            {currentResult && (
              <div>
                <div className="flex items-center justify-center gap-3 mb-4 text-sm text-gray-400">
                  <span className="bg-gray-100 px-3 py-1 rounded-full">
                    Thread {currentResult.threadIndex + 1} / {gameEndData.threads.length}
                  </span>
                  <span className="bg-gray-100 px-3 py-1 rounded-full">
                    Step {currentResult.stepIndex + 1} / {gameEndData.threads[currentResult.threadIndex].steps.length}
                  </span>
                </div>

                {renderResultStep(
                  gameEndData.threads[currentResult.threadIndex].steps[currentResult.stepIndex],
                )}

                <div className="mt-6 text-center">
                  {isHost ? (
                    <button
                      onClick={handleNextResult}
                      className="px-8 py-3 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    >
                      Next
                    </button>
                  ) : (
                    <p className="text-gray-400 text-sm animate-pulse-slow">Waiting for host to continue...</p>
                  )}
                </div>
              </div>
            )}

            {!currentResult && !allShown && (
              <div className="bg-white rounded-3xl shadow-lg p-12 text-center">
                {isHost ? (
                  <button
                    onClick={handleNextResult}
                    className="px-8 py-3.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl font-bold text-lg transition-all shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    Start viewing results
                  </button>
                ) : (
                  <>
                    <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Waiting for host to start viewing results...</p>
                  </>
                )}
              </div>
            )}

            {allShown && (
              <div className="bg-white rounded-3xl shadow-lg p-12 text-center animate-slideUp">
                <p className="text-xl text-gray-700 mb-6" style={{ fontFamily: 'var(--font-fredoka)' }}>
                  All results shown!
                </p>
                {isHost ? (
                  <button
                    onClick={handleRestartGame}
                    className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                  >
                    Play Again
                  </button>
                ) : (
                  <p className="text-gray-400 text-sm animate-pulse-slow">Waiting for host to start a new game...</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}
