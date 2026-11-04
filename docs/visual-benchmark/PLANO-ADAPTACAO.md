# Plano de adaptação visual — Mais Clientes V2

**Status:** proposta técnica; implementação não autorizada nesta etapa.  
**Princípio:** transportar a linguagem visual integrada do benchmark, não seus componentes de produto ou dados fictícios.

## 1. Objetivo

Adaptar a identidade visual de `Tokenizaa/sci-fi` ao shell e aos componentes reais de `Tokenizaa/mais-clientes-v2`, mantendo a arquitetura, navegação, autenticação, coleta, persistência e funcionalidades existentes.

## 2. Ordem de implementação proposta

### Etapa A — Ambiente e fundo

1. Incorporar a fotografia panorâmica original do benchmark como asset versionado.
2. Implementar a imagem em camada de fundo de tela cheia, com posição, escala, brilho e contraste controlados.
3. Aplicar os scrims, vinheta radial e scanlines de forma independente e ajustável.
4. Reproduzir os halos ciano, magenta, verde e vermelho com posicionamento e intensidade coerentes com a referência.
5. Validar legibilidade e contraste de todas as telas sobre o novo ambiente.

### Etapa B — Superfícies, bordas e luz

1. Definir tokens CSS de cor, intensidade, blur, borda e sombra.
2. Criar classes/componentes reutilizáveis para painéis LED e ambilight.
3. Reproduzir luz interna e externa em camadas, evitando aplicar seletores globais frágeis a qualquer elemento com `rounded-2xl`.
4. Aplicar cores de destaque por função, não indiscriminadamente.
5. Implementar hover com transições suaves e sem deslocamento excessivo de conteúdo.

### Etapa C — Camada atmosférica

1. Evoluir o canvas atual para partículas multicoloridas com níveis de profundidade e glow.
2. Manter limites de densidade, DPR e custo de renderização adequados a desktop e mobile.
3. Pausar animação quando a aba estiver oculta e respeitar `prefers-reduced-motion`.
4. Avaliar a grade holográfica, feixe de varredura e marcas táticas como camada visual de baixa opacidade.
5. Não introduzir tracking do ponteiro ou efeitos custosos sem benefício visual comprovado.

### Etapa D — Componentes reais

1. Mapear os painéis existentes do dashboard, coleta, resultados, projetos, histórico e logs.
2. Aplicar o sistema visual aos componentes reais, sem refazer a arquitetura de telas.
3. Preservar todos os dados, eventos, filtros, estados de loading/empty/error e fluxos de coleta.
4. Se houver radar ou visualização tática, conectar somente a dados reais do Mais Clientes V2. Não copiar `mockData.ts`, `Math.random()`, telefones fictícios, nomes de empresas demonstrativos ou contadores simulados do benchmark.

## 3. Arquitetura sugerida

- Fundo e iluminação em um componente ambiental isolado.
- Partículas em canvas isolado, com ciclo de vida e performance independentes.
- Grade/scan beam como overlay decorativo, sem capturar eventos de interação.
- Painéis com classes/tokens explícitos e reutilizáveis.
- Nenhuma regra global que dependa de correspondência parcial de classes Tailwind para descobrir quais elementos são cards.
- Assets servidos por caminho compatível com o build de produção do Vite.

## 4. Critérios de validação

- Comparação lado a lado com o benchmark em viewport equivalente (1440×1000).
- Captura mobile equivalente.
- Conferir imagem de fundo, recorte, brilho, contraste e vinheta.
- Conferir distribuição/intensidade dos halos e reflexos.
- Conferir borda LED, ambilight e sombra interna/externa em painéis representativos.
- Conferir partículas e grade sem prejudicar legibilidade nem interação.
- Verificar `prefers-reduced-motion`, mobile, rolagem e estados de autenticação.
- Executar build, lint e testes existentes.
- Confirmar que nenhuma regra visual alterou comportamento, dados, coleta, persistência ou permissões.

## 5. Restrições

- Não importar componentes React do benchmark.
- Não importar dados simulados nem lógica de radar demonstrativo.
- Não adicionar bibliotecas sem necessidade comprovada.
- Não modificar coleta, API, banco, autenticação ou permissões como parte do trabalho visual.
- Não substituir a imagem de referência por gradiente genérico.
- Não considerar a tarefa aprovada apenas porque o build passou: a aprovação exige inspeção visual comparativa.

## 6. Gate de autorização

Este documento é apenas o plano. Nenhuma alteração visual foi realizada nesta auditoria. A implementação deve aguardar aprovação expressa do usuário após a revisão das evidências e do plano.
