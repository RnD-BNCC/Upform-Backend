import { google } from 'googleapis'

type SheetField = { id: string; label: string }

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars')
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  })
}

// 0-based index → column letter (0→A, 26→AA)
function colToLetter(index: number): string {
  let result = ''
  let n = index
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

export async function createSpreadsheet(title: string, fields: SheetField[]) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const drive = google.drive({ version: 'v3', auth })

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

  await drive.permissions.create({
    fileId: spreadsheetId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  }
}

export async function syncAndAppendRow(
  spreadsheetId: string,
  fields: SheetField[],
  answers: Record<string, string | string[]>,
  submittedAt: string,
) {
  const auth = getAuth()
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
