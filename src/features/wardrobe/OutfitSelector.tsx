import { useId } from 'react'
import type { KeyboardEvent } from 'react'
import { garmentGenderLabels, garmentSlotLabels, getGarmentSlot } from './garments'
import type { Garment, GarmentFilter, GarmentSlot } from './garments'
import type { OutfitAction, OutfitState } from './outfitState'
import './OutfitSelector.css'

const slots: GarmentSlot[] = ['tops', 'bottoms', 'onepiece']
const filters: { value: GarmentFilter; label: string }[] = [
  { value: 'men', label: '男性' },
  { value: 'women', label: '女性' },
  { value: 'all', label: '全て' },
]

export function OutfitSelector({ state, candidates, worn, onAction }: {
  state: OutfitState
  candidates: readonly Garment[]
  worn: readonly Garment[]
  onAction: (action: OutfitAction) => void
}) {
  const id = useId()
  const index = candidates.findIndex(item => item.id === state.selected[state.focus])
  const preview = candidates[index >= 0 ? index : 0]
  const canCycle = candidates.length > 1 || (candidates.length === 1 && index < 0)

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next: number
    if (event.key === 'ArrowRight') next = (current + 1) % slots.length
    else if (event.key === 'ArrowLeft') next = (current + slots.length - 1) % slots.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = slots.length - 1
    else return
    event.preventDefault()
    onAction({ type: 'focus', slot: slots[next] })
    document.getElementById(`${id}-tab-${slots[next]}`)?.focus()
  }

  return (
    <section className="outfit-selector" aria-label="服を選ぶ">
      <div className="outfit-tabs" role="tablist" aria-label="操作する服のカテゴリ">
        {slots.map((slot, i) => (
          <button key={slot} type="button" role="tab" id={`${id}-tab-${slot}`}
            aria-selected={state.focus === slot} aria-controls={`${id}-panel`}
            tabIndex={state.focus === slot ? 0 : -1}
            onKeyDown={event => onTabKey(event, i)}
            onClick={() => onAction({ type: 'focus', slot })}>
            {garmentSlotLabels[slot]}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${state.focus}`}>
        <p className="outfit-hint">
          {`スワイプは「${garmentSlotLabels[state.focus]}」だけを切り替えます。`}
        </p>
        <fieldset className="outfit-filter">
          <legend>{'商品の絞り込み'}</legend>
          {filters.map(filter => (
            <label key={filter.value}>
              <input type="radio" name={`${id}-filter`} value={filter.value}
                checked={state.filter === filter.value}
                onChange={() => onAction({ type: 'filter', filter: filter.value })} />
              {filter.label}
            </label>
          ))}
        </fieldset>
        {preview ? (
          <>
            <div className="outfit-preview">
              <img src={preview.image} alt={`${preview.name}のアイコン`} />
              <div>
                <p className="outfit-count">{index >= 0 ? `${index + 1} / ${candidates.length}` : `未選択 / ${candidates.length}`}</p>
                <strong>{preview.name}</strong>
                <p>{garmentGenderLabels[preview.gender]}</p>
                {index < 0 && <span>{'プレビュー（未着用）'}</span>}
              </div>
            </div>
            <div className="outfit-actions">
              <button type="button" disabled={!canCycle}
                onClick={() => onAction({ type: 'cycle', direction: 'previous' })}>{'前の服'}</button>
              <button type="button" disabled={!canCycle}
                onClick={() => onAction({ type: 'cycle', direction: 'next' })}>{'次の服'}</button>
              <button type="button" disabled={state.selected[state.focus] === null}
                onClick={() => onAction({ type: 'clear', slot: state.focus })}>{'このカテゴリを外す'}</button>
            </div>
            <div className="outfit-thumbnails">
              {candidates.map(item => (
                <button key={item.id} type="button" aria-label={`${item.name}を選ぶ`}
                  aria-pressed={item.id === state.selected[state.focus]}
                  onClick={() => onAction({ type: 'select', id: item.id })}>
                  <img src={item.image} alt="" /><span>{item.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : <p role="status">{'このカテゴリの服はまだありません。'}</p>}
      </div>
      <div className="outfit-summary" aria-label="着用中の組み合わせ">
        <strong>{'着用中'}</strong>
        {worn.length === 0 ? <p>{'服は未選択です'}</p> : worn.map(item => (
          <div key={item.id} className="outfit-worn-item">
            <span>{item.name}</span>
            <button type="button" aria-label={`${item.name}を外す`}
              onClick={() => onAction({ type: 'clear', slot: getGarmentSlot(item.category) })}>{'外す'}</button>
          </div>
        ))}
        <p className="outfit-hint">{'タブ・絞り込みの変更だけでは着用中の服は変わりません。ワンピースを選ぶと上下の服は外れます。'}</p>
      </div>
    </section>
  )
}
