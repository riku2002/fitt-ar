import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { OutfitSelector } from './OutfitSelector'
import { demoGarment } from './garments'
import type { Garment } from './garments'
import { createOutfitState, getFocusedGarments } from './outfitState'

const catalog: readonly Garment[] = [
  { ...demoGarment, id: 'top', name: 'Top', category: 'tshirt' },
  { ...demoGarment, id: 'dress', name: 'Dress', category: 'onepiece' },
  { ...demoGarment, id: 'pants', name: 'Pants', category: 'bottoms' },
]

it('renders only tops/bottoms tabs and shows onepiece inside tops', () => {
  const state = createOutfitState(catalog)
  const onAction = vi.fn()

  render(
    <OutfitSelector
      state={state}
      candidates={getFocusedGarments(state, catalog)}
      worn={[catalog[0]]}
      onAction={onAction}
    />,
  )

  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(screen.getByRole('tab', { name: 'トップス' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'ボトムス' })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'ワンピース' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dressを選ぶ' })).toBeInTheDocument()
})

it('dispatches bottoms focus from the two-tab UI', () => {
  const state = createOutfitState(catalog)
  const onAction = vi.fn()

  render(
    <OutfitSelector
      state={state}
      candidates={getFocusedGarments(state, catalog)}
      worn={[catalog[0]]}
      onAction={onAction}
    />,
  )

  fireEvent.click(screen.getByRole('tab', { name: 'ボトムス' }))

  expect(onAction).toHaveBeenCalledWith({
    type: 'focus',
    slot: 'bottoms',
  })
})
