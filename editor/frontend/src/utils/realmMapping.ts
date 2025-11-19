/**
 * 境界映射工具函数
 * 将数字1-9映射为一级到九级
 */

// 数字到中文境界的映射
export const numberToRealm = (tier: number): string => {
  const realmMap: Record<number, string> = {
    1: '一级',
    2: '二级',
    3: '三级',
    4: '四级',
    5: '五级',
    6: '六级',
    7: '七级',
    8: '八级',
    9: '九级',
  };

  return realmMap[tier] || `${tier}级`;
};

// 中文境界到数字的映射
export const realmToNumber = (realm: string): number => {
  const realmMap: Record<string, number> = {
    '一级': 1,
    '二级': 2,
    '三级': 3,
    '四级': 4,
    '五级': 5,
    '六级': 6,
    '七级': 7,
    '八级': 8,
    '九级': 9,
  };

  return realmMap[realm] || parseInt(realm.replace(/[^\d]/g, '')) || 1;
};

// 获取所有可选的境界选项（用于下拉框等）
export const getRealmOptions = () => {
  return [
    { label: '一级', value: 1 },
    { label: '二级', value: 2 },
    { label: '三级', value: 3 },
    { label: '四级', value: 4 },
    { label: '五级', value: 5 },
    { label: '六级', value: 6 },
    { label: '七级', value: 7 },
    { label: '八级', value: 8 },
    { label: '九级', value: 9 },
  ];
};

/**
 * 特化映射工具函数
 * 将英文特化类型映射为中文显示
 */

// 特化信息接口
export interface SpecializationInfo {
  label: string;
  description: string;
  coefficients: {
    atk: number;
    def: number;
    agi: number;
  };
}

// 特化映射数据
export const specializationMap: Record<string, SpecializationInfo> = {
  balanced: {
    label: '均衡',
    description: '通用型，攻守兼备',
    coefficients: { atk: 0.40, def: 0.40, agi: 0.20 }
  },
  attacker: {
    label: '攻击',
    description: '高输出，低防中速',
    coefficients: { atk: 0.55, def: 0.25, agi: 0.20 }
  },
  defender: {
    label: '防御',
    description: '高减伤，输出偏低',
    coefficients: { atk: 0.30, def: 0.55, agi: 0.15 }
  },
  agile: {
    label: '敏捷',
    description: '高速、破绽威胁',
    coefficients: { atk: 0.35, def: 0.20, agi: 0.45 }
  },
  bruiser: {
    label: '重装',
    description: '压迫近战',
    coefficients: { atk: 0.50, def: 0.40, agi: 0.10 }
  },
  skirmisher: {
    label: '游击',
    description: '灵活快打',
    coefficients: { atk: 0.40, def: 0.20, agi: 0.40 }
  },
  mystic: {
    label: '奥术',
    description: '均衡偏防，技能输出',
    coefficients: { atk: 0.35, def: 0.40, agi: 0.25 }
  },
  crazy: {
    label: '疯狂',
    description: '极高攻，极脆',
    coefficients: { atk: 0.65, def: 0.10, agi: 0.25 }
  }
};

// 获取特化的中文名称
export const getSpecializationLabel = (spec: string): string => {
  return specializationMap[spec]?.label || spec;
};

// 获取特化的详细说明
export const getSpecializationDescription = (spec: string): string => {
  return specializationMap[spec]?.description || '';
};

// 获取特化的系数信息
export const getSpecializationCoefficients = (spec: string) => {
  return specializationMap[spec]?.coefficients || { atk: 0, def: 0, agi: 0 };
};

// 获取特化的完整提示信息
export const getSpecializationTooltip = (spec: string): string => {
  const info = specializationMap[spec];
  if (!info) return spec;

  return `${info.description} (ATK: ${(info.coefficients.atk * 100).toFixed(0)}%, DEF: ${(info.coefficients.def * 100).toFixed(0)}%, AGI: ${(info.coefficients.agi * 100).toFixed(0)}%)`;
};

// 获取所有可选的特化选项（用于下拉框等）
export const getSpecializationOptions = () => {
  return Object.entries(specializationMap).map(([key, value]) => ({
    label: value.label,
    value: key
  }));
};