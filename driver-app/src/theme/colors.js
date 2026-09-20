/**
 * Auto 24 Design Tokens - Colors
 * Centralized palette for live status indicators, dark background, and clean geometric UI.
 */

export const colors = {
  // Brand & Background
  background: '#0B0F17',
  surface: '#111827',
  card: '#161F30',
  cardBorder: '#1E293B',

  // Status Indicators
  moving: '#10B981', // Green for moving vehicle
  movingGlow: 'rgba(16, 185, 129, 0.15)',
  idle: '#EF4444',   // Red for idle / stationary
  idleGlow: 'rgba(239, 68, 68, 0.15)',
  pending: '#F59E0B', // Amber for waiting approval
  pendingGlow: 'rgba(245, 158, 11, 0.15)',

  // Brand Accents
  brandPrimary: '#2563EB',
  brandLight: '#60A5FA',

  // Text Hierarchy
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Form & Inputs
  inputBg: '#1E293B',
  inputBorder: '#334155',
  inputFocusBorder: '#3B82F6',

  // Action Buttons
  buttonPrimary: '#2563EB',
  buttonDanger: '#DC2626',
  buttonDisabled: '#334155',
};

export default colors;
