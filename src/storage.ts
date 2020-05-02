import { CommandLineOptions } from "command-line-args"
import { readConfig } from "./config"
import { OAuth2Client } from "google-auth-library"

export const storage = async (options: CommandLineOptions) => {
  const config = await readConfig(true)
  if (!config.tokens) {
    console.log("The authentication token is missing. Run 'config' command first.")
    return
  }

  const oauth2Client = new OAuth2Client(config.clientId, config.clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth2Client.setCredentials(config.tokens!)

  try {
    const result = await oauth2Client.request<any>({
      method: "GET",
      url: `https://www.googleapis.com/drive/v3/about`,
      params: {
        fields: "storageQuota",
      },
    })
    let total = Number(result.data.storageQuota.limit) / 1024 / 1024 / 1024
    let used = Number(result.data.storageQuota.usage) / 1024 / 1024 / 1024
    total = Math.round((total + Number.EPSILON) * 10) / 10
    used = Math.round((used + Number.EPSILON) * 10) / 10
    process.stdout.write(`${used}/${total} GB\n`)
  } catch (error) {
    console.error(`Unable to get the drive stats`)
    console.error(error.message)
  }
}

export const definition = {
  command: {
    name: "storage",
    description: "Display the free space on Google drive.",
  },
  options: [],
  exec: storage,
}
