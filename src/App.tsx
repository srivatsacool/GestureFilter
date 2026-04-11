import { useState, useRef, useEffect, useCallback } from 'react';
import { useHandTracking } from './hooks/useHandTracking';
import { ControlPanel } from './components/ControlPanel';
import { FilterEngine } from './components/FilterEngine';
import { SkeletonLayer } from './components/SkeletonLayer';
import { getFilterById, DEFAULT_FILTER_ID } from './filters';
import { NormalMode, NumberDetectionMode, ModeBase } from './modes';
import { HandStabilizer } from './core/utils/HandStabilizer';
import './App.css';

function App() {
  // 1. Core State
  const [activeFilterId, setActiveFilterId] = useState(DEFAULT_FILTER_ID);
  const [activeMode, setActiveMode] = useState<ModeBase>(new NormalMode(getFilterById(DEFAULT_FILTER_ID)));
  const [fps, setFps] = useState(0);
  
  // 2. Tracking Hook (Inference throttled to 30 FPS at 360p)
  const { 
    videoRef, 
    isModelLoaded, 
    handCount, 
    latestResultsRef,
    processFrameOptimized 
  } = useHandTracking();

  // 3. Rendering Refs
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rafRef = useRef<number>();
  
  // Tracking Stability Layer (Ghosting + Smoothing + Identity)
  const stabilizerRef = useRef(new HandStabilizer());
  const lastUpdateRef = useRef<number>(performance.now());
  const frameStatsRef = useRef({ count: 0, lastTime: performance.now() });

  // 4. Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') {
        const filter = getFilterById('dither');
        setActiveFilterId('dither');
        setActiveMode(new NormalMode(filter));
      }
      if (e.key === '2') {
        const filter = getFilterById('glitch');
        setActiveFilterId('glitch');
        setActiveMode(new NormalMode(filter));
      }
      if (e.key === '3') {
        const filter = getFilterById('drunk');
        setActiveFilterId('drunk');
        setActiveMode(new NormalMode(filter));
      }
      if (e.key === 'm') {
        setActiveMode(new NumberDetectionMode());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 5. Initialize WebGL on active mode change
  useEffect(() => {
    if (glRef.current && activeMode.filter) {
      activeMode.filter.init(glRef.current);
    }
  }, [activeMode]);

  // 6. Main Interleaved Loop (60 FPS)
  const animate = useCallback((time: number) => {
    const now = performance.now();
    const deltaTime = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;

    // A. Trigger Optimized Inference (throttled inside hook to 30 FPS)
    processFrameOptimized();

    // B. Get Results & Stabilize (Ghosting + Smoothing + Identity)
    const rawHands = latestResultsRef.current.hands;
    const stabilizedHands = stabilizerRef.current.update(rawHands);

    // C. Update Current Mode
    activeMode.update(stabilizedHands, deltaTime);

    // D. Render Current Mode
    const ctx = overlayCanvasRef.current?.getContext('2d');
    const gl = glRef.current;
    const video = videoRef.current;

    if (ctx && gl && video && video.readyState === 4) {
      activeMode.render(ctx, gl, video, stabilizedHands, time * 0.001);
    }

    // E. FPS Tracking
    frameStatsRef.current.count++;
    if (now >= frameStatsRef.current.lastTime + 1000) {
      setFps(Math.round((frameStatsRef.current.count * 1000) / (now - frameStatsRef.current.lastTime)));
      frameStatsRef.current.lastTime = now;
      frameStatsRef.current.count = 0;
    }

    rafRef.current = requestAnimationFrame(animate);
  }, [activeMode, processFrameOptimized]);

  const [isUiVisible, setIsUiVisible] = useState(true);

  // Start/Stop Loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [animate]);

  return (
    <div className="hd-viewport">
      {isUiVisible && (
        <ControlPanel 
          isModelLoaded={isModelLoaded}
          fps={fps}
          handCount={handCount}
          activeFilterId={activeFilterId}
          activeModeName={activeMode.name}
          onFilterChange={setActiveFilterId}
          onModeChange={setActiveMode}
        />
      )}

      {/* Floating Toggle Button */}
      <button 
        className={`ui-toggle-btn ${!isUiVisible ? 'hidden-mode' : ''}`}
        onClick={() => setIsUiVisible(!isUiVisible)}
        title={isUiVisible ? "Hide UI" : "Show UI"}
      >
        {isUiVisible ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>

      <div className="media-container">
        <video 
          ref={videoRef} 
          className="hd-feed" 
          playsInline 
          muted 
          autoPlay 
        />
        
        <FilterEngine 
          onContextReady={(gl) => {
            glRef.current = gl;
            activeMode.filter?.init(gl);
          }}
        />

        <SkeletonLayer 
          canvasRef={overlayCanvasRef}
        />
      </div>
    </div>
  );
}

export default App;
