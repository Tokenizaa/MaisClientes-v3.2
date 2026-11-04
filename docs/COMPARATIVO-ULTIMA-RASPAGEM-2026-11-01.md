# Comparativo da última coleta × validação Firecrawl — 01/11/2026

## Escopo e fontes

Este documento separa três evidências que não devem ser confundidas:

1. **Última execução real registrada no Supabase:** job `job_1793509876027_tshaz`, segmento `cafeteiras`, São Paulo.
2. **Últimos registros efetivamente persistidos:** tabela `public.places`, com destaque para os registros do job anterior `job_1793508674464_1ixe8`.
3. **Ficha de referência Bearzil:** mapeamento Firecrawl de 26/10 e nova simulação interativa Firecrawl de 01/11. A simulação não gravou dados no Supabase e não foi executada pelo Puppeteer do produto.

## 1. Última execução real no Supabase

| Indicador | Resultado |
|---|---:|
| Job | `job_1793509876027_tshaz` |
| Pesquisa | cafeteiras — São Paulo, SP |
| Resultados encontrados | 14 |
| Novos registros salvos | 0 |
| Duplicados descartados | 14 |
| Erros | 1 |
| Estado final | `failed` |
| Último erro | Puppeteer: `Attempted to use detached Frame` |

A deduplicação fez o que deveria: os 14 resultados já existiam e foram descartados sem abrir fichas. A falha ocorreu depois, quando o navegador tentou continuar usando um frame desconectado. Portanto, zero novos registros não é evidência de falha de deduplicação; é ausência de inéditos nessa amostra.

## 2. Problema grave encontrado na última coleta com fichas abertas

O job anterior `job_1793508674464_1ixe8` registrou 31 resultados: 3 novos, 28 duplicados e 1 erro. A consulta direta aos registros persistidos encontrou:

- `Café Creme` salvo com `name = "Horários"`, sem categoria, endereço, telefone, site, nota ou contagem de avaliações.
- `opening_hours` desse registro misturava o horário de sábado, texto de interface, nome de outro negócio e sugestões de horários.
- O mesmo padrão de registro inválido `name = "Horários"` aparece em outros registros anteriores.

Isso comprova um defeito do extrator, não apenas uma hipótese baseada em seletor: o overlay de horários estava sendo confundido com o título do estabelecimento e o conteúdo global de acessibilidade estava contaminando o campo de horários.

## 3. Comparação da ficha Bearzil — Firecrawl

| Campo | Mapeamento Firecrawl de 26/10 | Simulação interativa de 01/11 | Leitura |
|---|---|---|---|
| Nota | 4,9 | 4,9 | Consistente |
| Total de avaliações | 278 | 278 | Consistente |
| Avaliações individuais visíveis | 3 | 5 | +2 visíveis; não representa o total |
| Fotos visíveis | 187 | 186 | Variação de 1; contagem dinâmica, não tratar como regressão |
| Horários semanais | Não capturados | 7 dias expandidos | Melhora comprovada na sessão interativa |
| Distribuição por estrelas | Não estruturada | 265×5, 8×4, 2×3, 0×2, 3×1 | Novo dado observado na sessão |
| Telefone, endereço e site | Capturados | Visíveis na ficha | Continuidade |
| Agendamento/WhatsApp | Link de agendamento documentado | Ações e link de agendamento visíveis | Continuidade |
| Avaliações completas | Limitadas pela view/autenticação | 5 acessíveis antes de exigir autenticação | Não prometer coleta integral |

A variação de 187 para 186 fotos pode decorrer da atualização da galeria ou da sessão. Não é evidência suficiente de perda no extrator.

## 4. Correção de código aplicada nesta rodada

Commit: `b381275fd382e06a03ab1edb627870c6cd7001a7`

Arquivo: `src/server/scraper/extractor.ts`

- O nome passa a ser lido de títulos `h1` fora de diálogos/overlays, descartando títulos genéricos como “Horários”, “Avaliações”, “Fotos” e “Sobre”.
- Se não houver título válido, o extrator lança `place_name_not_found`. O registro não deve ser persistido como estabelecimento.
- A coleta de horários deixou de varrer todos os elementos com `aria-label`; agora aceita apenas linhas estruturadas e exige que o texto comece pelo dia da semana. Isso impede misturar controles, recomendações e nomes de outros negócios ao horário.

A correção foi commitada na branch `fix/scraper-p0-recovery-and-exhaustion`. O CI foi iniciado e ainda precisa concluir TypeScript, testes e build. Nenhuma alteração foi aplicada à `main`, nenhum deploy foi realizado e nenhuma nova coleta foi executada pelo Puppeteer após a correção.

## 5. O que melhorou e o que ainda falta provar

### Melhorias comprovadas

- A simulação interativa Firecrawl conseguiu expandir e observar os sete dias de horários.
- A simulação encontrou mais avaliações individuais visíveis e a distribuição de estrelas, indisponíveis na extração Firecrawl anterior.
- O código agora bloqueia o erro confirmado de gravar o título do overlay como nome de negócio e restringe a leitura de horários a linhas estruturadas.
- A deduplicação remota descartou silenciosamente os 14 resultados repetidos na última execução.

### Pendências para aprovação

1. CI verde no commit `b381275`.
2. Executar a ficha Bearzil com o Puppeteer/Chromium do próprio produto, sem inserir fixtures no banco.
3. Comparar DOM observado, objeto extraído, linha persistida e resposta da API para cada campo.
4. Confirmar que nenhum registro com nome genérico ou sem nome é persistido.
5. Validar a recuperação de `detached Frame` no fluxo real; a última execução ainda terminou com esse erro.
6. Repetir uma coleta curta com resultados inéditos e duplicados para comprovar que a meta conta apenas inserts reais.

**Conclusão:** a qualidade potencial da extração aumentou na simulação Firecrawl, mas ainda não há prova de que o runtime Puppeteer do produto reproduz essa cobertura. A correção mais urgente desta rodada ataca um defeito confirmado de integridade dos dados: impedir que títulos de overlays sejam salvos como estabelecimentos.
