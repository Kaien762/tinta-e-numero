# Tinta & Número

Jogo 3D de leitura e atenção (Vite + TypeScript + Three.js).
O painel mostra um número por extenso; vale o **número da palavra** e a **cor das letras**.
A cor do fundo é só distração.

**Jogar:** https://kaien762.github.io/tinta-e-numero/

Cada push na `main` roda os testes, gera o build e publica no GitHub Pages
(`.github/workflows/pages.yml`).

## Modos

Na primeira visita o jogo começa pelo tutorial (2 rodadas). Depois abre o menu:

| Modo | Como funciona |
| --- | --- |
| **Jornada** | 10 fases que ficam mais difíceis: fundo colorido, vidas, tempo por rodada, fundo piscando. Cada fase dá até 3 estrelas (concluir · até 1 erro · sem erros dentro do tempo-alvo) e libera a próxima. |
| **Relâmpago** | 60 segundos. 100 pontos por acerto + bônus de rapidez, multiplicados pelo combo (x2 com 3 acertos seguidos, x3 com 6, x4 com 10). Errar zera o combo. Guarda o recorde. |
| **Clássico** | O jogo original: 10 rodadas no Treino (sem tempo) ou no Desafio (cronômetro, guarda o melhor tempo). |

O progresso (estrelas, recordes, tutorial) e o volume ficam no `localStorage` do navegador.
O botão de som abre o volume separado de **música** (uma trilha em loop sintetizada em Web Audio,
que acelera nos 10 segundos finais do Relâmpago) e de **efeitos**.

## Rodar

```powershell
npm install
npm run dev          # http://localhost:5173
npm run dev:rede     # abre na rede local, para testar no celular
npm run build        # checa os tipos e gera dist/
npm run preview      # serve o dist/ em http://localhost:4173
npm test             # testes das regras (vitest)
```

`?debug` na URL expõe `window.__tinta` (estado, posições na tela, forçar estímulo) para testes.

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `src/game/rules.ts` | Regra do jogo (`isCorrectMove`) e sorteio dos estímulos |
| `src/game/session.ts` | Partida: rodadas, erros, sequência, cronômetro, tempo esgotado, reinício |
| `src/game/levels.ts` | Fases da Jornada, estrelas e vidas |
| `src/game/scoring.ts` | Pontos e combo do Relâmpago |
| `src/game/progress.ts` | Progresso salvo no navegador |
| `src/game.ts` | Fluxo: tutorial, menu, modos, contagem, resultados |
| `src/scene/*` | Mesa, tabuleiro, peças de cerâmica, luz, câmera, confete e animações |
| `src/input.ts` | Arrastar ou tocar-e-tocar (mouse e toque) |
| `src/ui.ts`, `index.html`, `src/*.css` | Painel, HUD, menu e telas |
| `src/audio.ts` | Música e efeitos sintetizados (Web Audio) |

Tudo é procedural: peças em `LatheGeometry` + símbolo extrudado, materiais
`MeshPhysicalMaterial` com verniz (clearcoat), madeira e algarismos desenhados em canvas,
iluminação de ambiente (`RoomEnvironment`) e tone mapping neutro para preservar as cores.
