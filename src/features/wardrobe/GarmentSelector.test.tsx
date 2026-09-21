import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GarmentSelector } from './GarmentSelector'
import { demoGarment } from './garments'

describe('GarmentSelector', () => {
  it('keeps category selection available when no garments match', () => {
    const onSelect = vi.fn()
    const onFilterChange = vi.fn()
    render(
      <GarmentSelector
        garments={[]}
        index={0}
        filter="women"
        onSelect={onSelect}
        onFilterChange={onFilterChange}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'このカテゴリの服はまだありません',
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '次の服' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '全て' }))
    expect(onFilterChange).toHaveBeenCalledExactlyOnceWith('all')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('disables cycling a single garment and shows its category', () => {
    const onSelect = vi.fn()
    render(
      <GarmentSelector
        garments={[demoGarment]}
        index={0}
        filter="men"
        onSelect={onSelect}
        onFilterChange={vi.fn()}
      />,
    )
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByText('男女共用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前の服' })).toBeDisabled()
    const next = screen.getByRole('button', { name: '次の服' })
    expect(next).toBeDisabled()
    fireEvent.click(next)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
