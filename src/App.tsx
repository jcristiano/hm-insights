import React, { useState, useMemo } from 'react';
import { parseHomeBankXML, calculateAllCategoryExpenses } from './xmlParser';
import { Category, Account, Payee, Operation, PresetPeriod, UserPreferences, Tag } from './types';
import { loadUserPreferences, saveUserPreferences } from './preferences';
import {
  UploadCloud,
  PieChart,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Search,
  Calendar,
  ChevronDown,
  ChevronUp,
  ShoppingBag,
  Receipt,
  RotateCcw,
  Building2,
  CreditCard,
  Sparkles,
  TrendingUp,
  Tag as TagIcon,
  Layers,
  FileCheck,
  FilterX,
  Menu,
  X,
  Landmark,
  Home,
  List,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Download,
  FileText,
  Printer,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatDateForInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetDates(
  preset: PresetPeriod,
  refDate: Date
): { start: string; end: string } | null {
  if (preset === 'all') return null;

  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  if (preset === 'current_month') {
    const start = new Date(year, month, 1);
    // Cria o dia 0 do mês seguinte (último dia do mês atual) às 12:00 para evitar roll-over por fuso
    const end = new Date(year, month + 1, 0, 12, 0, 0);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  if (preset === 'previous_month') {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  if (preset === 'current_bimonth') {
    const startMonth = Math.floor(month / 2) * 2;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 2, 0);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  if (preset === 'current_quarter') {
    const startMonth = Math.floor(month / 3) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  if (preset === 'current_semester') {
    const startMonth = Math.floor(month / 6) * 6;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 6, 0);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  if (preset === 'current_year') {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return { start: formatDateForInput(start), end: formatDateForInput(end) };
  }

  return null;
}

interface PayeeUnitSummary {
  name: string;
  total: number;
  operationsCount: number;
  operations: Operation[];
}

interface PayeeSummary {
  groupName: string;
  total: number;
  operationsCount: number;
  units: PayeeUnitSummary[];
}

const ANALYSIS_COLORS = [
  '#818cf8',
  '#2dd4bf',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#c084fc',
  '#34d399',
  '#f97316',
  '#38bdf8',
  '#e879f9',
];

function parsePayeeGrouping(payeeName?: string): { groupName: string; unitName: string } {
  const value = payeeName?.trim();
  if (!value) {
    return { groupName: 'Sem favorecido', unitName: 'Sem unidade' };
  }

  const match = value.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match) {
    return { groupName: value, unitName: 'Favorecido direto' };
  }

  return {
    groupName: match[2].trim() || 'Sem grupo',
    unitName: match[1].trim() || 'Unidade não informada',
  };
}

export default function App() {
  const [parsedData, setParsedData] = useState<{
    fileName: string;
    categoriesMap: Map<number, Category>;
    accountsMap: Map<number, Account>;
    payeesMap: Map<number, Payee>;
    tagsMap: Map<number, Tag>;
    operations: Operation[];
  } | null>(null);

  const [activePreset, setActivePreset] = useState<PresetPeriod>('all');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<number>>(new Set());
  const [useFileMaxDateAsRef, setUseFileMaxDateAsRef] = useState<boolean>(true);
  const [selectedSubcategoryKeys, setSelectedSubcategoryKeys] = useState<
    Record<number, number | null>
  >({});

  // Navigation states
  const [activeView, setActiveView] = useState<
    'dashboard' | 'analysis' | 'accounts' | 'payees' | 'report'
  >('dashboard');
  const [analysisCategoryKey, setAnalysisCategoryKey] = useState<number | null>(null);
  const [analysisSubcategoryKey, setAnalysisSubcategoryKey] = useState<number | null>(null);
  const [payeeSearchFilter, setPayeeSearchFilter] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedAccountKey, setSelectedAccountKey] = useState<number | null>(null);
  const [expandedSplits, setExpandedSplits] = useState<Set<string>>(new Set());
  const [expandedPayeeUnits, setExpandedPayeeUnits] = useState<Set<string>>(new Set());
  const [fileError, setFileError] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<Date | null>(null);

  // User Preferences (saved in LocalStorage)
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadUserPreferences());

  const updatePreferences = (newPrefs: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...newPrefs };
      saveUserPreferences(updated);
      return updated;
    });
  };

  const toggleSortOrder = () => {
    updatePreferences({
      operationsSortOrder: preferences.operationsSortOrder === 'desc' ? 'asc' : 'desc',
    });
  };

  // Handle XML / XHB File Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'xhb' && extension !== 'xml') {
      setFileError('Selecione um arquivo com extensão .xhb ou .xml.');
      return;
    }

    setIsLoadingFile(true);
    setFileError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlContent = e.target?.result;
        if (typeof xmlContent !== 'string' || !xmlContent.trim()) {
          throw new Error('O arquivo está vazio ou não pôde ser lido.');
        }

        const data = parseHomeBankXML(xmlContent);
        setParsedData({ fileName: file.name, ...data });
        setFileError(null);
        setActivePreset('all');
        setSelectedYear(null);
        setStartDateStr('');
        setEndDateStr('');
        setSelectedTagIds([]);
        setExpandedCategoryKeys(new Set());
        setSelectedSubcategoryKeys({});
        setExpandedSplits(new Set());
        setExpandedPayeeUnits(new Set());
        setAnalysisCategoryKey(null);
        setAnalysisSubcategoryKey(null);
        setReportGeneratedAt(null);
      } catch (error) {
        setParsedData(null);
        setFileError(error instanceof Error ? error.message : 'Não foi possível processar o arquivo.');
      } finally {
        setIsLoadingFile(false);
      }
    };
    reader.onerror = () => {
      setFileError('Não foi possível ler o arquivo selecionado.');
      setIsLoadingFile(false);
    };
    reader.readAsText(file);
  };

  // Determine latest date in file dataset
  const fileMaxDate = useMemo(() => {
    if (!parsedData || parsedData.operations.length === 0) return new Date();
    const dates = parsedData.operations.map((op) => op.date.getTime());
    return new Date(Math.max(...dates));
  }, [parsedData]);

  // Reference date used for presets (file latest date OR current real date)
  const referenceDate = useMemo(() => {
    return useFileMaxDateAsRef ? fileMaxDate : new Date();
  }, [useFileMaxDateAsRef, fileMaxDate]);

  // Available unique years in dataset
  const availableYears = useMemo(() => {
    if (!parsedData) return [];
    const yearsSet = new Set<number>();
    parsedData.operations.forEach((op) => {
      yearsSet.add(op.date.getFullYear());
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [parsedData]);

  // Apply Preset Click
  const handleApplyPreset = (preset: PresetPeriod) => {
    setActivePreset(preset);
    setSelectedYear(null);

    if (preset === 'all') {
      setStartDateStr('');
      setEndDateStr('');
    } else {
      const dates = getPresetDates(preset, referenceDate);
      if (dates) {
        setStartDateStr(dates.start);
        setEndDateStr(dates.end);
      }
    }
  };

  // Apply Year Quick Filter
  const handleApplyYearFilter = (year: number) => {
    const yearStr = year.toString();
    setSelectedYear(yearStr);
    setActivePreset('custom');
    setStartDateStr(`${yearStr}-01-01`);
    setEndDateStr(`${yearStr}-12-31`);
  };

  // Local Date boundary objects
  const activeStartDate = useMemo(() => {
    if (!startDateStr) return null;
    const parts = startDateStr.split('-').map(Number);
    if (parts.length !== 3) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0);
  }, [startDateStr]);

  const activeEndDate = useMemo(() => {
    if (!endDateStr) return null;
    const parts = endDateStr.split('-').map(Number);
    if (parts.length !== 3) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59);
  }, [endDateStr]);

  const dateRangeError = useMemo(() => {
    if (!activeStartDate || !activeEndDate || activeStartDate <= activeEndDate) return null;
    return 'A data inicial não pode ser posterior à data final.';
  }, [activeEndDate, activeStartDate]);

  // Filter operations for overall financial totals (excluding internal transfers) and tag filter
  const filteredOperations = useMemo(() => {
    if (!parsedData || dateRangeError) return [];
    return parsedData.operations.filter((op) => {
      if (op.isTransfer) return false; // Exclude internal transfers between accounts
      if (activeStartDate && op.date < activeStartDate) return false;
      if (activeEndDate && op.date > activeEndDate) return false;
      if (selectedTagIds.length > 0) {
        if (!op.tags) return false;
        // Match any selected tag
        const hasTag = op.tags.some((t) => selectedTagIds.includes(t));
        if (!hasTag) return false;
      }
      return true;
    });
  }, [parsedData, activeStartDate, activeEndDate, dateRangeError, selectedTagIds]);

  const { totalIncomes, totalExpenses } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredOperations.forEach((op) => {
      if (op.amount < 0) {
        exp += Math.abs(op.amount);
      } else {
        inc += op.amount;
      }
    });
    return { totalIncomes: inc, totalExpenses: exp };
  }, [filteredOperations]);

  // Calculate grouped categories from the same filtered operations used by the KPIs.
  const categorySummaries = useMemo(() => {
    if (!parsedData) return [];
    return calculateAllCategoryExpenses(
      filteredOperations,
      parsedData.categoriesMap,
      parsedData.accountsMap,
      parsedData.payeesMap
    );
  }, [parsedData, filteredOperations]);

  // Filter categories by search filter
  const filteredCategories = useMemo(() => {
    if (!searchFilter.trim()) return categorySummaries;
    const term = searchFilter.toLowerCase();
    return categorySummaries.filter((cat) => {
      const catMatches = cat.name.toLowerCase().includes(term);
      const subMatches = cat.subcategories.some((sub) => sub.name.toLowerCase().includes(term));
      const opMatches = cat.operations.some(
        (op) =>
          (op.wording && op.wording.toLowerCase().includes(term)) ||
          (op.payeeName && op.payeeName.toLowerCase().includes(term))
      );
      return catMatches || subMatches || opMatches;
    });
  }, [categorySummaries, searchFilter]);

  // Top category by spend
  const topExpenseCategory = useMemo(() => {
    if (categorySummaries.length === 0) return null;
    return categorySummaries[0];
  }, [categorySummaries]);

  const analysisCategoryData = useMemo(
    () =>
      categorySummaries.map((category) => ({
        key: category.key,
        name: category.name,
        value: category.total,
      })),
    [categorySummaries]
  );

  const selectedAnalysisCategory = useMemo(
    () => categorySummaries.find((category) => category.key === analysisCategoryKey) || null,
    [analysisCategoryKey, categorySummaries]
  );

  const analysisSubcategoryData = useMemo(
    () =>
      selectedAnalysisCategory?.subcategories.map((subcategory) => ({
        key: subcategory.key,
        name: subcategory.name,
        value: subcategory.total,
      })) || [],
    [selectedAnalysisCategory]
  );

  const analysisScopedOperations = useMemo(() => {
    if (!selectedAnalysisCategory) {
      return categorySummaries.flatMap((category) => category.operations);
    }

    return selectedAnalysisCategory.operations.filter(
      (operation) =>
        analysisSubcategoryKey === null ||
        operation.subcategoryKey === analysisSubcategoryKey
    );
  }, [analysisSubcategoryKey, categorySummaries, selectedAnalysisCategory]);

  const analysisPayeeData = useMemo(() => {
    const totals = new Map<string, number>();
    analysisScopedOperations.forEach((operation) => {
      const { groupName } = parsePayeeGrouping(operation.payeeName);
      totals.set(groupName, (totals.get(groupName) || 0) + operation.amount);
    });

    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [analysisScopedOperations]);

  const analysisMonthlyData = useMemo(() => {
    const totals = new Map<string, { expenses: number; incomes: number }>();
    filteredOperations.forEach((operation) => {
      const key = `${operation.date.getFullYear()}-${String(operation.date.getMonth() + 1).padStart(2, '0')}`;
      const current = totals.get(key) || { expenses: 0, incomes: 0 };
      if (operation.amount < 0) current.expenses += Math.abs(operation.amount);
      else current.incomes += operation.amount;
      totals.set(key, current);
    });

    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month: month.split('-').reverse().join('/'),
        expenses: values.expenses,
        incomes: values.incomes,
      }));
  }, [filteredOperations]);

  const analysisAccountData = useMemo(() => {
    if (!parsedData) return [];
    const totals = new Map<number, number>();
    filteredOperations.forEach((operation) => {
      if (operation.amount < 0) {
        totals.set(
          operation.accountKey,
          (totals.get(operation.accountKey) || 0) + Math.abs(operation.amount)
        );
      }
    });

    return Array.from(totals.entries())
      .map(([key, value]) => ({
        name: parsedData.accountsMap.get(key)?.name || 'Sem conta',
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOperations, parsedData]);

  const reportMetrics = useMemo(() => {
    const expenseOperations = filteredOperations.filter((operation) => operation.amount < 0);
    const days = new Set(
      expenseOperations.map((operation) => operation.date.toISOString().slice(0, 10))
    );
    const largestExpense = expenseOperations.reduce<Operation | null>(
      (largest, operation) =>
        !largest || Math.abs(operation.amount) > Math.abs(largest.amount) ? operation : largest,
      null
    );
    const uncategorizedCount = expenseOperations.filter(
      (operation) =>
        !operation.categoryKey && (!operation.splits || operation.splits.length === 0)
    ).length;

    return {
      expenseOperations,
      daysCount: days.size,
      averageDailyExpense: days.size > 0 ? totalExpenses / days.size : 0,
      largestExpense,
      uncategorizedCount,
    };
  }, [filteredOperations, totalExpenses]);

  const downloadReport = () => {
    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Relatório Analítico HomeBank Insights'],
      ['Arquivo', parsedData?.fileName || ''],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
      ['Período inicial', startDateStr || 'Todos'],
      ['Período final', endDateStr || 'Todos'],
      [],
      ['Indicador', 'Valor'],
      ['Receitas', totalIncomes.toFixed(2)],
      ['Despesas', totalExpenses.toFixed(2)],
      ['Saldo', (totalIncomes - totalExpenses).toFixed(2)],
      ['Média diária de despesas', reportMetrics.averageDailyExpense.toFixed(2)],
      ['Lançamentos de despesas', reportMetrics.expenseOperations.length],
      [],
      ['Categorias', 'Total', 'Percentual'],
      ...categorySummaries.map((category) => [
        category.name,
        category.total.toFixed(2),
        `${category.percentage.toFixed(2)}%`,
      ]),
      [],
      ['Favorecidos', 'Total', 'Lançamentos'],
      ...payeeSummaries.map((payee) => [payee.groupName, payee.total.toFixed(2), payee.operationsCount]),
    ];
    const csv = rows.map((row) => row.map((value) => escapeCsv(value ?? '')).join(';')).join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-homebank-${formatDateForInput(new Date())}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const payeeSummaries = useMemo<PayeeSummary[]>(() => {
    const groups = new Map<string, Map<string, PayeeUnitSummary>>();

    filteredOperations.forEach((op) => {
      if (op.amount >= 0) return;

      const payeeName = op.payeeKey ? parsedData?.payeesMap.get(op.payeeKey)?.name : undefined;
      const { groupName, unitName } = parsePayeeGrouping(payeeName);
      if (!groups.has(groupName)) groups.set(groupName, new Map());

      const units = groups.get(groupName)!;
      const current = units.get(unitName) || {
        name: unitName,
        total: 0,
        operationsCount: 0,
        operations: [],
      };
      units.set(unitName, {
        name: unitName,
        total: current.total + Math.abs(op.amount),
        operationsCount: current.operationsCount + 1,
        operations: [...current.operations, op],
      });
    });

    return Array.from(groups.entries())
      .map(([groupName, units]) => {
        const unitList = Array.from(units.values()).sort((a, b) => b.total - a.total);
        return {
          groupName,
          total: unitList.reduce((sum, unit) => sum + unit.total, 0),
          operationsCount: unitList.reduce((sum, unit) => sum + unit.operationsCount, 0),
          units: unitList,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredOperations, parsedData]);

  const filteredPayeeSummaries = useMemo(() => {
    const term = payeeSearchFilter.trim().toLowerCase();
    if (!term) return payeeSummaries;

    return payeeSummaries
      .map((group) => ({
        ...group,
        units: group.units.filter(
          (unit) =>
            group.groupName.toLowerCase().includes(term) ||
            unit.name.toLowerCase().includes(term)
        ),
      }))
      .filter((group) => group.units.length > 0);
  }, [payeeSearchFilter, payeeSummaries]);

  // Expand / Collapse Category Accordion
  const toggleExpandCategory = (key: number) => {
    setExpandedCategoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allKeys = new Set(filteredCategories.map((c) => c.key));
    setExpandedCategoryKeys(allKeys);
  };

  const collapseAll = () => {
    setExpandedCategoryKeys(new Set());
  };

  const clearDateFilters = () => {
    setActivePreset('all');
    setSelectedYear(null);
    setStartDateStr('');
    setEndDateStr('');
  };

  const clearAllFilters = () => {
    clearDateFilters();
    setSelectedTagIds([]);
    setSearchFilter('');
    setPayeeSearchFilter('');
  };

  const toggleSubcategoryFilter = (catKey: number, subKey: number) => {
    setSelectedSubcategoryKeys((prev) => {
      const current = prev[catKey];
      return {
        ...prev,
        [catKey]: current === subKey ? null : subKey,
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-['Plus_Jakarta_Sans',sans-serif] relative overflow-x-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>
      <div className="absolute top-1/3 right-10 w-[450px] h-[450px] bg-teal-500/10 rounded-full blur-[130px] pointer-events-none -z-10"></div>

      {/* Sidebar Navigation Drawer */}
      {parsedData && (
        <>
          {/* Overlay */}
          <div
            className={`fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity duration-300 ${
              isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            onClick={() => setIsMenuOpen(false)}
          ></div>

          {/* Drawer */}
          <div
            className={`fixed top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-800 z-50 transform transition-transform duration-300 ease-in-out ${
              isMenuOpen ? 'translate-x-0' : '-translate-x-full'
            } shadow-2xl flex flex-col`}
          >
            <div className="p-5 flex items-center justify-between border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-white tracking-wide text-sm">HomeBank Menu</span>
              </div>
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <button
                onClick={() => {
                  setActiveView('dashboard');
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeView === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Home className="w-5 h-5" />
                Dashboard Geral
              </button>
              <button
                onClick={() => {
                  setActiveView('accounts');
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeView === 'accounts'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Landmark className="w-5 h-5" />
                Contas e Extratos
              </button>
              <button
                onClick={() => {
                  setActiveView('analysis');
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeView === 'analysis'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                Análise Gráfica
              </button>
              <button
                onClick={() => {
                  setActiveView('report');
                  setReportGeneratedAt(new Date());
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeView === 'report'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <FileText className="w-5 h-5" />
                Relatório Analítico
              </button>
              <button
                onClick={() => {
                  setActiveView('payees');
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeView === 'payees'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Building2 className="w-5 h-5" />
                Gastos por Favorecido
              </button>
            </div>
            <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
              Minhas Finanças Clone v1.0
            </div>
          </div>
        </>
      )}

      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 md:px-8 py-4 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            {parsedData && (
              <button
                onClick={() => setIsMenuOpen(true)}
                className="p-2.5 mr-1 md:hidden bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-300 transition"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            
            <div className="hidden md:flex p-2.5 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/25 items-center justify-center">
              <PieChart className="w-6 h-6 text-white" />
            </div>
            
            {parsedData && (
              <button
                onClick={() => setIsMenuOpen(true)}
                className="hidden md:flex p-2.5 mr-1 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-slate-300 transition"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  HomeBank Insights
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-widest bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  v2.0 PRO
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Análise financeira inteligente, agrupamento de categorias e rastreamento de compras
              </p>
            </div>
          </div>

          {parsedData ? (
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <div className="hidden sm:flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs text-slate-300">
                <FileCheck className="w-4 h-4 text-emerald-400" />
                <span className="truncate max-w-[160px]" title={parsedData.fileName}>
                  {parsedData.fileName}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 font-medium">
                  {parsedData.operations.length} lançamentos
                </span>
              </div>

              <label className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-medium px-4 py-2 rounded-xl cursor-pointer shadow-lg shadow-indigo-500/20 transition text-xs">
                <UploadCloud className="w-4 h-4" />
                Trocar Arquivo (.xhb)
                <input type="file" accept=".xhb,.xml" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {parsedData && dateRangeError && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            {dateRangeError} Ajuste o intervalo para visualizar os dados.
          </div>
        )}
        {!parsedData ? (
          /* Empty State Landing Screen */
          <div className="max-w-3xl mx-auto my-12">
            <div className="relative glass-card border border-slate-800 rounded-3xl p-8 md:p-14 text-center overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
              
              <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-indigo-600/20 to-teal-500/20 border border-indigo-500/30 rounded-3xl flex items-center justify-center text-indigo-400 mb-6 shadow-xl">
                <UploadCloud className="w-10 h-10" />
              </div>

              <h2 className="text-3xl font-extrabold text-white mb-3">
                Importe seu arquivo do HomeBank
              </h2>
              {isLoadingFile && (
                <div className="mb-5 text-sm text-indigo-300 animate-pulse">
                  Processando o arquivo e preparando os indicadores...
                </div>
              )}
              <p className="text-slate-400 text-sm max-w-lg mx-auto mb-8 leading-relaxed">
                Carregue seu arquivo <code className="text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono text-xs">.xhb</code> ou <code className="text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono text-xs">.xml</code> para desbloquear a análise de 100% dos seus gastos, filtro completo por intervalo de datas e detalhamento de cada item comprado.
              </p>
              {fileError && (
                <div className="max-w-lg mx-auto mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left text-xs text-rose-300">
                  Não foi possível carregar o arquivo: {fileError}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <label className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 via-blue-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white font-semibold px-8 py-3.5 rounded-2xl cursor-pointer shadow-xl shadow-indigo-500/25 transition transform active:scale-95 flex items-center justify-center gap-2">
                  <UploadCloud className="w-5 h-5" />
                  Selecionar Arquivo .xhb / .xml
                  <input type="file" accept=".xhb,.xml" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 pt-8 border-t border-slate-800/80 text-left">
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
                  <Calendar className="w-5 h-5 text-indigo-400 mb-2" />
                  <h3 className="text-xs font-bold text-slate-200 mb-1">Filtro por Período</h3>
                  <p className="text-[11px] text-slate-400">
                    Selecione bimestres, trimestres, semestres, anos ou datas customizadas.
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
                  <Receipt className="w-5 h-5 text-teal-400 mb-2" />
                  <h3 className="text-xs font-bold text-slate-200 mb-1">Detalhamento dos Itens</h3>
                  <p className="text-[11px] text-slate-400">
                    Veja exatamente o que foi comprado em cada lançamento individual.
                  </p>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
                  <Sparkles className="w-5 h-5 text-emerald-400 mb-2" />
                  <h3 className="text-xs font-bold text-slate-200 mb-1">Visão 100% Completa</h3>
                  <p className="text-[11px] text-slate-400">
                    Sem limites de exibição: agrupa 100% das categorias e subcategorias.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : activeView === 'dashboard' ? (
          <div className="space-y-8">
            {/* Control Panel: Date Interval & Quick Presets */}
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-400" />
                    <h2 className="text-lg font-bold text-white">Intervalo de Análise</h2>
                    <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-0.5 rounded-full">
                      {filteredOperations.length} lançamentos filtrados
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Escolha um atalho rápido ou defina o período exato (Início e Fim)
                  </p>
                </div>

                {/* Reference Date Toggle */}
                <div className="flex items-center gap-3 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 text-xs">
                  <span className="text-slate-400 pl-2">Atalhos baseados em:</span>
                  <button
                    onClick={() => setUseFileMaxDateAsRef(true)}
                    className={`px-3 py-1 rounded-xl transition ${
                      useFileMaxDateAsRef
                        ? 'bg-indigo-600 text-white font-medium shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Data do Arquivo ({referenceDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })})
                  </button>
                  <button
                    onClick={() => setUseFileMaxDateAsRef(false)}
                    className={`px-3 py-1 rounded-xl transition ${
                      !useFileMaxDateAsRef
                        ? 'bg-indigo-600 text-white font-medium shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Hoje
                  </button>
                </div>
              </div>

              {/* Date Inputs & Presets Grid */}
              <div className="space-y-4">
                {/* Inputs Row */}
                <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-300">Data Inicial:</span>
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => {
                        setStartDateStr(e.target.value);
                        setActivePreset('custom');
                        setSelectedYear(null);
                      }}
                      className="glass-input text-xs text-slate-100 px-3.5 py-2 rounded-xl focus:outline-none cursor-pointer"
                    />
                  </div>

                  <span className="text-slate-500 text-xs font-semibold">até</span>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-300">Data Final:</span>
                    <input
                      type="date"
                      value={endDateStr}
                      onChange={(e) => {
                        setEndDateStr(e.target.value);
                        setActivePreset('custom');
                        setSelectedYear(null);
                      }}
                      className="glass-input text-xs text-slate-100 px-3.5 py-2 rounded-xl focus:outline-none cursor-pointer"
                    />
                  </div>

                  {(startDateStr ||
                    endDateStr ||
                    activePreset !== 'all' ||
                    selectedYear !== null ||
                    selectedTagIds.length > 0 ||
                    searchFilter.trim()) && (
                    <button
                      onClick={clearAllFilters}
                      className="ml-auto text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3.5 py-2 rounded-xl transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Limpar Filtros
                    </button>
                  )}
                </div>

                {/* Presets Pills Row */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400 mr-2 font-medium">Atalhos de Período:</span>

                  <button
                    onClick={() => handleApplyPreset('all')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'all' && !selectedYear
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Todos os Tempos
                  </button>

                  <button
                    onClick={() => handleApplyPreset('current_month')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'current_month'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Mês Atual
                  </button>

                  <button
                    onClick={() => handleApplyPreset('previous_month')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'previous_month'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Mês Anterior
                  </button>

                  <button
                    onClick={() => handleApplyPreset('current_bimonth')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'current_bimonth'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Bimestre Atual
                  </button>

                  <button
                    onClick={() => handleApplyPreset('current_quarter')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'current_quarter'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Trimestre Atual
                  </button>

                  <button
                    onClick={() => handleApplyPreset('current_semester')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'current_semester'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Semestre Atual
                  </button>

                  <button
                    onClick={() => handleApplyPreset('current_year')}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                      activePreset === 'current_year'
                        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    Ano Atual
                  </button>
                </div>
                {dateRangeError && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                    {dateRangeError}
                  </div>
                )}

                {/* Years Selector Row */}
{availableYears.length > 0 && (
  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
    <span className="text-xs text-slate-400 mr-2 font-medium">Filtrar por Ano:</span>
    {availableYears.map((yr) => (
      <button
        key={yr}
        onClick={() => handleApplyYearFilter(yr)}
        className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
          selectedYear === yr.toString()
            ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
            : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800/80'
        }`}
      >
        {yr}
      </button>
    ))}
  </div>
)}

{/* Tags Selector Row */}
{parsedData && parsedData.tagsMap && Array.from(parsedData.tagsMap.values()).length > 0 && (
  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
    <span className="text-xs text-slate-400 mr-2 font-medium">Filtrar por Tag:</span>
    {Array.from(parsedData.tagsMap.values()).map((tag) => {
      const isSelected = selectedTagIds.includes(tag.key);
      return (
        <button
          key={tag.key}
          onClick={() => {
            setSelectedTagIds((prev) =>
              isSelected ? prev.filter((id) => id !== tag.key) : [...prev, tag.key]
            );
          }}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
            isSelected
              ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-500/20'
              : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800/80'
          }`}
        >
          <TagIcon className="inline w-3 h-3 mr-1 align-text-bottom" /> {tag.name}
        </button>
      );
    })}
  </div>
)}
              </div>
            </div>

            {/* Financial KPI Dashboard Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Receitas */}
              <div className="glass-card glass-card-hover rounded-3xl p-6 border border-slate-800/80">
                <div className="flex justify-between items-center text-slate-400 text-xs font-medium mb-3">
                  <span>Receitas Totais</span>
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-400 tracking-tight">
                  {totalIncomes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                  <span>Entradas no período</span>
                  <span className="text-emerald-400 font-semibold">
                    {filteredOperations.filter((op) => op.amount > 0).length} itens
                  </span>
                </div>
              </div>

              {/* Despesas */}
              <div className="glass-card glass-card-hover rounded-3xl p-6 border border-slate-800/80">
                <div className="flex justify-between items-center text-slate-400 text-xs font-medium mb-3">
                  <span>Despesas Totais</span>
                  <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
                    <ArrowDownRight className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-2xl font-black text-rose-400 tracking-tight">
                  {totalExpenses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                  <span>Saídas no período</span>
                  <span className="text-rose-400 font-semibold">
                    {filteredOperations.filter((op) => op.amount < 0).length} itens
                  </span>
                </div>
              </div>

              {/* Saldo Líquido */}
              <div className="glass-card glass-card-hover rounded-3xl p-6 border border-slate-800/80">
                <div className="flex justify-between items-center text-slate-400 text-xs font-medium mb-3">
                  <span>Saldo do Período</span>
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
                <div
                  className={`text-2xl font-black tracking-tight ${
                    totalIncomes - totalExpenses >= 0 ? 'text-blue-400' : 'text-rose-400'
                  }`}
                >
                  {(totalIncomes - totalExpenses).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                  <span>Resultado</span>
                  <span
                    className={`font-semibold ${
                      totalIncomes - totalExpenses >= 0 ? 'text-blue-400' : 'text-rose-400'
                    }`}
                  >
                    {totalIncomes - totalExpenses >= 0 ? 'Superávit' : 'Déficit'}
                  </span>
                </div>
              </div>

              {/* Maior Categoria de Gasto */}
              <div className="glass-card glass-card-hover rounded-3xl p-6 border border-slate-800/80">
                <div className="flex justify-between items-center text-slate-400 text-xs font-medium mb-3">
                  <span>Maior Categoria de Gasto</span>
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                </div>
                <div className="text-lg font-bold text-amber-300 truncate" title={topExpenseCategory?.name || 'Nenhuma'}>
                  {topExpenseCategory ? topExpenseCategory.name : '-'}
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-between">
                  <span>Total gasto</span>
                  <span className="text-amber-400 font-semibold">
                    {topExpenseCategory
                      ? topExpenseCategory.total.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                      : 'R$ 0,00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Categories & Transactions Main View */}
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                    <ShoppingBag className="w-6 h-6 text-indigo-400" />
                    Categorias e Lançamentos Detalhados ({filteredCategories.length})
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Clique na categoria para expandir subcategorias e filtrar cada lançamento individual.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={expandAll}
                      className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl transition"
                    >
                      Expandir Todos
                    </button>
                    <button
                      onClick={collapseAll}
                      className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl transition"
                    >
                      Recolher Todos
                    </button>
                    <button
                      onClick={toggleSortOrder}
                      title={`Clique para ordenar por data: ${preferences.operationsSortOrder === 'desc' ? 'Mais recente primeiro' : 'Mais antigo primeiro'}`}
                      className="text-xs font-semibold text-slate-200 hover:text-white bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm"
                    >
                      <ArrowDownUp className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Data:</span>
                      <span className="text-indigo-400 font-bold">
                        {preferences.operationsSortOrder === 'desc' ? 'Mais recentes' : 'Mais antigos'}
                      </span>
                    </button>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar produto, loja..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full glass-input rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {filteredCategories.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">
                  Nenhum lançamento encontrado para o período ou termo buscado.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCategories.map((cat) => {
                    const isExpanded = expandedCategoryKeys.has(cat.key);
                    const activeSubKey = selectedSubcategoryKeys[cat.key] ?? null;
                    const isAsc = preferences.operationsSortOrder === 'asc';
                    const displayedOperations = cat.operations
                      .filter((op) => {
                        if (activeSubKey !== null && op.subcategoryKey !== activeSubKey) {
                          return false;
                        }
                        return true;
                      })
                      .slice()
                      .sort((a, b) => {
                        const dateDiff = b.date.getTime() - a.date.getTime();
                        if (dateDiff !== 0) {
                          return isAsc ? -dateDiff : dateDiff;
                        }
                        // Mesma data: item mais recente no arquivo fica no topo se 'desc', ou no final se 'asc'
                        const orderDiff = (b.order ?? 0) - (a.order ?? 0);
                        return isAsc ? -orderDiff : orderDiff;
                      });

                    return (
                      <div
                        key={cat.key}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden transition-all duration-300"
                      >
                        {/* Category Row Header (Interactive Accordion Trigger) */}
                        <div
                          onClick={() => toggleExpandCategory(cat.key)}
                          className="p-4 md:p-5 cursor-pointer hover:bg-slate-900/60 transition flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 select-none"
                        >
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                              <span className="font-bold text-slate-100 text-base">
                                {cat.name}
                              </span>
                              <span className="text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-0.5 rounded-full">
                                {cat.percentage.toFixed(1)}% das despesas
                              </span>
                              <span className="text-xs bg-slate-900 text-slate-400 border border-slate-800 px-2.5 py-0.5 rounded-full font-medium">
                                {cat.operations.length} {cat.operations.length === 1 ? 'lançamento' : 'lançamentos'}
                              </span>
                              {cat.subcategories.length > 0 && (
                                <span className="text-xs bg-teal-500/10 text-teal-300 border border-teal-500/20 px-2.5 py-0.5 rounded-full font-medium">
                                  {cat.subcategories.length} subcategorias
                                </span>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800/50">
                              <div
                                className="bg-gradient-to-r from-indigo-500 via-blue-500 to-teal-400 h-full rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-5 pt-2 md:pt-0 border-t md:border-t-0 border-slate-900">
                            <div className="text-left md:text-right">
                              <div className="font-extrabold text-rose-400 text-lg tracking-tight">
                                {cat.total.toLocaleString('pt-BR', {
                                  style: 'currency',
                                  currency: 'BRL',
                                })}
                              </div>
                              <div className="text-[11px] text-slate-400 font-medium">
                                {isExpanded ? 'Clique para recolher' : 'Clique para ver subcategorias e compras'}
                              </div>
                            </div>

                            <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
                              {isExpanded ? (
                                <ChevronUp className="w-5 h-5 text-indigo-400" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Section Body */}
                        {isExpanded && (
                          <div className="p-5 md:p-6 border-t border-slate-800/80 bg-slate-900/40 space-y-6">
                            {/* Subcategories Breakdown Pills */}
                            {cat.subcategories.length > 0 && (
                              <div>
                                <div className="flex justify-between items-center mb-3">
                                  <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                    Subcategorias de {cat.name} (Clique para filtrar os lançamentos abaixo)
                                  </h3>
                                  {activeSubKey !== null && (
                                    <button
                                      onClick={() =>
                                        setSelectedSubcategoryKeys((prev) => ({
                                          ...prev,
                                          [cat.key]: null,
                                        }))
                                      }
                                      className="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20"
                                    >
                                      <FilterX className="w-3 h-3" />
                                      Mostrar Todas Subcategorias
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                  {/* "Todos" Pill */}
                                  <div
                                    onClick={() =>
                                      setSelectedSubcategoryKeys((prev) => ({
                                        ...prev,
                                        [cat.key]: null,
                                      }))
                                    }
                                    className={`cursor-pointer transition p-3 rounded-xl border text-xs flex justify-between items-center ${
                                      activeSubKey === null
                                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white font-bold shadow'
                                        : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800/80 text-slate-400'
                                    }`}
                                  >
                                    <span className="truncate pr-2">Todas ({cat.subcategories.length})</span>
                                    <span className="font-bold">
                                      {cat.total.toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })}
                                    </span>
                                  </div>

                                  {cat.subcategories.map((sub) => {
                                    const isSubSelected = activeSubKey === sub.key;

                                    return (
                                      <div
                                        key={sub.key}
                                        onClick={() => toggleSubcategoryFilter(cat.key, sub.key)}
                                        className={`cursor-pointer transition p-3 rounded-xl border text-xs flex flex-col justify-between ${
                                          isSubSelected
                                            ? 'bg-indigo-600/25 border-indigo-500 text-white font-bold shadow-md shadow-indigo-500/10'
                                            : 'bg-slate-950/80 hover:bg-slate-900 border-slate-800/80 text-slate-300'
                                        }`}
                                      >
                                        <div className="flex justify-between items-start mb-1.5">
                                          <span className="font-semibold text-slate-200 truncate pr-2" title={sub.name}>
                                            {sub.name}
                                          </span>
                                          <span className="text-[10px] font-bold bg-slate-900 text-indigo-300 border border-slate-800 px-1.5 py-0.5 rounded shrink-0">
                                            {sub.percentage.toFixed(1)}%
                                          </span>
                                        </div>

                                        <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-slate-500">
                                            {sub.operationsCount} {sub.operationsCount === 1 ? 'item' : 'itens'}
                                          </span>
                                          <span className="font-bold text-slate-200">
                                            {sub.total.toLocaleString('pt-BR', {
                                              style: 'currency',
                                              currency: 'BRL',
                                            })}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Detailed Purchased Items Table */}
                            <div>
                              <div className="flex justify-between items-center mb-3">
                                <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <Receipt className="w-3.5 h-3.5 text-teal-400" />
                                  Detalhamento dos Lançamentos ({displayedOperations.length})
                                </h3>
                                {activeSubKey !== null && (
                                  <span className="text-xs text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full font-medium">
                                    Filtrado por subcategoria
                                  </span>
                                )}
                              </div>

                              <div className="overflow-x-auto border border-slate-800/80 rounded-2xl bg-slate-950/90 shadow-inner">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                                    <tr>
                                      <th
                                        onClick={toggleSortOrder}
                                        className="py-3.5 px-4 font-semibold cursor-pointer select-none hover:text-white transition group"
                                        title={`Ordenar por data (${preferences.operationsSortOrder === 'desc' ? 'Mais recente primeiro' : 'Mais antigo primeiro'})`}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>Data</span>
                                          {preferences.operationsSortOrder === 'desc' ? (
                                            <ArrowDown className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition" />
                                          ) : (
                                            <ArrowUp className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition" />
                                          )}
                                        </div>
                                      </th>
                                      <th className="py-3.5 px-4 font-semibold">O que comprou (Descrição)</th>
                                      <th className="py-3.5 px-4 font-semibold">Beneficiário / Loja</th>
                                      <th className="py-3.5 px-4 font-semibold">Subcategoria</th>
                                      <th className="py-3.5 px-4 font-semibold">Conta</th>
                                      <th className="py-3.5 px-4 font-semibold text-right">Valor</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                                    {displayedOperations.map((op, idx) => (
                                      <tr key={idx} className="hover:bg-slate-900/70 transition">
                                        <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                                          {op.date.toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3.5 px-4 font-medium text-slate-100">
                                          {op.wording ? (
                                            <span className="text-slate-100 font-semibold">{op.wording}</span>
                                          ) : (
                                            <span className="text-slate-500 italic text-[11px]">Lançamento sem descrição</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-300">
                                          {op.payeeName ? (
                                            <span className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300 text-[11px]">
                                              <Building2 className="w-3 h-3 text-indigo-400" />
                                              {op.payeeName}
                                            </span>
                                          ) : (
                                            <span className="text-slate-600">-</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-400">
                                          {op.subcategoryName ? (
                                            <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded text-[11px] font-medium">
                                              <TagIcon className="w-3 h-3 text-indigo-400" />
                                              {op.subcategoryName}
                                            </span>
                                          ) : (
                                            <span className="text-slate-600">-</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-400">
                                          {op.accountName ? (
                                            <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                                              <CreditCard className="w-3 h-3 text-slate-500" />
                                              {op.accountName}
                                            </span>
                                          ) : (
                                            <span className="text-slate-600">-</span>
                                          )}
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-bold text-rose-400 whitespace-nowrap font-mono">
                                          {op.amount.toLocaleString('pt-BR', {
                                            style: 'currency',
                                            currency: 'BRL',
                                          })}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'analysis' ? (
          <div className="space-y-6">
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                    <TrendingUp className="w-6 h-6 text-indigo-400" />
                    Análise Gráfica dos Gastos
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Clique nos segmentos para navegar entre categorias, subcategorias e favorecidos.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setAnalysisCategoryKey(null);
                      setAnalysisSubcategoryKey(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg border transition ${
                      analysisCategoryKey === null
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    Categorias
                  </button>
                  {selectedAnalysisCategory && (
                    <>
                      <span className="text-slate-600">/</span>
                      <button
                        onClick={() => setAnalysisSubcategoryKey(null)}
                        className={`px-3 py-1.5 rounded-lg border transition ${
                          analysisSubcategoryKey === null
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {selectedAnalysisCategory.name}
                      </button>
                    </>
                  )}
                  {selectedAnalysisCategory && analysisSubcategoryKey !== null && (
                    <>
                      <span className="text-slate-600">/</span>
                      <span className="px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20">
                        {analysisSubcategoryData.find((item) => item.key === analysisSubcategoryKey)?.name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-bold text-slate-200">
                      {selectedAnalysisCategory ? `Distribuição: ${selectedAnalysisCategory.name}` : 'Distribuição por categoria'}
                    </h3>
                    <span className="text-[10px] text-slate-500">Clique para detalhar</span>
                  </div>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={selectedAnalysisCategory ? analysisSubcategoryData : analysisCategoryData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={112}
                          paddingAngle={2}
                          stroke="#020617"
                          strokeWidth={2}
                          onClick={(data) => {
                            const key = Number(data.key);
                            if (!Number.isFinite(key)) return;
                            if (!selectedAnalysisCategory) {
                              setAnalysisCategoryKey(key);
                              setAnalysisSubcategoryKey(null);
                            } else {
                              setAnalysisSubcategoryKey(key);
                            }
                          }}
                        >
                          {(selectedAnalysisCategory ? analysisSubcategoryData : analysisCategoryData).map(
                            (entry, index) => (
                              <Cell key={entry.key} fill={ANALYSIS_COLORS[index % ANALYSIS_COLORS.length]} />
                            )
                          )}
                        </Pie>
                        <Tooltip
                          formatter={(value) =>
                            Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          }
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            color: '#f8fafc',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4">
                  <h3 className="text-sm font-bold text-slate-200 mb-2">Favorecidos no recorte</h3>
                  <p className="text-[10px] text-slate-500 mb-3">Os 10 maiores gastos da seleção atual.</p>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysisPayeeData} layout="vertical" margin={{ left: 8, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={105}
                          tick={{ fill: '#94a3b8', fontSize: 10 }}
                        />
                        <Tooltip
                          formatter={(value) =>
                            Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          }
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                          }}
                        />
                        <Bar dataKey="value" fill="#2dd4bf" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 glass-card border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                <h3 className="text-sm font-bold text-slate-200 mb-1">Evolução mensal</h3>
                <p className="text-[10px] text-slate-500 mb-4">Entradas e saídas dentro do período filtrado.</p>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analysisMonthlyData} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                        tickFormatter={(value: number) => `R$ ${Math.round(value / 1000)}k`}
                      />
                      <Tooltip
                        formatter={(value) =>
                          Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        }
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" dataKey="expenses" name="Despesas" stroke="#fb7185" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="incomes" name="Receitas" stroke="#34d399" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-2 glass-card border border-slate-800/80 rounded-3xl p-6 shadow-2xl">
                <h3 className="text-sm font-bold text-slate-200 mb-1">Despesas por conta</h3>
                <p className="text-[10px] text-slate-500 mb-4">Onde os gastos estão concentrados.</p>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={analysisAccountData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        paddingAngle={2}
                        stroke="#020617"
                        strokeWidth={2}
                      >
                        {analysisAccountData.map((entry, index) => (
                          <Cell key={entry.name} fill={ANALYSIS_COLORS[index % ANALYSIS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) =>
                          Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        }
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        ) : activeView === 'report' ? (
          <div className="space-y-6 print:text-slate-950" id="analytical-report">
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl print:border-slate-300 print:shadow-none">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80 print:border-slate-300">
                <div>
                  <h2 className="text-xl font-extrabold text-white print:text-slate-950 flex items-center gap-2.5">
                    <FileText className="w-6 h-6 text-indigo-400 print:text-indigo-600" />
                    Relatório Analítico
                  </h2>
                  <p className="text-xs text-slate-400 print:text-slate-600 mt-1">
                    Síntese dos movimentos financeiros conforme os filtros selecionados.
                  </p>
                  {reportGeneratedAt && (
                    <p className="text-[10px] text-slate-500 print:text-slate-500 mt-1">
                      Gerado em {reportGeneratedAt.toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    onClick={() => setReportGeneratedAt(new Date())}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Gerar novamente
                  </button>
                  <button
                    onClick={downloadReport}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimir / PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  ['Receitas', totalIncomes, 'text-emerald-400'],
                  ['Despesas', totalExpenses, 'text-rose-400'],
                  ['Saldo', totalIncomes - totalExpenses, totalIncomes - totalExpenses >= 0 ? 'text-blue-400' : 'text-rose-400'],
                  ['Média diária', reportMetrics.averageDailyExpense, 'text-amber-300'],
                  ['Lançamentos', reportMetrics.expenseOperations.length, 'text-teal-300'],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 print:bg-white print:border-slate-300">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 print:text-slate-600 font-bold">
                      {label}
                    </div>
                    <div className={`text-xl font-black mt-1 ${color}`}>
                      {label === 'Lançamentos'
                        ? value
                        : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 print:bg-white print:border-slate-300">
                  <h3 className="text-sm font-bold text-slate-200 print:text-slate-950 mb-3">Principais conclusões</h3>
                  <ul className="space-y-2 text-xs text-slate-400 print:text-slate-700">
                    <li>
                      Maior categoria: <strong className="text-slate-200 print:text-slate-950">{categorySummaries[0]?.name || 'Nenhuma'}</strong>
                      {categorySummaries[0] && ` (${categorySummaries[0].total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}.
                    </li>
                    <li>
                      Maior favorecido: <strong className="text-slate-200 print:text-slate-950">{payeeSummaries[0]?.groupName || 'Nenhum'}</strong>
                      {payeeSummaries[0] && ` (${payeeSummaries[0].total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}.
                    </li>
                    <li>
                      Maior lançamento: <strong className="text-slate-200 print:text-slate-950">
                        {reportMetrics.largestExpense?.wording || 'Nenhum'}
                      </strong>
                      {reportMetrics.largestExpense &&
                        ` (${Math.abs(reportMetrics.largestExpense.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}.
                    </li>
                    <li>
                      {reportMetrics.uncategorizedCount} lançamento(s) de despesa sem categoria identificada.
                    </li>
                  </ul>
                </div>
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 print:bg-white print:border-slate-300">
                  <h3 className="text-sm font-bold text-slate-200 print:text-slate-950 mb-3">Escopo do relatório</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-slate-500">Arquivo</div>
                      <div className="text-slate-200 print:text-slate-950 truncate" title={parsedData.fileName}>{parsedData.fileName}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Período</div>
                      <div className="text-slate-200 print:text-slate-950">{startDateStr || 'Início'} — {endDateStr || 'Fim'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Dias com gastos</div>
                      <div className="text-slate-200 print:text-slate-950">{reportMetrics.daysCount}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Tags selecionadas</div>
                      <div className="text-slate-200 print:text-slate-950">{selectedTagIds.length || 'Todas'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="glass-card border border-slate-800/80 rounded-3xl p-6 print:border-slate-300 print:shadow-none">
                <h3 className="text-sm font-bold text-slate-200 print:text-slate-950 mb-4">Despesas por categoria</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 border-b border-slate-800 print:border-slate-300">
                      <tr><th className="text-left py-2">Categoria</th><th className="text-right py-2">Valor</th><th className="text-right py-2">%</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                      {categorySummaries.slice(0, 12).map((category) => (
                        <tr key={category.key}>
                          <td className="py-2 text-slate-300 print:text-slate-700">{category.name}</td>
                          <td className="py-2 text-right font-semibold text-rose-300 print:text-slate-950">{category.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="py-2 text-right text-slate-500">{category.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card border border-slate-800/80 rounded-3xl p-6 print:border-slate-300 print:shadow-none">
                <h3 className="text-sm font-bold text-slate-200 print:text-slate-950 mb-4">Despesas por favorecido</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 border-b border-slate-800 print:border-slate-300">
                      <tr><th className="text-left py-2">Favorecido / grupo</th><th className="text-right py-2">Valor</th><th className="text-right py-2">Itens</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 print:divide-slate-300">
                      {payeeSummaries.slice(0, 12).map((payee) => (
                        <tr key={payee.groupName}>
                          <td className="py-2 text-slate-300 print:text-slate-700">{payee.groupName}</td>
                          <td className="py-2 text-right font-semibold text-rose-300 print:text-slate-950">{payee.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="py-2 text-right text-slate-500">{payee.operationsCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : activeView === 'payees' ? (
          <div className="space-y-8">
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                    <Building2 className="w-6 h-6 text-indigo-400" />
                    Gastos por Favorecido
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Grupos vêm do texto entre parênteses; o texto externo representa a unidade.
                    Favorecidos sem parênteses aparecem como gastos diretos.
                  </p>
                </div>
                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar grupo ou unidade..."
                    value={payeeSearchFilter}
                    onChange={(event) => setPayeeSearchFilter(event.target.value)}
                    className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Total de gastos</div>
                  <div className="text-xl font-black text-rose-400 mt-1">
                    {totalExpenses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Grupos</div>
                  <div className="text-xl font-black text-indigo-300 mt-1">{filteredPayeeSummaries.length}</div>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                  <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">Lançamentos</div>
                  <div className="text-xl font-black text-teal-300 mt-1">
                    {filteredOperations.filter((op) => op.amount < 0).length}
                  </div>
                </div>
              </div>

              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 mb-6">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-semibold text-slate-300">Período dos gastos</span>
                  <button
                    onClick={() => handleApplyPreset('all')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                      activePreset === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    Todos
                  </button>
                  {[
                    ['current_month', 'Mês atual'],
                    ['previous_month', 'Mês anterior'],
                    ['current_bimonth', 'Bimestre'],
                    ['current_quarter', 'Trimestre'],
                    ['current_semester', 'Semestre'],
                    ['current_year', 'Ano'],
                  ].map(([preset, label]) => (
                    <button
                      key={preset}
                      onClick={() => handleApplyPreset(preset as PresetPeriod)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
                        activePreset === preset
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    De
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(event) => {
                        setStartDateStr(event.target.value);
                        setActivePreset('custom');
                        setSelectedYear(null);
                      }}
                      className="glass-input text-xs text-slate-100 px-2.5 py-1.5 rounded-lg focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    Até
                    <input
                      type="date"
                      value={endDateStr}
                      onChange={(event) => {
                        setEndDateStr(event.target.value);
                        setActivePreset('custom');
                        setSelectedYear(null);
                      }}
                      className="glass-input text-xs text-slate-100 px-2.5 py-1.5 rounded-lg focus:outline-none"
                    />
                  </label>
                  {(startDateStr || endDateStr || activePreset !== 'all') && (
                    <button
                      onClick={clearDateFilters}
                      className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {filteredPayeeSummaries.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm bg-slate-900/30 rounded-2xl border border-slate-800/50">
                  Nenhum gasto encontrado para os filtros atuais.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayeeSummaries.map((group) => (
                    <div
                      key={group.groupName}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-2xl overflow-hidden"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-800/80">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 truncate">{group.groupName}</div>
                            <div className="text-[11px] text-slate-500">
                              {group.operationsCount} {group.operationsCount === 1 ? 'lançamento' : 'lançamentos'} em {group.units.length} {group.units.length === 1 ? 'unidade' : 'unidades'}
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-black text-rose-400">
                          {group.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>

                      <div className="divide-y divide-slate-800/60">
                        {group.units.map((unit) => {
                          const unitKey = `${group.groupName}-${unit.name}`;
                          const isUnitExpanded = expandedPayeeUnits.has(unitKey);
                          return (
                            <div key={unitKey}>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPayeeUnits((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(unitKey)) next.delete(unitKey);
                                    else next.add(unitKey);
                                    return next;
                                  })
                                }
                                className="w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-slate-900/70 transition"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                                  <span className="text-sm text-slate-300 truncate">{unit.name}</span>
                                  <span className="text-[10px] text-slate-500 shrink-0">
                                    {unit.operationsCount} {unit.operationsCount === 1 ? 'item' : 'itens'}
                                  </span>
                                  {isUnitExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-indigo-400" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                  )}
                                </div>
                                <span className="font-bold text-slate-200 whitespace-nowrap">
                                  {unit.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              </button>

                              {isUnitExpanded && (
                                <div className="px-5 pb-4 space-y-2">
                                  {unit.operations
                                    .slice()
                                    .sort((a, b) => b.date.getTime() - a.date.getTime())
                                    .map((op) => {
                                      const hasSplits = Boolean(op.splits && op.splits.length > 0);
                                      const isSplitExpanded = expandedSplits.has(op.id);
                                      const category = op.categoryKey
                                        ? parsedData.categoriesMap.get(op.categoryKey)?.name
                                        : undefined;
                                      return (
                                        <div key={op.id} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (!hasSplits) return;
                                              setExpandedSplits((previous) => {
                                                const next = new Set(previous);
                                                if (next.has(op.id)) next.delete(op.id);
                                                else next.add(op.id);
                                                return next;
                                              });
                                            }}
                                            className={`w-full flex items-center justify-between gap-3 text-left ${hasSplits ? 'cursor-pointer' : 'cursor-default'}`}
                                          >
                                            <div className="min-w-0">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[11px] text-slate-500 font-mono">
                                                  {op.date.toLocaleDateString('pt-BR')}
                                                </span>
                                                {hasSplits && (
                                                  <span className="text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                                                    Compra subdividida ({op.splits!.length} itens)
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-sm text-slate-200 font-semibold truncate mt-1">
                                                {op.wording || 'Lançamento sem descrição'}
                                              </div>
                                              <div className="text-[10px] text-slate-500 mt-1">
                                                {category || 'Sem categoria'}
                                                {op.accountKey ? ` • ${parsedData.accountsMap.get(op.accountKey)?.name || 'Sem conta'}` : ''}
                                              </div>
                                            </div>
                                            <span className="font-bold text-rose-400 whitespace-nowrap">
                                              {Math.abs(op.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </span>
                                          </button>

                                          {hasSplits && isSplitExpanded && (
                                            <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1.5">
                                              {op.splits!.map((split, splitIndex) => (
                                                <div key={`${op.id}-split-${splitIndex}`} className="flex justify-between gap-3 text-xs text-slate-400">
                                                  <span className="truncate">{split.wording || op.wording || 'Item sem descrição'}</span>
                                                  <span className="font-mono whitespace-nowrap">
                                                    {Math.abs(split.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="glass-card border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80">
                <div>
                  <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                    <Landmark className="w-6 h-6 text-indigo-400" />
                    Contas e Extratos
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Selecione uma conta para ver o saldo e as movimentações.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="col-span-1 space-y-3">
                  <h3 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                    <List className="w-4 h-4 text-indigo-400" />
                    Suas Contas
                  </h3>
                  {Array.from(parsedData.accountsMap.values()).map(acc => {
                    const accOps = parsedData.operations.filter(op => op.accountKey === acc.key);
                    const currentBalance = acc.initial + accOps.reduce((sum, op) => sum + op.amount, 0);

                    return (
                      <button
                        key={acc.key}
                        onClick={() => setSelectedAccountKey(acc.key)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          selectedAccountKey === acc.key
                            ? 'bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-500/10'
                            : 'bg-slate-900/50 hover:bg-slate-900 border-slate-800/60'
                        }`}
                      >
                        <div className="font-bold text-slate-200 text-sm mb-1">{acc.name}</div>
                        <div className={`text-xs font-bold ${currentBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {currentBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="col-span-1 md:col-span-3">
                  {selectedAccountKey === null ? (
                    <div className="text-center py-16 text-slate-500 text-sm bg-slate-900/30 rounded-3xl border border-slate-800/50">
                      Selecione uma conta ao lado para visualizar o extrato detalhado.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(() => {
                        const account = parsedData.accountsMap.get(selectedAccountKey);
                        const isAsc = preferences.operationsSortOrder === 'asc';
                        const accountOps = parsedData.operations
                          .filter(op => op.accountKey === selectedAccountKey)
                          .sort((a, b) => {
                            const dateDiff = b.date.getTime() - a.date.getTime();
                            if (dateDiff !== 0) {
                              return isAsc ? -dateDiff : dateDiff;
                            }
                            // Mesma data: desempate pela ordem de inserção no arquivo (.order)
                            const orderDiff = (b.order ?? 0) - (a.order ?? 0);
                            return isAsc ? -orderDiff : orderDiff;
                          });
                        const dailyBalances = new Map<string, number>();
                        let runningBalance = account?.initial ?? 0;
                        accountOps
                          .slice()
                          .sort((a, b) => {
                            const dateDiff = a.date.getTime() - b.date.getTime();
                            if (dateDiff !== 0) return dateDiff;
                            return (a.order ?? 0) - (b.order ?? 0);
                          })
                          .forEach((op) => {
                            runningBalance += op.amount;
                            const y = op.date.getFullYear();
                            const m = String(op.date.getMonth() + 1).padStart(2, '0');
                            const d = String(op.date.getDate()).padStart(2, '0');
                            dailyBalances.set(`${y}-${m}-${d}`, runningBalance);
                          });
                        
                        return (
                          <>
                            <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/60">
                              <span className="text-sm font-bold text-slate-200">Extrato: {account?.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full font-medium">
                                  {accountOps.length} transações registradas
                                </span>
                                <button
                                  onClick={toggleSortOrder}
                                  title={`Clique para ordenar: ${isAsc ? 'Mais antigo primeiro' : 'Mais recente primeiro'}`}
                                  className="text-xs font-semibold text-slate-200 hover:text-white bg-slate-950 hover:bg-slate-900 border border-slate-800 px-3 py-1 rounded-full transition flex items-center gap-1.5"
                                >
                                  <ArrowDownUp className="w-3 h-3 text-indigo-400" />
                                  <span>{isAsc ? 'Mais antigos' : 'Mais recentes'}</span>
                                </button>
                              </div>
                            </div>

                            <div className="mt-4">
                              {accountOps.length === 0 ? (
                                <div className="py-8 text-center text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800/50">
                                  Nenhuma movimentação nesta conta.
                                </div>
                              ) : (
                                (() => {
                                  const groupedOps = accountOps.reduce((acc, op) => {
                                    // Local date string to avoid timezone issues
                                    const y = op.date.getFullYear();
                                    const m = String(op.date.getMonth() + 1).padStart(2, '0');
                                    const d = String(op.date.getDate()).padStart(2, '0');
                                    const dateKey = `${y}-${m}-${d}`;
                                    if (!acc[dateKey]) acc[dateKey] = [];
                                    acc[dateKey].push(op);
                                    return acc;
                                  }, {} as Record<string, typeof accountOps>);

                                  const sortedDates = Object.keys(groupedOps).sort((a, b) =>
                                    isAsc ? a.localeCompare(b) : b.localeCompare(a)
                                  );

                                  return (
                                    <div className="space-y-8">
                                      {sortedDates.map((dateStr) => {
                                        const ops = groupedOps[dateStr];
                                        const [year, month, day] = dateStr.split('-');
                                        const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
                                        const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
                                        const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long' });
                                        
                                        const dailyTotal = ops.reduce((sum, o) => sum + o.amount, 0);
                                        const dailyIncome = ops
                                          .filter((op) => op.amount > 0)
                                          .reduce((sum, op) => sum + op.amount, 0);
                                        const dailyExpenses = ops
                                          .filter((op) => op.amount < 0)
                                          .reduce((sum, op) => sum + Math.abs(op.amount), 0);
                                        const balanceAfterDay = dailyBalances.get(dateStr) ?? (account?.initial ?? 0);

                                        return (
                                          <div key={dateStr} className="relative">
                                            {/* Date Header */}
                                            <div className="sticky top-20 z-10 bg-slate-950/95 py-2 backdrop-blur-md border-y border-slate-800/80 mb-4 px-4 flex justify-between items-center rounded-xl">
                                              <div className="flex items-center gap-3">
                                                <span className="text-2xl font-black text-slate-100">{day}</span>
                                                <div className="flex flex-col">
                                                  <span className="text-[10px] uppercase font-bold text-slate-500">{dayName}</span>
                                                  <span className="text-[10px] uppercase font-bold text-slate-400">{monthName.substring(0, 3)}, {year}</span>
                                                </div>
                                              </div>
                                              <div className="flex flex-wrap justify-end items-center gap-x-4 gap-y-1 text-[10px] font-semibold">
                                                <span className="text-emerald-400" title="Total de entradas do dia">
                                                  Entradas: +{dailyIncome.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                                <span className="text-rose-400" title="Total de saídas do dia">
                                                  Saídas: -{dailyExpenses.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                                <span className={dailyTotal >= 0 ? 'text-blue-300' : 'text-amber-300'} title="Resultado líquido do dia">
                                                  Dia: {dailyTotal >= 0 ? '+' : ''}{dailyTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                                <span className={`font-bold ${balanceAfterDay >= 0 ? 'text-slate-100' : 'text-rose-300'}`} title="Saldo acumulado após as movimentações deste dia">
                                                  Saldo: {balanceAfterDay.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Timeline Items */}
                                            <div className="space-y-3 px-2 sm:px-4 pl-10 sm:pl-12 relative">
                                              {/* Vertical Line */}
                                              <div className="absolute left-4 sm:left-6 top-4 bottom-4 w-px bg-slate-800/80 rounded-full" />
                                              
                                              {ops.map((op, idx) => {
                                                const cat = op.categoryKey ? parsedData.categoriesMap.get(op.categoryKey) : null;
                                                const isIncome = op.amount >= 0;
                                                const isTransfer = op.isTransfer;
                                                
                                                let transferText = '';
                                                if (isTransfer) {
                                                  // Find counter operation
                                                  const counterOp = parsedData.operations.find(o => 
                                                    o !== op && 
                                                    o.isTransfer && 
                                                    o.date.getTime() === op.date.getTime() && 
                                                    (o.amount === -op.amount || Math.abs(o.amount - -op.amount) < 0.01)
                                                  );
                                                  if (counterOp) {
                                                    const counterAcc = parsedData.accountsMap.get(counterOp.accountKey)?.name;
                                                    if (counterAcc) {
                                                      transferText = isIncome ? `De: ${counterAcc}` : `Para: ${counterAcc}`;
                                                    }
                                                  }
                                                }

                                                const dotColor = isTransfer 
                                                  ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)] border-slate-950' 
                                                  : isIncome 
                                                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] border-slate-950' 
                                                    : 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)] border-slate-950';
                                                
                                                const textColor = isTransfer
                                                  ? 'text-blue-400'
                                                  : isIncome
                                                    ? 'text-emerald-400'
                                                    : 'text-slate-100';

                                                const hasSplits = op.splits && op.splits.length > 0;
                                                const isExpanded = expandedSplits.has(op.id);

                                                return (
                                                  <div key={idx} className="relative bg-slate-900/40 p-3.5 sm:p-4 rounded-2xl border border-slate-800/60 flex flex-col hover:bg-slate-900/80 transition-colors group shadow-sm">
                                                    {/* Timeline Dot */}
                                                    <div className={`absolute -left-7 sm:-left-7 top-6 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-[2.5px] z-10 ${dotColor}`}>
                                                    </div>
                                                    
                                                    {/* Main Row */}
                                                    <div className={`flex justify-between items-center ${hasSplits ? 'cursor-pointer' : ''}`} onClick={() => {
                                                      if (hasSplits) {
                                                        setExpandedSplits(prev => {
                                                          const next = new Set(prev);
                                                          if (next.has(op.id)) next.delete(op.id);
                                                          else next.add(op.id);
                                                          return next;
                                                        });
                                                      }
                                                    }}>
                                                      {/* Content */}
                                                      <div className="flex-1 min-w-0 pr-3 sm:pr-4">
                                                        <div className="font-bold text-slate-200 truncate text-sm">
                                                          {op.wording || (isTransfer ? 'Transferência' : 'Sem descrição')}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 text-[10px] sm:text-[11px]">
                                                          {isTransfer ? (
                                                            <span className="text-blue-300 font-medium truncate max-w-[200px] sm:max-w-[250px] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                                              {transferText || 'Transferência Interna'}
                                                            </span>
                                                          ) : hasSplits ? (
                                                            <>
                                                              <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1">
                                                                <Layers className="w-3 h-3" />
                                                                Múltiplas ({op.splits!.length})
                                                              </span>
                                                              {op.payeeKey && (
                                                                <>
                                                                  <span className="text-slate-700">•</span>
                                                                  <span className="text-slate-500 truncate max-w-[100px] sm:max-w-[140px]">
                                                                    {parsedData.payeesMap.get(op.payeeKey)?.name}
                                                                  </span>
                                                                </>
                                                              )}
                                                            </>
                                                          ) : (
                                                            <>
                                                              <span className="text-slate-400 font-medium truncate max-w-[100px] sm:max-w-[140px]">
                                                                {cat ? cat.name : 'Sem categoria'}
                                                              </span>
                                                              {op.payeeKey && (
                                                                <>
                                                                  <span className="text-slate-700">•</span>
                                                                  <span className="text-slate-500 truncate max-w-[100px] sm:max-w-[140px]">
                                                                    {parsedData.payeesMap.get(op.payeeKey)?.name}
                                                                  </span>
                                                                </>
                                                              )}
                                                            </>
                                                          )}
                                                        </div>
                                                      </div>

                                                      {/* Amount & Expand Icon */}
                                                      <div className="flex items-center gap-3">
                                                        <div className={`text-right font-bold whitespace-nowrap font-mono text-sm sm:text-base tracking-tight ${textColor}`}>
                                                          {isIncome && !isTransfer ? '+' : ''}{op.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                        </div>
                                                        {hasSplits && (
                                                          <div className="p-1 rounded-md bg-slate-800 text-slate-400">
                                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>

                                                    {/* Expanded Splits View */}
                                                    {hasSplits && isExpanded && (
                                                      <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
                                                        {op.splits!.map((split, sIdx) => {
                                                          const sCat = split.categoryKey ? parsedData.categoriesMap.get(split.categoryKey) : null;
                                                          return (
                                                            <div key={sIdx} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/50">
                                                              <div className="flex-1 min-w-0 pr-3">
                                                                <div className="text-slate-300 font-medium truncate">{split.wording || op.wording || 'Sem descrição'}</div>
                                                                <div className="text-slate-500 text-[10px] mt-0.5">{sCat ? sCat.name : 'Sem categoria'}</div>
                                                              </div>
                                                              <div className="font-mono text-slate-400 font-bold">
                                                                {split.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                              </div>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
