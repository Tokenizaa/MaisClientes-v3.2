import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { countPlaces, getAllPlaces, getJob, getPlacesByIds, getRunReport, saveRunReport, getAuthenticatedUser } from './db';
import { listAuditLogs } from './audit-log';
import { PlaceRecord } from '../shared/types';

const reportDirectory = path.resolve(process.cwd(), 'artifacts', 'reports');

function missingFields(place: PlaceRecord): string[] {
  const fields: (keyof PlaceRecord)[] = [
    'name', 'category', 'address', 'phone', 'website', 'rating',
    'review_count', 'opening_hours', 'business_status', 'latitude',
    'longitude', 'maps_url',
  ];
  return fields.filter((field) => !String(place[field] ?? '').trim());
}


function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (char) => entities[char] || char);
}

function renderReportHtml(report: any): string {
  const saved = (report.data_quality.processed_records || report.data_quality.saved_records) as any[];
  const duplicates = report.duplicates as any[];
  const events = (report.audit.events as any[]).slice(0, 80);
  const run = report.run;
  const rows = saved.map((item) => '<tr><td>' + escapeHtml(item.name) + '</td><td>' + escapeHtml(item.fields.category) + '</td><td>' + escapeHtml(item.fields.rating) + ' (' + escapeHtml(item.fields.review_count) + ')</td><td>' + escapeHtml(item.fields.address) + '</td><td>' + escapeHtml(item.fields.phone) + '</td><td>' + escapeHtml(item.fields.website) + '</td><td>' + escapeHtml(item.missing_fields.join(', ') || 'Nenhum') + '</td></tr>').join('');
  const duplicateRows = duplicates.map((item) => '<tr><td>' + escapeHtml(item.existingName || item.previewName) + '</td><td>' + escapeHtml(item.existingJobId) + '</td><td>' + escapeHtml(item.existingCollectedAt) + '</td><td>' + escapeHtml(item.mapsUrl) + '</td></tr>').join('');
  const eventRows = events.map((item) => '<tr><td>' + escapeHtml(item.created_at) + '</td><td>' + escapeHtml(item.level) + '</td><td>' + escapeHtml(item.event) + '</td><td>' + escapeHtml(item.message) + '</td></tr>').join('');
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' +
    '@page{size:A4 landscape;margin:14mm 10mm}body{font:10px Arial,sans-serif;color:#18181b}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}p{color:#52525b;margin:4px 0}.metrics{display:flex;gap:12px;margin:16px 0}.metric{border:1px solid #d4d4d8;border-radius:6px;padding:9px;min-width:110px}.metric strong{display:block;font-size:18px;margin-top:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #d4d4d8;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f4f4f5}tr{break-inside:avoid}.note{margin-top:16px;font-size:9px}' +
    '</style></head><body><h1>Relatório de execução MapScrape</h1>' +
    '<p>Gerado em ' + escapeHtml(report.generated_at) + ' · Pesquisa ' + escapeHtml(run.id) + '</p>' +
    '<p>Consulta: ' + escapeHtml(run.segment) + ' · ' + escapeHtml(run.location) + ' · Status: ' + escapeHtml(run.status) + '</p>' +
    '<div class="metrics"><div class="metric">Base antes<strong>' + escapeHtml(report.database.total_before) + '</strong></div>' +
    '<div class="metric">Base depois<strong>' + escapeHtml(report.database.total_after) + '</strong></div>' +
    '<div class="metric">Crescimento líquido<strong>' + escapeHtml(report.database.net_growth) + '</strong></div>' +
    '<div class="metric">Salvos nesta pesquisa<strong>' + escapeHtml(report.database.records_saved_by_run) + '</strong></div>' +
    '<div class="metric">Duplicados<strong>' + escapeHtml(run.total_duplicates) + '</strong></div><div class="metric">Falhas<strong>' + escapeHtml(run.total_errors) + '</strong></div></div>' +
    '<p>' + escapeHtml(run.status_message) + '</p><h2>Registros salvos e qualidade dos campos</h2>' +
    '<table><thead><tr><th>Estabelecimento</th><th>Categoria</th><th>Nota / avaliações</th><th>Endereço</th><th>Telefone</th><th>Site</th><th>Campos ausentes</th></tr></thead><tbody>' + (rows || '<tr><td colspan="7">Nenhum registro novo salvo nesta execução.</td></tr>') + '</tbody></table>' +
    '<h2>Duplicados ignorados</h2><table><thead><tr><th>Estabelecimento existente</th><th>Pesquisa original</th><th>Data da coleta original</th><th>Ficha Maps</th></tr></thead><tbody>' + (duplicateRows || '<tr><td colspan="4">Nenhum duplicado identificado.</td></tr>') + '</tbody></table>' +
    '<h2>Eventos técnicos recentes (máximo 80)</h2><table><thead><tr><th>Data</th><th>Nível</th><th>Evento</th><th>Mensagem</th></tr></thead><tbody>' + (eventRows || '<tr><td colspan="4">Sem eventos de auditoria.</td></tr>') + '</tbody></table>' +
    '<p class="note">Este relatório documenta a execução observada. Não comprova que o Google Maps apresentou todos os resultados possíveis. O JSON associado contém os dados completos para análise automatizada.</p></body></html>';
}

