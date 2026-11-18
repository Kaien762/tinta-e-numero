# Tinta & Número

Jogo 3D de leitura e atenção (Vite + TypeScript + Three.js).
O painel mostra um número por extenso; vale o **número da palavra** e a **cor das letras**.
A cor do fundo é só distração.

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
| `src/game/session.ts` | Partida: rodadas, erros, cronômetro, posições, reinício |
| `src/game.ts` | Fluxo: tutorial, modos, contagem, tela final |
| `src/scene/*` | Mesa, tabuleiro, peças de cerâmica, luz, câmera e animações |
| `src/input.ts` | Arrastar ou tocar-e-tocar (mouse e toque) |
| `src/ui.ts`, `index.html`, `src/style.css` | Painel, HUD e telas |
| `src/audio.ts` | Sons sintetizados (Web Audio) |

Tudo é procedural: peças em `LatheGeometry` + símbolo extrudado, materiais
`MeshPhysicalMaterial` com verniz (clearcoat), madeira e algarismos desenhados em canvas,
iluminação de ambiente (`RoomEnvironment`) e tone mapping neutro para preservar as cores.
