# Análise do benchmark visual — Tokenizaa/sci-fi

**Status:** auditoria de código concluída; validação visual em navegador ainda pendente.  
**Data:** 2026-11-01  
**Benchmark:** [Tokenizaa/sci-fi](https://github.com/Tokenizaa/sci-fi) — branch `main`  
**Aplicação auditada:** [Tokenizaa/mais-clientes-v2](https://github.com/Tokenizaa/mais-clientes-v2) — branch `main`  
**Commit atual auditado:** `5dc7e55af1a79a880af1e11a01ad4cff3cf1e1ce`

## 1. Identidade visual: sistema integrado

O benchmark não é definido por um gradiente isolado ou por cards com sombras. A identidade é uma composição em camadas:

1. Fotografia panorâmica de uma sala de controle sci-fi como ambiente de fundo.
2. Tratamento cinematográfico da fotografia: escurecimento, contraste, vinheta radial, gradiente de leitura e scanlines.
3. Iluminação volumétrica distribuída pelo cenário, com ciano, verde neon, magenta e vermelho.
4. Superfícies de vidro escuro com bordas LED e brilho interno/externo.
5. Ambilight colorido atrás dos painéis, reagindo ao hover.
6. Partículas em múltiplas cores, com profundidade, brilho, conexões e movimento.
7. Grade holográfica, feixe de varredura e marcas táticas periféricas.
8. Movimento de flutuação e animações de entrada para dar profundidade à composição.
9. Radar tático como elemento de interface, visualmente integrado ao mesmo ambiente.

A reprodução deve preservar a relação entre essas camadas. Não basta reproduzir valores de cor ou copiar sombras sem a imagem, os scrims e a distribuição de luz.

## 2. Fundo panorâmico e atmosfera

Arquivo de referência:

`src/assets/images/scifi_control_room_bg_1793541718927.jpg`

Implementação em `src/components/BackgroundEnvironment.tsx`:

- Imagem ocupa a viewport inteira, com `object-cover`, `object-center` e escala de 1.02.
- Tratamento fotográfico: brilho de 0.72 e contraste de 1.12.
- Vinheta radial: centro transparente, região intermediária navy com 60% e borda final `#02050f` com 95%.
- Scrim vertical: topo `#020617/85`, centro transparente e base `#020617/90`.
- Scanlines horizontais com opacidade 3.5% e repetição a cada 4px.
- Halos: ciano no topo central (720×360), magenta à esquerda, verde à direita e vermelho na região inferior.
- Filetes de iluminação nas bordas superior (ciano/magenta) e inferior (verde).

O fundo é estrutural: fornece contexto visual, profundidade e fontes de luz atrás dos painéis. Não deve ser substituído por um gradiente genérico.

## 3. Paleta, tipografia e superfícies

Tokens observados em `src/index.css` do benchmark:

| Função | Cor |
|---|---|
| Fundo-base | `#02050e` |
| Ciano LED | `#00f0ff` |
| Verde neon | `#00ff66` |
| Magenta | `#ff007f` |
| Âmbar | `#ffaa00` |
| Vermelho de alerta | `#ff1744` |
| Azul elétrico | `#38bdf8` |

Tipografia:
- Outfit: títulos e display.
- Plus Jakarta Sans: texto de interface.
- JetBrains Mono: telemetria, números e rótulos técnicos.

Superfícies:
- `.scifi-panel`: fundo escuro translúcido, blur de 32px, borda ciano de 2px e sombras em múltiplas camadas (bloom externo, sombra de levitação e luz interna).
- `.scifi-panel-interactive`: mesma linguagem, com resposta de hover mais intensa, borda mais luminosa, glow ciano/verde/magenta e elevação de 8px com escala de 1.012.
- `.led-tube-cyan`, `.led-tube-green`, `.led-tube-pink`, `.led-tube-amber`: tubos LED de 2.5px, com brilho externo em várias distâncias e iluminação interna.
- `.ambilight-card` e variantes cromáticas: pseudo-elementos com gradientes radiais, blur de 32–34px e expansão/maior intensidade no hover.

## 4. Movimento e elementos atmosféricos

### Partículas — `ParticleCanvas.tsx`

- 75 partículas em desktop e 35 em mobile na intensidade alta.
- Três níveis de profundidade, com raio, opacidade e velocidade diferentes.
- Paleta multicolorida: ciano, magenta, verde neon, vermelho e azul elétrico.
- Conexões entre partículas próximas (120px em desktop e 85px em mobile).
- Oscilação orgânica, drift vertical e glow volumétrico nas partículas de primeiro plano.
- Interação opcional com o ponteiro, com deflexão e aumento de brilho em proximidade.

### Grade — `HolographicGridOverlay.tsx`

- Grade ciano de 48×48px com baixa opacidade.
- Pontos verdes em padrão de 24×24px.
- Feixe horizontal animado com ciclo de 14 segundos.
- Marcas de enquadramento nos quatro cantos da viewport.

### Movimento dos painéis e da navegação

- Flutuação em ciclos de 7 e 8 segundos.
- Entrada da sidebar com animação de origami de 0.95s.
- Entrada do header com animação de origami de 0.85s.
- Feixe de borda na sidebar (2.2s) e no header (2s).
- Radar com sweep e blips pulsantes.

## 5. Radar: separar aparência de dados

O benchmark usa `ProspectingRadar.tsx` e `tactical_radar_map_1793542783612.jpg`. O componente contém dados de demonstração e aquisições aleatórias: nomes fictícios, telefones gerados, distâncias e posições randômicas, `Math.random()` e `setInterval()`.

**Regra de adaptação:** não transportar esses dados, nomes, telefones, coordenadas, contadores ou geração aleatória para o Mais Clientes V2. Se um radar/visualização tática for aproveitado, seus pontos e métricas precisam vir exclusivamente dos dados reais já existentes no fluxo de coleta, com estados vazios e de carregamento corretos. O mapa de fundo é um asset visual independente e sua adoção também precisa ser justificada pelo produto.

## 6. Referências técnicas do benchmark

- [CSS global](https://github.com/Tokenizaa/sci-fi/blob/main/src/index.css)
- [BackgroundEnvironment.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/BackgroundEnvironment.tsx)
- [ParticleCanvas.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/ParticleCanvas.tsx)
- [HolographicGridOverlay.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/HolographicGridOverlay.tsx)
- [ProspectingRadar.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/ProspectingRadar.tsx)
- [DashboardScreen.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/screens/DashboardScreen.tsx)
- [ColetaScreen.tsx](https://github.com/Tokenizaa/sci-fi/blob/main/src/components/screens/ColetaScreen.tsx)

## 7. Limitações desta etapa

A análise acima é baseada no código versionado. Ainda não foi possível fazer inspeção visual real do dashboard do benchmark em navegador: não foi identificada uma implantação pública/preview do repositório `Tokenizaa/sci-fi`. A implantação Vercel consultada para Mais Clientes V2 apresentou a tela de autenticação; não foram fornecidas credenciais de acesso, portanto o dashboard autenticado não foi capturado.

Não declarar a comparação visual como concluída até registrar screenshots equivalentes do benchmark e do Mais Clientes V2, no mesmo viewport e em estados comparáveis.
