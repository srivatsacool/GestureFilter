import { DitherFilter } from './DitherFilter';
import { GlitchFilter } from './GlitchFilter';
import { DrunkFilter } from './DrunkFilter';
import type { FilterBase } from './FilterBase';

export const filterRegistry: Record<string, FilterBase> = {
  'dither': new DitherFilter(),
  'glitch': new GlitchFilter(),
  'drunk': new DrunkFilter(),
};

export const DEFAULT_FILTER_ID = 'dither';

export function getFilterById(id: string): FilterBase {
  return filterRegistry[id] || filterRegistry[DEFAULT_FILTER_ID];
}

export * from './FilterBase';
export * from './DitherFilter';
export * from './GlitchFilter';
export * from './DrunkFilter';
