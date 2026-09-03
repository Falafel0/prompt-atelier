import { describe, expect, it } from 'vitest'
import { addTag } from './tagEngine'
import { formatPrompt, generatePrompt } from './prompt'
import { analyzePromptText } from './promptAnalysis'
const sample=[{id:'cat_ears',name:'cat_ears',category:'Body' as const,subcategory:'Creature traits'},{id:'animal_ears',name:'animal_ears',category:'Body' as const,subcategory:'Creature traits'},{id:'long_hair',name:'long_hair',category:'Body' as const,subcategory:'Hair length'},{id:'short_hair',name:'short_hair',category:'Body' as const,subcategory:'Hair length'},{id:'1girl',name:'1girl',category:'General' as const,subcategory:'Count'},{id:'blush',name:'blush',category:'Expression' as const,subcategory:'Facial expression'},{id:'school_uniform',name:'school_uniform',category:'Clothing' as const,subcategory:'Outfit'}]
const tags = new Map(sample.map(t => [t.id, t]))
const relationships=[{source:'cat_ears',target:'animal_ears',type:'implies' as const},{source:'long_hair',target:'short_hair',type:'conflicts' as const}]
describe('selection engine', () => {
  it('adds implication tags with auto-added provenance', () => { const result = addTag(tags.get('cat_ears')!, [], tags, relationships); expect(result.selected.map(x => x.id)).toEqual(['cat_ears','animal_ears']); expect(result.selected[1].source).toBe('auto-added') })
  it('detects conflicts before replacing', () => { const current = [{ id:'long_hair', weight:1, order:0, source:'user' as const }]; expect(addTag(tags.get('short_hair')!, current, tags, relationships).conflicts[0].id).toBe('long_hair') })
})
describe('prompt generation', () => {
  it('keeps NAI tag order and weights deterministic', () => expect(generatePrompt('NAI', [{id:'1girl',weight:1,order:0,source:'user'},{id:'blush',weight:1.5,order:1,source:'user'}], tags)).toBe('1girl, (blush:1.5)'))
  it('keeps natural output in explicit user order without relying on category names', () => expect(generatePrompt('SDXL (NoobAI)', [{id:'1girl',weight:1,order:0,source:'user'},{id:'long_hair',weight:1,order:1,source:'user'},{id:'school_uniform',weight:1,order:2,source:'user'}], tags)).toBe('1girl, long hair, school uniform'))
  it('formats a deterministic hybrid prompt', () => expect(formatPrompt('natural-and-tags','NAI',[{id:'1girl',weight:1,order:0,source:'user'}],tags)).toBe('1girl\n\nTags: 1girl'))
})
describe('literal prompt analysis', () => {
  it('finds canonical tags, aliases, and sentences without changing the catalog', () => {
    const withAliases = sample.map(tag => tag.id === 'long_hair' ? { ...tag, aliases: ['flowing hair'] } : tag)
    const result = analyzePromptText('A girl with flowing hair and cat ears. school_uniform, made_up_term', withAliases)
    expect(result.sentences).toHaveLength(2)
    expect(result.recognized.map(tag => tag.id)).toEqual(['long_hair', 'cat_ears', 'school_uniform'])
    expect(result.unknown).toEqual(['made_up_term'])
  })
})
