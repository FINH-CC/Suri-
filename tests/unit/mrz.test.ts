import { describe, expect, it } from 'vitest';
import { DEFAULT } from '../../src/data/characters';
import { mrzCheck, mrzLines, passportNo } from '../../src/ui/nameit';

describe('passport machine-readable zone', () => {
  it('mrzCheck matches the ICAO 9303 worked example', () => {
    expect(mrzCheck('L898902C3')).toBe('6');
  });
  it('mrzLines gives two 44-character lines', () => {
    const [a, b] = mrzLines({ ...DEFAULT, name: 'Puff' }, new Date(2026, 9, 21));
    expect(a).toHaveLength(44);
    expect(b).toHaveLength(44);
    expect(a.startsWith('P<SRKPUFF<<KIDS<LAB')).toBe(true);
  });
  it('an unnamed design reads UNNAMED', () => {
    expect(mrzLines({ ...DEFAULT, name: '' }, new Date(2026, 0, 2))[0].startsWith('P<SRKUNNAMED<<')).toBe(true);
  });
  it('passportNo is stable and depends on the name', () => {
    expect(passportNo({ ...DEFAULT, name: 'A' })).toMatch(/^SK01-[0-9A-Z]{7}$/);
    expect(passportNo({ ...DEFAULT, name: 'A' })).toBe(passportNo({ ...DEFAULT, name: 'A' }));
    expect(passportNo({ ...DEFAULT, name: 'A' })).not.toBe(passportNo({ ...DEFAULT, name: 'B' }));
  });
});
