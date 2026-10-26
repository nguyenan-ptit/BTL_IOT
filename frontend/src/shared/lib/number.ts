// Số hiện theo kiểu Việt Nam: dấu phẩy thập phân (29,5 °C).
const oneDecimal = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
})
const integer = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export function formatTemperature(value: number): string {
  return `${oneDecimal.format(value)} °C`
}

export function formatInteger(value: number): string {
  return integer.format(value)
}
