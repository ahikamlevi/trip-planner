export const CURRENCIES = ['USD', 'EUR', 'GBP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'INR', 'ILS']

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency}`
  }
}
