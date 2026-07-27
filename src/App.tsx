import React, { useState, useMemo } from 'react';
import { parseHomeBankXML, calculateAllCategoryExpenses } from './xmlParser';
import { Category, Account, Payee, Operation, PresetPeriod } from './types';
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
  Tag,
  Layers,
  FileCheck,
  FilterX,
} from 'lucide-react';

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
    const end = new Date(year, month + 1, 0);
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

export default function App() {
  const [parsedData, setParsedData] = useState<{
    fileName: string;
    categoriesMap: Map<number, Category>;
    accountsMap: Map<number, Account>;
    payeesMap: Map<number, Payee>;
    operations: Operation[];
  } | null>(null);

  const [activePreset, setActivePreset] = useState<PresetPeriod>('all');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [startDateStr, setStartDateStr] = useState<string>('');
  const [endDateStr, setEndDateStr] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<number>>(new Set());
  const [useFileMaxDateAsRef, setUseFileMaxDateAsRef] = useState<boolean>(true);
  const [selectedSubcategoryKeys, setSelectedSubcategoryKeys] = useState<
    Record<number, number | null>
  >({});

  // Handle XML / XDB File Upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const xmlContent = e.target?.result as string;
      if (xmlContent) {
        const data = parseHomeBankXML(xmlContent);
        setParsedData({
          fileName: file.name,
          ...data,
        });
        setActivePreset('all');
        setSelectedYear(null);
        setStartDateStr('');
        setEndDateStr('');
        setExpandedCategoryKeys(new Set());
        setSelectedSubcategoryKeys({});
      }
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

  // Filter operations for overall financial totals (excluding internal transfers)
  const filteredOperations = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.operations.filter((op) => {
      if (op.isTransfer) return false; // Exclude internal transfers between accounts
      if (activeStartDate && op.date < activeStartDate) return false;
      if (activeEndDate && op.date > activeEndDate) return false;
      return true;
    });
  }, [parsedData, activeStartDate, activeEndDate]);

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

  // Calculate grouped categories with date filter
  const categorySummaries = useMemo(() => {
    if (!parsedData) return [];
    return calculateAllCategoryExpenses(
      parsedData.operations,
      parsedData.categoriesMap,
      parsedData.accountsMap,
      parsedData.payeesMap,
      activeStartDate,
      activeEndDate
    );
  }, [parsedData, activeStartDate, activeEndDate]);

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

      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 md:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/25">
              <PieChart className="w-6 h-6 text-white" />
            </div>
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
                Trocar Arquivo (.xdb)
                <input type="file" accept=".xdb,.xml" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
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
              <p className="text-slate-400 text-sm max-w-lg mx-auto mb-8 leading-relaxed">
                Carregue seu arquivo <code className="text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono text-xs">.xdb</code> ou <code className="text-indigo-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono text-xs">.xml</code> para desbloquear a análise de 100% dos seus gastos, filtro completo por intervalo de datas e detalhamento de cada item comprado.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <label className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 via-blue-600 to-teal-500 hover:from-indigo-500 hover:to-teal-400 text-white font-semibold px-8 py-3.5 rounded-2xl cursor-pointer shadow-xl shadow-indigo-500/25 transition transform active:scale-95 flex items-center justify-center gap-2">
                  <UploadCloud className="w-5 h-5" />
                  Selecionar Arquivo .xdb / .xml
                  <input type="file" accept=".xdb,.xml" onChange={handleFileUpload} className="hidden" />
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
        ) : (
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

                  {(startDateStr || endDateStr || activePreset !== 'all' || selectedYear !== null) && (
                    <button
                      onClick={clearDateFilters}
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
                  <div className="flex items-center gap-2">
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

                    const displayedOperations = cat.operations.filter((op) => {
                      if (activeSubKey !== null && op.subcategoryKey !== activeSubKey) {
                        return false;
                      }
                      return true;
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
                                      <th className="py-3.5 px-4 font-semibold">Data</th>
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
                                              <Tag className="w-3 h-3 text-indigo-400" />
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
        )}
      </main>
    </div>
  );
}
