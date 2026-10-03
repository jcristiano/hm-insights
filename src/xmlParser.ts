import {
  Category,
  CategorySummary,
  Operation,
  Payee,
  Account,
  DetailedOperation,
  SubcategorySummary,
} from './types';

export function parseHomeBankDate(hbDateStr: string): Date {
  const hbDate = parseInt(hbDateStr, 10);
  if (isNaN(hbDate) || hbDate <= 0) return new Date(0);
  
  // O HomeBank usa o número de dias a partir de 01/01/0001 (Rata Die).
  // A diferença para a época Unix (01/01/1970) é de 719163 dias.
  const utcDays = hbDate - 719163;
  const utcMillis = utcDays * 86400 * 1000;
  
  const d = new Date(utcMillis);
  // Garante que usamos a data UTC pura para criar o objeto local no meio do dia (12:00)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0);
}

export function parseHomeBankXML(xmlText: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

  const categoriesMap = new Map<number, Category>();
  const catNodes = xmlDoc.getElementsByTagName('cat');
  Array.from(catNodes).forEach((node) => {
    const key = parseInt(node.getAttribute('key') || '0', 10);
    const name = node.getAttribute('name') || '';
    const parent = node.getAttribute('parent')
      ? parseInt(node.getAttribute('parent')!, 10)
      : undefined;
    const flags = parseInt(node.getAttribute('flags') || '0', 10);
    categoriesMap.set(key, { key, name, parent, flags });
  });

  const accountsMap = new Map<number, Account>();
  const accNodes = xmlDoc.getElementsByTagName('account');
  Array.from(accNodes).forEach((node) => {
    const key = parseInt(node.getAttribute('key') || '0', 10);
    const name = node.getAttribute('name') || '';
    const bankname = node.getAttribute('bankname') || undefined;
    const initial = parseFloat(node.getAttribute('initial') || '0');
    accountsMap.set(key, { key, name, bankname, initial });
  });

  const payeesMap = new Map<number, Payee>();
  const payNodes = xmlDoc.getElementsByTagName('pay');
  Array.from(payNodes).forEach((node) => {
    const key = parseInt(node.getAttribute('key') || '0', 10);
    const name = node.getAttribute('name') || '';
    payeesMap.set(key, { key, name });
  });

  // Map each Payee to its default / known Category from previous categorized operations
  const payeeDefaultCategoryMap = new Map<number, number>();

  const opeNodes = xmlDoc.getElementsByTagName('ope');

  // Pass 1: Build payee -> category mapping
  Array.from(opeNodes).forEach((node) => {
    const payeeKey = node.getAttribute('payee')
      ? parseInt(node.getAttribute('payee')!, 10)
      : undefined;
    const categoryKey = node.getAttribute('category')
      ? parseInt(node.getAttribute('category')!, 10)
      : undefined;

    if (payeeKey && categoryKey) {
      payeeDefaultCategoryMap.set(payeeKey, categoryKey);
    }

    const splitNodes = node.getElementsByTagName('split');
    Array.from(splitNodes).forEach((splitNode) => {
      const splitCatKey = splitNode.getAttribute('category')
        ? parseInt(splitNode.getAttribute('category')!, 10)
        : undefined;
      if (payeeKey && splitCatKey) {
        payeeDefaultCategoryMap.set(payeeKey, splitCatKey);
      }
    });
  });

  // Pass 2: Extract operations
  const operations: Operation[] = [];

  Array.from(opeNodes).forEach((node) => {
    const date = parseHomeBankDate(node.getAttribute('date') || '0');
    const mainAmount = parseFloat(node.getAttribute('amount') || '0');
    const accountKey = parseInt(node.getAttribute('account') || '0', 10);
    let mainCategoryKey = node.getAttribute('category')
      ? parseInt(node.getAttribute('category')!, 10)
      : undefined;
    const payeeKey = node.getAttribute('payee')
      ? parseInt(node.getAttribute('payee')!, 10)
      : undefined;
    const wording = node.getAttribute('wording') || undefined;
    const flags = parseInt(node.getAttribute('flags') || '0', 10);
    const kxfer = node.getAttribute('kxfer')
      ? parseInt(node.getAttribute('kxfer')!, 10)
      : undefined;

    // Detect internal transfers (HomeBank OF_INTERNAL = 8 or kxfer attribute)
    const isTransfer = Boolean(
      kxfer !== undefined || (flags & 8) !== 0
    );

    // Fallback to Payee's mapped category if category is missing
    if (!mainCategoryKey && payeeKey && payeeDefaultCategoryMap.has(payeeKey)) {
      mainCategoryKey = payeeDefaultCategoryMap.get(payeeKey);
    }

    const scat = node.getAttribute('scat');
    const samt = node.getAttribute('samt');
    const smem = node.getAttribute('smem');
    
    let splits: import('./types').OperationSplit[] | undefined = undefined;

    if (scat && samt) {
      const catArray = scat.split('||');
      const amtArray = samt.split('||');
      const memArray = smem ? smem.split('||') : [];
      
      splits = amtArray.map((amtStr, idx) => {
        let catKey = parseInt(catArray[idx] || '0', 10) || undefined;
        if (!catKey && payeeKey && payeeDefaultCategoryMap.has(payeeKey)) {
          catKey = payeeDefaultCategoryMap.get(payeeKey);
        }
        return {
          amount: parseFloat(amtStr || '0'),
          categoryKey: catKey,
          wording: memArray[idx] || wording
        };
      });
    } else {
      const splitNodes = node.getElementsByTagName('split');
      if (splitNodes.length > 0) {
        splits = Array.from(splitNodes).map((splitNode) => {
          let splitCatKey = splitNode.getAttribute('category')
            ? parseInt(splitNode.getAttribute('category')!, 10)
            : mainCategoryKey;
          if (!splitCatKey && payeeKey && payeeDefaultCategoryMap.has(payeeKey)) {
            splitCatKey = payeeDefaultCategoryMap.get(payeeKey);
          }
          return {
            amount: parseFloat(splitNode.getAttribute('amount') || '0'),
            categoryKey: splitCatKey,
            wording: splitNode.getAttribute('wording') || wording
          };
        });
      }
    }

    operations.push({
      id: `ope-${Math.random().toString(36).substr(2, 9)}-${date.getTime()}`,
      date,
      amount: mainAmount,
      accountKey,
      categoryKey: mainCategoryKey,
      payeeKey,
      wording,
      flags,
      kxfer,
      isTransfer,
      splits,
    });
  });

  return { categoriesMap, accountsMap, payeesMap, operations };
}

