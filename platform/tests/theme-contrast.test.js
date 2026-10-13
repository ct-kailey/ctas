'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const helper = import('../web/src/theme-contrast.mjs');

test('contrast uses WCAG sRGB luminance for known colors', async () => {
  const { relativeLuminance, contrastRatio } = await helper;
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21);
  assert.ok(Math.abs(contrastRatio([255, 0, 0], [255, 255, 255]) - 3.9984767708) < 0.0001);
  assert.ok(contrastRatio([117, 117, 117], [255, 255, 255]) >= 4.5);
  assert.ok(contrastRatio([119, 119, 119], [255, 255, 255]) < 4.5);
});

test('light pastel and medium saturated fills select a legible token', async () => {
  const { chooseContrastForeground } = await helper;
  const candidates = [{ token: '--fixed-black', rgb: [0, 0, 0] }, { token: '--fixed-white', rgb: [255, 255, 255] }];
  assert.equal(chooseContrastForeground([190, 228, 203], candidates).token, '--fixed-black');
  assert.equal(chooseContrastForeground([20, 70, 55], candidates).token, '--fixed-white');
  assert.equal(chooseContrastForeground([255, 0, 0], candidates).token, '--fixed-black');
  for (let red = 0; red <= 255; red += 17) for (let green = 0; green <= 255; green += 17) for (let blue = 0; blue <= 255; blue += 17) {
    assert.ok(chooseContrastForeground([red, green, blue], candidates).contrast >= 4.5);
  }
});

test('contrast enhancement is safe without a browser document', async () => {
  const { applyThemeContrast } = await helper;
  assert.deepEqual(applyThemeContrast(null), { applied: false });
});
