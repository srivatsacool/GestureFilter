import { ModeBase } from './ModeBase';
import type { FilterBase } from '../filters/FilterBase';
import type { Hand, FingerStates } from '../core/types';
import { drawSkeleton } from '../utils/drawUtils';
import { VIDEO_CONFIG, GESTURE_CONFIG } from '../core/constants';

export class NumberDetectionMode extends ModeBase {
  name = 'Number Detection';
  filter: FilterBase | null = null; // Number detection usually doesn't apply a filter by default

  private detectedNumber: number | null = null;
  private confidence = 0;
  private gestureHistory: number[] = [];

  constructor(filter: FilterBase | null = null) {
    super();
    this.filter = filter;
  }

  update(hands: Hand[], _deltaTime: number) {
    const rawNumber = this.detectNumberGesture(hands);
    
    if (rawNumber !== null) {
      this.gestureHistory.push(rawNumber);
      // Keep only enough history for the hold duration (30 FPS tracking * 0.5s = ~15 frames)
      const maxHistory = Math.ceil(GESTURE_CONFIG.HOLD_DURATION / (1000 / 30));
      if (this.gestureHistory.length > maxHistory) {
        this.gestureHistory.shift();
      }

      // Check for consistency
      const counts: Record<number, number> = {};
      this.gestureHistory.forEach(n => counts[n] = (counts[n] || 0) + 1);
      
      const mostFrequent = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const count = mostFrequent ? mostFrequent[1] : 0;
      const freqNum = mostFrequent ? parseInt(mostFrequent[0]) : null;

      if (count >= maxHistory * 0.7) { // 70% consistency
        this.detectedNumber = freqNum;
        this.confidence = count / maxHistory;
      }
    } else {
      this.gestureHistory = [];
      this.detectedNumber = null;
      this.confidence = 0;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    _gl: WebGL2RenderingContext,
    _video: HTMLVideoElement,
    hands: Hand[],
    _time: number
  ) {
    // 1. (Optional) Filter rendering - usually none for detection
    if (this.filter && this.filter.isActive) {
       // Typically we don't render a quad filter in this mode unless specified
    }

    // 2. Overlay Rendering
    ctx.clearRect(0, 0, VIDEO_CONFIG.WIDTH, VIDEO_CONFIG.HEIGHT);

    // Draw Skeletons
    hands.forEach((hand) => {
      drawSkeleton(ctx, hand.landmarks, false);
    });

    // Draw Detected Number
    if (this.detectedNumber !== null) {
      ctx.save();
      
      // The canvas is flipped horizontally via CSS to act as a mirror.
      // We flip the context back so that text and UI elements render normally.
      ctx.translate(VIDEO_CONFIG.WIDTH, 0);
      ctx.scale(-1, 1);

      ctx.font = 'bold 120px monospace';
      ctx.fillStyle = '#00ffff';
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#00ffff';
      ctx.textAlign = 'center';
      
      // Draw behind the hands or in center? Let's put in top-center
      ctx.fillText(this.detectedNumber.toString(), VIDEO_CONFIG.WIDTH / 2, 200);
      
      // Confidence Bar
      const barWidth = 200;
      const barHeight = 10;
      const x = (VIDEO_CONFIG.WIDTH / 2) - (barWidth / 2);
      const y = 220;
      
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(x, y, barWidth * this.confidence, barHeight);
      ctx.restore();
    }
  }

  private detectNumberGesture(hands: Hand[]): number | null {
    if (hands.length === 0) return null;

    const fingerStates = hands.map(hand => this.getFingerStates(hand));
    
    // 1-5 with single hand
    if (hands.length === 1) {
      const f = fingerStates[0];
      if (f.index && !f.middle && !f.ring && !f.pinky) return 1;
      if (f.index && f.middle && !f.ring && !f.pinky) return 2;
      if (f.index && f.middle && f.ring && !f.pinky) return 3;
      if (f.index && f.middle && f.ring && f.pinky && !f.thumb) return 4;
      if (f.index && f.middle && f.ring && f.pinky && f.thumb) return 5;
    }

    // 6-10 with dual hands or specific combinations
    if (hands.length === 2) {
      // Helper: count total fingers up across both hands
      const totalUp = fingerStates.reduce((acc, f) => {
        return acc + (f.index ? 1 : 0) + (f.middle ? 1 : 0) + (f.ring ? 1 : 0) + (f.pinky ? 1 : 0) + (f.thumb ? 1 : 0);
      }, 0);

      // Simple implementation: total count of fingers up across 2 hands
      if (totalUp >= 6 && totalUp <= 10) return totalUp;
    }

    return null;
  }

  private getFingerStates(hand: Hand): FingerStates {
    const lm = hand.landmarks;
    // A finger is "up" if its tip is further from the wrist than its base/pip joint
    // For hand landmarks: wrist is 0, tips are 4, 8, 12, 16, 20
    const isUp = (tip: number, pip: number) => lm[tip].y < lm[pip].y;

    return {
      thumb: this.isThumbUp(hand),
      index: isUp(8, 6),
      middle: isUp(12, 10),
      ring: isUp(16, 14),
      pinky: isUp(20, 18)
    };
  }

  private isThumbUp(hand: Hand): boolean {
    const lm = hand.landmarks;
    // Thumb is trickier: check X distance or relative Y depending on hand orientation
    // Simple heuristic: distance from wrist
    const wrist = lm[0];
    const thumbTip = lm[4];
    const thumbBase = lm[2];
    
    // For now, simple Y-based or distance based
    return Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbBase.x - wrist.x);
  }
}
