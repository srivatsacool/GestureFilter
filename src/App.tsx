import { useEffect, useRef, useState, useCallback } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import './App.css'

// Ultra-Responsive Tracking
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const LERP_FACTOR = 0.65;
const PINCH_THRESHOLD = 0.3;

// NEW COLOR PALETTE FOR NEON CYBERPUNK
const COLORS = {
  // Primary lines
  hand_bone_start: '#ff00ff',      // Magenta
  hand_bone_mid: '#00f3ff',        // Cyan
  hand_bone_end: '#00ff88',        // Neon green

  // Joints
  wrist: '#ff00ff',                // Magenta
  fingertips: '#00ff00',           // Green
  middle_joints: '#00f3ff',        // Cyan
  other_joints: '#ff6600',         // Orange

  // Pinch effects
  pinch_line: '#00f3ff',           // Cyan
  pinch_glow: 'rgba(0, 243, 255, 0.8)',

  // Rectangles
  forming: '#ffff00',              // Yellow (being formed)
  active: '#00ff00',               // Green (active)
  saved: '#00ff00',                // Green (saved)

  // Accents
  accent_1: '#ff00ff',             // Magenta
  accent_2: '#ff6600',             // Orange
  accent_3: '#00ff88',             // Green
};

interface Point2D {
  x: number;
  y: number;
}

interface FingerState {
  thumb: Point2D;
  index: Point2D;
  handIdx: number;
}

interface PinchPoint extends Point2D {
  handIdx: number;
  timestamp: number;
}

interface DrawnRect {
  p1: PinchPoint;
  p2: PinchPoint;
  p3: PinchPoint;
  p4: PinchPoint;
  id: string;
  createdAt: number;
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  // Smoothing buffers
  const smoothedHandsRef = useRef<Record<string, NormalizedLandmark[]>>({});
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  // Track active pinches per hand and drawn rectangles
  const activePinchesRef = useRef<Record<number, FingerState>>({});
  const drawnRectsRef = useRef<DrawnRect[]>([]);

  // Transition state tracking
  const wasDualPinchRef = useRef(false);
  const lastDualPointsRef = useRef<{ p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D } | null>(null);
  const isDrawingRef = useRef<Record<number, boolean>>({});

