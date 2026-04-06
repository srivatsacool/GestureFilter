import { useEffect, useRef, useState, useCallback } from 'react'
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import * as twgl from 'twgl.js'
import './App.css'

// Configuration
const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const START_PINCH_THRESHOLD = 0.25; // Threshold to BEGIN a pinch
const STOP_PINCH_THRESHOLD = 0.50;  // Threshold to BREAK a pinch (Hysteresis)
const FADE_DURATION = 500;   // 500ms fade-out
const GRID_SIZE = 20;        // 20x20 grid (800 triangles)
const LERP_FACTOR = 0.12;    // Reduced from 0.25 for buttery smooth movement

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

// --- GS2.4 Shader Source (True Portal Mode) ---
const VS_SOURCE = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
uniform vec2 u_resolution;
out vec2 v_texCoord;
out vec2 v_videoCoord;

void main() {
  v_texCoord = a_texCoord;
  v_videoCoord = a_position / u_resolution;
  vec2 zeroToOne = a_position / u_resolution;
  vec2 zeroToTwo = zeroToOne * 2.0;
  vec2 clipSpace = zeroToTwo - 1.0;
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
}`;

const FS_SOURCE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_alpha;
uniform sampler2D u_video;
in vec2 v_texCoord;
in vec2 v_videoCoord;

#define CELL_W      6.0
#define CELL_H      4.0

float shapeResponse(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x;
}

void main() {
    // True Portal Mode: Use screen-space v_videoCoord for sampling
    vec2 fragCoord = v_videoCoord * u_resolution;
    
    vec2 cellSize = vec2(CELL_W, CELL_H);
    vec2 cell = floor(fragCoord / cellSize);
    vec2 cellOrigin = cell * cellSize;
    vec2 localFrac = (fragCoord - cellOrigin) / cellSize;

    int qx = int(localFrac.x * 3.0);
    int qy = int(localFrac.y * 2.0);

    vec2 cellCenter = cellOrigin + cellSize * 0.5;
    vec3 cellCol = texture(u_video, cellCenter / u_resolution).rgb;

    int ch0 = 0, ch1 = 1, ch2 = 2;
    if (cellCol[1] > cellCol[0]) { ch0 = 1; ch1 = 0; }
    if (cellCol[2] > cellCol[ch0]) { ch2 = ch0; ch0 = 2; }
    else if (cellCol[2] > cellCol[ch1]) { ch2 = ch1; ch1 = 2; }

    int role;
    if (qx == 1)      role = ch1;  
    else if (qy == 0) role = ch0;  
    else               role = ch2;  

    vec2 subSize = cellSize / vec2(3.0, 2.0);
    vec2 subOrigin = cellOrigin + vec2(float(qx), float(qy)) * subSize;
    vec2 sampleCoord = subOrigin + subSize * 0.5;
    vec3 subCol = texture(u_video, sampleCoord / u_resolution).rgb;
    float val = shapeResponse(subCol[role]);

    vec2 inSub = fragCoord - subOrigin;
    int idx = int(inSub.x) + int(inSub.y) * 2;

    float threshold;
    if      (idx == 0) threshold = 0.2;
    else if (idx == 3) threshold = 0.4;
    else if (idx == 2) threshold = 0.6;
    else               threshold = 0.8;

    float on = step(threshold, val);
    fragColor = vec4(vec3(on), u_alpha);
}
`;

const SHADER_SETTINGS = {
  u_size: 8.0 // Pixel size
};

// Utilities


