import type { CSSProperties, ReactNode } from 'react'

export function ParameterSlider({ label, value, min, max, step = .05, onChange, reset }: { label: string; value: number; min: number; max: number; step?: number; onChange(value:number):void; reset?():void }) {
  const percent=Math.max(0,Math.min(100,((value-min)/(max-min))*100))
  const setNumber=(raw:string)=>{const next=Number(raw);if(Number.isFinite(next))onChange(Math.max(min,Math.min(max,next)))}
  return <div className="parameter-slider">
    <div className="parameter-label"><label>{label}</label><input aria-label={`${label} numeric value`} type="number" min={min} max={max} step={step} value={value} onChange={event=>setNumber(event.target.value)}/>{reset&&<button type="button" onClick={reset} title={`Reset ${label}`}>Reset</button>}</div>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} style={{'--parameter-fill':`${percent}%`} as CSSProperties} onChange={event=>onChange(+event.target.value)}/>
    <div className="parameter-range"><span>{min.toFixed(1)}</span><span>default</span><span>{max.toFixed(1)}</span></div>
  </div>
}

export function PreviewChoiceGrid({ label, value, choices, onChange }: { label:string; value:number; choices:{value:number; title:string; preview:ReactNode}[]; onChange(value:number):void }) {
  return <div className="parameter-choice"><span className="parameter-choice-label">{label}</span><div className="parameter-choice-grid" role="group" aria-label={label}>{choices.map(choice=><button type="button" key={choice.title} className={value===choice.value?'active':''} aria-pressed={value===choice.value} onClick={()=>onChange(choice.value)}><i aria-hidden="true">{choice.preview}</i><span>{choice.title}</span></button>)}</div></div>
}

export function ParameterCheckbox({ label, checked, detail, onChange }: { label:string; checked:boolean; detail?:string; onChange(checked:boolean):void }) {
  return <label className="parameter-checkbox"><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/><span className="parameter-checkmark"/><span><b>{label}</b>{detail&&<small>{detail}</small>}</span></label>
}
