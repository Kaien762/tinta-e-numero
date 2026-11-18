import type { Background, ColorId } from './rules';

export type SymbolId = 'coracao' | 'estrela' | 'folha' | 'gota';

export interface ColorInfo {
  readonly id: ColorId;
  /** "vermelho" */
  readonly name: string;
  /** "vermelhas" (as letras são vermelhas) */
  readonly plural: string;
  /** Cor das letras, das peças e do fundo: é a mesma em todo lugar. */
  readonly hex: string;
  /** Tom claro das casas da coluna. */
  readonly tint: string;
  /** Tom escuro dos algarismos da coluna. */
  readonly deep: string;
  readonly symbol: SymbolId;
  readonly symbolName: string;
}

export const PALETTE: Readonly<Record<ColorId, ColorInfo>> = {
  vermelho: {
    id: 'vermelho', name: 'vermelho', plural: 'vermelhas',
    hex: '#e5484d', tint: '#f6cdc8', deep: '#ad2229', symbol: 'coracao', symbolName: 'coração',
  },
  amarelo: {
    id: 'amarelo', name: 'amarelo', plural: 'amarelas',
    hex: '#f5c400', tint: '#f8e5a0', deep: '#7f5d00', symbol: 'estrela', symbolName: 'estrela',
  },
  verde: {
    id: 'verde', name: 'verde', plural: 'verdes',
    hex: '#2fa860', tint: '#c4e7cd', deep: '#13663a', symbol: 'folha', symbolName: 'folha',
  },
  azul: {
    id: 'azul', name: 'azul', plural: 'azuis',
    hex: '#3b82f6', tint: '#c9dafa', deep: '#1a4aa3', symbol: 'gota', symbolName: 'gota',
  },
};

export const NEUTRAL_BG = '#e6dfd2';
/** Contorno escuro das letras do painel: garante contraste sem mudar a cor delas. */
export const LINE_DARK = '#241c36';
export const HALO = '#fffaf0';

export function backgroundHex(bg: Background): string {
  return bg === 'neutro' ? NEUTRAL_BG : PALETTE[bg].hex;
}
