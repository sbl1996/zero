export type RhythmKey =
  | 'z'
  | 'x'
  | 'c'
  | 'v'
  | 'b'
  | 'n'
  | 'm'
  | 'j'
  | 'k'
  | 'l'
  | ';'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'

export interface RhythmNote {
  /** 1-7 代表音级，null 表示空拍 */
  pitch: number | null
  /** 是否必按；可空音符 Miss 不会导致失败 */
  required?: boolean
  label?: string
  hint?: string
}

export interface RhythmPhrase {
  id: string
  name: string
  description?: string
  bpm?: number
  intervalMs?: number
  leadInCells: number
  notes: RhythmNote[]
  lanes?: RhythmKey[]
  tags?: string[]
}
