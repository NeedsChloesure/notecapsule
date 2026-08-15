import { useEffect, useMemo } from 'react'
import {
  ThemeDark,
  ThemeLight,
  themeToCSS,
  useThemeEngineStore,
} from '@notesnook/theme'

/**
 * @notesnook/editor's own stylesheet (styles.css) is plain CSS that reads
 * raw custom properties like `var(--paragraph)` and `var(--border)`.
 * EmotionThemeProvider does NOT inject these — it only wires up Theme UI's
 * `sx` prop system (a separate, JS-driven styling path). Without this
 * component, every `var(--...)` reference in the editor's CSS resolves to
 * nothing, which is why things like table borders and secondary text
 * silently lose their color.
 *
 * Mount this once, near the root, inside/after wherever EmotionThemeProvider
 * lives. The active theme follows the browser's prefers-color-scheme setting,
 * while themeToCSS supplies the Notesnook CSS variables without duplicating
 * the light or dark color definitions in this application.
 */
function ThemeVariables() {
  const theme = useThemeEngineStore((store) => store.theme)
  const setTheme = useThemeEngineStore((store) => store.setTheme)
  const themeBackground = theme.scopes.base.primary.background
  const css = useMemo(() => themeToCSS(theme), [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncTheme = (isDark: boolean) => {
      setTheme(isDark ? ThemeDark : ThemeLight)
    }

    syncTheme(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => syncTheme(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [setTheme])

  useEffect(() => {
    document.documentElement.classList.add('theme-scope-base')
    document.documentElement.style.colorScheme = theme.colorScheme

    const themeColorMeta = document.querySelector('meta[name="theme-color"]')
    themeColorMeta?.setAttribute('content', themeBackground)

    return () => {
      document.documentElement.classList.remove('theme-scope-base')
    }
  }, [theme.colorScheme, themeBackground])

  return <style>{`${css}\n${theme.codeBlockCSS}`}</style>
}

export default ThemeVariables
