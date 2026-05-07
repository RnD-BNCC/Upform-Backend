import { google } from 'googleapis'
import { createHash } from 'crypto'

type DriveShareRole = 'viewer' | 'editor'
type DriveShareVisibility = 'private' | 'restricted' | 'public'
type DriveShareMember = { email: string; role: DriveShareRole }
const DRIVE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
]

export type DriveGalleryFile = {
  eventId: string
  responseId: string
  respondentLabel: string
  filename: string
  sourceUrl: string
  getContent: () => Promise<{ body: unknown; contentType?: string } | null>
}

function getAuth(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function getOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )
}

function toDriveRole(role: DriveShareRole) {
  return role === 'editor' ? 'writer' : 'reader'
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function sanitizeDriveName(value: string, fallback: string) {
  const cleaned = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim()
  return cleaned || fallback
}

function createSourceHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

async function findDriveChildByAppProperty(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  key: string,
  value: string,
  mimeType?: string,
) {
  const clauses = [
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    'trashed=false',
    `appProperties has { key='${escapeDriveQueryValue(key)}' and value='${escapeDriveQueryValue(value)}' }`,
  ]
  if (mimeType) clauses.push(`mimeType='${escapeDriveQueryValue(mimeType)}'`)

  const response = await drive.files.list({
    q: clauses.join(' and '),
    spaces: 'drive',
    fields: 'files(id,name,webViewLink)',
    pageSize: 1,
  })

  return response.data.files?.[0] ?? null
}

export async function createDriveFolder(refreshToken: string, name: string) {
  const drive = google.drive({ version: 'v3', auth: getAuth(refreshToken) })
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id, webViewLink',
  })

  return {
    folderId: response.data.id!,
    folderUrl:
      response.data.webViewLink ??
      `https://drive.google.com/drive/folders/${response.data.id}`,
  }
}

export function createDriveAccountAuthUrl(redirectUri: string, state: string) {
  const client = getOAuthClient(redirectUri)
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: true,
    scope: DRIVE_SCOPES,
    state,
  })
}

export async function exchangeDriveAccountCode(code: string, redirectUri: string) {
  const client = getOAuthClient(redirectUri)
  const { tokens } = await client.getToken(code)
  client.setCredentials(tokens)

  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const userInfo = await oauth2.userinfo.get()

  return {
    refreshToken: tokens.refresh_token ?? null,
    email: userInfo.data.email?.toLowerCase() ?? null,
  }
}

export async function syncDriveGalleryFiles(
  refreshToken: string,
  rootFolderId: string,
  files: DriveGalleryFile[],
) {
  const drive = google.drive({ version: 'v3', auth: getAuth(refreshToken) })
  const responseFolderCache = new Map<string, string>()
  let uploaded = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    try {
      let responseFolderId = responseFolderCache.get(file.responseId)

      if (!responseFolderId) {
        const existingFolder = await findDriveChildByAppProperty(
          drive,
          rootFolderId,
          'upformResponseId',
          file.responseId,
          'application/vnd.google-apps.folder',
        )

        if (existingFolder?.id) {
          responseFolderId = existingFolder.id
        } else {
          const folder = await drive.files.create({
            requestBody: {
              name: sanitizeDriveName(file.respondentLabel, 'Anonymous'),
              mimeType: 'application/vnd.google-apps.folder',
              parents: [rootFolderId],
              appProperties: {
                upformEventId: file.eventId,
                upformResponseId: file.responseId,
              },
            },
            fields: 'id',
          })
          responseFolderId = folder.data.id ?? undefined
        }

        if (!responseFolderId) {
          failed += 1
          continue
        }

        responseFolderCache.set(file.responseId, responseFolderId)
      }

      const sourceHash = createSourceHash(file.sourceUrl)
      const existingFile = await findDriveChildByAppProperty(
        drive,
        responseFolderId,
        'upformSourceHash',
        sourceHash,
      )

      if (existingFile?.id) {
        skipped += 1
        continue
      }

      const content = await file.getContent()
      if (!content) {
        failed += 1
        continue
      }

      await drive.files.create({
        requestBody: {
          name: sanitizeDriveName(file.filename, 'Untitled file'),
          parents: [responseFolderId],
          appProperties: {
            upformEventId: file.eventId,
            upformResponseId: file.responseId,
            upformSourceHash: sourceHash,
          },
        },
        media: {
          mimeType: content.contentType ?? 'application/octet-stream',
          body: content.body as never,
        },
        fields: 'id',
      })

      uploaded += 1
    } catch (error) {
      failed += 1
      console.error('[Google Drive] gallery file sync failed:', error)
    }
  }

  return { uploaded, skipped, failed }
}

export async function syncDriveFolderPermissions(
  refreshToken: string,
  folderId: string,
  visibility: DriveShareVisibility,
  publicRole: DriveShareRole,
  members: DriveShareMember[],
) {
  const drive = google.drive({ version: 'v3', auth: getAuth(refreshToken) })
  const permissionRes = await drive.permissions.list({
    fileId: folderId,
    fields: 'permissions(id,type,emailAddress,role)',
  })

  const permissions = permissionRes.data.permissions ?? []
  const desiredEmails = new Set(members.map((member) => member.email))
  const desiredPublicRole = toDriveRole(publicRole)

  for (const permission of permissions) {
    if (!permission.id || permission.role === 'owner') continue

    const shouldRemoveAnyone = permission.type === 'anyone' && visibility !== 'public'
    const shouldRemoveUser =
      permission.type === 'user' &&
      typeof permission.emailAddress === 'string' &&
      !desiredEmails.has(permission.emailAddress.toLowerCase())

    if (shouldRemoveAnyone || shouldRemoveUser) {
      await drive.permissions.delete({ fileId: folderId, permissionId: permission.id })
    }
  }

  if (visibility === 'public') {
    const publicPermission = permissions.find((permission) => permission.type === 'anyone')
    if (publicPermission?.id) {
      await drive.permissions.update({
        fileId: folderId,
        permissionId: publicPermission.id,
        requestBody: { role: desiredPublicRole },
      })
    } else {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: { type: 'anyone', role: desiredPublicRole },
      })
    }
  }

  if (visibility === 'restricted') {
    for (const member of members) {
      const role = toDriveRole(member.role)
      const existing = permissions.find(
        (permission) =>
          permission.type === 'user' &&
          permission.emailAddress?.toLowerCase() === member.email,
      )

      if (existing?.id) {
        await drive.permissions.update({
          fileId: folderId,
          permissionId: existing.id,
          requestBody: { role },
        })
      } else {
        await drive.permissions.create({
          fileId: folderId,
          sendNotificationEmail: false,
          requestBody: { type: 'user', emailAddress: member.email, role },
        })
      }
    }
  }
}
