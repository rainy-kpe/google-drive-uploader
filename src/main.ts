import commandLineArgs from "command-line-args"
import commandLineUsage, { Section, OptionDefinition } from "command-line-usage"
import { definition as configDefinition } from "./config"
import { definition as watchDefinition } from "./watch"
import { definition as pruneDefinition } from "./prune"
import { definition as storageDefinition } from "./storage"
import cs from "console-stamp"
import { appName } from "./common"

cs(console)

const definitions = {
  [configDefinition.command.name]: configDefinition,
  [watchDefinition.command.name]: watchDefinition,
  [pruneDefinition.command.name]: pruneDefinition,
  [storageDefinition.command.name]: storageDefinition,
}

const helpCommand: OptionDefinition = {
  name: "help",
  description: "Print this usage guide.",
}

const commands = [
  configDefinition.command,
  watchDefinition.command,
  pruneDefinition.command,
  storageDefinition.command,
  helpCommand,
]

const sectionTitle: Section = {
  header: appName,
  content: "Monitors a folder and uploads new files to Google Drive.",
}

const sectionSynopsis: Section = {
  header: "Synopsis",
  content: "$ node dist/main.js <command> <options>",
}

const sectionCommands: Section = {
  header: "Commands",
  content: commands,
}

const sectionHelp = {
  content: "Run 'node dist/main.js help <command>' for help with a specific command.",
}

const showCommandHelp = (command: string) => {
  const hasOptions = definitions[command].options.length !== 0
  const sectionHelpSynopsis: Section = {
    header: "Synopsis",
    content: `$ node dist/main.js ${command} ${hasOptions ? "<options>" : ""}`,
  }
  const sectionCommand: Section = {
    header: `Command: ${command}`,
    content: definitions[command].command.description,
  }
  const sectionOptions: Section = {
    header: "Options",
    optionList: definitions[command].options,
  }
  console.log(commandLineUsage([sectionTitle, sectionCommand, sectionHelpSynopsis, hasOptions ? sectionOptions : {}]))
}

const main = async () => {
  const mainOptions = commandLineArgs([{ name: "command", defaultOption: true }], { stopAtFirstUnknown: true })
  const argv = mainOptions._unknown || []

  if (mainOptions.command === "help") {
    const helpOptions = commandLineArgs([{ name: "command", defaultOption: true }], { stopAtFirstUnknown: true, argv })
    if (definitions[helpOptions.command]) {
      showCommandHelp(helpOptions.command)
    } else if (!helpOptions.command) {
      console.log(commandLineUsage([sectionTitle, sectionSynopsis, sectionCommands, sectionHelp]))
    } else {
      console.log(`Unknown command: ${helpOptions.command}`)
    }
  } else if (!mainOptions.command) {
    console.log(commandLineUsage([sectionTitle, sectionSynopsis, sectionCommands, sectionHelp]))
  } else if (definitions[mainOptions.command]) {
    let commandOptions = {}
    try {
      commandOptions = commandLineArgs(definitions[mainOptions.command].options, { argv })
    } catch (error) {
      console.warn(`Unknown option: ${error.optionName}`)
      process.exit(1)
    }
    await definitions[mainOptions.command].exec(commandOptions)
  } else {
    console.log(`Unknown command: ${mainOptions.command}`)
  }
}

main()
