import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { VIDEO_CONFIG, GESTURE_CONFIG } from '../constants';
import type { InteractionState, RectPoints } from '../types';

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [handCount, setHandCount] = useState(0);

  // High-frequency mutable state (60fps loop uses these directly)
  const interactionStateRef = useRef<InteractionState>({
    currentRect: null,
    fadeAlpha: 0,
  });

  const smoothLandmarksRef = useRef<NormalizedLandmark[][]>([]);
  const pinchStatesRef = useRef<[boolean, boolean]>([false, false]);
  const isDrawingRef = useRef(false);
  const fadeStartRef = useRef<number | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    const initModel = async () => {
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
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      setIsModelLoaded(true);
    };
    initModel();
  }, []);

  // Singleton Webcam Feed Initialization
  const setupWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: VIDEO_CONFIG.WIDTH, 
          height: VIDEO_CONFIG.HEIGHT, 
          frameRate: VIDEO_CONFIG.FPS 
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Webcam Access Denied:", err);
    }
  }, []);

  useEffect(() => { setupWebcam(); }, [setupWebcam]);

  // Core Processing Loop Logic
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !landmarker || video.readyState !== 4) return;

    const results = landmarker.detectForVideo(video, performance.now());
    const currentTime = performance.now();

    const sortedHands = results.landmarks 
      ? [...results.landmarks].sort((a, b) => a[0].x - b[0].x).slice(0, 2) 
      : [];

    setHandCount(sortedHands.length);

    // 1. UPDATE SMOOTHED LANDMARKS
    if (sortedHands.length > 0) {
      if (smoothLandmarksRef.current.length !== sortedHands.length) {
        smoothLandmarksRef.current = sortedHands;
      } else {
        smoothLandmarksRef.current = smoothLandmarksRef.current.map((smoothHand, hIdx) => {
          const targetHand = sortedHands[hIdx];
          return smoothHand.map((prev, lmIdx) => {
            const target = targetHand[lmIdx];
            return {
              x: prev.x + (target.x - prev.x) * GESTURE_CONFIG.LERP_FACTOR,
              y: prev.y + (target.y - prev.y) * GESTURE_CONFIG.LERP_FACTOR,
              z: prev.z + (target.z - prev.z) * (GESTURE_CONFIG.LERP_FACTOR * 0.5)
            } as NormalizedLandmark;
          });
        });
      }
    } else {
      smoothLandmarksRef.current = [];
    }

    // 2. PINCH DETECTION & RECT LOGIC
    let numPinching = 0;
    smoothLandmarksRef.current.forEach((hand, idx) => {
      const dist = Math.sqrt(Math.pow(hand[4].x - hand[8].x, 2) + Math.pow(hand[4].y - hand[8].y, 2));
      const wasPinching = pinchStatesRef.current[idx];
      const threshold = wasPinching ? GESTURE_CONFIG.STOP_PINCH_THRESHOLD : GESTURE_CONFIG.START_PINCH_THRESHOLD;
      const isPinching = dist < threshold;
      pinchStatesRef.current[idx] = isPinching;
      if (isPinching) numPinching++;
    });

    const bothPinching = numPinching === 2 && smoothLandmarksRef.current.length === 2;
    const wasDrawing = isDrawingRef.current;

    // State Machine
    if (!wasDrawing && bothPinching) {
      isDrawingRef.current = true;
      fadeStartRef.current = null;
    } else if (wasDrawing && !bothPinching) {
      isDrawingRef.current = false;
      fadeStartRef.current = currentTime;
    }

    // Update Persistent Rect State (Deterministic Ordering)
    if (isDrawingRef.current && smoothLandmarksRef.current.length === 2) {
      const hL = smoothLandmarksRef.current[0];
      const hR = smoothLandmarksRef.current[1];
      
      const nextRect: RectPoints = {
        p1: { x: hL[4].x * VIDEO_CONFIG.WIDTH, y: hL[4].y * VIDEO_CONFIG.HEIGHT }, // L Thumb
        p2: { x: hR[4].x * VIDEO_CONFIG.WIDTH, y: hR[4].y * VIDEO_CONFIG.HEIGHT }, // R Thumb
        p3: { x: hR[8].x * VIDEO_CONFIG.WIDTH, y: hR[8].y * VIDEO_CONFIG.HEIGHT }, // R Index
        p4: { x: hL[8].x * VIDEO_CONFIG.WIDTH, y: hL[8].y * VIDEO_CONFIG.HEIGHT }  // L Index
      };

      interactionStateRef.current.currentRect = nextRect;
      interactionStateRef.current.fadeAlpha = 1.0;
    } else if (fadeStartRef.current) {
      const elapsed = currentTime - fadeStartRef.current;
      const alpha = Math.max(0, 1 - (elapsed / GESTURE_CONFIG.FADE_DURATION));
      interactionStateRef.current.fadeAlpha = alpha;
      if (alpha === 0) {
        interactionStateRef.current.currentRect = null;
        fadeStartRef.current = null;
      }
    }
  }, []);

  return {
    videoRef,
    isModelLoaded,
    handCount,
    processFrame, 
    interactionStateRef,
    smoothLandmarksRef,
    pinchStatesRef,
  };
}
