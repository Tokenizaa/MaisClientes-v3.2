# Inventário de assets visuais

**Data:** 2026-11-01

## 1. Assets do benchmark

Repositório de origem: [Tokenizaa/sci-fi](https://github.com/Tokenizaa/sci-fi)

| Asset | Caminho no benchmark | Tamanho | SHA do blob |
|---|---|---:|---|
| Fundo panorâmico da sala de controle | `src/assets/images/scifi_control_room_bg_1793541718927.jpg` | 984,436 bytes | `79b6560bba6c3d259f2bdfdb57bbf37799c07737` |
| Mapa tático do radar | `src/assets/images/tactical_radar_map_1793542783612.jpg` | 1,072,651 bytes | `bf5247722ab20924c8b4feb94bd5b841c99397df` |

Links de origem:
- [Imagem panorâmica](https://github.com/Tokenizaa/sci-fi/blob/main/src/assets/images/scifi_control_room_bg_1793541718927.jpg)
- [Mapa tático](https://github.com/Tokenizaa/sci-fi/blob/main/src/assets/images/tactical_radar_map_1793542783612.jpg)

## 2. Uso observado no benchmark

- `BackgroundEnvironment.tsx` usa o fundo panorâmico em tela cheia, com `object-cover`, brilho 0.72, contraste 1.12, vinheta, scrims, scanlines e halos.
- `ProspectingRadar.tsx` usa o mapa tático como base de seu painel de radar.
- O caminho literal `/src/assets/images/...` está no código do benchmark. Não copiar esse caminho sem validar o comportamento do build Vite. Na adaptação, usar import estático do asset ou colocá-lo em `public/` com URL pública estável e validar o build de produção.

## 3. Estado do Mais Clientes V2

Na árvore completa da branch `main` consultada, não foram encontrados assets de imagem versionados. O componente `src/components/AmbientBackground.tsx` não importa imagem externa nem local; ele desenha gradientes e um canvas.

## 4. Decisão de transferência

- O fundo panorâmico é o asset visual prioritário a avaliar para incorporação.
- O mapa tático é opcional e não deve ser importado automaticamente: primeiro confirmar se existe uma visualização funcional que justifique sua utilização.
- Nenhum dado de demonstração do radar deve ser transferido.
- A transferência de assets deve preservar origem, nome, formato e hash documentados; otimização/conversão só depois de comparar qualidade visual e tamanho.
- Esta etapa não copiou arquivos nem alterou a interface.
