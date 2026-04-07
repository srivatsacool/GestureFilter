import type { FilterPlugin } from '../types';
import { DitherMod } from './DitherMod';
import { GlitchMod } from './GlitchMod';

export const filterRegistry: Record<string, FilterPlugin> = {
  'dither': new DitherMod(),
  'glitch': new GlitchMod(),
};

export const DEFAULT_FILTER_ID = 'dither';

export function getFilterById(id: string): FilterPlugin {
  return filterRegistry[id] || filterRegistry[DEFAULT_FILTER_ID];
}