/**
 * Resolves root category, subcategory path, and direct category for any given category key.
 */
export function getCategoryHierarchy(
  catKey: number | undefined,
  categoriesMap: Map<number, Category>
): {
  rootCategory: Category;
  subcategoryName: string;
  subcategoryKey: number;
} {
  if (!catKey || !categoriesMap.has(catKey)) {
    const uncategorized: Category = { key: 0, name: 'Sem Categoria' };
    return {
      rootCategory: uncategorized,
      subcategoryName: 'Sem Categoria',
      subcategoryKey: 0,
    };
  }

  const directCategory = categoriesMap.get(catKey)!;
  const path: Category[] = [];
  let current: Category | undefined = directCategory;
  const visited = new Set<number>();

  while (current && !visited.has(current.key)) {
    visited.add(current.key);
    path.unshift(current); // Prepend so root is at index 0

    if (current.parent && current.parent !== 0 && categoriesMap.has(current.parent)) {
      current = categoriesMap.get(current.parent);
    } else {
      break;
    }
  }

  const rootCategory = path[0];
  let subcategoryName = directCategory.name;

  if (path.length > 1) {
    subcategoryName = path.slice(1).map((c) => c.name).join(' > ');
  } else if (directCategory.key === rootCategory.key) {
    subcategoryName = '(Geral / Direto)';
  }

  return {
    rootCategory,
    subcategoryName,
    subcategoryKey: directCategory.key,
  };
}

