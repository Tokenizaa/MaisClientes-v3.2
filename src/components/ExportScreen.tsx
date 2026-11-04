import React, { useState, useMemo } from 'react';
import {
  FileDown,
  CheckSquare,
  Square,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  Download,
  Check,
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
  // Field selection state (default all selected)
  const [selectedFields, setSelectedFields] = useState<Set<keyof PlaceRecord>>(
    new Set(EXPORTABLE_FIELDS.map((f) => f.key))
  );

  // Scope: 'selected' | 'current_job' | 'all'
  const [scope, setScope] = useState<'selected' | 'current_job' | 'all'>(
    selectedPlaceIds.size > 0 ? 'selected' : selectedJobId ? 'current_job' : 'all'
  );

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

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const payload: any = {
        fields: Array.from(selectedFields),
        filename: filename.trim() || defaultFilename,
      };

      if (scope === 'selected' && selectedPlaceIds.size > 0) {
        payload.placeIds = Array.from(selectedPlaceIds);
      } else if (scope === 'current_job' && selectedJobId) {
        payload.jobId = selectedJobId;
      }
      // Keep the active Results filters in the export request so the CSV
      // contains every matching record, not just the current visible page.
      if (searchQuery.trim()) payload.query = searchQuery.trim();
      if (selectedCategory) payload.category = selectedCategory;

      const token = window.sessionStorage.getItem('mapscrape_session_token');
      const response = await fetch('/api/v1/export/csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || 'Falha ao gerar arquivo CSV.');
      }

      // Download trigger
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.trim() || defaultFilename}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar o arquivo CSV.');
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
          <span>Exportação de Dados Tabulares</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-100 tracking-tight leading-tight">
          Exportar para CSV
        </h1>
        <p className="mt-3 text-base sm:text-lg text-slate-400 max-w-3xl leading-relaxed">
          Gere um arquivo CSV profissional com codificação UTF-8 com BOM, delimitador por vírgula e proteção contra fórmulas (CSV Injection). 100% compatível com Excel, LibreOffice Calc e Google Sheets.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: Escopo da Exportação */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5 backdrop-blur-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            1. Escopo da Exportação
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
                  {selectedPlaceIds.size} de {totalPlaces} selecionados na tabela
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
                  Todos os {totalPlaces.toLocaleString('pt-BR')} registros salvos no SQLite
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Step 2: Selecionar Colunas / Campos */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-5 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-100">
                2. Selecionar Campos para Exportação
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                {selectedFields.size} de {EXPORTABLE_FIELDS.length} campos selecionados para as colunas do CSV
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

        {/* Step 3: Nome do Arquivo & Botão de Download */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-6 backdrop-blur-sm">
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">
            3. Nome do Arquivo e Download
          </h2>

          <div className="space-y-2">
            <label htmlFor="csv-filename" className="block text-sm font-semibold text-slate-300">
              Nome do arquivo CSV:
            </label>
            <div className="flex items-center gap-2">
              <input
                id="csv-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="Ex: mapscrape_leads_2026"
                className="flex-1 py-3.5 px-4 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-base font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
              <span className="text-base font-bold text-slate-400 font-mono shrink-0">.csv</span>
            </div>
          </div>

          {/* Compliance & Security Callout */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-start gap-3 text-xs sm:text-sm text-slate-300">
            <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-slate-100 block">Padrão Corporativo & Proteção contra Fórmulas</span>
              <p className="text-slate-400 leading-relaxed">
                O arquivo é gerado com cabeçalho UTF-8 BOM para abertura perfeita no Excel sem desconfigurar acentuação. Células que iniciam com caracteres perigosos (<code className="text-blue-400 font-mono">=</code>, <code className="text-blue-400 font-mono">+</code>, <code className="text-blue-400 font-mono">-</code>, <code className="text-blue-400 font-mono">@</code>) são automaticamente neutralizadas com aspas simples para segurança contra CSV Injection.
              </p>
            </div>
          </div>

          {exportSuccess && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3 text-sm font-semibold text-blue-300">
              <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
              <span>Download concluído com sucesso! Verifique a pasta de downloads do seu computador.</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || totalPlaces === 0}
            className="w-full py-4 sm:py-5 px-8 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg sm:text-xl rounded-2xl shadow-lg shadow-blue-950/50 hover:shadow-blue-900/60 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {isExporting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Gerando arquivo CSV...</span>
              </>
            ) : (
              <>
                <Download className="w-6 h-6" />
                <span>Baixar Arquivo CSV Agora</span>
              </>
            )}
          </button>
        </div>

        {/* Step 4: Prévia das Primeiras Linhas */}
        {previewRecords.length > 0 && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/30 space-y-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <span>Prévia das Primeiras Linhas da Planilha</span>
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
