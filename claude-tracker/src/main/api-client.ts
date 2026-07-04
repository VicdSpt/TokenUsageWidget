export interface ApiUsageResult {
  date: string
  tokensIn: number
  tokensOut: number
}

export async function fetchApiUsage(apiKey: string): Promise<ApiUsageResult | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/usage', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!response.ok) return null
    const data = await response.json() as { data?: Array<{ input_tokens?: number; output_tokens?: number }> }
    if (!data.data?.length) return null
    const entry = data.data[0]
    return {
      date: new Date().toISOString().slice(0, 10),
      tokensIn:  entry.input_tokens  ?? 0,
      tokensOut: entry.output_tokens ?? 0,
    }
  } catch {
    return null
  }
}
