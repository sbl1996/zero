/**
 * 将数字转换为中文数字
 * @param num 数字
 * @returns 中文数字字符串
 */
export function numberToChinese(num: number): string {
  if (num < 1 || num > 99) {
    return num.toString()
  }

  const chinese: string[] = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

  if (num <= 10) {
    return chinese[num - 1] ?? num.toString()
  }

  if (num < 20) {
    const ones = chinese[num - 11] ?? ''
    return `十${ones}`
  }

  const tens = Math.floor(num / 10)
  const ones = num % 10
  const tensText = chinese[tens - 1] ?? tens.toString()

  if (ones === 0) {
    return `${tensText}十`
  }

  const onesText = chinese[ones - 1] ?? ones.toString()
  return `${tensText}十${onesText}`
}
