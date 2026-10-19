import { ItemQuantityInfo } from './types';

/**
 * Analisa a descrição (wording) de um lançamento para detectar se contém quantidade entre parênteses.
 * Exemplos aceitos:
 *  - "(2) Desodorantes" -> quantidade: 2, nome limpo: "Desodorantes"
 *  - "(3x) Sabonetes" -> quantidade: 3, nome limpo: "Sabonetes"
 *  - "Desodorantes (2)" -> quantidade: 2, nome limpo: "Desodorantes"
 *  - "(2.5) Quilo de carne" ou "(2,5) Quilos" -> quantidade: 2.5
 *
 * Se a descrição contiver parênteses que não são quantidade (ex: "Presunto (250g)", "Padaria (Centro)"), retorna null.
 */
export function parseItemQuantity(wording?: string, totalAmount?: number): ItemQuantityInfo | null {
  if (!wording) return null;
  const trimmed = wording.trim();
  if (!trimmed) return null;

  let quantity: number | null = null;
  let cleanName: string | null = null;

  // 1. Prefixo: "(2) Desodorantes", "( 2 ) Desodorantes", "(2x) Desodorantes", etc.
  const matchPrefix = trimmed.match(/^\(\s*(\d+(?:[.,]\d+)?)\s*(?:x|un|itens|und|cx)?\s*\)\s*(.+)$/i);
  if (matchPrefix) {
    const parsedQty = parseFloat(matchPrefix[1].replace(',', '.'));
    const parsedName = matchPrefix[2].trim();
    if (parsedQty > 0 && parsedName) {
      quantity = parsedQty;
      cleanName = parsedName;
    }
  }

  // 2. Sufixo: "Desodorantes (2)" - apenas se não houver múltiplos pares de parênteses
  if (quantity === null && (!trimmed.includes('(') || trimmed.indexOf('(') === trimmed.lastIndexOf('('))) {
    const matchSuffix = trimmed.match(/^([^(]+?)\s*\(\s*(\d+(?:[.,]\d+)?)\s*(?:x|un|itens|und|cx)?\s*\)$/i);
    if (matchSuffix) {
      const parsedName = matchSuffix[1].trim();
      const parsedQty = parseFloat(matchSuffix[2].replace(',', '.'));
      if (parsedQty > 0 && parsedName) {
        quantity = parsedQty;
        cleanName = parsedName;
      }
    }
  }

  if (quantity === null || cleanName === null) {
    return null;
  }

  const absTotal = totalAmount !== undefined ? Math.abs(totalAmount) : 0;
  const unitPrice = quantity > 0 ? absTotal / quantity : absTotal;

  return {
    quantity,
    cleanName,
    unitPrice,
    totalPrice: absTotal,
  };
}
