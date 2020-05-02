import path from "path"
import { OAuth2Client } from "google-auth-library"
import { CommandLineOptions } from "command-line-args"
import { readConfig, Config } from "./config"
import { deleteFiles, fetchFiles } from "./common"

export const deleteFromFolder = async (config: Config, ids: string[]) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  console.log(`Deleting ${ids.length} files from the folder ${config.folderName}`)

  for (let id of ids) {
    try {
      await oauth2Client.request<any>({
        method: "DELETE",
        url: `https://www.googleapis.com/drive/v3/files/${id}`,
      })
    } catch (error) {
      console.error(`Unable to delete the file from the folder.`)
      console.error(error.message)
    }
  }
}

// Get files before the date
// Delete files
export const prune = async (options: CommandLineOptions) => {
  if (!options["keep-days"]) {
    console.log("--keep-days is mandatory option for prune command")
    return
  }

  const config = await readConfig(true)
  if (!config.tokens) {
    console.log("The authentication token is missing. Run 'config' command first.")
    return
  }
  if (!config.folderId) {
    console.log("The online folder is not defined. Run 'config' command first.")
    return
  }

  const endDate = new Date()
  endDate.setDate(new Date().getDate() - options["keep-days"])
  console.log(`Deleting all files before ${endDate}`)
  const deletedFiles = (await fetchFiles(config))
    .filter((file) => !!file)
    .filter((file) => new Date(file.createdTime) < endDate)

  if (deletedFiles.length === 0) {
    console.log("No files found before the archive date")
  } else {
    console.log(`Found ${deletedFiles.length} to be deleted`)

    await deleteFromFolder(
      config,
      deletedFiles.map((file) => file.id)
    )

    if (options.folder) {
      const absPath = path.resolve(options.folder)
      console.log(`Removing files from the local path: ${absPath}`)
      await deleteFiles(
        deletedFiles.map((file) => path.join(absPath, file.filename)),
        true
      )
    }
  }
}

export const definition = {
  command: {
    name: "prune",
    description: "Delete old files.",
  },
  options: [
    {
      name: "folder",
      alias: "f",
      typeLabel: "{underline path}",
      description: "The path of the watched folder.",
    },
    {
      name: "keep-days",
      type: Number,
      description: "Number of days to keep in the original album.",
    },
  ],
  exec: prune,
}
