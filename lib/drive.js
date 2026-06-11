import { google } from 'googleapis'
import { Readable } from 'stream'

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

export async function getOrCreateFolder(parentId, folderName) {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  // Check if folder exists
  const res = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
  })

  if (res.data.files.length > 0) return res.data.files[0].id

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return folder.data.id
}

export async function uploadFileToDrive(base64Data, fileName, mimeType, folderId) {
  const auth = getAuth()
  const drive = google.drive({ version: 'v3', auth })

  const buffer = Buffer.from(base64Data.replace(/^data:[^;]+;base64,/, ''), 'base64')
  const stream = Readable.from(buffer)

  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink, webContentLink',
  })

  // Make file publicly readable
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return {
    id: res.data.id,
    url: res.data.webViewLink,
    directUrl: `https://drive.google.com/uc?id=${res.data.id}`,
  }
}

export async function createPedidoFolder(pedidoId) {
  // Root Mandarina Pro folder ID - you'll set this once
  const ROOT_FOLDER = process.env.DRIVE_ROOT_FOLDER_ID || 'root'
  const pedidosFolder = await getOrCreateFolder(ROOT_FOLDER, 'Mandarina Pro - Pedidos')
  return getOrCreateFolder(pedidosFolder, pedidoId)
}
