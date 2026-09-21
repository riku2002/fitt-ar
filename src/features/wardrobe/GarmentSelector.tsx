import { useId } from 'react'
import { garmentGenderLabels } from './garments'
import type { Garment, GarmentFilter } from './garments'

const filters: readonly { value: GarmentFilter; label: string }[] = [
  { value: 'men', label: '男性' },
  { value: 'women', label: '女性' },
  { value: 'all', label: '全て' },
]

export function GarmentSelector({
  garments,
  index,
  filter,
  onFilterChange,
  onSelect,
}: {
  garments: readonly Garment[]
  index: number
  filter: GarmentFilter
  onFilterChange: (filter: GarmentFilter) => void
  onSelect: (index: number) => void
}) {
  const groupId = useId()
  const garment = garments[index]
  return (
    <div className="wardrobe" aria-label="服を選ぶ">
      <fieldset className="garment-filter" aria-describedby={`${groupId}-hint`}>
        <legend>服のカテゴリ</legend>
        <div className="garment-filter-options">
          {filters.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={groupId}
                value={option.value}
                checked={filter === option.value}
                onChange={() => onFilterChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <p id={`${groupId}-hint`} className="garment-filter-hint">
          共用の服は、男性・女性の両方に表示します。
        </p>
      </fieldset>
      {garment ? (
        <>
          <div className="garment-preview">
            <img
              key={garment.id}
              src={garment.image}
              alt={`${garment.name}の透過素材`}
            />
            <div aria-live="polite" aria-atomic="true">
              <span className="garment-count">
                {index + 1} / {garments.length}
              </span>
              <strong>{garment.name}</strong>
              <span className="garment-gender">
                {garmentGenderLabels[garment.gender]}
              </span>
            </div>
          </div>
          <div className="wardrobe-buttons">
            <button
              type="button"
              disabled={garments.length < 2}
              onClick={() =>
                onSelect((index - 1 + garments.length) % garments.length)
              }
            >
              前の服
            </button>
            <button
              type="button"
              disabled={garments.length < 2}
              onClick={() => onSelect((index + 1) % garments.length)}
            >
              次の服
            </button>
          </div>
          <div className="garment-thumbnails">
            {garments.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.name}を選ぶ`}
                aria-pressed={itemIndex === index}
                onClick={() => onSelect(itemIndex)}
              >
                <img src={item.image} alt="" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="garment-empty" role="status">
          このカテゴリの服はまだありません。別のカテゴリを選んでください。
        </p>
      )}
    </div>
  )
}
