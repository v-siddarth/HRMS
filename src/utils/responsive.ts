import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Design baseline: 375pt width × 812pt height (standard modern mobile reference)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

/**
 * Width-proportional scaling.
 * Use for horizontal spacing, widths, border-radius, horizontal padding/margin.
 */
export function wp(size: number): number {
  return PixelRatio.roundToNearestPixel((SCREEN_WIDTH / BASE_WIDTH) * size);
}

/**
 * Height-proportional scaling.
 * Use for vertical spacing, heights, min-heights, vertical padding/margin.
 */
export function hp(size: number): number {
  return PixelRatio.roundToNearestPixel((SCREEN_HEIGHT / BASE_HEIGHT) * size);
}

/**
 * Font scaling — uses width ratio with clamping to avoid
 * unreadable text on small devices or oversized text on tablets.
 * Clamped between 0.85x and 1.25x of the base size.
 */
export function sp(size: number): number {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const clampedScale = Math.min(Math.max(scale, 0.85), 1.25);
  return PixelRatio.roundToNearestPixel(size * clampedScale);
}

/** Device has a narrow screen (below 360dp) */
export const isSmallDevice = SCREEN_WIDTH < 360;

/** Device qualifies as tablet (600dp+ width) */
export const isTablet = SCREEN_WIDTH >= 600;

/** Raw screen dimensions for one-off calculations */
export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;
