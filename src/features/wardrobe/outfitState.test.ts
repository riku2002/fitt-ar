import { expect, it } from 'vitest'
import { demoGarment, getGarmentSlot } from './garments'
import type { Garment } from './garments'
import {
  createOutfitState,
  getFocusedGarments,
  getWornGarments,
  reduceOutfit,
} from './outfitState'

const catalog: readonly Garment[] = [
  { ...demoGarment, id: 'top-a', category: 'tshirt', gender: 'unisex' },
  { ...demoGarment, id: 'top-b', category: 'jacket', gender: 'men' },
  { ...demoGarment, id: 'pants', category: 'bottoms', gender: 'unisex' },
  { ...demoGarment, id: 'skirt', category: 'bottoms', gender: 'women' },
  { ...demoGarment, id: 'dress', category: 'onepiece', gender: 'women' },
]

const reduce = (
  state: ReturnType<typeof createOutfitState>,
  action: Parameters<typeof reduceOutfit>[1],
) => reduceOutfit(state, action, catalog)

it('maps onepiece into the tops slot and exposes only two slots', () => {
  expect(
    ['tshirt', 'shirt', 'jacket', 'onepiece'].map((category) =>
      getGarmentSlot(category as Garment['category']),
    ),
  ).toEqual(['tops', 'tops', 'tops', 'tops'])

  expect(getGarmentSlot('bottoms')).toBe('bottoms')
})

it('starts with an ordinary top and no automatically equipped bottoms', () => {
  const state = createOutfitState(catalog)

  expect(state.selected).toEqual({
    tops: 'top-a',
    bottoms: null,
  })

  expect(createOutfitState([]).selected).toEqual({
    tops: null,
    bottoms: null,
  })
})

it('shows T-shirts and onepiece together while tops are focused', () => {
  const state = createOutfitState(catalog)

  expect(
    getFocusedGarments(state, catalog).map((item) => item.id),
  ).toEqual(['top-a', 'top-b', 'dress'])
})

it('toggles focus without changing the selected outfit', () => {
  const state = createOutfitState(catalog)
  const bottomFocus = reduce(state, { type: 'toggle-focus' })
  const topFocus = reduce(bottomFocus, { type: 'toggle-focus' })

  expect(bottomFocus.focus).toBe('bottoms')
  expect(bottomFocus.selected).toEqual(state.selected)
  expect(topFocus.focus).toBe('tops')
  expect(topFocus.selected).toEqual(state.selected)
})

it('focus and gender filter do not change what is worn', () => {
  const state = createOutfitState(catalog)
  const focused = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  const filtered = reduce(focused, {
    type: 'filter',
    filter: 'men',
  })

  expect(filtered.selected).toEqual(state.selected)
  expect(
    getFocusedGarments(filtered, catalog).map((item) => item.id),
  ).toEqual(['pants'])
})

it('equips ordinary tops and bottoms independently', () => {
  let state = createOutfitState(catalog)

  state = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  state = reduce(state, {
    type: 'select',
    id: 'pants',
  })
  state = reduce(state, {
    type: 'focus',
    slot: 'tops',
  })
  state = reduce(state, {
    type: 'cycle',
    direction: 'next',
  })

  expect(
    getWornGarments(state, catalog).map((item) => item.id),
  ).toEqual(['top-b', 'pants'])
})

it('keeps remembered bottoms while a onepiece is active and restores them when returning to a top', () => {
  let state = createOutfitState(catalog)

  state = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  state = reduce(state, {
    type: 'select',
    id: 'pants',
  })
  state = reduce(state, {
    type: 'focus',
    slot: 'tops',
  })
  state = reduce(state, {
    type: 'select',
    id: 'top-b',
  })

  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'top-b',
    'pants',
  ])

  state = reduce(state, {
    type: 'cycle',
    direction: 'next',
  })

  expect(state.selected).toEqual({
    tops: 'dress',
    bottoms: 'pants',
  })
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'dress',
  ])

  state = reduce(state, {
    type: 'cycle',
    direction: 'next',
  })

  expect(state.selected).toEqual({
    tops: 'top-a',
    bottoms: 'pants',
  })
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'top-a',
    'pants',
  ])
})

