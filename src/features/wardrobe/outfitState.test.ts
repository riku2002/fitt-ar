import { expect, it } from 'vitest'
import { demoGarment, getGarmentSlot } from './garments'
import type { Garment } from './garments'
import { createOutfitState, getFocusedGarments, getWornGarments, reduceOutfit } from './outfitState'

const catalog: readonly Garment[] = [
  { ...demoGarment, id: 'top-a', category: 'tshirt', gender: 'unisex' },
  { ...demoGarment, id: 'top-b', category: 'jacket', gender: 'men' },
  { ...demoGarment, id: 'pants', category: 'bottoms', gender: 'unisex' },
  { ...demoGarment, id: 'skirt', category: 'bottoms', gender: 'women' },
  { ...demoGarment, id: 'dress', category: 'onepiece', gender: 'women' },
]
const reduce = (state: ReturnType<typeof createOutfitState>, action: Parameters<typeof reduceOutfit>[1]) =>
  reduceOutfit(state, action, catalog)

it('maps all garment categories to independent slots', () => {
  expect(['tshirt', 'shirt', 'jacket'].map(category => getGarmentSlot(category as Garment['category']))).toEqual(['tops', 'tops', 'tops'])
  expect(getGarmentSlot('bottoms')).toBe('bottoms')
  expect(getGarmentSlot('onepiece')).toBe('onepiece')
})
it('starts with one top and no automatically equipped bottoms', () => {
  const state = createOutfitState(catalog)
  expect(state.selected).toEqual({ tops: 'top-a', bottoms: null, onepiece: null })
  expect(createOutfitState([]).selected).toEqual({ tops: null, bottoms: null, onepiece: null })
})
it('focus and gender filter do not change what is worn', () => {
  const state = createOutfitState(catalog)
  const focused = reduce(state, { type: 'focus', slot: 'bottoms' })
  const filtered = reduce(focused, { type: 'filter', filter: 'men' })
  expect(filtered.selected).toEqual(state.selected)
  expect(getFocusedGarments(filtered, catalog).map(item => item.id)).toEqual(['pants'])
})
it('equips tops and bottoms independently', () => {
  let state = createOutfitState(catalog)
  state = reduce(state, { type: 'focus', slot: 'bottoms' })
  state = reduce(state, { type: 'select', id: 'pants' })
  state = reduce(state, { type: 'focus', slot: 'tops' })
  state = reduce(state, { type: 'cycle', direction: 'next' })
  expect(getWornGarments(state, catalog).map(item => item.id)).toEqual(['top-b', 'pants'])
})
it('onepiece selection atomically clears both separate slots', () => {
  let state = createOutfitState(catalog)
  state = reduce(state, { type: 'focus', slot: 'bottoms' })
  state = reduce(state, { type: 'select', id: 'pants' })
  state = reduce(state, { type: 'focus', slot: 'onepiece' })
  state = reduce(state, { type: 'select', id: 'dress' })
  expect(state.selected).toEqual({ tops: null, bottoms: null, onepiece: 'dress' })
  state = reduce(state, { type: 'focus', slot: 'tops' })
  expect(getWornGarments(state, catalog).map(item => item.id)).toEqual(['dress'])
  state = reduce(state, { type: 'select', id: 'top-a' })
  expect(state.selected).toEqual({ tops: 'top-a', bottoms: null, onepiece: null })
})
it('selecting a bottom after a dress removes only the dress, without restoring old tops', () => {
  let state = createOutfitState(catalog)
  state = reduce(state, { type: 'focus', slot: 'onepiece' })
  state = reduce(state, { type: 'select', id: 'dress' })
  state = reduce(state, { type: 'focus', slot: 'bottoms' })
  state = reduce(state, { type: 'select', id: 'pants' })
  expect(state.selected).toEqual({ tops: null, bottoms: 'pants', onepiece: null })
})
it('cycles from an unselected slot in either direction and wraps', () => {
  let state = reduce(createOutfitState(catalog), { type: 'focus', slot: 'bottoms' })
  state = reduce(state, { type: 'cycle', direction: 'previous' })
  expect(state.selected.bottoms).toBe('skirt')
  state = reduce(state, { type: 'cycle', direction: 'next' })
  expect(state.selected.bottoms).toBe('pants')
})
it('ignores selections outside the active slot/filter and handles no candidates', () => {
  const initial = createOutfitState(catalog)
  expect(reduce(initial, { type: 'select', id: 'pants' })).toBe(initial)
  let state = reduce(initial, { type: 'focus', slot: 'onepiece' })
  state = reduce(state, { type: 'filter', filter: 'men' })
  expect(reduce(state, { type: 'select', id: 'dress' })).toBe(state)
  expect(reduce(state, { type: 'cycle', direction: 'next' })).toBe(state)
})
it('does not mutate previous selection objects', () => {
  const initial = createOutfitState(catalog)
  Object.freeze(initial.selected)
  Object.freeze(initial)
  const changed = reduce(initial, { type: 'select', id: 'top-b' })
  expect(initial.selected.tops).toBe('top-a')
  expect(changed.selected.tops).toBe('top-b')
})
it('clears one slot without altering other slots', () => {
  const state = { ...createOutfitState(catalog), selected: { tops: 'top-a', bottoms: 'pants', onepiece: null } }
  const changed = reduce(state, { type: 'clear', slot: 'tops' })
  expect(changed.selected).toEqual({ tops: null, bottoms: 'pants', onepiece: null })
})
