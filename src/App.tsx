import { useEffect, useRef, useState, useCallback } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import './App.css'

// Configuration
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const START_PINCH_THRESHOLD = 0.25; // Threshold to BEGIN a pinch
const STOP_PINCH_THRESHOLD = 0.50;  // Threshold to BREAK a pinch (Hysteresis)
const FADE_DURATION = 500;   // 500ms fade-out

const COLORS = {
  // Primary lines
  hand_bone_start: '#ff00ff',      // Magenta
  hand_bone_mid: '#00f3ff',        // Cyan
  hand_bone_end: '#00ff88',        // Neon green

  // Joints
  wrist: '#ff00ff',                // Magenta
  fingertips: '#00ff00',           // Green
  middle_joints: '#00f3ff',        // Cyan
  accent_2: '#ff6600',             // Orange

  // UI / Rects
  rectActive: '#ffff00',           // Yellow while forming
  rectSaved: '#00ff00',            // Green once saved/locked
  hudText: '#00ff00',
};

interface Point2D {
  x: number;
  y: number;
}

interface RectPoints {
  p1: Point2D; // Hand 0 Thumb (4)
  p2: Point2D; // Hand 0 Index (8)
  p3: Point2D; // Hand 1 Index (8)
  p4: Point2D; // Hand 1 Thumb (4)
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  // Unified Interaction State
  const interactionRef = useRef({
    currentRect: null as RectPoints | null,
    lockedRect: null as RectPoints | null,
    fadeStart: null as number | null,
    isFading: false,
    isLockedEnabled: false,
    isDrawing: false, // Latch for current session
  });

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [fps, setFps] = useState(0);
  const [handCount, setHandCount] = useState(0);
  const [webcamError, setWebcamError] = useState<string | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    const initModel = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        setIsModelLoaded(true);
      } catch (err) {
        console.error("Model Load Error:", err);
      }
    };
    initModel();
  }, []);

  // Setup Webcam
  const setupWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, frameRate: 30 }
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setWebcamError("WEBCAM_DENIED");
    }
  }, []);

  useEffect(() => { setupWebcam(); }, [setupWebcam]);

  // Utilities
  const getDistance = (p1: NormalizedLandmark, p2: NormalizedLandmark) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  const drawQuad = (ctx: CanvasRenderingContext2D, rect: RectPoints, color: string, alpha: number = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;

    ctx.beginPath();
    ctx.moveTo(rect.p1.x, rect.p1.y);
    ctx.lineTo(rect.p2.x, rect.p2.y);
    ctx.lineTo(rect.p3.x, rect.p3.y);
    ctx.lineTo(rect.p4.x, rect.p4.y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.15;
    ctx.fill();

    // Corners
    ctx.globalAlpha = alpha;
    [rect.p1, rect.p2, rect.p3, rect.p4].forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  };

  const drawSkeleton = (ctx: CanvasRenderingContext2D, hand: NormalizedLandmark[], isPinching: boolean) => {
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17]
    ];

    ctx.save();

    // 1. Draw bones with gradient glow
    connections.forEach((conn) => {
      const [s, e] = conn;
      const start = hand[s];
      const end = hand[e];
      if (!start || !end) return;

      const x1 = start.x * VIDEO_WIDTH;
      const y1 = start.y * VIDEO_HEIGHT;
      const x2 = end.x * VIDEO_WIDTH;
      const y2 = end.y * VIDEO_HEIGHT;

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, COLORS.hand_bone_start);
      gradient.addColorStop(0.5, COLORS.hand_bone_mid);
      gradient.addColorStop(1, COLORS.hand_bone_end);

      // Outer glow
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
      ctx.lineWidth = 6;
      ctx.shadowBlur = 20;
      ctx.shadowColor = COLORS.hand_bone_mid;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Main bone
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = gradient;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    // 2. Draw joints with neon depth
    hand.forEach((lm, idx) => {
      const x = lm.x * VIDEO_WIDTH;
      const y = lm.y * VIDEO_HEIGHT;

      let color = COLORS.middle_joints;
      if (idx === 0) color = COLORS.wrist;
      if (idx === 4 || idx === 8) color = isPinching ? COLORS.fingertips : COLORS.middle_joints;
      if ([12, 16, 20].includes(idx)) color = COLORS.accent_2;

      // Glow circle
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      // Core point
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.beginPath();
      const radius = [4, 8].includes(idx) ? 5 : 3.5;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Inner highlight
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  };

  // Main Loop
  useEffect(() => {
    let animId: number;
    const frameCount = { count: 0, lastTime: performance.now() };

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (video && canvas && landmarker && video.readyState === 4) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
          const results = landmarker.detectForVideo(video, performance.now());
          const currentTime = performance.now();

          let numPinching = 0;
          let pinchActivePerHand: boolean[] = [false, false];

          if (results.landmarks && results.landmarks.length > 0) {
            setHandCount(results.landmarks.length);
            results.landmarks.forEach((hand, idx) => {
              if (idx > 1) return; // Only 2 hands
              const dist = getDistance(hand[4], hand[8]);
              
              // Hysteresis logic per hand
              const wasAlreadyDrawing = interactionRef.current.isDrawing;
              const threshold = wasAlreadyDrawing ? STOP_PINCH_THRESHOLD : START_PINCH_THRESHOLD;
              const isPinching = dist < threshold;
              
              pinchActivePerHand[idx] = isPinching;
              if (isPinching) numPinching++;
              
              drawSkeleton(ctx, hand, isPinching);
            });
          } else {
            setHandCount(0);
          }

          const bothPinching = numPinching === 2;
          const wasDrawing = interactionRef.current.isDrawing;

          // Drawing State Machine
          if (!wasDrawing && bothPinching && results.landmarks.length === 2) {
            // ENTER_DRAWING
            interactionRef.current.isDrawing = true;
            interactionRef.current.isFading = false;
          } else if (wasDrawing && (results.landmarks.length < 2 || !bothPinching)) {
            // EXIT_DRAWING
            interactionRef.current.isDrawing = false;
            if (interactionRef.current.currentRect) {
              if (interactionRef.current.isLockedEnabled) {
                interactionRef.current.lockedRect = interactionRef.current.currentRect;
                interactionRef.current.currentRect = null;
              } else {
                interactionRef.current.fadeStart = currentTime;
                interactionRef.current.isFading = true;
              }
            }
          }

          // Update currentRect if drawing
          if (interactionRef.current.isDrawing && results.landmarks.length === 2) {
            const h0 = results.landmarks[0];
            const h1 = results.landmarks[1];
            interactionRef.current.currentRect = {
              p1: { x: h0[4].x * VIDEO_WIDTH, y: h0[4].y * VIDEO_HEIGHT },
              p2: { x: h0[8].x * VIDEO_WIDTH, y: h0[8].y * VIDEO_HEIGHT },
              p3: { x: h1[8].x * VIDEO_WIDTH, y: h1[8].y * VIDEO_HEIGHT },
              p4: { x: h1[4].x * VIDEO_WIDTH, y: h1[4].y * VIDEO_HEIGHT }
            };
          }

          // RENDER PRIORITY: Locked > Live > Faded
          
          // 1. Locked (Green)
          if (interactionRef.current.lockedRect) {
            drawQuad(ctx, interactionRef.current.lockedRect, COLORS.rectSaved);
          }

          // 2. Fading (Transition from Yellow to Green-Alpha?)
          if (interactionRef.current.isFading && interactionRef.current.currentRect && interactionRef.current.fadeStart) {
            const elapsed = currentTime - interactionRef.current.fadeStart;
            const progress = 1 - (elapsed / FADE_DURATION);
            if (progress > 0) {
              drawQuad(ctx, interactionRef.current.currentRect, COLORS.rectSaved, progress);
            } else {
              interactionRef.current.currentRect = null;
              interactionRef.current.isFading = false;
            }
          }

          // 3. Live (Yellow)
          if (interactionRef.current.isDrawing && interactionRef.current.currentRect) {
            drawQuad(ctx, interactionRef.current.currentRect, COLORS.rectActive);
          }
        }

        // FPS
        frameCount.count++;
        const now = performance.now();
        if (now >= frameCount.lastTime + 1000) {
          setFps(Math.round((frameCount.count * 1000) / (now - frameCount.lastTime)));
          frameCount.lastTime = now;
          frameCount.count = 0;
        }
      }
      animId = requestAnimationFrame(loop);
    };

    if (isModelLoaded) loop();
    return () => cancelAnimationFrame(animId);
  }, [isModelLoaded]);

  return (
    <div className="hd-viewport">
      <div className="terminal-hud">
        <div style={{ borderBottom: '1px solid #00ff00', marginBottom: '10px', paddingBottom: '5px' }}>
          <code style={{ fontSize: '1rem', fontWeight: 'bold' }}>[GESTURE_FILTER_v2.1]</code>
        </div>
        
        <code>STATUS: <span style={{ color: isModelLoaded ? '#00ff00' : '#ff0000' }}>{isModelLoaded ? "SYSTEM_ACTIVE" : "LOADING..."}</span></code>
        <code>FPS: {fps}</code>
        <code>HANDS_DETECTED: {handCount}</code>
        
        {webcamError && (
          <code style={{ color: '#ff0000', marginTop: '5px' }}>[WEB_CAM_ERROR: {webcamError}]</code>
        )}

        <div style={{ 
          margin: '15px 0', 
          padding: '10px', 
          border: '1px solid rgba(0, 255, 0, 0.3)', 
          background: 'rgba(0, 255, 0, 0.05)',
          borderRadius: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <input 
              type="checkbox" 
              id="lock-rect" 
              onChange={(e) => interactionRef.current.isLockedEnabled = e.target.checked}
              style={{ 
                width: '18px', 
                height: '18px', 
                cursor: 'pointer',
                accentColor: '#00ff00'
              }}
            />
            <label htmlFor="lock-rect" style={{ 
              cursor: 'pointer', 
              fontSize: '0.9rem', 
              color: '#00ff00',
              textShadow: '0 0 5px #00ff00'
            }}>
              LOCK_TARGET_RECT
            </label>
          </div>
          
          <button 
            className="retry-btn" 
            onClick={() => {
              interactionRef.current.lockedRect = null;
              interactionRef.current.currentRect = null;
            }}
            style={{ 
              width: '100%', 
              padding: '8px',
              fontSize: '0.8rem',
              letterSpacing: '1px'
            }}
          >
            [CLEAR_MEMORY_STALL]
          </button>
        </div>

        <code style={{ fontSize: '0.7rem', opacity: 0.6, lineHeight: '1.4' }}>
          {">"} PINCH_DUAL: CREATE_QUAD<br/>
          {">"} RELEASE: AUTO_FADE_500MS<br/>
          {">"} LOCK_ENABLED: PERSIST_BUFFER
        </code>
      </div>

      <div className="media-container">
        <video ref={videoRef} className="hd-feed" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hd-overlay" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
      </div>
    </div>
  );
}

export default App;
