'use client'

import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react'

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

type Screen = 'menu' | 'lobby' | 'first-word' | 'drawing' | 'naming'

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

export default function Home() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [inputUsername, setInputUsername] = useState('')
  const [username, setUsername] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [isHost, setIsHost] = useState(false)
  const [threadId, setThreadId] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [timer, setTimer] = useState(0)
  const [drawingLines, setDrawingLines] = useState<DrawingLine[]>([])
  const [connected, setConnected] = useState(false)
  const [firstWordValue, setFirstWordValue] = useState('')
  const [namingValue, setNamingValue] = useState('')

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

  useEffect(() => () => clearTimer(), [clearTimer])

  const handleJoin = () => {
    const name = inputUsername.trim()
    if (!name) return
    setUsername(name)
    wsRef.current?.send(JSON.stringify({ type: 'join', username: name }))
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

  const handleNamingChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNamingValue(e.target.value)
    wsRef.current?.send(JSON.stringify({ type: 'naming', username, name: e.target.value }))
  }

  return (
    <main className="min-h-screen p-4 max-w-3xl mx-auto font-sans">
      <header className="flex justify-between items-baseline gap-4 mb-3">
        <h1 className="m-0">Gartic Phone WS</h1>
        <p className="m-0 text-sm">{connected ? 'Connected' : 'Disconnected'}</p>
      </header>

      {screen === 'menu' && (
        <section>
          <h2 className="text-center mb-4">Menu</h2>
          <label className="block mb-2">
            Username{' '}
            <input
              type="text"
              value={inputUsername}
              onChange={(e) => setInputUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="thomas"
              className="border border-gray-300 px-2 py-1"
            />
          </label>
          <p>
            <button
              onClick={handleJoin}
              className="px-3 py-1.5 bg-blue-500 text-white rounded cursor-pointer"
            >
              Join
            </button>
          </p>
        </section>
      )}

      {screen === 'lobby' && (
        <section>
          <h2 className="text-center mb-4">Lobby</h2>
          <ul id="playersList" className="list-disc pl-5 mb-4">
            {players.map((name, i) => <li key={i}>{name}</li>)}
          </ul>
          {isHost && (
            <button
              onClick={handleStartGame}
              className="px-3 py-1.5 bg-green-500 text-white rounded cursor-pointer"
            >
              Start
            </button>
          )}
        </section>
      )}

      {screen === 'first-word' && (
        <section>
          <h2 className="text-center mb-4">First word</h2>
          <p className="mb-2">Give the first word of your thread.</p>
          {!submitted ? (
            <div>
              <input
                type="text"
                value={firstWordValue}
                onChange={(e) => setFirstWordValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFirstWordSubmit()}
                placeholder="banana wizard"
                className="border border-gray-300 px-2 py-1 mr-2"
              />
              <p>
                <button
                  onClick={handleFirstWordSubmit}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded cursor-pointer"
                >
                  Submit word
                </button>
              </p>
            </div>
          ) : (
            <p>Waiting for all players...</p>
          )}
        </section>
      )}

      {screen === 'drawing' && (
        <section>
          <h2 className="mb-4">Drawing</h2>
          <header className="flex justify-between items-baseline gap-4 mb-3">
            <p>
              Draw: <strong>{prompt}</strong>
            </p>
            <p>
              Time left: <span>{timer}</span>s
            </p>
          </header>
          <div className="w-full max-w-[800px]">
            <canvas
              ref={drawingCanvasRef}
              width={800}
              height={500}
              className="block w-full h-auto border border-black cursor-crosshair"
            />
          </div>
          <div className="flex gap-6 items-center mt-3">
            <label>
              Color{' '}
              <input
                type="color"
                defaultValue="#111111"
                onChange={(e) => { colorRef.current = e.target.value }}
              />
            </label>
            <label>
              Thickness{' '}
              <input
                type="range"
                min={1}
                max={16}
                defaultValue={4}
                onChange={(e) => { thicknessRef.current = Number(e.target.value) }}
              />
            </label>
          </div>
        </section>
      )}

      {screen === 'naming' && (
        <section>
          <h2 className="mb-4">Naming</h2>
          <header className="flex justify-between items-baseline gap-4 mb-3">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={namingValue}
                onChange={handleNamingChange}
                placeholder="sad fish at work"
                className="border border-gray-300 px-2 py-1 min-w-48"
              />
            </div>
            <p>
              Time left: <span>{timer}</span>s
            </p>
          </header>
          <div className="w-full max-w-[800px]">
            <canvas
              ref={namingCanvasRef}
              width={800}
              height={500}
              className="block w-full h-auto border border-black"
            />
          </div>
        </section>
      )}
    </main>
  )
}