it('suppresses a remembered bottom from the worn list while a onepiece is selected', () => {
  const state = {
    ...createOutfitState(catalog),
    selected: {
      tops: 'dress',
      bottoms: 'skirt',
    },
  }

  expect(state.selected.bottoms).toBe('skirt')
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'dress',
  ])
})

it('clearing a onepiece reveals the remembered bottom', () => {
  // Build the state only through the reducer so `state` keeps the full
  // OutfitState type (`string | null` for each slot) instead of being narrowed
  // to `{ tops: string; bottoms: string }` by an object literal.
  let state = createOutfitState(catalog)

  state = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  state = reduce(state, {
    type: 'select',
    id: 'pants',
  })
  state = reduce(state, {
    type: 'focus',
    slot: 'tops',
  })
  state = reduce(state, {
    type: 'select',
    id: 'dress',
  })

  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'dress',
  ])

  state = reduce(state, {
    type: 'clear',
    slot: 'tops',
  })

  expect(state.selected).toEqual({
    tops: null,
    bottoms: 'pants',
  })
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'pants',
  ])
})

it('selecting bottoms while a onepiece is worn removes the onepiece and equips the chosen bottom', () => {
  let state = createOutfitState(catalog)

  state = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  state = reduce(state, {
    type: 'select',
    id: 'pants',
  })
  state = reduce(state, {
    type: 'focus',
    slot: 'tops',
  })
  state = reduce(state, {
    type: 'select',
    id: 'dress',
  })

  expect(state.selected).toEqual({
    tops: 'dress',
    bottoms: 'pants',
  })
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'dress',
  ])

  state = reduce(state, {
    type: 'focus',
    slot: 'bottoms',
  })
  state = reduce(state, {
    type: 'select',
    id: 'skirt',
  })

  expect(state.selected).toEqual({
    tops: null,
    bottoms: 'skirt',
  })
  expect(getWornGarments(state, catalog).map((item) => item.id)).toEqual([
    'skirt',
  ])
})

it('cycles from an unselected bottoms slot in either direction and wraps', () => {
  let state = reduce(createOutfitState(catalog), {
    type: 'focus',
    slot: 'bottoms',
  })

  state = reduce(state, {
    type: 'cycle',
    direction: 'previous',
  })
  expect(state.selected.bottoms).toBe('skirt')

  state = reduce(state, {
    type: 'cycle',
    direction: 'next',
  })
  expect(state.selected.bottoms).toBe('pants')
})

it('ignores selections outside the active slot/filter and handles no candidates', () => {
  const initial = createOutfitState(catalog)

  expect(
    reduce(initial, {
      type: 'select',
      id: 'pants',
    }),
  ).toBe(initial)

  const state = reduce(initial, {
    type: 'filter',
    filter: 'men',
  })

  expect(
    reduce(state, {
      type: 'select',
      id: 'dress',
    }),
  ).toBe(state)

  const emptyCatalog: readonly Garment[] = []
  const empty = createOutfitState(emptyCatalog)
  expect(
    reduceOutfit(
      empty,
      { type: 'cycle', direction: 'next' },
      emptyCatalog,
    ),
  ).toBe(empty)
})

it('does not mutate previous selection objects', () => {
  const initial = createOutfitState(catalog)
  Object.freeze(initial.selected)
  Object.freeze(initial)

  const changed = reduce(initial, {
    type: 'select',
    id: 'top-b',
  })

  expect(initial.selected.tops).toBe('top-a')
  expect(changed.selected.tops).toBe('top-b')
})

it('clears one slot without altering the other slot', () => {
  const state = {
    ...createOutfitState(catalog),
    selected: {
      tops: 'top-a',
      bottoms: 'pants',
    },
  }

  const changed = reduce(state, {
    type: 'clear',
    slot: 'tops',
  })

  expect(changed.selected).toEqual({
    tops: null,
    bottoms: 'pants',
  })
})
