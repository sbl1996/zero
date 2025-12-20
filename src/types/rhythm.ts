export type RhythmKey =
  | '0'
  | '.'
  | '+'
  | '-'
  | '*'
  | '/'
  | 'insert'
  | '8'
  | '9'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
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
  | 'arrowright'
  | 'pagedown'

export interface RhythmTimeSignature {
  numerator: number
  denominator: number
}

export interface RhythmNote {
  /** 扩展音级：-1 开始向上递增，null 表示空拍。支持 ABC 记谱法字符串。 */
  pitch: string | number | null
  /** 时值，以拍为单位（默认四分音符 = 1 拍） */
  durationBeats?: number
  /** 是否必按；可空音符 Miss 不会导致失败 */
  required?: boolean
}

export interface RhythmPhrase {
  id: string
  name: string
  description?: string
  bpm?: number
  /** 默认 4/4 */
  timeSignature?: RhythmTimeSignature
  /** 以拍计的起拍时值 */
  leadInBeats?: number
  /** 以拍计的收尾空白时值 */
  trailInBeats?: number
  notes: RhythmNote[]
}

