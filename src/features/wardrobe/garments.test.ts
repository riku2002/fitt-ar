import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GARMENT_MODEL_URL,
  demoGarment,
  filterGarments,
  garments,
} from './garments'
import type { Garment, GarmentFilter } from './garments'

const catalog: readonly Garment[] = [
  { ...demoGarment, id: 'women-1', gender: 'women' },
  { ...demoGarment, id: 'shared', gender: 'unisex' },
  { ...demoGarment, id: 'men-1', gender: 'men' },
  { ...demoGarment, id: 'women-2', gender: 'women' },
]

describe('garment catalog', () => {
  it('exports the default GLB URL and gives catalog garments a model URL', () => {
    expect(DEFAULT_GARMENT_MODEL_URL).toBe(
      `${import.meta.env.BASE_URL}garments/tshirt1.glb`,
    )

    expect(demoGarment.modelUrl).toBe(DEFAULT_GARMENT_MODEL_URL)

    for (const garment of garments) {
      expect(garment.modelUrl).toBeTruthy()
    }
  })
})

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


it('registers all five actual model/icon paths and the new categories', () => {
  const expected = [
    ['tshirt-1', 'tshirt', 'tshirt1'],
    ['tshirt-2', 'tshirt', 'tshirt2'],
    ['pants', 'bottoms', 'pants'],
    ['skirt', 'bottoms', 'skirt'],
    ['dress', 'onepiece', 'dress'],
  ]
  expect(garments).toHaveLength(expected.length)
  expect(new Set(garments.map(item => item.id)).size).toBe(garments.length)
  for (const [id, category, filename] of expected) {
    const item = garments.find(garment => garment.id === id)
    expect(item?.category).toBe(category)
    expect(item?.modelUrl).toBe(`${import.meta.env.BASE_URL}garments/${filename}.glb`)
    expect(item?.image).toBe(`${import.meta.env.BASE_URL}garments/${filename}_icon.png`)
  }
})
