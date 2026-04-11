import { useEffect, useRef, useState, useCallback } from 'react';
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { VIDEO_CONFIG, INFERENCE_CONFIG } from '../core/constants';
import type { TrackingData } from '../core/types';

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [handCount, setHandCount] = useState(0);

  // Downscale for performance (360p)
  const scaledCanvasRef = useRef<OffscreenCanvas | null>(null);
  const scaledCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(null);

  // Latest results for the 60 FPS rendering loop
  const latestResultsRef = useRef<TrackingData>({
    hands: [],
    timestamp: 0,
    fps: 0
  });

  // Initialize MediaPipe on Main Thread
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
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4
      });

      // Init offscreen canvas for downscaling
      scaledCanvasRef.current = new OffscreenCanvas(
        INFERENCE_CONFIG.INPUT_WIDTH, 
        INFERENCE_CONFIG.INPUT_HEIGHT
      );
      scaledCtxRef.current = scaledCanvasRef.current.getContext('2d');

      setIsModelLoaded(true);
    };
    initModel();

    return () => {
      landmarkerRef.current?.close();
    };
  }, []);

  // Setup Webcam (Standard)
  const setupWebcam = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: VIDEO_CONFIG.WIDTH, 
          height: VIDEO_CONFIG.HEIGHT, 
          frameRate: 30 
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

  // Optimized Inference: Throttled to 30 FPS and 360p
  const lastInferenceTimeRef = useRef(0);
  const processFrameOptimized = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const scaledCtx = scaledCtxRef.current;
    
    if (!video || !landmarker || video.readyState !== 4 || !isModelLoaded || !scaledCtx) return;

    const now = performance.now();
    // Throttle to 30 FPS
    if (now - lastInferenceTimeRef.current < (1000 / INFERENCE_CONFIG.UPDATE_FPS)) return;
    lastInferenceTimeRef.current = now;

    // 1. Downscale to 360p
    scaledCtx.drawImage(video, 0, 0, INFERENCE_CONFIG.INPUT_WIDTH, INFERENCE_CONFIG.INPUT_HEIGHT);
    
    // 2. Inference
    const results = landmarker.detectForVideo(scaledCanvasRef.current!, now);
    
    // 3. Update Ref for main loop
    latestResultsRef.current = {
      hands: (results.landmarks || []).map((lm, i) => ({
        landmarks: lm,
        handedness: results.handedness?.[i]?.[0]?.categoryName as 'Left' | 'Right'
      })),
      timestamp: now,
      fps: INFERENCE_CONFIG.UPDATE_FPS
    };
    setHandCount(results.landmarks?.length || 0);
  }, [isModelLoaded]);

  return {
    videoRef,
    isModelLoaded,
    handCount,
    latestResultsRef,
    processFrameOptimized
  };
}
