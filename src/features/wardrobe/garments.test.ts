import { describe, expect, it } from 'vitest'
import { demoGarment, filterGarments } from './garments'
import type { Garment, GarmentFilter } from './garments'

const catalog: readonly Garment[] = [
  { ...demoGarment, id: 'women-1', gender: 'women' },
  { ...demoGarment, id: 'shared', gender: 'unisex' },
  { ...demoGarment, id: 'men-1', gender: 'men' },
  { ...demoGarment, id: 'women-2', gender: 'women' },
]

describe('filterGarments', () => {
  it.each<[GarmentFilter, string[]]>([
    ['all', ['women-1', 'shared', 'men-1', 'women-2']],
    ['men', ['shared', 'men-1']],
    ['women', ['women-1', 'shared', 'women-2']],
  ])(
    'includes shared garments in %s and preserves catalog order',
    (filter, expected) => {
      expect(
        filterGarments(catalog, filter).map((garment) => garment.id),
      ).toEqual(expected)
      expect(catalog.map((garment) => garment.id)).toEqual([
        'women-1',
        'shared',
        'men-1',
        'women-2',
      ])
    },
  )

  it('supports an empty catalog or a category with no matches', () => {
    expect(filterGarments([], 'all')).toEqual([])
    expect(filterGarments([], 'women')).toEqual([])
    expect(filterGarments([catalog[0]], 'men')).toEqual([])
  })
})
