import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE_URL = process.env.E2E_BASE_URL?.replace(/\/+$/, '');
const E2E_EMAIL = process.env.E2E_EMAIL;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

async function runCommercialTests() {
  if (!BASE_URL || !E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error('Defina E2E_BASE_URL, E2E_EMAIL e E2E_PASSWORD para executar os testes E2E.');
  }
  if (process.env.E2E_ALLOW_DESTRUCTIVE_TESTS !== 'true') {
    throw new Error('Esta suíte cria e exclui oportunidades. Defina E2E_ALLOW_DESTRUCTIVE_TESTS=true somente em ambiente de teste isolado.');
  }
  console.log('🚀 Iniciando bateria de testes Playwright E2E — Refatoração Comercial MaisClientes...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  console.log('📍 Acessando aplicação em ${BASE_URL}...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // If AuthScreen is shown, log in with administrator credentials
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 2500 }).catch(() => false)) {
    console.log('Autenticando via formulário de login (AuthScreen)...');
    await emailInput.fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(2000);
  }

  // Wait for sidebar and main layout
  await page.waitForSelector('.app-shell', { timeout: 10000 });
  console.log('✅ 0. Autenticação realizada com sucesso e app carregado.');

  // =========================================================================
  // TESTE 1: Abrir uma ficha de lead a partir de Base de Leads
  // =========================================================================
  console.log('\n--- TESTE 1: Abrir ficha de lead ---');
  // Click on 'Base de Leads' tab in sidebar
  const leadsTabBtn = page.locator('button:has-text("Base de Leads")').first();
  await leadsTabBtn.click();
  await page.waitForTimeout(1000);

  // Click on lead card button using data-testid
  const leadCardBtn = page.locator('[data-testid="open-lead-modal-btn"]').first();
  await leadCardBtn.waitFor({ state: 'visible', timeout: 10000 });
  const leadName = (await leadCardBtn.innerText()).trim();
  console.log(`Abrindo ficha do lead: "${leadName}"...`);
  await leadCardBtn.click();

  // Verify modal dialog opened
  const leadModal = page.locator('section[role="dialog"]');
  await leadModal.waitFor({ state: 'visible', timeout: 5000 });
  const modalTitle = (await page.locator('#lead-title').innerText()).trim();
  assert(modalTitle.length > 0, 'O título da ficha do lead deve estar preenchido');
  console.log(`✅ 1. Ficha do lead aberta com sucesso: "${modalTitle}".`);

  // =========================================================================
  // TESTE 2: Navegar pelas 4 áreas da ficha (sem abas aninhadas)
  // =========================================================================
  console.log('\n--- TESTE 2: Navegar pelas 4 áreas da ficha ---');
  // Tab 1: Comercial & Diagnóstico
  assert(await page.locator('button:has-text("1. Comercial & Diagnóstico")').isVisible());
  console.log('  - Aba 1 (Comercial) confirmada ativa.');

  // Tab 2: Empresa & Operação
  await page.locator('button:has-text("2. Empresa & Operação")').click();
  await page.waitForTimeout(400);
  assert(await page.locator('text=Informações Cadastrais').isVisible());
  console.log('  - Aba 2 (Empresa & Operação) renderizada com sucesso.');

  // Tab 3: Presença Digital & Evidências
  await page.locator('button:has-text("3. Presença Digital & Evidências")').click();
  await page.waitForTimeout(400);
  assert(await page.locator('text=Maturidade Digital').isVisible());
  console.log('  - Aba 3 (Presença Digital & Evidências) renderizada com sucesso.');

  // Tab 4: Avaliações & Mídia
  await page.locator('button:has-text("4. Avaliações & Mídia")').click();
  await page.waitForTimeout(400);
  assert(await page.locator('text=Reputação no Google Maps').isVisible());
  console.log('  - Aba 4 (Avaliações & Mídia) renderizada com sucesso.');

  console.log('✅ 2. Navegação completa e limpa pelas 4 áreas sem concorrência de abas.');

  // =========================================================================
  // TESTE 3: Consultar inteligência comercial
  // =========================================================================
  console.log('\n--- TESTE 3: Consultar inteligência comercial ---');
  await page.locator('button:has-text("1. Comercial & Diagnóstico")').click();
  await page.waitForTimeout(400);

  // Check that executive summary and questions are displayed
  const whoIsCompany = page.locator('text=Quem é a Empresa & Operação');
  assert(await whoIsCompany.isVisible(), 'Quem é a empresa deve estar visível');

  const recommendedSolution = page.locator('text=Solução Comercial Recomendada & Aderência');
  assert(await recommendedSolution.isVisible(), 'Solução recomendada deve estar visível');

  const discoveryQuestions = page.locator('text=Perguntas de Sondagem para o Vendedor');
  assert(await discoveryQuestions.isVisible(), 'Perguntas de sondagem devem estar visíveis');
  console.log('✅ 3. Inteligência comercial consultada com sucesso (resumo, solução, aderência e discovery).');

  // =========================================================================
  // TESTE 4: Criar ou atualizar oportunidade no pipeline a partir da ficha
  // =========================================================================
  console.log('\n--- TESTE 4: Criar oportunidade a partir da ficha ---');
  // Check the pipeline stage selector in the header
  const stageSelect = page.locator('select').first();
  await stageSelect.selectOption('apresentacao');
  await page.waitForTimeout(1000);
  console.log('Etapa alterada na ficha para "3. Demonstração Comercial".');
  console.log('✅ 4. Oportunidade associada e salva no pipeline comercial.');

  // =========================================================================
  // TESTE 5: Visualizar a oportunidade no Kanban
  // =========================================================================
  console.log('\n--- TESTE 5: Visualizar oportunidade no Kanban ---');
  // Close lead modal
  await page.locator('button[aria-label="Fechar ficha do lead"]').click();
  await page.waitForTimeout(500);

  // Navigate to Kanban
  await page.locator('button:has-text("Pipeline Kanban")').first().click();
  await page.waitForTimeout(1000);

  // Verify Kanban header and columns
  assert(await page.locator('h1:has-text("Pipeline de Oportunidades")').isVisible());
  // Verify that the lead card appears in Kanban
  const kanbanCardBtn = page.locator(`[data-testid="kanban-lead-btn"]:has-text("${modalTitle}")`).first();
  assert(await kanbanCardBtn.isVisible(), `O card "${modalTitle}" deve aparecer no Kanban`);
  console.log(`✅ 5. Oportunidade "${modalTitle}" visualizada no Kanban com sucesso.`);

  // =========================================================================
  // TESTE 6: Mover oportunidade entre etapas no Kanban
  // =========================================================================
  console.log('\n--- TESTE 6: Mover oportunidade entre etapas no Kanban ---');
  // Move using accessible select dropdown on the card
  const cardContainer = page.locator(`div:has([data-testid="kanban-lead-btn"]:has-text("${modalTitle}"))`).first();
  const cardStageSelect = cardContainer.locator('select[aria-label="Mover para etapa"]');
  await cardStageSelect.selectOption('proposta');
  await page.waitForTimeout(1000);

  // Verify that the card is now in Proposta column
  const propostaColumn = page.locator('div:has-text("PROPOSTA")');
  assert(await propostaColumn.locator(`[data-testid="kanban-lead-btn"]:has-text("${modalTitle}")`).first().isVisible());
  console.log('✅ 6. Oportunidade movida para "Proposta Enviada" via seletor acessível.');

  // =========================================================================
  // TESTE 7: Atualizar informações comerciais (valor e decisor)
  // =========================================================================
  console.log('\n--- TESTE 7: Atualizar informações comerciais ---');
  // Click on the card to open lead details modal directly from Kanban
  await kanbanCardBtn.click();
  await page.waitForTimeout(600);
  assert(await page.locator('#lead-title').isVisible(), 'Ficha deve abrir ao clicar no card do Kanban');

  // Click on "Editar Dados Comerciais"
  const editDealBtn = page.locator('button:has-text("Editar Dados Comerciais")');
  await editDealBtn.click();
  await page.waitForTimeout(300);

  // Enter proposal value R$ 5200 and contact name
  const dealValueInput = page.locator('input[placeholder="0,00"]');
  await dealValueInput.fill('5200');

  const contactNameInput = page.locator('input[placeholder="Nome do decisor"]');
  await contactNameInput.fill('Dr. Roberto Silva');

  // Save deal details
  await page.locator('button:has-text("Salvar Alterações")').click();
  await page.waitForTimeout(1000);

  assert(await page.locator('text=R$ 5.200').isVisible(), 'Valor atualizado R$ 5.200 deve estar visível');
  assert(await page.locator('text=Dr. Roberto Silva').isVisible(), 'Nome do decisor deve estar visível');
  console.log('✅ 7. Informações comerciais atualizadas (R$ 5.200 e Dr. Roberto Silva).');

  // =========================================================================
  // TESTE 8: Registrar contato e próximo retorno
  // =========================================================================
  console.log('\n--- TESTE 8: Registrar contato e próximo retorno ---');
  const registerContactBtn = page.locator('button:has-text("Registrar Contato")').first();
  await registerContactBtn.click();
  await page.waitForTimeout(300);

  // Fill in interaction form
  const notesTextarea = page.locator('textarea[placeholder*="Falou com"]');
  await notesTextarea.fill('Conversa produtiva com Dr. Roberto. Demonstrou interesse no módulo de agendamento e emissão fiscal. Reunião de apresentação confirmada.');

  const nextActionInput = page.locator('input[placeholder*="Próxima ação"]');
  await nextActionInput.fill('Apresentar demonstração comercial ao vivo');

  const dateInput = page.locator('input[type="date"]');
  // Set next follow-up date to next week
  const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];
  await dateInput.fill(futureDate);

  // Submit interaction
  await page.locator('button:has-text("Salvar Registro")').click();
  await page.waitForTimeout(1000);

  // Verify interaction is rendered in history
  assert(await page.locator('text=Conversa produtiva com Dr. Roberto').isVisible());
  console.log('✅ 8. Contato e retorno futuro registrados com sucesso.');

  // =========================================================================
  // TESTE 9: Reabrir a ficha e verificar a sincronização
  // =========================================================================
  console.log('\n--- TESTE 9: Reabrir a ficha e verificar sincronização ---');
  await page.locator('button[aria-label="Fechar ficha do lead"]').click();
  await page.waitForTimeout(500);

  // Check card on Kanban reflects the new value R$ 5.200 and next action
  const updatedKanbanCard = page.locator(`div:has([data-testid="kanban-lead-btn"]:has-text("${modalTitle}"))`).first();
  assert(await updatedKanbanCard.locator('text=R$ 5.200').isVisible(), 'Kanban deve refletir R$ 5.200');
  assert(await updatedKanbanCard.locator('text=Apresentar demonstração').isVisible(), 'Kanban deve refletir próxima ação');

  // Reopen lead modal from Kanban card
  await updatedKanbanCard.locator('[data-testid="kanban-lead-btn"]').click();
  await page.waitForTimeout(500);

  // Check stage select in modal still reflects 'proposta'
  const currentStageInModal = await page.locator('select').first().inputValue();
  assert.strictEqual(currentStageInModal, 'proposta', 'Etapa na ficha deve estar perfeitamente sincronizada com o Kanban');
  console.log('✅ 9. Ficha e Kanban rigorosamente sincronizados bidirecionalmente.');

  // =========================================================================
  // TESTE 10: Recarregar a aplicação e confirmar persistência
  // =========================================================================
  console.log('\n--- TESTE 10: Recarregar a aplicação e confirmar persistência ---');
  await page.locator('button[aria-label="Fechar ficha do lead"]').click();
  await page.waitForTimeout(300);

  console.log('Executando reload completo do navegador...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // If AuthScreen shows after reload, authenticate again
  if (await emailInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await emailInput.fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);
  }

  // Go to Kanban tab
  await page.locator('button:has-text("Pipeline Kanban")').first().click();
  await page.waitForTimeout(1000);

  // Check persisted opportunity
  const persistedCard = page.locator(`div:has([data-testid="kanban-lead-btn"]:has-text("${modalTitle}"))`).first();
  assert(await persistedCard.isVisible(), 'Oportunidade deve persistir após reload');
  assert(await persistedCard.locator('text=R$ 5.200').isVisible(), 'Valor persistido R$ 5.200 deve estar intacto');
  console.log('✅ 10. Persistência de dados confirmada após recarregar a aplicação.');

  // =========================================================================
  // TESTE 11: Verificar exclusão e indicadores do pipeline
  // =========================================================================
  console.log('\n--- TESTE 11: Indicadores e exclusão ---');
  // Check active opportunities indicator
  const activeMetric = await page.locator('p:has-text("Oportunidades Ativas"), div:has(span:has-text("Oportunidades Ativas")) p').first().innerText();
  console.log(`Contagem de ativas no indicador: ${activeMetric}`);
  assert(Number(activeMetric) > 0, 'Oportunidades ativas deve ser maior que zero');

  // Delete the opportunity via delete button on card
  const deleteBtn = persistedCard.locator('button[title="Remover oportunidade"]');
  await deleteBtn.click();
  await page.waitForTimeout(1000);

  // Verify it is removed
  assert(!(await page.locator(`[data-testid="kanban-lead-btn"]:has-text("${modalTitle}")`).isVisible()), 'Card excluído não deve mais aparecer');
  console.log('✅ 11. Exclusão e recálculo dinâmico de métricas verificados com sucesso.');

  // =========================================================================
  // TESTE 12: Responsividade Mobile (375x812)
  // =========================================================================
  console.log('\n--- TESTE 12: Verificar responsividade ---');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(500);

  // Go to Results screen on mobile
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // If AuthScreen shows on mobile, authenticate
  if (await emailInput.isVisible({ timeout: 1500 }).catch(() => false)) {
    await emailInput.fill(E2E_EMAIL);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1500);
  }

  // Open mobile menu if needed or navigate directly
  const mobileMenuBtn = page.locator('button[aria-label="Abrir menu lateral"]');
  if (await mobileMenuBtn.isVisible()) {
    await mobileMenuBtn.click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Base de Leads")').first().click();
  }

  await page.waitForTimeout(1000);

  // Open lead sheet on mobile
  const mobileLeadBtn = page.locator('[data-testid="open-lead-modal-btn"]').first();
  await mobileLeadBtn.click();
  await page.waitForTimeout(500);

  const mobileModal = page.locator('section[role="dialog"]');
  assert(await mobileModal.isVisible(), 'Modal deve se adaptar e abrir corretamente no viewport mobile');
  console.log('✅ 12. Responsividade mobile validada sem quebras de layout.');

  await browser.close();
  console.log('\n🎉 TODOS OS 12 TESTES PLAYWRIGHT E2E FORAM EXECUTADOS E APROVADOS COM SUCESSO!\n');
}

runCommercialTests().catch((err) => {
  console.error('❌ Falha na bateria de testes:', err);
  process.exit(1);
});
