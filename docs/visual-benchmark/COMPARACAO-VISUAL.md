# Comparação visual — benchmark × Mais Clientes V2

**Status:** comparação técnica preliminar; comparação visual em navegador bloqueada por falta de acesso autenticado e de implantação do benchmark.  
**Data:** 2026-11-01

## 1. Identificação das versões

| Item | Referência |
|---|---|
| Benchmark | `Tokenizaa/sci-fi`, branch `main` |
| Aplicação | `Tokenizaa/mais-clientes-v2`, branch `main` |
| Commit da aplicação | `5dc7e55af1a79a880af1e11a01ad4cff3cf1e1ce` |
| Commit pai do rollback | `40819b79c3ef73ca8487acd0a98c9d39a0ad87cd` |
| Arquivo alterado no rollback | `src/index.css` |
| Deploy consultado | `https://mais-clientes-v2-c77fw0tpw-fariasnetto01-5017.vercel.app/` |

## 2. Diferenças verificadas no código

| Camada | Benchmark `Tokenizaa/sci-fi` | Mais Clientes V2 atual |
|---|---|---|
| Fundo | Fotografia panorâmica da sala de controle com scrims e vinheta | Não há imagem de fundo no repositório; fundo feito por gradientes CSS |
| Iluminação ambiente | Halos ciano, magenta, verde e vermelho em posições distintas | Dois halos discretos (azul e verde) |
| Painéis | Glassmorphism forte, blur 32px, bordas LED de 2–2.5px, glow interno e externo | Superfícies foscas discretas, borda azul acinzentada e sombras leves |
| Ambilight | Radiais multicoloridos atrás dos cards, com expansão no hover | Não há equivalentes ao sistema de ambilight do benchmark |
| Partículas | 35–75 partículas, cinco cores, três profundidades, glow, conexões e interação com ponteiro | 18–34 partículas, cor turquesa única, conexões mais discretas e sem interação com ponteiro |
| Grade holográfica | Duas grades, scan beam e marcas de canto | Não identificada no shell atual |
| Animação de painéis | Flutuação e hover com elevação e bloom | Transições discretas de borda/sombra |
| Radar | Componente próprio com mapa tático e blips demonstrativos | Não foi identificado equivalente ao radar do benchmark na estrutura de shell examinada |

## 3. Evidência do rollback

O commit `5dc7e55af1a79a880af1e11a01ad4cff3cf1e1ce` altera somente `src/index.css`. O diff remove ou reduz:

- `@property --holo-angle` e `holo-border-orbit`.
- Borda ciano animada nos painéis.
- Pseudo-elemento de ambilight atrás dos cards.
- Intensidade e sombras internas/externas dos painéis.
- Realce de hover e elevação.
- Cores neon de indicadores.
- Parte da intensidade dos halos e do canvas.

O commit pai `40819b79c3ef73ca8487acd0a98c9d39a0ad87cd` continha uma versão visual mais intensa no CSS do Mais Clientes V2. Ela ainda não era uma cópia integral do benchmark: não incluía o asset fotográfico do benchmark nem seus componentes de fundo, grade e partículas multicoloridas.

## 4. Estado do código atual da aplicação

- `src/components/AmbientBackground.tsx` cria o fundo com gradientes e canvas; não importa nem renderiza a imagem panorâmica.
- `src/index.css` atual usa dois radiais discretos e um gradiente linear.
- O canvas atual desenha partículas turquesa com conexões discretas.
- `src/App.tsx` renderiza `AmbientBackground` no shell autenticado.
- O repositório atual não contém arquivos `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` ou `.svg` no tree da branch `main`.

## 5. Inspeção visual em navegador — pendências

### Mais Clientes V2

A URL Vercel consultada respondeu com a tela de autenticação. O HTML capturado contém o formulário de login, não o dashboard. Sem credenciais fornecidas, a inspeção não avançou para as telas internas.

### Benchmark

O repositório `Tokenizaa/sci-fi` está disponível no GitHub, mas não foi encontrada uma implantação Vercel vinculada a esse repositório na conta consultada. Não há screenshot de navegador do benchmark nesta etapa.

### Evidências visuais

Nenhum screenshot de dashboard será registrado como se fosse evidência visual válida. A captura da tela de login não substitui uma captura da interface autenticada. A comparação visual fica explicitamente **pendente** até obter:
1. URL navegável do benchmark ou ambiente local executável.
2. Acesso autenticado ao Mais Clientes V2.
3. Capturas em viewport equivalente, preferencialmente 1440×1000 e uma dimensão mobile.
4. Mesmo estado funcional/tela para comparação lado a lado.

## 6. Conclusão preliminar

A diferença não é apenas de paleta. O benchmark tem um sistema ambiental completo (imagem, luz, profundidade, painéis, partículas e grade). O Mais Clientes V2 atual conserva apenas uma versão simplificada do ambiente CSS e do canvas. A fotografia panorâmica está ausente.

Esta conclusão é técnica, derivada dos arquivos e commits consultados. Não equivale a aprovação visual final nem substitui as screenshots pendentes.
