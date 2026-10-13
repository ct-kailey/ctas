// CTDS keeps the chosen palette. Only foreground roles change when needed.
export function relativeLuminance([red, green, blue]) {
  const linear = [red, green, blue].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first), b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function chooseContrastForeground(background, candidates) {
  return candidates.reduce((best, candidate) => {
    const contrast = contrastRatio(background, candidate.rgb);
    return !best || contrast > best.contrast ? { ...candidate, contrast } : best;
  }, null);
}

export function applyThemeContrast(root) {
  const document = root?.ownerDocument, view = document?.defaultView;
  if (!document || !view) return { applied: false };
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('inert', '');
  Object.assign(probe.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', width: '1px', height: '1px', contain: 'strict' });
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  for (const name of ['--ains-primary-fg', '--ains-primary-hover-fg', '--ains-primary-text']) root.style.removeProperty(name);
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { applied: false };
    (document.body || root).appendChild(probe);
    const readToken = (name) => {
      // On the first module evaluation Vite may not yet have injected tokens.
      if (!view.getComputedStyle(root).getPropertyValue(name).trim()) return null;
      probe.style.backgroundColor = `var(${name})`;
      const color = view.getComputedStyle(probe).backgroundColor;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = 'transparent';
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = [...context.getImageData(0, 0, 1, 1).data];
      // Primary and surface tokens must be opaque for this comparison.
      return pixel[3] === 255 ? pixel.slice(0, 3) : null;
    };
    const names = ['--primary', '--primary-hover', '--fixed-black', '--fixed-white', '--bg', '--bg-subtle', '--bg-muted'];
    const colors = Object.fromEntries(names.map(name => [name, readToken(name)]));
    if (names.some(name => !colors[name])) return { applied: false };
    const candidates = ['--fixed-black', '--fixed-white'].map(token => ({ token, rgb: colors[token] }));
    const foreground = chooseContrastForeground(colors['--primary'], candidates);
    const hoverForeground = chooseContrastForeground(colors['--primary-hover'], candidates);
    const surfaceRatios = ['--bg', '--bg-subtle', '--bg-muted'].map(name => contrastRatio(colors['--primary'], colors[name]));
    const textToken = Math.min(...surfaceRatios) >= 4.5 ? '--primary' : '--fg';
    root.style.setProperty('--ains-primary-fg', `var(${foreground.token})`);
    root.style.setProperty('--ains-primary-hover-fg', `var(${hoverForeground.token})`);
    root.style.setProperty('--ains-primary-text', `var(${textToken})`);
    return { applied: true, primaryContrast: foreground.contrast, hoverContrast: hoverForeground.contrast, textToken };
  } catch {
    // Privacy modes may disallow canvas reads; CSS aliases retain a visible fallback.
    return { applied: false };
  } finally {
    probe.remove();
  }
}
