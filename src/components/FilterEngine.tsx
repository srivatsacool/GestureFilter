import { useEffect, useRef, forwardRef } from 'react';
import { VIDEO_CONFIG } from '../constants';
import type { FilterPlugin, InteractionState } from '../types';

interface FilterEngineProps {
  activeFilter: FilterPlugin;
  videoRef: React.RefObject<HTMLVideoElement>;
  interactionStateRef: React.RefObject<InteractionState>;
  onFrame?: () => void; // For external lifecycle syncing if needed
}

export const FilterEngine = forwardRef((props: FilterEngineProps, _ref) => {
  const { activeFilter, videoRef, interactionStateRef, onFrame } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rafRef = useRef<number>();
  
  // High-frequency mutable references to avoid closure stale state in RAF
  const activeFilterRef = useRef<FilterPlugin>(activeFilter);
  
  useEffect(() => {
    activeFilterRef.current = activeFilter;
  }, [activeFilter]);

  // Handle Context Initialization and Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', { 
      alpha: true, 
      antialias: true,
      premultipliedAlpha: false
    });
    if (!gl) return;
    glRef.current = gl;

    // Standard high-performance WebGL settings
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // Filter Lifecycle: Initial Init
    activeFilter.init(gl);

    activeFilter.init(gl);

    // Fixed Engine Resolution: Match MediaPipe tracking space (1280x720)
    // We let CSS/Browser handle scaling the canvas element to fit the screen.
    gl.canvas.width = VIDEO_CONFIG.WIDTH;
    gl.canvas.height = VIDEO_CONFIG.HEIGHT;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    activeFilterRef.current.resize?.(gl, gl.canvas.width, gl.canvas.height);

    // The IMPERATIVE Render Loop
    const render = (time: number) => {
      onFrame?.(); // Trigger hand tracking process

      const currentFilter = activeFilterRef.current;
      const video = videoRef.current;
      const state = interactionStateRef.current;

      if (gl && video && video.readyState === 4) {
        currentFilter.render({
          gl,
          rect: state?.currentRect || null,
          video,
          time: time * 0.001,
          alpha: state?.fadeAlpha || 0,
          resolution: [VIDEO_CONFIG.WIDTH, VIDEO_CONFIG.HEIGHT], // Stick to tracking space
        });
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (gl) activeFilter.dispose?.(gl);
    };
  }, []); // Only init once

  // Handle Filter Switching (Safe Lifecycle)
  const prevFilterId = useRef<string>(activeFilter.name);
  useEffect(() => {
    if (prevFilterId.current !== activeFilter.name && glRef.current) {
      const gl = glRef.current;
      
      // Cleanup previous
      // Note: We don't have access to the *previous* object easily here, 
      // but the registry ensures unique IDs.
      // Ideally, the Registry or App handles this.
      
      activeFilter.init(gl);
      prevFilterId.current = activeFilter.name;
    }
  }, [activeFilter]);

  return (
    <canvas 
      ref={canvasRef} 
      className="webgl-layer"
      width={VIDEO_CONFIG.WIDTH} 
      height={VIDEO_CONFIG.HEIGHT}
    />
  );
});

FilterEngine.displayName = 'FilterEngine';
