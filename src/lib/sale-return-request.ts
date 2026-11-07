import { z } from 'zod'

const positiveId = z.coerce.number().int().positive().safe()
export const SaleReturnRequestSchema = z.object({
  store_id: positiveId,
  venda_id: positiveId,
  customer_id: positiveId,
  employee_id: positiveId,
  tipo_reembolso: z.enum(['Carteira', 'Estorno']),
  idempotency_key: z.string().uuid(),
  authorization_token: z.string().min(1),
  itens: z.array(z.object({
    venda_item_id: positiveId,
    condicao: z.enum(['Intacto', 'Defeito', 'Sobra']),
    detalhes_sobra: z.object({
      diametro: z.coerce.number().positive().max(999),
      olho: z.enum(['OD', 'OE']),
    }).optional(),
  })).min(1).max(200),
}).superRefine((value, ctx) => {
  const ids = new Set<number>()
  for (const [index, item] of value.itens.entries()) {
    if (ids.has(item.venda_item_id)) {
      ctx.addIssue({ code: 'custom', message: 'Item repetido.', path: ['itens', index] })
    }
    ids.add(item.venda_item_id)
    if (item.condicao === 'Sobra' && !item.detalhes_sobra) {
      ctx.addIssue({ code: 'custom', message: 'Informe diâmetro e olho da sobra.', path: ['itens', index] })
    }
  }
})
