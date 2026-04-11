import { useEffect, useRef, forwardRef } from 'react';
import { VIDEO_CONFIG } from '../core/constants';

interface FilterEngineProps {
  onContextReady?: (gl: WebGL2RenderingContext) => void;
}

export const FilterEngine = forwardRef((props: FilterEngineProps, _ref) => {
  const { onContextReady } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

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

    // Initial Resolution
    gl.canvas.width = VIDEO_CONFIG.WIDTH;
    gl.canvas.height = VIDEO_CONFIG.HEIGHT;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    if (onContextReady) {
      onContextReady(gl);
    }
  }, []);

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
