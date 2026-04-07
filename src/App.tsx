import { useState, useRef, useEffect, useCallback } from 'react';
import { useHandTracking } from './hooks/useHandTracking';
import { FilterEngine } from './components/FilterEngine';
import { SkeletonLayer } from './components/SkeletonLayer';
import { TerminalHUD } from './components/TerminalHUD';
import { getFilterById, DEFAULT_FILTER_ID } from './filters';
import { drawSkeleton, drawQuad } from './utils/drawUtils';
import { VIDEO_CONFIG, COLORS } from './constants';
import './App.css';

function App() {
  const [activeFilterId, setActiveFilterId] = useState(DEFAULT_FILTER_ID);
  const [fps, setFps] = useState(0);
  const frameCount = useRef({ count: 0, lastTime: performance.now() });
  
  const { 
    videoRef, 
    isModelLoaded, 
    handCount, 
    processFrame, 
    interactionStateRef,
    smoothLandmarksRef,
    pinchStatesRef,
  } = useHandTracking();

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  // Keyboard Switching Logic (1-9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') setActiveFilterId('dither');
      if (e.key === '2') setActiveFilterId('glitch');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Performance Monitoring (FPS)
  const updateFPS = useCallback(() => {
    frameCount.current.count++;
    const now = performance.now();
    if (now >= frameCount.current.lastTime + 1000) {
      setFps(Math.round((frameCount.current.count * 1000) / (now - frameCount.current.lastTime)));
      frameCount.current.lastTime = now;
      frameCount.current.count = 0;
    }
  }, []);

  const activeFilter = getFilterById(activeFilterId);

  return (
    <div className="hd-viewport">
      <TerminalHUD 
        isModelLoaded={isModelLoaded}
        fps={fps}
        handCount={handCount}
        activeFilterName={activeFilter.name}
      />

      <div className="media-container">
        {/* 1. Underlying Webcam Feed (Singleton) */}
        <video 
          ref={videoRef} 
          className="hd-feed" 
          playsInline 
          muted 
          autoPlay 
        />
        
        {/* 2. WebGL Filter Engine (Imperative) */}
        <FilterEngine 
          activeFilter={activeFilter}
          videoRef={videoRef}
          interactionStateRef={interactionStateRef}
          onFrame={() => {
            processFrame();
            updateFPS();
            
            // --- IMPERATIVE 2D OVERLAY RENDERING ---
            const canvas = overlayCanvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, VIDEO_CONFIG.WIDTH, VIDEO_CONFIG.HEIGHT);
                
                // 1. Draw Rect
                const state = interactionStateRef.current;
                if (state.currentRect) {
                  drawQuad(ctx, state.currentRect, COLORS.rectActive, state.fadeAlpha);
                }
                
                // 2. Draw Skeletons
                const hands = smoothLandmarksRef.current;
                const pinchStates = pinchStatesRef.current;
                hands.forEach((hand, idx) => {
                  drawSkeleton(ctx, hand, pinchStates[idx]);
                });
              }
            }
          }}
        />

        {/* 3. High-Fidelity Skeleton Overlay (2D Canvas) */}
        <SkeletonLayer 
          canvasRef={overlayCanvasRef}
        />
      </div>
    </div>
  );
}

export default App;