export function calculateCategorySummaries(
  operations: Operation[],
  categoriesMap: Map<number, Category>,
  accountsMap: Map<number, Account> = new Map(),
  payeesMap: Map<number, Payee> = new Map(),
  mode: 'expenses' | 'incomes' | 'all' = 'expenses',
  startDate?: Date | null,
  endDate?: Date | null
): CategorySummary[] {
  const summaryMap = new Map<
    number,
    {
      total: number;
      subcategories: Map<
        number,
        { name: string; key: number; total: number; count: number }
      >;
      operations: DetailedOperation[];
    }
  >();

  let grandTotal = 0;

  operations.forEach((op) => {
    // Exclude internal transfers between accounts from category totals
    if (op.isTransfer) return;

    // Check date boundaries
    if (startDate && op.date < startDate) return;
    if (endDate && op.date > endDate) return;

    const processItem = (
      amount: number,
      categoryKey: number | undefined,
      wording: string | undefined
    ) => {
      const catObj = categoryKey ? categoriesMap.get(categoryKey) : undefined;
      // In HomeBank XML, category flag bit 1 (value 2) is GF_INCOME
      const isIncomeCategory = catObj ? ((catObj.flags || 0) & 2) !== 0 : false;

      let include = false;
      let netAmount = 0;

      if (mode === 'expenses') {
        // Process negative amounts (expenses) or positive amounts on expense categories (refunds)
        if (amount < 0 || (amount > 0 && !isIncomeCategory && categoryKey)) {
          include = true;
          netAmount = amount < 0 ? Math.abs(amount) : -amount;
        }
      } else if (mode === 'incomes') {
        // Process positive amounts (incomes) or negative amounts on income categories (adjustments)
        if (amount > 0 || (amount < 0 && isIncomeCategory && categoryKey)) {
          include = true;
          netAmount = amount > 0 ? amount : amount;
        }
      } else {
        // 'all'
        include = true;
        netAmount = Math.abs(amount);
      }

      if (!include) return;

      const { rootCategory, subcategoryName, subcategoryKey } = getCategoryHierarchy(
        categoryKey,
        categoriesMap
      );

      grandTotal += netAmount;

      const parentCatId = rootCategory.key;

      if (!summaryMap.has(parentCatId)) {
        summaryMap.set(parentCatId, {
          total: 0,
          subcategories: new Map(),
          operations: [],
        });
      }

      const item = summaryMap.get(parentCatId)!;
      item.total += netAmount;

      // Track subcategory
      const subData = item.subcategories.get(subcategoryKey) || {
        name: subcategoryName,
        key: subcategoryKey,
        total: 0,
        count: 0,
      };
      item.subcategories.set(subcategoryKey, {
        name: subcategoryName,
        key: subcategoryKey,
        total: subData.total + netAmount,
        count: subData.count + 1,
      });

      const detailedOp: DetailedOperation = {
        date: op.date,
        amount: Math.abs(amount),
        rawAmount: amount,
        accountName: op.accountKey ? accountsMap.get(op.accountKey)?.name : undefined,
        categoryName: rootCategory.name,
        subcategoryName,
        payeeName: op.payeeKey ? payeesMap.get(op.payeeKey)?.name : undefined,
        wording: wording,
        categoryKey: rootCategory.key,
        subcategoryKey,
      };

      item.operations.push(detailedOp);
    };

    if (op.splits && op.splits.length > 0) {
      op.splits.forEach(split => {
        processItem(split.amount, split.categoryKey, split.wording || op.wording);
      });
    } else {
      processItem(op.amount, op.categoryKey, op.wording);
    }
  });

  const result: CategorySummary[] = [];

  summaryMap.forEach((value, key) => {
    const mainCat = categoriesMap.get(key);
    const mainName = mainCat ? mainCat.name : key === 0 ? 'Sem Categoria' : `Categoria #${key}`;

    const subList: SubcategorySummary[] = Array.from(value.subcategories.values())
      .map((data) => ({
        key: data.key,
        name: data.name,
        total: data.total,
        operationsCount: data.count,
        percentage: value.total > 0 ? (data.total / value.total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Sort operations by date descending
    value.operations.sort((a, b) => b.date.getTime() - a.date.getTime());

    result.push({
      key,
      name: mainName,
      total: value.total,
      subcategories: subList,
      percentage: grandTotal > 0 ? (value.total / grandTotal) * 100 : 0,
      operations: value.operations,
      isIncome: mode === 'incomes',
    });
  });

  return result.sort((a, b) => b.total - a.total);
}

export function calculateAllCategoryExpenses(
  operations: Operation[],
  categoriesMap: Map<number, Category>,
  accountsMap: Map<number, Account> = new Map(),
  payeesMap: Map<number, Payee> = new Map(),
  startDate?: Date | null,
  endDate?: Date | null
): CategorySummary[] {
  return calculateCategorySummaries(
    operations,
    categoriesMap,
    accountsMap,
    payeesMap,
    'expenses',
    startDate,
    endDate
  );
}
