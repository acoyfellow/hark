import { describe, expect, it } from 'vitest';
import { KIT_NAMES, MODEL_KIT, modelProblem, partsOf } from '../../shared/model-parts';
import { askedForAPicture, asModel } from '../../src/reply';

describe('the model kit', () => {
  it('builds every kit by name, with real parts', () => {
    for (const name of KIT_NAMES) {
      expect(modelProblem(name)).toBeNull();
      expect(partsOf(name).length).toBe(MODEL_KIT[name]!.length);
    }
  });

  it('reads "a red car" and plural names as kits', () => {
    expect(partsOf('a car').length).toBeGreaterThan(5);
    expect(partsOf('"rockets"').length).toBeGreaterThan(3);
  });

  it('places kits in a scene with offsets and scale', () => {
    const parts = partsOf(JSON.stringify({ scene: [{ use: 'house', at: [-1, 0, 0] }, { use: 'tree', at: [1, 0, 0], scale: 0.5 }] }));
    expect(parts.length).toBe(MODEL_KIT.house!.length + MODEL_KIT.tree!.length);
    expect(parts.some((part) => part.at[0] < -0.5)).toBe(true);
    expect(parts.some((part) => part.cut)).toBe(true);
  });
});

describe('3D before pictures', () => {
  it('turns an imagine call into a model unless they asked for a picture', () => {
    const call = { id: '1', name: 'imagine', arguments: JSON.stringify({ prompt: 'rocket' }) };
    expect(asModel(call, 'show me a rocket').name).toBe('show_form');
    expect(asModel(call, 'paint me a rocket').name).toBe('imagine');
    expect(askedForAPicture('make a picture of a castle')).toBe(true);
    expect(askedForAPicture('build a castle')).toBe(false);
  });
});
