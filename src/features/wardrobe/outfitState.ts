import { filterGarments, getGarmentSlot } from './garments'
import type { Garment, GarmentFilter, GarmentSlot } from './garments'

export interface OutfitState {
  focus: GarmentSlot
  filter: GarmentFilter
  selected: Record<GarmentSlot, string | null>
}

export type OutfitAction =
  | { type: 'focus'; slot: GarmentSlot }
  | { type: 'toggle-focus' }
  | { type: 'filter'; filter: GarmentFilter }
  | { type: 'select'; id: string }
  | { type: 'cycle'; direction: 'next' | 'previous' }
  | { type: 'clear'; slot: GarmentSlot }

function garmentById(
  catalog: readonly Garment[],
  id: string | null,
): Garment | undefined {
  return id == null
    ? undefined
    : catalog.find((item) => item.id === id)
}

function isOnepieceId(
  catalog: readonly Garment[],
  id: string | null,
): boolean {
  return garmentById(catalog, id)?.category === 'onepiece'
}

export function createOutfitState(catalog: readonly Garment[]): OutfitState {
  const defaultTop =
    catalog.find(
      (item) =>
        getGarmentSlot(item.category) === 'tops' &&
        item.category !== 'onepiece',
    ) ??
    catalog.find((item) => getGarmentSlot(item.category) === 'tops')

  return {
    focus: 'tops',
    filter: 'all',
    selected: {
      tops: defaultTop?.id ?? null,
      bottoms: null,
    },
  }
}

export function getFocusedGarments(
  state: OutfitState,
  catalog: readonly Garment[],
): readonly Garment[] {
  return filterGarments(catalog, state.filter).filter(
    (item) => getGarmentSlot(item.category) === state.focus,
  )
}

export function getWornGarments(
  state: OutfitState,
  catalog: readonly Garment[],
): readonly Garment[] {
  const top = garmentById(catalog, state.selected.tops)

  // A onepiece occupies the tops slot but is full-body. Keep any selected
  // bottom in state as wardrobe memory, while suppressing it from rendering.
  if (top?.category === 'onepiece') {
    return [top]
  }

  const bottom = garmentById(catalog, state.selected.bottoms)
  const worn: Garment[] = []

  if (top && getGarmentSlot(top.category) === 'tops') {
    worn.push(top)
  }

  if (bottom && getGarmentSlot(bottom.category) === 'bottoms') {
    worn.push(bottom)
  }

  return worn
}

/** Pure, atomic transitions. Changing a browsing tab/filter does not undress. */
export function reduceOutfit(
  state: OutfitState,
  action: OutfitAction,
  catalog: readonly Garment[],
): OutfitState {
  if (action.type === 'focus') {
    return action.slot === state.focus
      ? state
      : { ...state, focus: action.slot }
  }

  if (action.type === 'toggle-focus') {
    return {
      ...state,
      focus: state.focus === 'tops' ? 'bottoms' : 'tops',
    }
  }

  if (action.type === 'filter') {
    return action.filter === state.filter
      ? state
      : { ...state, filter: action.filter }
  }

  if (action.type === 'clear') {
    return state.selected[action.slot] === null
      ? state
      : {
          ...state,
          selected: {
            ...state.selected,
            [action.slot]: null,
          },
        }
  }

  const candidates = getFocusedGarments(state, catalog)
  let item: Garment | undefined

  if (action.type === 'select') {
    item = candidates.find((candidate) => candidate.id === action.id)
  } else {
    if (candidates.length === 0) {
      return state
    }

    const current = candidates.findIndex(
      (candidate) => candidate.id === state.selected[state.focus],
    )

    const index =
      current < 0
        ? action.direction === 'next'
          ? 0
          : candidates.length - 1
        : (
            current +
            (action.direction === 'next' ? 1 : -1) +
            candidates.length
          ) % candidates.length

    item = candidates[index]
  }

  if (!item) {
    return state
  }

  const slot = getGarmentSlot(item.category)
  const selected: OutfitState['selected'] =
    slot === 'tops'
      ? {
          // Tops and onepieces share the same UI slot. When a onepiece is
          // selected, keep the current bottoms ID as hidden wardrobe memory.
          // getWornGarments() is responsible for suppressing that bottom while
          // the onepiece is active, so returning to an ordinary top restores it.
          ...state.selected,
          tops: item.id,
        }
      : {
          // Selecting/changing bottoms while a onepiece is actively worn keeps
          // the previous UX: remove the onepiece rather than rendering both.
          // The newly chosen bottom becomes the remembered/active bottom.
          tops: isOnepieceId(catalog, state.selected.tops)
            ? null
            : state.selected.tops,
          bottoms: item.id,
        }

  if (
    selected.tops === state.selected.tops &&
    selected.bottoms === state.selected.bottoms
  ) {
    return state
  }

  return {
    ...state,
    selected,
  }
}
