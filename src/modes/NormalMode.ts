import { ModeBase } from './ModeBase';
import type { FilterBase } from '../filters/FilterBase';
import type { Hand, RectPoints } from '../core/types';
import { drawSkeleton, drawQuad } from '../utils/drawUtils';
import { VIDEO_CONFIG, GESTURE_CONFIG, COLORS } from '../core/constants';

type DrawState = 'IDLE' | 'DRAWING';

export class NormalMode extends ModeBase {
  name = 'Normal';
  filter: FilterBase | null = null;

  private currentRect: RectPoints | null = null;
  private lockedRect: RectPoints | null = null;
  private drawState: DrawState = 'IDLE';

  constructor(filter: FilterBase | null) {
    super();
    this.filter = filter;
  }

  update(hands: Hand[], _deltaTime: number) {
    let numPinchingStart = 0;

    hands.forEach((hand) => {
      const lm = hand.landmarks;
      const dist = Math.sqrt(
        Math.pow(lm[4].x - lm[8].x, 2) + 
        Math.pow(lm[4].y - lm[8].y, 2)
      );
      
      if (dist < GESTURE_CONFIG.PINCH_START) numPinchingStart++;
    });

    if (this.drawState === 'IDLE') {
      // Must explicitly start with 2 tight pinches
      if (numPinchingStart === 2 && hands.length === 2) {
        this.drawState = 'DRAWING';
      }
    } else if (this.drawState === 'DRAWING') {
      const isLost = hands.length < 2;

      // Keep drawing as long as both hands are in the camera view!
      // This allows the user to freely open their fingers to stretch the rectangle.
      if (!isLost) {
        // LIVE rectangle update
        const hL = hands.find(h => h.handedness === 'Left') || hands[0];
        const hR = hands.find(h => h.handedness === 'Right') || hands[1];
        
        const lmL = hL.landmarks;
        const lmR = hR.landmarks;

        this.currentRect = {
          p1: { x: lmL[4].x * VIDEO_CONFIG.WIDTH, y: lmL[4].y * VIDEO_CONFIG.HEIGHT },
          p2: { x: lmR[4].x * VIDEO_CONFIG.WIDTH, y: lmR[4].y * VIDEO_CONFIG.HEIGHT },
          p3: { x: lmR[8].x * VIDEO_CONFIG.WIDTH, y: lmR[8].y * VIDEO_CONFIG.HEIGHT },
          p4: { x: lmL[8].x * VIDEO_CONFIG.WIDTH, y: lmL[8].y * VIDEO_CONFIG.HEIGHT }
        };
      } else {
        // 🔥 LOCK the last rectangle via hand loss (dropping arms)
        if (this.currentRect) {
          this.lockedRect = this.currentRect;
        }

        this.currentRect = null;
        this.drawState = 'IDLE';
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    gl: WebGL2RenderingContext,
    video: HTMLVideoElement,
    hands: Hand[],
    time: number
  ) {
    const rectToUse = this.currentRect || this.lockedRect;

    if (rectToUse && this.filter && this.filter.isActive) {
      // Render WebGL pinned to rectangle
      this.filter.render({
        gl,
        rect: rectToUse,
        video,
        time,
        alpha: 1.0,
        resolution: [VIDEO_CONFIG.WIDTH, VIDEO_CONFIG.HEIGHT]
      });
    }

    ctx.clearRect(0, 0, VIDEO_CONFIG.WIDTH, VIDEO_CONFIG.HEIGHT);

    // Render 2D UI bound
    if (rectToUse) {
      const color = (this.drawState === 'DRAWING') ? COLORS.rectActive : (COLORS.rectSaved || COLORS.rectActive);
      drawQuad(ctx, rectToUse, color, 1.0);
    }

    // Render hand feedback
    hands.forEach((hand) => {
      const lm = hand.landmarks;
      const isDrawing = this.drawState === 'DRAWING';
      
      // Fingertip visual feedback
      drawSkeleton(ctx, lm, isDrawing);
    });
  }
}