  const [fps, setFps] = useState(0);
  const [gestures, setGestures] = useState<string[]>([]);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);


  // Initialize HandLandmarker
  useEffect(() => {
    const init = async () => {
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
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });
        setIsModelLoaded(true);
      } catch (err) {
        console.error("MediaPipe Init Error:", err);
        setIsModelLoaded(false);
      }
    };
    init();
  }, []);

  // Set up Webcam
  const setupWebcam = useCallback(async () => {
    if (videoRef.current?.srcObject) return; // Already running

    setWebcamError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError("BROWSER_UNSUPPORTED");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: VIDEO_WIDTH },
          height: { ideal: VIDEO_HEIGHT },
          frameRate: { ideal: 30 }
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch((e) => {
              if (e.name !== "AbortError") {
                console.error("Play Error:", e);
                setWebcamError("PLAY_BLOCKED");
              }
            });
          }
        };
      }
    } catch (err: any) {
      console.error("Webcam Error:", err);
      const errorName = err?.name || "UNKNOWN_ERROR";
      setWebcamError(errorName === "AbortError" ? "TIMEOUT" : errorName.toUpperCase());
    }
  }, []);

  useEffect(() => {
    setupWebcam();
    return () => {
      // Cleanup: Stop all tracks
      const video = videoRef.current;
      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
      }
    };
  }, [setupWebcam]);

  // LERP Smoothing for hand landmarks - now Handedness-aware
  const applyLerp = useCallback((hands: NormalizedLandmark[][], handedness: any[]) => {
    return hands.map((current, i) => {
      const handLabel = handedness[i]?.[0]?.categoryName || `Unknown_${i}`;
      const prev = smoothedHandsRef.current[handLabel];

      if (!prev || prev.length !== current.length) {
        smoothedHandsRef.current[handLabel] = current;
        return { landmarks: current, label: handLabel };
      }

      const smoothed = current.map((curr, j) => {
        const prevLandmark = prev[j];
        return {
          x: prevLandmark.x * (1 - LERP_FACTOR) + curr.x * LERP_FACTOR,
          y: prevLandmark.y * (1 - LERP_FACTOR) + curr.y * LERP_FACTOR,
          z: prevLandmark.z * (1 - LERP_FACTOR) + curr.z * LERP_FACTOR,
        } as NormalizedLandmark;
      });

      smoothedHandsRef.current[handLabel] = smoothed;
      return { landmarks: smoothed, label: handLabel };
    });
  }, []);

  // Improved Gesture Recognition
  const getGesture = useCallback((hand: NormalizedLandmark[]) => {
    if (hand.length < 21) return "NONE";

    const wrist = hand[0];
    const thumbTip = hand[4];
    const indexTip = hand[8];
    const middleMCP = hand[9];

    const handScale = Math.sqrt(
      Math.pow(wrist.x - middleMCP.x, 2) +
      Math.pow(wrist.y - middleMCP.y, 2) +
      Math.pow(wrist.z - middleMCP.z, 2)
    );

    if (handScale === 0) return "NONE";

    const pinchDist = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2) +
      Math.pow(thumbTip.z - indexTip.z, 2)
    );
    const normalizedPinchDist = pinchDist / handScale;

    // FIST Check: All fingertips close to palm
    const fingertipIndices = [8, 12, 16, 20];
    const isFist = fingertipIndices.every((idx) => {
      const dist = Math.sqrt(
        Math.pow(hand[idx].x - hand[0].x, 2) + Math.pow(hand[idx].y - hand[0].y, 2)
      );
      return dist / (handScale * 2.1) < 0.5;
    });

    // OPEN Check: All fingertips extended forward/up
    const isOpen = fingertipIndices.every((idx) => hand[idx].y < hand[idx - 2].y);

    if (isFist) return "FIST";
    if (normalizedPinchDist < PINCH_THRESHOLD) return "PINCH";
    if (isOpen) return "OPEN";
    return "NONE";
  }, []);

  // Get pinch points (thumb and index tips)
  const getFingerState = useCallback((hand: NormalizedLandmark[], handIdx: number): FingerState | null => {
    if (hand.length < 21) return null;

    const thumbTip = hand[4];
    const indexTip = hand[8];

    if (!thumbTip || !indexTip) return null;

    return {
      thumb: { x: thumbTip.x * VIDEO_WIDTH, y: thumbTip.y * VIDEO_HEIGHT },
      index: { x: indexTip.x * VIDEO_WIDTH, y: indexTip.y * VIDEO_HEIGHT },
      handIdx
    };
  }, []);

  // Enhanced Neon Hand Drawing
  const drawHandWithNeon = (ctx: CanvasRenderingContext2D, hand: NormalizedLandmark[], canvasWidth: number, canvasHeight: number) => {
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

      const x1 = start.x * canvasWidth;
      const y1 = start.y * canvasHeight;
      const x2 = end.x * canvasWidth;
      const y2 = end.y * canvasHeight;

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
      const x = lm.x * canvasWidth;
      const y = lm.y * canvasHeight;

      let color = COLORS.middle_joints;
      if (idx === 0) color = COLORS.wrist;
      if (idx === 4 || idx === 8) color = COLORS.fingertips;
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
      const radius = idx === 4 || idx === 8 ? 5 : 3.5;
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

  // AGGRESSIVE Stretch Line Enhancement
  const drawStretchLine = (
    ctx: CanvasRenderingContext2D,
    p1: Point2D,
    p2: Point2D
  ) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Aggressive scaling
    const thickness = Math.max(2, Math.min(25, 2 + dist * 0.2));
    const glowSize = Math.min(80, 10 + dist * 0.15);

    ctx.save();

    // Base Glow
    ctx.shadowBlur = glowSize;
    ctx.shadowColor = COLORS.pinch_glow;
    ctx.strokeStyle = COLORS.pinch_line;
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Parallel spreading lines for extreme stretch
    if (dist > 50) {
      const angle = Math.atan2(dy, dx);
      const offset = thickness * 0.8;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = thickness * 0.5;

      // Spreading parallel lines
      ctx.beginPath();
      ctx.moveTo(p1.x - Math.sin(angle) * offset, p1.y + Math.cos(angle) * offset);
      ctx.lineTo(p2.x - Math.sin(angle) * offset, p2.y + Math.cos(angle) * offset);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p1.x + Math.sin(angle) * offset, p1.y - Math.cos(angle) * offset);
      ctx.lineTo(p2.x + Math.sin(angle) * offset, p2.y - Math.cos(angle) * offset);
      ctx.stroke();
    }

    // Glowing Particles along the stretch
    if (dist > 80) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = COLORS.pinch_line;
      const particleCount = Math.floor(dist / 25);
      for (let i = 0; i <= particleCount; i++) {
        const t = i / particleCount;
        const px = p1.x + dx * t;
        const py = p1.y + dy * t;
        const size = 2 + Math.sin(t * Math.PI) * 4;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  };

  // Draw interactive rectangle (quad) from 4 points
  const drawInteractiveRect = (
    ctx: CanvasRenderingContext2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    p4: Point2D,
    color: string,
    alpha: number = 1
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;

    // Draw quad: H0 Thumb -> H0 Index -> H1 Index -> H1 Thumb -> H0 Thumb
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p4.x, p4.y); // Hand 1 Index
    ctx.lineTo(p3.x, p3.y); // Hand 1 Thumb
    ctx.closePath();
    ctx.stroke();

    // Fill with very light version
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.1;
    ctx.fill();

    // Draw corner circles
    ctx.globalAlpha = alpha;
    [p1, p2, p3, p4].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    ctx.restore();
  };
  // Main draw and analyze function
  const drawAndAnalyze = useCallback((processedHands: { landmarks: NormalizedLandmark[], label: string }[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = canvas.width || VIDEO_WIDTH;
    const canvasHeight = canvas.height || VIDEO_HEIGHT;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const discoveredGestures: string[] = [];
    const currentTime = performance.now();

    // 1. Draw previously created (green) rectangles
    drawnRectsRef.current.forEach((rect) => {
      const age = currentTime - rect.createdAt;
      const fadeAlpha = Math.max(0, 1 - age / 5000); // Fade over 5 seconds
      if (fadeAlpha > 0) {
        drawInteractiveRect(ctx, rect.p1, rect.p2, rect.p3, rect.p4, "#00ff00", fadeAlpha);
      }
    });

    // Clean up old rectangles
    drawnRectsRef.current = drawnRectsRef.current.filter(
      (rect) => currentTime - rect.createdAt < 5000
    );

    const currentPinchingHands: string[] = [];

    // 2. Process each hand for skeletons and gesture detection
    processedHands.forEach(({ landmarks: hand, label }) => {
      if (hand.length < 21) return;

      // 1. Draw neon skeleton
      drawHandWithNeon(ctx, hand, canvasWidth, canvasHeight);

      // Gesture detection
      const gesture = getGesture(hand);
      discoveredGestures.push(`${label}: ${gesture}`);

      // PERSISTENT DRAWING LOGIC:
      // 1. Start drawing on PINCH
      if (gesture === "PINCH") {
        isDrawingRef.current[label as any] = true;
      }
      // 2. Stop drawing on FIST
      if (gesture === "FIST") {
        isDrawingRef.current[label as any] = false;
      }

      // If we are in drawing mode for this hand, update the positions
      if (isDrawingRef.current[label as any]) {
        const fingerState = getFingerState(hand, 0); // index doesn't matter much now with label
        if (fingerState) {
          activePinchesRef.current[label as any] = fingerState;
          currentPinchingHands.push(label);
        }
      } else {
        delete activePinchesRef.current[label as any];
      }
    });

    // 3. Handle Single vs Dual Pinch Rendering
    if (currentPinchingHands.length === 2) {
      // DUAL PINCH: Draw Interactive Rectangle
      const f0Label = currentPinchingHands[0];
      const f1Label = currentPinchingHands[1];
      const f0 = activePinchesRef.current[f0Label as any];
      const f1 = activePinchesRef.current[f1Label as any];

      if (f0 && f1) {
        // High LERP factor during dual pinch for responsive manipulation
        drawInteractiveRect(ctx, f0.thumb, f0.index, f1.thumb, f1.index, COLORS.forming);

        wasDualPinchRef.current = true;
        lastDualPointsRef.current = { p1: f0.thumb, p2: f0.index, p3: f1.thumb, p4: f1.index };
      }
    } else if (currentPinchingHands.length === 1) {
      // SINGLE PINCH: Draw Cyan Stretch Line
      const hLabel = currentPinchingHands[0];
      const f = activePinchesRef.current[hLabel as any];
      if (f) {
        drawStretchLine(ctx, f.thumb, f.index);
      }

      // If we just released a dual pinch, save it
      if (wasDualPinchRef.current) {
        const points = lastDualPointsRef.current;
        if (points) {
          drawnRectsRef.current.push({
            p1: { ...points.p1, handIdx: 0, timestamp: currentTime },
            p2: { ...points.p2, handIdx: 0, timestamp: currentTime },
            p3: { ...points.p3, handIdx: 1, timestamp: currentTime },
            p4: { ...points.p4, handIdx: 1, timestamp: currentTime },
            id: Math.random().toString(36).substr(2, 9),
            createdAt: currentTime
          });
        }
        wasDualPinchRef.current = false;
        lastDualPointsRef.current = null;
      }
    } else {
      // NO PINCH: Final check to save if dual was just released
      if (wasDualPinchRef.current) {
        const points = lastDualPointsRef.current;
        if (points) {
          drawnRectsRef.current.push({
            p1: { ...points.p1, handIdx: 0, timestamp: currentTime },
            p2: { ...points.p2, handIdx: 0, timestamp: currentTime },
            p3: { ...points.p3, handIdx: 1, timestamp: currentTime },
            p4: { ...points.p4, handIdx: 1, timestamp: currentTime },
            id: Math.random().toString(36).substr(2, 9),
            createdAt: currentTime
          });
        }
        wasDualPinchRef.current = false;
        lastDualPointsRef.current = null;
      }
    }

    setGestures(discoveredGestures);
  }, [getGesture, getFingerState]);

  // Unified Frame Loop
  useEffect(() => {
    let animId: number;

    const loop = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && video.readyState === 4 && video.videoWidth > 0 && landmarker) {
        try {
          const results = landmarker.detectForVideo(video, performance.now());

          if (results.landmarks && results.landmarks.length > 0) {
            const processed = applyLerp(results.landmarks, results.handedness);
            drawAndAnalyze(processed);
          } else {
            const ctx = canvasRef.current?.getContext('2d');
            if (ctx && canvasRef.current) {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            setGestures([]);
            smoothedHandsRef.current = {};
            activePinchesRef.current = {};
            isDrawingRef.current = {};
          }

          // FPS Counter
          frameCountRef.current++;
          const now = performance.now();
          if (now >= lastTimeRef.current + 1000) {
            setFps(Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current)));
            lastTimeRef.current = now;
            frameCountRef.current = 0;
          }
        } catch (err) {
          console.error("Detection Error:", err);
        }
      }
      animId = requestAnimationFrame(loop);
    };

    if (isModelLoaded) {
      loop();
    }

    return () => cancelAnimationFrame(animId);
  }, [isModelLoaded, applyLerp, drawAndAnalyze]);

  return (
    <div className="hd-viewport">
      <div className="terminal-hud">
        <code>[System_Info]</code>
        <code>----------------</code>
        <code>STATUS: {isModelLoaded ? "MODEL_READY" : "LOADING_MODEL..."}</code>
        <code>VIDEO: {webcamError ? `ERROR_${webcamError}` : (videoRef.current?.paused ? "PAUSED" : "PLAYING")}</code>
        {webcamError && (
          <button className="retry-btn" onClick={setupWebcam}>[RETRY_WEBCAM]</button>
        )}
        <code>FPS: {fps}</code>
        <code>ACTIVE_HANDS: {gestures.length}</code>
        {gestures.map((g, idx) => (
          <code key={idx}>HAND_{idx}: {g}</code>
        ))}
        <code>ACTIVE_PINCHES: {Object.keys(activePinchesRef.current).length}</code>
        <code>SAVED_RECTS: {drawnRectsRef.current.length}</code>
        <code>TARGET_RES: {VIDEO_WIDTH}x{VIDEO_HEIGHT}</code>
        <code>ACTUAL_RES: {videoRef.current ? `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}` : "0x0"}</code>
        <code style={{ color: '#009dffff' }}>💡 PINCH BOTH HANDS TO CREATE RECT</code>
      </div>

      <div className="media-container">
        <video ref={videoRef} className="hd-feed" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hd-overlay" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
      </div>
    </div>
  );
}

export default App;
