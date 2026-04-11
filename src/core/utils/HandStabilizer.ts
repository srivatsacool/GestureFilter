import type { Hand } from '../types';
import { GESTURE_CONFIG } from '../constants';

export interface StabilizedHand extends Hand {
  lastSeen: number;
}

export class HandStabilizer {
  private leftHand: StabilizedHand | null = null;
  private rightHand: StabilizedHand | null = null;

  // Configuration from constants or defaults
  private HAND_TIMEOUT = GESTURE_CONFIG.LOCKED_TIMEOUT || 300; // ms (prediction window)
  private SMOOTHING = GESTURE_CONFIG.LERP_FACTOR || 0.35;

  update(rawHands: Hand[]): StabilizedHand[] {
    const now = performance.now();

    // Step 1: classify hands by handedness
    let detectedLeft: Hand | null = null;
    let detectedRight: Hand | null = null;

    for (const hand of rawHands) {
      if (hand.handedness === 'Left') {
        detectedLeft = hand;
      } else if (hand.handedness === 'Right') {
        detectedRight = hand;
      }
    }

    // Step 2: update LEFT hand
    if (detectedLeft) {
      this.leftHand = this.smoothHand(this.leftHand, detectedLeft, now);
    }

    // Step 3: update RIGHT hand
    if (detectedRight) {
      this.rightHand = this.smoothHand(this.rightHand, detectedRight, now);
    }

    // Step 4: ghost prediction (holding state after loss)
    const output: StabilizedHand[] = [];

    if (this.leftHand && now - this.leftHand.lastSeen < this.HAND_TIMEOUT) {
      output.push(this.leftHand);
    }

    if (this.rightHand && now - this.rightHand.lastSeen < this.HAND_TIMEOUT) {
      output.push(this.rightHand);
    }

    // Ensure consistent order in output (Left then Right)
    // This prevents ROI flipping if MediaPipe swaps the order in their array
    return output.sort((a, _b) => (a.handedness === 'Left' ? -1 : 1));
  }

  private smoothHand(prev: StabilizedHand | null, current: Hand, now: number): StabilizedHand {
    if (!prev) {
      return {
        ...current,
        lastSeen: now
      };
    }

    // Landmark-by-landmark smoothing
    const smoothedLandmarks = prev.landmarks.map((p, i) => {
      const t = current.landmarks[i];
      if (!t) return p;

      return {
        x: p.x + (t.x - p.x) * this.SMOOTHING,
        y: p.y + (t.y - p.y) * this.SMOOTHING,
        z: p.z + (t.z - p.z) * this.SMOOTHING
      } as any;
    });

    return {
      landmarks: smoothedLandmarks,
      handedness: current.handedness,
      lastSeen: now
    };
  }
}