export async function writeRunReport(jobId: string, baselineCount: number, options: { updateLatest?: boolean; generatePdf?: boolean } = {}): Promise<string> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Cannot write run report: job ${jobId} was not found`);

  const [currentCount, savedPlaces, audit] = await Promise.all([
    countPlaces(),
    getAllPlaces(jobId),
    listAuditLogs({ jobId, limit: 500 }),
  ]);

  // Enrichment updates an existing global record and intentionally preserves its original job_id.
  // Include those updated records in this run's evidence without rewriting historical ownership.
  const enrichedPlaceIds = Array.from(new Set(audit.logs
    .filter((event) => event.event === 'place.enriched')
    .flatMap((event) => {
      try {
        const metadata = JSON.parse(event.metadata || '{}') as Record<string, unknown>;
        return typeof metadata.placeId === 'string' ? [metadata.placeId] : [];
      } catch { return []; }
    })));
  const enrichedPlaces = enrichedPlaceIds.length ? await getPlacesByIds(enrichedPlaceIds) : [];
  const processedPlaces = Array.from(new Map([...savedPlaces, ...enrichedPlaces].map((place) => [place.id, place])).values());

  const finishEvent = audit.logs.find((event) => event.event === 'job.finished');
  let finishMetadata: Record<string, unknown> = {};
  try { finishMetadata = JSON.parse(finishEvent?.metadata || '{}'); } catch {}

  const duplicateEvents = audit.logs
    .filter((event) => event.event === 'place.duplicate_skipped')
    .map((event) => {
      let metadata: Record<string, unknown> = {};
      try { metadata = JSON.parse(event.metadata || '{}'); } catch {}
      return { at: event.created_at, message: event.message, ...metadata };
    });

  const toPlaceQuality = (places: PlaceRecord[]) => places.map((place) => ({
    id: place.id,
    name: place.name,
    maps_url: place.maps_url,
    collected_at: place.collected_at,
    fields: place,
    missing_fields: missingFields(place),
    populated_fields: Object.keys(place).filter((key) => String((place as unknown as Record<string, unknown>)[key] ?? '').trim()).length,
  }));
  const savedQuality = toPlaceQuality(savedPlaces);
  const processedQuality = toPlaceQuality(processedPlaces);

  const report = {
    schema_version: 1,
    report_type: 'mapscrape-run-audit',
    generated_at: new Date().toISOString(),
    application: 'Tokenizaa/mapscrape-v2',
    run: job,
    database: {
      total_before: baselineCount,
      total_after: currentCount,
      net_growth: currentCount - baselineCount,
      records_saved_by_run: savedPlaces.length,
      records_enriched_by_run: enrichedPlaces.length,
      records_processed_by_run: processedPlaces.length,
      records_saved_by_run_matches_job_counter: processedPlaces.length === job.total_collected,
    },
    collection: {
      requested_limit: job.limit_requested,
      status: job.status,
      total_found: job.total_found,
      total_collected: job.total_collected,
      total_duplicates: job.total_duplicates,
      total_errors: job.total_errors,
      duplicate_only_run: job.total_collected === 0 && job.total_duplicates > 0,
      reached_successful_new_record_target: job.total_collected >= job.limit_requested,
      scroll_attempts: Number(finishMetadata.scrollAttempts ?? 0),
      reached_end_of_list: Boolean(finishMetadata.reachedEndOfList ?? false),
      new_candidates_found: Number(finishMetadata.newCandidatesFound ?? finishMetadata.totalFound ?? 0),
    },
    data_quality: {
      records_with_missing_fields: processedQuality.filter((place) => place.missing_fields.length > 0).length,
      missing_field_frequency: Object.fromEntries(
        [...new Set(processedQuality.flatMap((place) => place.missing_fields))]
          .map((field) => [field, processedQuality.filter((place) => place.missing_fields.includes(field)).length])
      ),
      saved_records: savedQuality,
      processed_records: processedQuality,
    },
    duplicates: duplicateEvents,
    artifacts: { json_file: jobId + '.json', pdf_file: jobId + '.pdf', pdf_generated: false as boolean },
    audit: {
      returned_count: audit.logs.length,
      total_matching_events: audit.total,
      events: audit.logs,
      truncated: audit.total > audit.logs.length,
    },
    interpretation: {
      database_growth_is_measured_by_before_after_count: true,
      zero_growth_is_not_reported_as_new_data: currentCount - baselineCount === 0,
      note: 'O relatório descreve evidências locais observadas. Crescimento líquido e contagem por job são métricas distintas; não comprovam que o Google Maps tenha retornado todos os resultados possíveis.',
    },
  };

  const filePath = path.join(reportDirectory, jobId + '.json');
  const pdfPath = path.join(reportDirectory, jobId + '.pdf');
  if (options.generatePdf !== false && !process.env.VERCEL) {
    await fs.mkdir(reportDirectory, { recursive: true });
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    try {
      report.artifacts.pdf_generated = true;
      browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
      const page = await browser.newPage();
      await page.setContent(renderReportHtml(report), { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#71717a;">MapScrape · Relatório de auditoria · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
        margin: { top: '12mm', bottom: '14mm', left: '8mm', right: '8mm' },
      });
      await fs.writeFile(pdfPath, pdf);
    } catch (error: any) {
      report.artifacts.pdf_generated = false;
      (report.artifacts as any).pdf_error = String(error?.message || error).slice(0, 1000);
      await fs.unlink(pdfPath).catch(() => {});
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
  const json = JSON.stringify(report, null, 2) + '\n';
  // Durable source of truth: Vercel's function filesystem is read-only and ephemeral.
  const userId = await getAuthenticatedUser().then(user => user?.id || 'anonymous');
  await saveRunReport(jobId, json, report.generated_at, userId);
  // Keep local artifacts for developer workflows only.
  if (!process.env.VERCEL) {
    await fs.mkdir(reportDirectory, { recursive: true });
    await fs.writeFile(filePath, json, 'utf8');
    if (options.updateLatest !== false) {
      await fs.writeFile(path.join(reportDirectory, 'latest-audit.json'), json, 'utf8');
      if (report.artifacts.pdf_generated) await fs.copyFile(pdfPath, path.join(reportDirectory, 'latest-audit.pdf'));
      else await fs.unlink(path.join(reportDirectory, 'latest-audit.pdf')).catch(() => {});
    }
    return filePath;
  }
  return `database:run_reports/${jobId}`;
}

export async function readRunReport(jobId: string): Promise<unknown | null> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) return null;
  try {
    const stored = await getRunReport(jobId);
    if (stored) return JSON.parse(stored);
  } catch (error) {
    console.error('Falha ao ler relatório persistido:', error instanceof Error ? error.message : error);
  }
  // Backward compatibility for reports generated by older local versions.
  if (!process.env.VERCEL) {
    try {
      const content = await fs.readFile(path.join(reportDirectory, `${jobId}.json`), 'utf8');
      return JSON.parse(content);
    } catch {}
  }
  return null;
}

export async function readRunReportPdf(jobId: string): Promise<Buffer | null> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(jobId)) return null;
  try {
    return await fs.readFile(path.join(reportDirectory, jobId + '.pdf'));
  } catch {
    return null;
  }
}
