/**
 * Shared button styling for the app. The sidebar and the webcam/drawing
 * capture dialogs both use these so every button looks the same. They pair
 * with the `.primary-action` / `.secondary-action` CSS classes (which pin the
 * colors via theme CSS variables) plus theme-ui's `Button` component.
 */
export const sidebarButtonSx = {
  appearance: 'none',
  border: '1px solid',
  borderColor: 'border',
  borderRadius: 6,
  px: 3,
  py: 2,
  color: 'paragraph',
  bg: 'background',
  fontSize: '14px',
  fontWeight: '600',
  lineHeight: 1.2,
  cursor: 'pointer',
  transition: 'background-color 150ms ease, border-color 150ms ease, opacity 150ms ease',
  '&:hover:not(:disabled)': {
    bg: 'background-secondary',
    borderColor: 'primary',
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary',
    outlineOffset: 2,
  },
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
} as const

export const primaryButtonSx = {
  ...sidebarButtonSx,
  color: 'black',
  bg: 'primary',
  borderColor: 'primary',
  '&:hover:not(:disabled)': {
    bg: 'primary',
    borderColor: 'primary',
    filter: 'brightness(0.92)',
  },
} as const
