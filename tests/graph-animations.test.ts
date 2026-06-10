import { describe, it, expect } from 'vitest';
import { lerp, easeOutCubic } from '@/composables/useGraphAnimations';

describe('useGraphAnimations — helpers purs (spec 52)', () => {
  describe('lerp', () => {
    it('renvoie from à t=0 et to à t=1', () => {
      expect(lerp(10, 20, 0)).toBe(10);
      expect(lerp(10, 20, 1)).toBe(20);
    });

    it('interpole linéairement au milieu', () => {
      expect(lerp(0, 100, 0.5)).toBe(50);
      expect(lerp(-10, 10, 0.5)).toBe(0);
    });

    it('clampe t hors de [0, 1]', () => {
      expect(lerp(0, 100, -1)).toBe(0);
      expect(lerp(0, 100, 2)).toBe(100);
    });
  });

  describe('easeOutCubic', () => {
    it('vaut 0 en 0 et 1 en 1', () => {
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
    });

    it('décélère (au-dessus de la droite y=x sur ]0,1[)', () => {
      expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
      expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    });

    it('clampe les entrées hors bornes', () => {
      expect(easeOutCubic(-1)).toBe(0);
      expect(easeOutCubic(2)).toBe(1);
    });
  });
});
