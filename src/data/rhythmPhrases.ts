import type { RhythmPhrase } from '@/types/rhythm'

export const RHYTHM_PHRASES: RhythmPhrase[] = [
  {
    id: 'twinkle',
    name: '小星星前半句',
    description: '1 1 5 5 6 6 5，默认 600ms/格，含两拍起手空拍',
    bpm: 100,
    intervalMs: 600,
    leadInCells: 2,
    notes: [
      { pitch: 1, label: '1' },
      { pitch: 1, label: '1' },
      { pitch: 5, label: '5' },
      { pitch: 5, label: '5' },
      { pitch: 6, label: '6' },
      { pitch: 6, label: '6' },
      { pitch: 5, label: '5' },
      { pitch: null, label: '休止', required: false },
      { pitch: 4, label: '4' },
      { pitch: 1, label: '1' },
    ],
  },
  {
    id: 'scale-ascending',
    name: '上行音阶',
    description: '1 2 3 4 5 6，手感测试用',
    bpm: 110,
    intervalMs: 540,
    leadInCells: 1,
    notes: [
      { pitch: 1, label: '1' },
      { pitch: 2, label: '2' },
      { pitch: 3, label: '3' },
      { pitch: 4, label: '4' },
      { pitch: 5, label: '5' },
      { pitch: 6, label: '6', required: false, hint: '可空测试' },
    ],
  },
]
