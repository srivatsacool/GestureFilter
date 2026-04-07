import { VIDEO_CONFIG } from '../constants';

interface SkeletonLayerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export function SkeletonLayer({ canvasRef }: SkeletonLayerProps) {
  return (
    <canvas 
      ref={canvasRef} 
      className="hd-overlay" 
      width={VIDEO_CONFIG.WIDTH} 
      height={VIDEO_CONFIG.HEIGHT} 
    />
  );
}
