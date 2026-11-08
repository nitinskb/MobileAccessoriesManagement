import { apiRequest } from './client'

export interface StockReceiptResult { id: number; name: string; currentStock: number; unit: string }

export function receiveStock(productId: number, quantity: number, reason: string): Promise<StockReceiptResult> {
  return apiRequest(`/stock/products/${productId}/receipts`, {
    method: 'POST', body: JSON.stringify({ quantity, reason }),
  }, true)
}
