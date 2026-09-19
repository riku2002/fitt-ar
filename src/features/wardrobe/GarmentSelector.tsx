import { garments } from './garments'

export function GarmentSelector({
  index,
  onSelect,
}: {
  index: number
  onSelect: (index: number) => void
}) {
  const garment = garments[index]
  return (
    <div className="wardrobe" aria-label="服を選ぶ">
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
        </div>
      </div>
      <div className="wardrobe-buttons">
        <button
          type="button"
          onClick={() =>
            onSelect((index - 1 + garments.length) % garments.length)
          }
        >
          前の服
        </button>
        <button
          type="button"
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
    </div>
  )
}
