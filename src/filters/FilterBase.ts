import type { FilterRenderContext } from '../core/types';

export abstract class FilterBase {
  abstract name: string;
  abstract isActive: boolean;

  abstract init(gl: WebGL2RenderingContext): void;
  
  update?(deltaTime: number): void;

  abstract render(ctx: FilterRenderContext): void;

  abstract cleanup(gl: WebGL2RenderingContext): void;
}
