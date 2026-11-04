# Logs de desenvolvimento e auditoria

O MapScrape registra eventos técnicos no SQLite (`audit_logs`) para que uma execução possa ser analisada depois de fechar a tela ou reiniciar o servidor.

## Como coletar evidências

1. Abra a aba **5. Logs** antes ou depois da coleta.
2. Execute a pesquisa normalmente.
3. Em **Logs e auditoria**, filtre por nível, categoria ou texto. Cada evento pode ser expandido para ver os metadados.
4. Clique em **Baixar JSONL** para exportar até os 500 eventos mais recentes que correspondam aos filtros.
5. Anexe o arquivo `.jsonl` ao issue ou à conversa de desenvolvimento. Um evento por linha permite pesquisar e processar os dados facilmente.

## Eventos registrados

- Início do servidor e de cada pesquisa.
- Inicialização do Chromium e lotes de resultados encontrados.
- Fichas persistidas, com lista de campos que ficaram vazios.
- Falhas individuais na extração, incluindo URL da ficha e stack trace.
- Bloqueio ou solicitação de verificação pelo Google Maps.
- Resultado final da coleta: concluída, parcial, interrompida ou falha.
- Falhas de API ao iniciar uma pesquisa e pedidos de interrupção.

## Arquivos e persistência

- Banco local: `mapscrape.db`.
- Tabela: `audit_logs`.
- Serviço: `src/server/audit-log.ts`.
- Interface: `src/components/LogsScreen.tsx`.
- API: `GET /api/logs` e `GET /api/logs/export`.

O JSONL é um artefato de diagnóstico; ele não substitui o banco SQLite nem é enviado automaticamente ao GitHub. Revise os metadados antes de publicar logs fora do repositório, pois podem conter nomes de estabelecimentos, URLs de fichas e mensagens técnicas.
