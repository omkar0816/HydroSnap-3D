export async function generateJson(system: string, prompt: string) {
  const r = await fetch(`${process.env.OMNIROUTE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OMNIROUTE_MODEL, // your combo name
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  })
  if (!r.ok) throw new Error(`LLM ${r.status}`)
  const data = await r.json()
  return JSON.parse(data.choices[0].message.content)
}
