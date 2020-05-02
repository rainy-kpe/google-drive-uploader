import fs from "fs"
import nodeWatch from "node-watch"
import path from "path"
import { debounce } from "debounce"
import { CommandLineOptions } from "command-line-args"
import { OAuth2Client } from "google-auth-library"
import { Config, readConfig } from "./config"
import readdirp, { EntryInfo } from "readdirp"
import { fetchFiles, deleteFiles } from "./common"

export const uploadFiles = async (config: Config, files: EntryInfo[], deleteAfterUpload: boolean) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  files.sort((a, b) => b.basename.localeCompare(a.basename))

  files = files.filter((file) => {
    const stats = fs.statSync(file.fullPath)
    return stats["size"] !== 0
  })

  // Upload the files to the server
  for (const file of files) {
    console.log(`Uploading ${file.path}`)
    try {
      const content = fs.readFileSync(file.fullPath)

      const body = Buffer.concat([
        Buffer.from(`--boundary
Content-Type: application/json; charset=UTF-8

${JSON.stringify({
  name: file.basename,
  parents: [config.folderId],
})}

--boundary
Content-Type: binary/octet-stream

`),
        content,
        Buffer.from(`
--boundary--`),
      ])

      await oauth2Client.request<any>({
        method: "POST",
        url: "https://www.googleapis.com/upload/drive/v3/files",
        params: {
          uploadType: "multipart",
        },
        headers: {
          "Content-type": "multipart/related; boundary=boundary",
          "Content-length": body.length,
        },
        body,
      })

      if (deleteAfterUpload) {
        await deleteFiles([file.fullPath])
      }
    } catch (error) {
      console.warn(`Uploading the file failed`)
      console.error(error)
    }
  }

  return files.length > 0
}

let syncOngoing = false
let runSyncAgain = false

export const sync = async (config: Config, absPath: string, options: CommandLineOptions, changedFiles: Set<string>) => {
  console.log(`Sync triggered by the following files: ${Array.from(changedFiles).map((file) => path.basename(file))}`)
  changedFiles.clear()

  if (syncOngoing) {
    console.log("Sync is already running.")
    runSyncAgain = true
    return
  }
  syncOngoing = true

  console.log(`Uploading local files to the online folder: ${config.folderName}`)

  let onlineFiles: any[] = []
  const localFiles = await readdirp.promise(absPath)
  // If --delete-after-upload is set there is no need to compare with the online content. We just upload everything that's in the folder.
  if (!options["delete-after-upload"]) {
    onlineFiles = await fetchFiles(config)
  }

  // Compare the local files and what's on online
  const newFiles = localFiles.filter((file) => !onlineFiles.find((item) => item && item.name === file.basename))
  if (newFiles.length > 0) {
    console.log(`New files found: ${newFiles.length}`)
    await uploadFiles(config, newFiles, options["delete-after-upload"])
  } else {
    console.log("No new files found")
  }
  syncOngoing = false
  console.log("Uploading finished")

  if (runSyncAgain) {
    runSyncAgain = false
    await sync(config, absPath, options, new Set())
  }
}

export const watch = async (options: CommandLineOptions) => {
  if (!options.folder) {
    console.log("--folder is mandatory option for watch command")
    return
  }

  const config = await readConfig(true)
  if (!config.tokens) {
    console.log("The authentication token is missing. Run 'config' command first.")
    return
  }
  if (!config.folderId) {
    console.log("The target folder is not defined. Run 'config' command first.")
    return
  }

  const absPath = path.resolve(options.folder)
  console.log(`Watching ${absPath} for changes`)

  const debouncedSync = debounce(sync, 3000)
  await debouncedSync(config, absPath, options, new Set())

  const changedFiles = new Set<string>()
  nodeWatch(absPath, { recursive: true }, async (eventType: string, filename: string) => {
    changedFiles.add(filename)
    debouncedSync(config, absPath, options, changedFiles)
  })
}

export const definition = {
  command: {
    name: "watch",
    description: "Starts watching the folder for new files.",
  },
  options: [
    {
      name: "folder",
      alias: "f",
      typeLabel: "{underline path}",
      description: "The path of the watched folder.",
    },
    {
      name: "delete-after-upload",
      type: Boolean,
      description: "Delete file after successful upload.",
    },
  ],
  exec: watch,
}