// Bilinear interpolation for grid vertex generation
const getGridPoint = (p1: Point2D, p2: Point2D, p3: Point2D, p4: Point2D, u: number, v: number): Point2D => {
  const leftX = p1.x + (p4.x - p1.x) * v;
  const leftY = p1.y + (p4.y - p1.y) * v;
  const rightX = p2.x + (p3.x - p2.x) * v;
  const rightY = p2.y + (p3.y - p2.y) * v;
  return {
    x: leftX + (rightX - leftX) * u,
    y: leftY + (rightY - leftY) * u
  };
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
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const webglRef = useRef<{
    gl: WebGL2RenderingContext;
    programInfo: twgl.ProgramInfo;
    bufferInfo: twgl.BufferInfo;
    textures: { [key: string]: WebGLTexture };
  } | null>(null);

  // Unified Interaction State
  const interactionRef = useRef({
    currentRect: null as RectPoints | null,
    fadeStart: null as number | null,
    isFading: false,
    isDrawing: false,
    handLandmarks: [] as NormalizedLandmark[][], // PERSISTENT SMOOTHED LANDMARKS
    pinchStates: [false, false] as [boolean, boolean] // Per-hand pinch hysteresis
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

  // Initialize WebGL (TWGL)
  useEffect(() => {
    const canvas = glCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { alpha: true });
    if (!gl) return;

    try {
      const programInfo = twgl.createProgramInfo(gl, [VS_SOURCE, FS_SOURCE]);
      
      // 1. Generate Static Grid UVs and Indices
      const numVerts = (GRID_SIZE + 1) * (GRID_SIZE + 1);
      const texCoords = new Float32Array(numVerts * 2);
      const indices = new Uint16Array(GRID_SIZE * GRID_SIZE * 6);

      for (let y = 0; y <= GRID_SIZE; y++) {
        for (let x = 0; x <= GRID_SIZE; x++) {
          const i = (y * (GRID_SIZE + 1) + x) * 2;
          texCoords[i] = x / GRID_SIZE;
          texCoords[i + 1] = 1.0 - (y / GRID_SIZE); // Flip Y for WebGL texture alignment
        }
      }

      let idx = 0;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const p1 = y * (GRID_SIZE + 1) + x;
          const p2 = p1 + 1;
          const p3 = (y + 1) * (GRID_SIZE + 1) + x;
          const p4 = p3 + 1;
          indices[idx++] = p1; indices[idx++] = p2; indices[idx++] = p4;
          indices[idx++] = p1; indices[idx++] = p4; indices[idx++] = p3;
        }
      }

      // 2. Create Dynamic Position Buffer
      const bufferInfo = twgl.createBufferInfoFromArrays(gl, {
        a_position: { numComponents: 2, data: new Float32Array(numVerts * 2), drawType: gl.DYNAMIC_DRAW },
        a_texCoord: { numComponents: 2, data: texCoords },
        indices: { numComponents: 3, data: indices },
      });

      const textures = twgl.createTextures(gl, {
        u_video: { src: [0, 0, 0, 255], format: gl.RGBA, min: gl.LINEAR, mag: gl.LINEAR, wrap: gl.CLAMP_TO_EDGE }
      });

      webglRef.current = { gl, programInfo, bufferInfo, textures };
    } catch (err) {
      console.error("WebGL Init Error:", err);
    }

    return () => {
      // Cleanup
      webglRef.current = null;
    };
  }, [isModelLoaded]); // Init after model/container are ready

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
          const sortedHands = results.landmarks 
            ? [...results.landmarks].sort((a, b) => a[0].x - b[0].x).slice(0, 2) 
            : [];

          // 1. UPDATE SMOOTHED LANDMARKS (Full hand jitter reduction)
          if (sortedHands.length > 0) {
            if (interactionRef.current.handLandmarks.length !== sortedHands.length) {
              // Rapid reset if hand count changes
              interactionRef.current.handLandmarks = sortedHands;
            } else {
              // Apply LERP to every single joint
              interactionRef.current.handLandmarks = interactionRef.current.handLandmarks.map((smoothHand, hIdx) => {
                const targetHand = sortedHands[hIdx];
                return smoothHand.map((prev, lmIdx) => {
                  const target = targetHand[lmIdx];
                  return {
                    x: prev.x + (target.x - prev.x) * LERP_FACTOR,
                    y: prev.y + (target.y - prev.y) * LERP_FACTOR,
                    z: prev.z + (target.z - prev.z) * (LERP_FACTOR * 0.5) // Z is usually noisier
                  } as NormalizedLandmark;
                });
              });
            }
          } else {
            interactionRef.current.handLandmarks = [];
          }

          const activeHands = interactionRef.current.handLandmarks;

          if (activeHands.length > 0) {
            setHandCount(activeHands.length);
            activeHands.forEach((hand, idx) => {
              const dist = getDistance(hand[4], hand[8]);
              
              // Per-hand hysteresis
              const wasPinching = interactionRef.current.pinchStates[idx];
              const threshold = wasPinching ? STOP_PINCH_THRESHOLD : START_PINCH_THRESHOLD;
              const isPinching = dist < threshold;
              
              interactionRef.current.pinchStates[idx] = isPinching;
              if (isPinching) numPinching++;
              
              drawSkeleton(ctx, hand, isPinching);
            });
          } else {
            setHandCount(0);
            interactionRef.current.pinchStates = [false, false];
          }

          const bothPinching = numPinching === 2 && sortedHands.length === 2;
          const wasDrawing = interactionRef.current.isDrawing;

          // Drawing State Machine
          if (!wasDrawing && bothPinching && results.landmarks.length === 2) {
            // ENTER_DRAWING
            interactionRef.current.isDrawing = true;
            interactionRef.current.isFading = false;
          } else if (wasDrawing && (activeHands.length < 2 || !bothPinching)) {
            // EXIT_DRAWING
            interactionRef.current.isDrawing = false;
            if (interactionRef.current.currentRect) {
              interactionRef.current.fadeStart = currentTime;
              interactionRef.current.isFading = true;
            }
          }

          // Update currentRect with LERP smoothing
          if (interactionRef.current.isDrawing && activeHands.length === 2) {
            const hL = activeHands[0];
            const hR = activeHands[1];
            
            // Note: landmarks are already smoothed via handLandmarks LERP
            const targetPoints = {
              p1: { x: hL[4].x * VIDEO_WIDTH, y: hL[4].y * VIDEO_HEIGHT },
              p2: { x: hR[4].x * VIDEO_WIDTH, y: hR[4].y * VIDEO_HEIGHT },
              p3: { x: hR[8].x * VIDEO_WIDTH, y: hR[8].y * VIDEO_HEIGHT },
              p4: { x: hL[8].x * VIDEO_WIDTH, y: hL[8].y * VIDEO_HEIGHT }
            };

            interactionRef.current.currentRect = targetPoints;
          }

          // RENDER PRIORITY: Live > Faded

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

        // --- WebGL ASCII Rendering Layer ---
        if (webglRef.current) {
          const { gl, programInfo, bufferInfo, textures } = webglRef.current;
          let targetRect = null;
          let currentAlpha = 0;

          if (interactionRef.current.currentRect) {
            targetRect = interactionRef.current.currentRect;
            if (interactionRef.current.isFading && interactionRef.current.fadeStart) {
              const elapsed = performance.now() - interactionRef.current.fadeStart;
              currentAlpha = Math.max(0, 1 - (elapsed / FADE_DURATION));
            } else if (interactionRef.current.isDrawing) {
              currentAlpha = 1.0;
            }
          }

          if (targetRect && currentAlpha > 0) {
            const { p1, p2, p3, p4 } = targetRect;
            
            // Generate Mesh Subdivision via Bilinear Interpolation
            const numVerts = (GRID_SIZE + 1) * (GRID_SIZE + 1);
            const positions = new Float32Array(numVerts * 2);
            
            for (let y = 0; y <= GRID_SIZE; y++) {
              const v = y / GRID_SIZE;
              for (let x = 0; x <= GRID_SIZE; x++) {
                const u = x / GRID_SIZE;
                const point = getGridPoint(p1, p2, p3, p4, u, v);
                const i = (y * (GRID_SIZE + 1) + x) * 2;
                positions[i] = point.x;
                positions[i + 1] = point.y;
              }
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, bufferInfo.attribs!.a_position.buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);

            gl.viewport(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
            twgl.setTextureFromElement(gl, textures.u_video, video);
            gl.useProgram(programInfo.program);
            twgl.setBuffersAndAttributes(gl, programInfo, bufferInfo);
            twgl.setUniforms(programInfo, {
              u_time: performance.now() * 0.001,
              u_resolution: [VIDEO_WIDTH, VIDEO_HEIGHT],
              u_alpha: currentAlpha,
              u_video: textures.u_video,
              ...SHADER_SETTINGS,
            });
            twgl.drawBufferInfo(gl, bufferInfo);
          } else {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
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

        <code style={{ fontSize: '0.7rem', opacity: 0.6, lineHeight: '1.4' }}>
          {">"} PINCH_DUAL: CREATE_QUAD<br/>
          {">"} RELEASE: AUTO_FADE_500MS<br/>
          {">"} SYSTEM: REALTIME_MODE
        </code>
      </div>

      <div className="media-container">
        <video ref={videoRef} className="hd-feed" playsInline muted autoPlay />
        <canvas ref={glCanvasRef} className="webgl-layer" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
        <canvas ref={canvasRef} className="hd-overlay" width={VIDEO_WIDTH} height={VIDEO_HEIGHT} />
      </div>
    </div>
  );
}

export default App;
