import { TrimTrailingZerosPipe } from './trim-trailing-zeros.pipe';

describe('TrimTrailingZerosPipe', () => {
  it('create an instance', () => {
    const pipe = new TrimTrailingZerosPipe();
    expect(pipe).toBeTruthy();
  });
});
