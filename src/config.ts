import envPaths from "env-paths"
import { OAuth2Client, Credentials } from "google-auth-library"
import { appName, createFolder, getFolders } from "./common"
import fs from "fs"
import path from "path"
import { promisify } from "util"
import readline from "readline"
import { CommandLineOptions } from "command-line-args"

const mkdir = promisify(fs.mkdir)
const readFile = promisify(fs.readFile)
const writeFile = promisify(fs.writeFile)

export type Config = {
  clientId?: string
  clientSecret?: string
  tokens?: Credentials
  folderId?: string
  folderName?: string
}

export const readConfig = async (silent: boolean) => {
  const paths = envPaths(appName)

  let config: Config = {}
  const filePath = path.join(paths.config, "config.json")
  if (fs.existsSync(filePath)) {
    config = JSON.parse(await readFile(filePath, "utf8"))
  } else if (!silent) {
    console.log("The config file is missing. Run 'config' command first.")
    process.exit(1)
  }
  return config
}

const askClientInfo = async (config: Config, ask: (q: string) => Promise<string>) => {
  console.log(
    "* Go to Google Developer portal (https://console.developers.google.com)\n" +
      "* Create new project\n" +
      "* Enable Google Drive API for it\n" +
      "* Create OAuth2 credentials\n" +
      "* Enter the client id and secret below\n"
  )
  const askClientId = `Client ID (default: ${config.clientId || "<none>"}): `
  const askClientSecret = `Client Secret (default: ${config.clientSecret || "<none>"}): `
  return {
    ...config,
    clientId: (await ask(askClientId)) || config.clientId,
    clientSecret: (await ask(askClientSecret)) || config.clientSecret,
  }
}

const askAuthCode = async (config: Config, ask: (q: string) => Promise<string>) => {
  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  })

  console.log(`* Go to the following url and grant access to your drive:\n\n${authorizeUrl}\n`)

  let askAuthCode = `Auth Code: `
  if (config.tokens) {
    askAuthCode = `Auth Code (leave empty to use current tokens): `
  }
  const authCode = await ask(askAuthCode)
  let tokens: Credentials | undefined = undefined
  if (authCode) {
    try {
      const tokenResponse = await oauth2Client.getToken(authCode)
      tokens = tokenResponse.tokens
    } catch (error) {
      console.warn(`Failed to get the access token (${error.message}).`)
    }
  } else {
    if (config.tokens) {
      try {
        oauth2Client.setCredentials(config.tokens)
        const tokenResponse = await oauth2Client.refreshAccessToken()
        tokens = tokenResponse.credentials
      } catch (error) {
        console.warn(`Failed to get the refresh the access token (${error.message}).`)
      }
    } else {
      console.log(`Refresh token is missing and the authentication code was not given. Unable to continue.`)
    }
  }

  return {
    ...config,
    tokens: tokens || config.tokens,
  }
}

const askFolder = async (config: Config, ask: (q: string) => Promise<string>) => {
  if (config.tokens && config.tokens.access_token) {
    const folders = await getFolders(config)
    console.log("\n* Select the target folder:")
    folders.forEach((folder, index) => {
      console.log(`${index + 1} = ${folder ? folder.name : ""}`)
    })
    do {
      const selectedFolder = await ask("Select the folder or give name for a new folder: ")
      const index = Number.parseInt(selectedFolder)
      if (index !== undefined && !Number.isNaN(index)) {
        if (index <= 0 || index > folders.length) {
          console.log("Incorrect folder index")
        } else {
          console.log(`Selected folder: ${folders[index - 1].name}`)
          return {
            ...config,
            folderId: folders[index - 1].id,
            folderName: folders[index - 1].name,
          }
        }
      } else if (selectedFolder) {
        const response = await createFolder(config, selectedFolder)
        if (response) {
          return {
            ...config,
            folderId: response.id,
            folderName: response.name,
          }
        }
      }
    } while (true)
  } else {
    console.log("Unable to get the folder list. The access token is missing")
  }
  return config
}

const config = async (options: CommandLineOptions) => {
  const paths = envPaths(appName)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const ask = (question: string) => {
    return new Promise<string>((resolve, reject) => {
      rl.question(question, (input) => resolve(input))
    })
  }

  try {
    await mkdir(paths.config, { recursive: true })

    const filePath = path.join(paths.config, "config.json")

    let config = await readConfig(true)
    config = await askClientInfo(config, ask)
    config = await askAuthCode(config, ask)

    await writeFile(filePath, JSON.stringify(config, null, 2))
    console.log(`Wrote "${filePath}"`)

    config = await askFolder(config, ask)

    await writeFile(filePath, JSON.stringify(config, null, 2))
    console.log(`Wrote "${filePath}"`)
  } catch (error) {
    console.error(error)
  } finally {
    rl.close()
  }
}

export const definition = {
  command: {
    name: "config",
    description: "Configures the Google Drive connection. This must be ran first.",
  },
  options: [],
  exec: config,
}
