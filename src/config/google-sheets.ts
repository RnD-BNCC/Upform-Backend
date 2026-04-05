import { google } from 'googleapis'

type SheetField = { id: string; label: string }

function getAuth(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function colToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

export async function createSpreadsheet(refreshToken: string, title: string, fields: SheetField[]) {
  const auth = getAuth(refreshToken)
  const sheets = google.sheets({ version: 'v4', auth })

  const headerValues = ['Submitted At', ...fields.map((f) => f.label || f.id)]

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [
        {
          properties: { title: 'Responses' },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [
                {
                  values: headerValues.map((h) => ({
                    userEnteredValue: { stringValue: h },
                    userEnteredFormat: { textFormat: { bold: true } },
                  })),
                },
              ],
            },
          ],
        },
      ],
    },
  })

  const spreadsheetId = response.data.spreadsheetId!

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  }
}

export async function appendAllRows(
  refreshToken: string,
  spreadsheetId: string,
  fields: SheetField[],
  responses: Array<{ answers: Record<string, string | string[]>; submittedAt: string }>,
) {
  if (responses.length === 0) return

  const auth = getAuth(refreshToken)
  const sheets = google.sheets({ version: 'v4', auth })

  const rows = responses.map((r) => [
    r.submittedAt,
    ...fields.map((f) => {
      const val = r.answers[f.id]
      return Array.isArray(val) ? val.join(', ') : (val ?? '')
    }),
  ])

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Responses!A:Z',
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  })
}

export async function syncAndAppendRow(
  refreshToken: string,
  spreadsheetId: string,
  fields: SheetField[],
  answers: Record<string, string | string[]>,
  submittedAt: string,
) {
  const auth = getAuth(refreshToken)
  const sheets = google.sheets({ version: 'v4', auth })

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Responses!1:1',
  })
  const currentHeaders: string[] = (headerRes.data.values?.[0] ?? []) as string[]

  const existingLabelSet = new Set(currentHeaders.slice(1))
  const newFields = fields.filter((f) => !existingLabelSet.has(f.label || f.id))

  if (newFields.length > 0) {
    const startColIndex = currentHeaders.length
    const newLabels = newFields.map((f) => f.label || f.id)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Responses!${colToLetter(startColIndex)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newLabels] },
    })
    currentHeaders.push(...newLabels)
  }

  const labelToFieldId = new Map(fields.map((f) => [f.label || f.id, f.id]))
  const row = currentHeaders.map((header, idx) => {
    if (idx === 0) return submittedAt
    const fieldId = labelToFieldId.get(header)
    if (!fieldId) return ''
    const val = answers[fieldId]
    return Array.isArray(val) ? val.join(', ') : (val ?? '')
  })

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Responses!A:Z',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  })
}
