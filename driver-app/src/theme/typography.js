/**
 * Auto 24 Design Tokens - Typography
 * Clean, geometric, highly legible typography designed for quick glance readability.
 */

import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'sans-serif',
});

export const typography = {
  fontFamily,

  // Hierarchy
  titleLarge: {
    fontFamily,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  titleMedium: {
    fontFamily,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  bodyLarge: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodyMedium: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 13,
  },
};

export default typography;
