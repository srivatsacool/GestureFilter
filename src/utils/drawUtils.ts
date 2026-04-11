import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { VIDEO_CONFIG, COLORS } from '../constants';
import type { RectPoints } from '../types';

export function drawQuad(ctx: CanvasRenderingContext2D, rect: RectPoints, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.shadowBlur = 15;
  ctx.shadowColor = color;

  ctx.beginPath();
  ctx.moveTo(rect.p1.x, rect.p1.y);
  ctx.lineTo(rect.p2.x, rect.p2.y);
  ctx.lineTo(rect.p3.x, rect.p3.y);
  ctx.lineTo(rect.p4.x, rect.p4.y);
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.15;
  ctx.fill();

  // Corners
  ctx.globalAlpha = alpha;
  [rect.p1, rect.p2, rect.p3, rect.p4].forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function drawSkeleton(
    ctx: CanvasRenderingContext2D, 
    hand: NormalizedLandmark[], 
    isDrawing: boolean = false
) {
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17]
    ];

    ctx.save();

    connections.forEach((conn) => {
        const [s, e] = conn;
        const start = hand[s];
        const end = hand[e];
        if (!start || !end) return;

        const x1 = start.x * VIDEO_CONFIG.WIDTH;
        const y1 = start.y * VIDEO_CONFIG.HEIGHT;
        const x2 = end.x * VIDEO_CONFIG.WIDTH;
        const y2 = end.y * VIDEO_CONFIG.HEIGHT;

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, COLORS.hand_bone_start);
        gradient.addColorStop(0.5, COLORS.hand_bone_mid);
        gradient.addColorStop(1, COLORS.hand_bone_end);

        // Glow
        const isHighlight = isDrawing;
        ctx.strokeStyle = isHighlight ? 'rgba(0, 255, 0, 0.4)' : 'rgba(0, 243, 255, 0.2)';
        ctx.lineWidth = isHighlight ? 8 : 6;
        ctx.shadowBlur = isHighlight ? 30 : 20;
        ctx.shadowColor = isHighlight ? '#00ff00' : COLORS.hand_bone_mid;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Bone
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = gradient;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });

    hand.forEach((lm, idx) => {
        const x = lm.x * VIDEO_CONFIG.WIDTH;
        const y = lm.y * VIDEO_CONFIG.HEIGHT;

        let color = COLORS.middle_joints;

        if (idx === 0) color = COLORS.wrist;
        if (idx === 4 || idx === 8) {
          color = isDrawing ? (COLORS.rectSaved || '#00ff00') : COLORS.fingertips;
        }
        if ([12, 16, 20].includes(idx)) color = COLORS.accent_2;
        
        if (isDrawing) {
            ctx.shadowBlur = 40;
            ctx.shadowColor = '#00ff00';
        }

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.beginPath();
        const radius = [4, 8].includes(idx) ? 5 : 3.5;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}
