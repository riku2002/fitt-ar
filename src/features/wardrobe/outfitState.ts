import { filterGarments, getGarmentSlot } from './garments'
import type { Garment, GarmentFilter, GarmentSlot } from './garments'

export interface OutfitState {
  focus: GarmentSlot
  filter: GarmentFilter
  selected: Record<GarmentSlot, string | null>
}

export type OutfitAction =
  | { type: 'focus'; slot: GarmentSlot }
  | { type: 'filter'; filter: GarmentFilter }
  | { type: 'select'; id: string }
  | { type: 'cycle'; direction: 'next' | 'previous' }
  | { type: 'clear'; slot: GarmentSlot }

export function createOutfitState(catalog: readonly Garment[]): OutfitState {
  return {
    focus: 'tops',
    filter: 'all',
    selected: {
      tops: catalog.find(item => getGarmentSlot(item.category) === 'tops')?.id ?? null,
      bottoms: null,
      onepiece: null,
    },
  }
}

export function getFocusedGarments(
  state: OutfitState,
  catalog: readonly Garment[],
): readonly Garment[] {
  return filterGarments(catalog, state.filter).filter(
    item => getGarmentSlot(item.category) === state.focus,
  )
}

export function getWornGarments(
  state: OutfitState,
  catalog: readonly Garment[],
): readonly Garment[] {
  const slots: GarmentSlot[] = state.selected.onepiece
    ? ['onepiece']
    : ['tops', 'bottoms']
  return slots.flatMap(slot => {
    const item = catalog.find(candidate => candidate.id === state.selected[slot])
    return item && getGarmentSlot(item.category) === slot ? [item] : []
  })
}

/** Pure, atomic transitions. Changing a browsing tab/filter does not undress. */
export function reduceOutfit(
  state: OutfitState,
  action: OutfitAction,
  catalog: readonly Garment[],
): OutfitState {
  if (action.type === 'focus') {
    return action.slot === state.focus ? state : { ...state, focus: action.slot }
  }
  if (action.type === 'filter') {
    return action.filter === state.filter ? state : { ...state, filter: action.filter }
  }
  if (action.type === 'clear') {
    return state.selected[action.slot] === null ? state : {
      ...state,
      selected: { ...state.selected, [action.slot]: null },
    }
  }

  const candidates = getFocusedGarments(state, catalog)
  let item: Garment | undefined
  if (action.type === 'select') {
    item = candidates.find(candidate => candidate.id === action.id)
  } else {
    if (candidates.length === 0) return state
    const current = candidates.findIndex(candidate => candidate.id === state.selected[state.focus])
    const index = current < 0
      ? (action.direction === 'next' ? 0 : candidates.length - 1)
      : (current + (action.direction === 'next' ? 1 : -1) + candidates.length) % candidates.length
    item = candidates[index]
  }
  if (!item) return state
  const slot = getGarmentSlot(item.category)
  if (state.selected[slot] === item.id) return state
  return {
    ...state,
    selected: slot === 'onepiece'
      ? { tops: null, bottoms: null, onepiece: item.id }
      : { ...state.selected, [slot]: item.id, onepiece: null },
  }
}
