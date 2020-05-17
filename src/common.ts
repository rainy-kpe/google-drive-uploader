import fs from "fs"
import path from "path"
import { OAuth2Client } from "google-auth-library"
import { Config } from "./config"
import { promisify } from "util"

const unlink = promisify(fs.unlink)

export const appName = "Google Drive Uploader"

export const getFolders = async (config: Config) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  let folders: any[] = []
  let nextPageToken
  let response
  try {
    console.log("Reading folders...")
    do {
      response = await oauth2Client.request<any>({
        url: "https://www.googleapis.com/drive/v3/files",
        params: {
          q: "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
          pageSize: 50,
          pageToken: nextPageToken,
        },
      })
      folders = folders.concat(response.data.files)
      nextPageToken = response.data.nextPageToken
    } while (nextPageToken)
  } catch (error) {
    console.warn("Unable to get the folder list.")
    console.error(error.message)
  }
  return folders
}

export const createFolder = async (config: Config, folderName: string) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  try {
    console.log(`Creating new folder: ${folderName}`)

    const response = await oauth2Client.request<any>({
      method: "POST",
      url: "https://www.googleapis.com/drive/v3/files",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
      }),
    })
    return response.data
  } catch (error) {
    console.warn("Unable to create the folder.")
    console.error(error.message)
    return undefined
  }
}

export const fetchFiles = async (config: Config) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  let files: any[] = []
  let nextPageToken
  let response
  try {
    console.log(`Reading files from folder ${config.folderName}...`)
    do {
      response = await oauth2Client.request<any>({
        url: "https://www.googleapis.com/drive/v3/files",
        params: {
          q: `'${config.folderId}' in parents and trashed=false`,
          fields: "files(id,name,createdTime),nextPageToken",
          pageSize: 100,
          pageToken: nextPageToken,
        },
      })
      files = files.concat(response.data.files)
      nextPageToken = response.data.nextPageToken
    } while (nextPageToken)
    console.log(`Found ${files.length} files.`)
  } catch (error) {
    console.warn("Unable to get the file list.")
    console.error(error.message)
  }
  return files
}

export const deleteFiles = async (filePaths: string[], silent = false) => {
  try {
    const promises = filePaths.map((file) => {
      if (!silent || fs.existsSync(file)) {
        console.log(`Deleting ${path.basename(file)}`)
        return unlink(file)
      }
    })
    await Promise.all(promises)
    return true
  } catch (error) {
    console.warn(`Unable to delete the files.`)
    console.error(error.message)
  }
  return false
}
