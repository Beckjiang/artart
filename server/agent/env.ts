import { getRuntimeConfigValue } from '../runtimeConfig'

export const getEnvValue = (key: string): string | undefined => {
  return getRuntimeConfigValue(key)
}

export const hasGeminiImageConfig = () =>
  Boolean(
    getEnvValue('VITE_GEMINI_API_KEY') ||
      getEnvValue('GEMINI_API_KEY') ||
      getEnvValue('VITE_UNIAPI_API_KEY')
  )
