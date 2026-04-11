import type { Hand } from '../core/types';
import type { FilterBase } from '../filters/FilterBase';

export abstract class ModeBase {
  abstract name: string;
  abstract filter: FilterBase | null;

  abstract update(hands: Hand[], deltaTime: number): void;
  abstract render(
    ctx: CanvasRenderingContext2D, // For 2D skeleton rendering
    gl: WebGL2RenderingContext, // For WebGL filter rendering
    video: HTMLVideoElement,
    hands: Hand[],
    time: number
  ): void;
}
