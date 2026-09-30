/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { garments } from './garments'

it.each(garments)(
  '$id has embedded anatomical anchors in its actual GLB',
  (garment) => {
    const filename = garment.modelUrl!.split('/').at(-1)!
    const bytes = readFileSync(`public/garments/${filename}`)
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67)
    expect(bytes.readUInt32LE(8)).toBe(bytes.length)
    const json = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    ) as {
      scene?: number
      scenes: { nodes: number[] }[]
      nodes: { name?: string; translation?: number[] }[]
    }
    const roots = json.scenes[json.scene ?? 0].nodes
    const pair = (axis: 'Hip' | 'Shoulder') => {
      const points = ['Left', 'Right'].map((side) => {
        const matches = json.nodes
          .map((node, index) => ({ node, index }))
          .filter(({ node }) => node.name === `AR_${side}${axis}`)
        expect(matches).toHaveLength(1)
        expect(roots).toContain(matches[0].index)
        const value = matches[0].node.translation!
        expect(value).toHaveLength(3)
        expect(value.every(Number.isFinite)).toBe(true)
        return value
      })
      expect(points[0][0]).toBeGreaterThan(points[1][0])
      expect(points[0][1]).toBe(points[1][1])
      expect(points[0][2]).toBe(points[1][2])
      return points[0][1]
    }
    const hipY = pair('Hip')
    if (garment.category !== 'bottoms')
      expect(pair('Shoulder')).toBeGreaterThan(hipY)
    const icon = readFileSync(
      `public/garments/${garment.image.split('/').at(-1)}`,
    )
    expect(icon.subarray(1, 4).toString()).toBe('PNG')
  },
)
