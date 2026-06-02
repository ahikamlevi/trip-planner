export const CURRENCIES = ['USD', 'EUR', 'GBP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'INR', 'ILS']

export function formatMoney(amount: number, currency: string, locale = 'en'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${Math.round(amount)} ${currency}`
  }
}
