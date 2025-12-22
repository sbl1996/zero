import type { RhythmPhrase } from '@/types/rhythm'

export const RHYTHM_PHRASES: RhythmPhrase[] = [
  {
    id: 'songbie',
    name: '送别 - 长亭外',
    description: '中级水系魔法：芳草碧连天',
    bpm: 80,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 1,
    notes: [
      // --- 第一句：长亭外，古道边 (6秒) ---
      { pitch: "G", durationBeats: 1 },   // 长 (5)
      { pitch: "E", durationBeats: 0.5 }, // 亭 (3)
      { pitch: "G", durationBeats: 0.5 }, // (5)
      { pitch: "C'", durationBeats: 2 }, // 外 (1' -)
      { pitch: "A", durationBeats: 1 },   // 古 (6)
      { pitch: "C'", durationBeats: 1 }, // 道 (1')
      { pitch: "G", durationBeats: 2 },   // 边 (5 -)

      // --- 第二句：芳草碧连天 (6秒) ---
      { pitch: "G", durationBeats: 1 },   // 芳 (5)
      { pitch: "C", durationBeats: 0.5 }, // 草 (1)
      { pitch: "D", durationBeats: 0.5 }, // (2)
      { pitch: "E", durationBeats: 2 },   // 碧 (3 -)
      { pitch: "D", durationBeats: 1 },   // 连 (2)
      { pitch: "C", durationBeats: 3 },   // 天 (1 - -)
    ],
  },
  {
    id: 'wind_blade',
    name: '风刃',
    description: '初级风系：快速切分音，瞬发伤害',
    bpm: 140,
    timeSignature: { numerator: 2, denominator: 4 },
    leadInBeats: 1,
    notes: [
      { pitch: "B", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "D'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "E'", durationBeats: 1 },
    ],
  },
  {
    id: 'tornado',
    name: '回旋飓风',
    description: '中级风系：华丽的装饰音，多段回旋伤害。选自《土耳其进行曲》。',
    bpm: 125,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 1,
    notes: [
      // 装饰音起手
      { pitch: "B", durationBeats: 0.5 },
      { pitch: "^C", durationBeats: 0.5 }, // 升1增加风的锐利感
      { pitch: "D", durationBeats: 0.5 },
      { pitch: "^C", durationBeats: 0.5 },
      { pitch: "E", durationBeats: 1 },
      { pitch: null, required: false, durationBeats: 0.5 },
      // 旋律爬升
      { pitch: "E", durationBeats: 0.5 },
      { pitch: "F", durationBeats: 0.5 },
      { pitch: "G", durationBeats: 0.5 },
      { pitch: "A", durationBeats: 1.5 },
      // 快速下行（模拟飓风下砸）
      { pitch: "G", durationBeats: 0.25 },
      { pitch: "F", durationBeats: 0.25 },
      { pitch: "E", durationBeats: 0.25 },
      { pitch: "D", durationBeats: 0.25 },
      { pitch: "C", durationBeats: 2 },
    ],
  },
  {
    id: 'tempest',
    name: '末日风暴',
    description: '高阶风系：极速马蹄节奏，大范围轰炸，选自《威廉退尔序曲》。',
    bpm: 150,
    timeSignature: { numerator: 2, denominator: 4 },
    leadInBeats: 2,
    notes: [
      // 号角唤风 (4拍)
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },

      // 核心马蹄节奏 (重复两组)
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.25 },
      { pitch: "C'", durationBeats: 0.25 },
      { pitch: "C'", durationBeats: 1 },

      { pitch: "E'", durationBeats: 0.5 },
      { pitch: "E'", durationBeats: 0.25 },
      { pitch: "E'", durationBeats: 0.25 },
      { pitch: "E'", durationBeats: 1 },

      // 狂风加速段
      { pitch: "G'", durationBeats: 0.5 },
      { pitch: "F'", durationBeats: 0.5 },
      { pitch: "E'", durationBeats: 0.5 },
      { pitch: "D'", durationBeats: 0.5 },

      // 升调压迫
      { pitch: "^C'", durationBeats: 0.5 },
      { pitch: "^C'", durationBeats: 0.25 },
      { pitch: "^C'", durationBeats: 0.25 },
      { pitch: "^C'", durationBeats: 1 },

      // 终结长音
      { pitch: "C'", durationBeats: 4 },
    ],
  },
  {
    id: 'canon_c_major',
    name: '永恒共鸣 - C大调卡农',
    description: '高阶魔法：标准的C-G-A-E跳跃，找回最纯正的卡农听感',
    bpm: 80,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 2,
    notes: [
      // --- 第一阶段：和弦骨架 (灵魂跳跃) ---
      // 每一组 2 拍，这是卡农最著名的低音进行
      { pitch: "C'", durationBeats: 2 }, // C' (高音多)
      { pitch: "G", durationBeats: 2 },   // G  (中音索) -> 这一跳下去卡农味就出来了
      { pitch: "A", durationBeats: 2 },   // A  (中音拉)
      { pitch: "E", durationBeats: 2 },   // E  (中音米)
      { pitch: "F", durationBeats: 2 },   // F  (中音法)
      { pitch: "C", durationBeats: 2 },   // C  (中音多)
      { pitch: "F", durationBeats: 2 },   // F  (中音法)
      { pitch: "G", durationBeats: 2 },   // G  (中音索)

      // --- 第二阶段：经典旋律 (平滑流转) ---
      // 每一组 1 拍，经典的下行线条
      { pitch: "C'", durationBeats: 1 }, // 1'
      { pitch: "B", durationBeats: 1 },   // 7
      { pitch: "A", durationBeats: 1 },   // 6
      { pitch: "G", durationBeats: 1 },   // 5
      { pitch: "F", durationBeats: 1 },   // 4
      { pitch: "E", durationBeats: 1 },   // 3
      { pitch: "F", durationBeats: 1 },   // 4
      { pitch: "G", durationBeats: 1 },   // 5

      // --- 第三阶段：华彩跑动 (最著名的 0.5 拍连奏) ---
      // 这一段在键盘上按起来非常丝滑
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "B", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "E'", durationBeats: 0.5 }, // 1' 7 1' 3'
      { pitch: "D'", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 },
      { pitch: "B", durationBeats: 0.5 },
      { pitch: "D'", durationBeats: 0.5 }, // 2' 1' 7 2'

      { pitch: "A", durationBeats: 0.5 },
      { pitch: "G", durationBeats: 0.5 },
      { pitch: "A", durationBeats: 0.5 },
      { pitch: "C'", durationBeats: 0.5 }, // 6 5 6 1'
      { pitch: "B", durationBeats: 0.5 },
      { pitch: "A", durationBeats: 0.5 },
      { pitch: "G", durationBeats: 0.5 },
      { pitch: "B", durationBeats: 0.5 }, // 7 6 5 7

      // --- 终曲：归于和谐 ---
      { pitch: "C'", durationBeats: 4 }, // 最终的 C 大调主音长鸣
    ],
  },
  {
    id: 'twinkle',
    name: '小星星前半句',
    description: '1 1 5 5 6 6 5，默认 100 BPM，含两拍起手空拍',
    bpm: 100,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 2,
    notes: [
      { pitch: "C", durationBeats: 1 },
      { pitch: "C", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: "A", durationBeats: 1 },
      { pitch: "A", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: null, required: false, durationBeats: 1 },
      { pitch: "F", durationBeats: 1 },
      { pitch: "C", durationBeats: 1 },
    ],
  },
  {
    id: 'fireball',
    name: '欢乐颂片段',
    description: '3 3 4 5 | 5 4 3 2 | 1 1 2 3 | 3 2 2，默认 100 BPM',
    bpm: 100,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 2,
    notes: [
      { pitch: "E", durationBeats: 1 },
      { pitch: "E", durationBeats: 1 },
      { pitch: "F", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: "F", durationBeats: 1 },
      { pitch: "E", durationBeats: 1 },
      { pitch: "D", durationBeats: 1 },
      { pitch: "C", durationBeats: 1 },
      { pitch: "C", durationBeats: 1 },
      { pitch: "D", durationBeats: 1 },
      { pitch: "E", durationBeats: 1 },
      { pitch: "E", durationBeats: 1 },
      { pitch: "D", durationBeats: 1 },
      { pitch: "D", durationBeats: 1 },
      { pitch: null, required: false, durationBeats: 1 },
    ],
  },
  {
    id: 'scale-ascending',
    name: '上行音阶',
    description: '1 2 3 4 5 6，默认 110 BPM，手感测试用',
    bpm: 110,
    timeSignature: { numerator: 4, denominator: 4 },
    leadInBeats: 1,
    notes: [
      { pitch: "C", durationBeats: 1 },
      { pitch: "D", durationBeats: 1 },
      { pitch: "E", durationBeats: 1 },
      { pitch: "F", durationBeats: 1 },
      { pitch: "G", durationBeats: 1 },
      { pitch: "A", durationBeats: 1, required: false },
    ],
  },
]
