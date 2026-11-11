import React, { useState, useMemo, useEffect } from 'react';
import {
  FileDown,
  CheckSquare,
  Square,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  FileCode2,
  AlertCircle,
  Download,
  Check,
  RefreshCw,
} from 'lucide-react';
import { PlaceRecord, EXPORTABLE_FIELDS, ScrapeJob } from '../shared/types';

interface ExportScreenProps {
  places: PlaceRecord[];
  totalPlaces: number;
  selectedPlaceIds: Set<string>;
  jobs: ScrapeJob[];
  selectedJobId: string | undefined;
  onSelectJobId: (id: string | undefined) => void;
  searchQuery: string;
  selectedCategory: string;
}

export const ExportScreen: React.FC<ExportScreenProps> = ({
  places,
  totalPlaces,
  selectedPlaceIds,
  jobs,
  selectedJobId,
  onSelectJobId,
  searchQuery,
  selectedCategory,
}) => {
  // Format selection: 'csv' | 'json'
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  // Field selection state (default all selected)
  const [selectedFields, setSelectedFields] = useState<Set<keyof PlaceRecord>>(
    new Set(EXPORTABLE_FIELDS.map((f) => f.key))
  );

  // Scope: 'selected' | 'current_job' | 'all'
  const [scope, setScope] = useState<'selected' | 'current_job' | 'all'>(
    selectedPlaceIds.size > 0 ? 'selected' : selectedJobId ? 'current_job' : 'all'
  );

  // Live database total places count from server coverage
  const [dbTotalRecords, setDbTotalRecords] = useState<number | null>(null);
  const [applyResultsFilter, setApplyResultsFilter] = useState(false);

  useEffect(() => {
    // Fetch total records directly from backend to avoid pagination miscounts
    const fetchCoverage = async () => {
      try {
        const token = window.sessionStorage.getItem('mapscrape_session_token');
        const res = await fetch('/api/v1/field-coverage', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.totalRecords === 'number') {
            setDbTotalRecords(data.totalRecords);
          }
        }
      } catch {
        // Fallback to prop
      }
    };
    void fetchCoverage();
  }, []);

  // Suggested filename
  const defaultFilename = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentJob = jobs.find((j) => j.id === selectedJobId);
    if (currentJob) {
      const seg = currentJob.segment.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const loc = currentJob.location.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return `mapscrape_${seg}_${loc}_${today}`;
    }
    return `mapscrape_estabelecimentos_${today}`;
  }, [jobs, selectedJobId]);

  const [filename, setFilename] = useState(defaultFilename);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleField = (key: keyof PlaceRecord) => {
    const next = new Set(selectedFields);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedFields(next);
  };

  const selectAllFields = () => {
    setSelectedFields(new Set(EXPORTABLE_FIELDS.map((f) => f.key)));
  };

  const deselectAllFields = () => {
    // Keep at least name
    setSelectedFields(new Set(['name']));
  };

  const effectiveTotal = dbTotalRecords ?? totalPlaces ?? places.length;

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);
    setErrorMessage(null);

    try {
      const payload: Record<string, any> = {
        fields: Array.from(selectedFields),
        filename: filename.trim() || defaultFilename,
      };

      if (scope === 'selected' && selectedPlaceIds.size > 0) {
        payload.placeIds = Array.from(selectedPlaceIds);
      } else if (scope === 'current_job' && selectedJobId) {
        payload.jobId = selectedJobId;
        if (applyResultsFilter) {
          if (searchQuery.trim()) payload.query = searchQuery.trim();
          if (selectedCategory) payload.category = selectedCategory;
        }
      } else if (scope === 'all') {
        if (applyResultsFilter) {
          if (searchQuery.trim()) payload.query = searchQuery.trim();
          if (selectedCategory) payload.category = selectedCategory;
        }
      }

      const token = window.sessionStorage.getItem('mapscrape_session_token');
      const endpoint = format === 'csv' ? '/api/v1/export/csv' : '/api/v1/export/json';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || `Falha ao gerar arquivo ${format.toUpperCase()}.`);
      }

      // Download trigger
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.trim() || defaultFilename}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
    } catch (err) {
      console.error(err);
      setErrorMessage(
        err instanceof Error ? err.message : `Erro ao exportar o arquivo ${format.toUpperCase()}.`
      );
    } finally {
      setIsExporting(false);
    }
  };

  // Preview data
  const previewRecords = places.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto py-2 sm:py-6 space-y-8">
      {/* Intro Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <FileDown className="w-4 h-4" />
          <span>Exportação de Dados Tabulares & Inteligência</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-100 tracking-tight leading-tight">
          Exportar Estabelecimentos
        </h1>
        <p className="mt-3 text-base sm:text-lg text-slate-400 max-w-3xl leading-relaxed">
          Gere arquivos profissionais em CSV com UTF-8 BOM (compatível com Excel, Google Sheets e LibreOffice) ou JSON estruturado com dados de inteligência comercial.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: Formato do Arquivo */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5 backdrop-blur-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            1. Formato do Arquivo
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`flex items-start gap-3.5 p-5 border rounded-2xl cursor-pointer transition-all ${
                format === 'csv'
                  ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              <input
                type="radio"
                name="format"
                value="csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
                className="mt-1 text-blue-500 focus:ring-blue-500/30 h-4 w-4 bg-slate-900 border-slate-700"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span className="block text-base font-bold text-slate-100">
                    Planilha CSV (Excel & Google Sheets)
                  </span>
                </div>
                <span className="block text-xs sm:text-sm font-medium text-slate-400">
                  Codificação UTF-8 com BOM, delimitador por vírgula e proteção contra CSV Injection.
                </span>
              </div>
            </label>

            <label
              className={`flex items-start gap-3.5 p-5 border rounded-2xl cursor-pointer transition-all ${
                format === 'json'
                  ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              <input
                type="radio"
                name="format"
                value="json"
                checked={format === 'json'}
                onChange={() => setFormat('json')}
                className="mt-1 text-blue-500 focus:ring-blue-500/30 h-4 w-4 bg-slate-900 border-slate-700"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-blue-400" />
                  <span className="block text-base font-bold text-slate-100">
                    JSON Estruturado
                  </span>
                </div>
                <span className="block text-xs sm:text-sm font-medium text-slate-400">
                  Ideal para desenvolvedores, automações em n8n/Zapier ou importação direta em CRMs.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Step 2: Escopo da Exportação */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5 backdrop-blur-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            2. Escopo da Exportação
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Option A: Selected places */}
            <label
              className={`flex items-start gap-3.5 p-5 border rounded-2xl cursor-pointer transition-all ${
                scope === 'selected'
                  ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/20'
                  : selectedPlaceIds.size === 0
                  ? 'border-slate-800 opacity-40 cursor-not-allowed bg-slate-950/40'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="selected"
                checked={scope === 'selected'}
                disabled={selectedPlaceIds.size === 0}
                onChange={() => setScope('selected')}
                className="mt-1 text-blue-500 focus:ring-blue-500/30 h-4 w-4 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="block text-base font-bold text-slate-100">
                  Selecionados Manualmente
                </span>
                <span className="block text-xs sm:text-sm font-medium text-slate-400 mt-1">
                  {selectedPlaceIds.size} de {effectiveTotal} selecionados na tabela
                </span>
              </div>
            </label>

            {/* Option B: Current Search */}
            <label
              className={`flex items-start gap-3.5 p-5 border rounded-2xl cursor-pointer transition-all ${
                scope === 'current_job'
                  ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/20'
                  : !selectedJobId
                  ? 'border-slate-800 opacity-40 cursor-not-allowed bg-slate-950/40'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="current_job"
                checked={scope === 'current_job'}
                disabled={!selectedJobId}
                onChange={() => setScope('current_job')}
                className="mt-1 text-blue-500 focus:ring-blue-500/30 h-4 w-4 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="block text-base font-bold text-slate-100">
                  Pesquisa Selecionada
                </span>
                <span className="block text-xs sm:text-sm font-medium text-slate-400 mt-1 truncate">
                  {selectedJobId
                    ? jobs.find((j) => j.id === selectedJobId)?.segment || 'Pesquisa ativa'
                    : 'Nenhuma pesquisa filtrada'}
                </span>
              </div>
            </label>

            {/* Option C: All database */}
            <label
              className={`flex items-start gap-3.5 p-5 border rounded-2xl cursor-pointer transition-all ${
                scope === 'all'
                  ? 'border-blue-500/60 bg-blue-500/10 ring-2 ring-blue-500/20'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-950'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-1 text-blue-500 focus:ring-blue-500/30 h-4 w-4 bg-slate-900 border-slate-700"
              />
              <div>
                <span className="block text-base font-bold text-slate-100">
                  Base Completa
                </span>
                <span className="block text-xs sm:text-sm font-medium text-slate-400 mt-1">
                  Todos os {effectiveTotal.toLocaleString('pt-BR')} registros salvos no banco
                </span>
              </div>
            </label>
          </div>

          {(searchQuery || selectedCategory) && scope !== 'selected' && (
            <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
              <input
                type="checkbox"
                id="apply-filter"
                checked={applyResultsFilter}
                onChange={(e) => setApplyResultsFilter(e.target.checked)}
                className="rounded border-slate-700 text-blue-500 focus:ring-blue-500/30"
              />
              <label htmlFor="apply-filter" className="text-xs text-slate-300 cursor-pointer">
                Aplicar filtros ativos da tela de Resultados (termo: &ldquo;{searchQuery || '—'}&rdquo;, categoria: &ldquo;{selectedCategory || 'todas'}&rdquo;)
              </label>
            </div>
          )}
        </div>

        {/* Step 3: Selecionar Colunas / Campos */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                3. Selecionar Campos para Exportação
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {selectedFields.size} de {EXPORTABLE_FIELDS.length} campos selecionados para {format.toUpperCase()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFields}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={deselectAllFields}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-400 transition-colors cursor-pointer"
              >
                Limpar seleção
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {EXPORTABLE_FIELDS.map((field) => {
              const isChecked = selectedFields.has(field.key);
              return (
                <label
                  key={field.key}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isChecked
                      ? 'border-blue-500/40 bg-slate-950 shadow-xs'
                      : 'border-slate-800/80 bg-slate-950/40 opacity-60 hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleField(field.key)}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/30 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-slate-100 leading-snug">
                      {field.label}
                    </span>
                    <span className="block text-xs text-slate-400 truncate mt-0.5">
                      {field.description}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Step 4: Nome do Arquivo & Botão de Download */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-6 backdrop-blur-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            4. Nome do Arquivo e Download
          </h2>

          <div className="space-y-2">
            <label htmlFor="export-filename" className="block text-sm font-semibold text-slate-300">
              Nome do arquivo ({format.toUpperCase()}):
            </label>
            <div className="flex items-center gap-2">
              <input
                id="export-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Ex: mapscrape_leads_2026"
                className="flex-1 py-3.5 px-4 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <span className="text-base font-bold text-slate-400 font-mono shrink-0">.{format}</span>
            </div>
          </div>

          {/* Compliance & Security Callout */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3 text-xs sm:text-sm text-slate-300">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-100 block">
                {format === 'csv' ? 'Padrão Corporativo & Proteção contra Fórmulas' : 'JSON Estruturado & Sanitizado'}
              </span>
              <p className="text-slate-400 leading-relaxed">
                {format === 'csv'
                  ? 'O arquivo é gerado com cabeçalho UTF-8 BOM para abertura perfeita no Excel sem desconfigurar acentuação. Células que iniciam com caracteres perigosos (=, +, -, @) são automaticamente neutralizadas com aspas simples para segurança contra CSV Injection.'
                  : 'O payload JSON inclui os campos selecionados e anexa objetos completos de análise e inteligência comercial para processamento imediato em pipelines de vendas.'}
              </p>
            </div>
          </div>

          {exportSuccess && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3 text-sm font-semibold text-blue-300">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
              <span>Download concluído com sucesso! Verifique a pasta de downloads do seu dispositivo.</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-sm font-semibold text-rose-300">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || (effectiveTotal === 0 && selectedPlaceIds.size === 0)}
            className="w-full py-4 sm:py-5 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg sm:text-xl rounded-2xl shadow-lg shadow-blue-950/50 hover:shadow-blue-900/60 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {isExporting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Gerando arquivo {format.toUpperCase()}...</span>
              </>
            ) : (
              <>
                <Download className="w-6 h-6" />
                <span>Baixar Arquivo {format.toUpperCase()} Agora</span>
              </>
            )}
          </button>
        </div>

        {/* Step 5: Prévia das Primeiras Linhas */}
        {previewRecords.length > 0 && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <span>Prévia dos Dados Selecionados</span>
              </h2>
              <span className="text-xs text-slate-400 font-mono">3 amostras</span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400">
                  <tr>
                    {Array.from(selectedFields).slice(0, 7).map((key) => {
                      const f = EXPORTABLE_FIELDS.find((item) => item.key === key);
                      return (
                        <th key={key} className="py-2.5 px-3 font-semibold whitespace-nowrap">
                          {f?.label || key}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/40 text-slate-300">
                  {previewRecords.map((rec) => (
                    <tr key={rec.id}>
                      {Array.from(selectedFields).slice(0, 7).map((key) => (
                        <td key={key} className="py-2.5 px-3 max-w-[200px] truncate">
                          {String(rec[key] ?? '') || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
