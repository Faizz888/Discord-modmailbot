const { Client, GatewayIntentBits, Partials, Collection, Events } = require("discord.js")
const fs = require("fs")
const path = require("path")
require("dotenv").config()
const errorLogger = require("./utils/error-logger")
const jsonValidator = require("./utils/json-validator")
const ticketStorage = require("./utils/ticket-storage")

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers, // Added for member fetching
  ],
  partials: [
    Partials.Channel, // Required for DM channel
    Partials.Message, // Required for message reactions
    Partials.Reaction, // Required for message reactions
    Partials.User, // Required for message reactions
    Partials.ThreadMember, // Required for thread-based tickets
    Partials.Thread, // Required for thread-based tickets
  ],
})

// Initialize collections - MUST be done before loading events
client.tickets = new Collection()
client.configs = new Collection()
client.commands = new Collection()

// Set environment
process.env.NODE_ENV = process.env.NODE_ENV || "production"

// Load commands
const commandsPath = path.join(__dirname, "commands")
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file)
  try {
    const command = require(filePath)

    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command)
    } else {
      console.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`)
    }
  } catch (error) {
    console.error(`Error loading command from ${filePath}:`, error)
  }
}

// Load events
const eventsPath = path.join(__dirname, "events")
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"))

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file)
  try {
    const event = require(filePath)

    if (event.once) {
      client.once(event.name, (...args) => {
        try {
          // Pass the client object to the event handler
          event.execute(...args)
        } catch (error) {
          console.error(`Error executing event ${event.name}:`, error)
        }
      })
    } else {
      client.on(event.name, (...args) => {
        try {
          // Pass the client object to the event handler
          event.execute(...args)
        } catch (error) {
          console.error(`Error executing event ${event.name}:`, error)
        }
      })
    }
  } catch (error) {
    console.error(`Error loading event from ${filePath}:`, error)
  }
}

// Global error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason)
})

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  // For uncaught exceptions, we might want to gracefully shutdown
  // But we'll just log for now to keep the bot running
})

// Load utilities
client.utils = require("./utils/utils")
client.ticketHistory = require("./utils/ticket-history")
client.ticketAnalytics = require("./utils/ticket-analytics")
client.tagManager = require("./utils/tag-manager")
client.satisfactionSurvey = require("./utils/satisfaction-survey")
client.security = require("./utils/security")
client.errorLogger = errorLogger
client.jsonValidator = jsonValidator
client.priorityUtils = require("./utils/priority-utils")
client.transcriptManager = require("./utils/transcript-manager")
client.ticketStorage = ticketStorage

// Create necessary directories
const directories = [
  path.join(__dirname, "data"),
  path.join(__dirname, "reports"),
  path.join(__dirname, "transcripts"),
  path.join(__dirname, "logs"),
]

for (const dir of directories) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Validate JSON files
function validateJsonFiles() {
  console.log("Starting JSON file validation")

  // Get common schemas
  const schemas = jsonValidator.getCommonSchemas()

  // Validate config.json
  const configPath = path.join(__dirname, "config.json")
  if (fs.existsSync(configPath)) {
    const configValidation = jsonValidator.validateFile(configPath, schemas["config.json"])
    if (!configValidation.valid) {
      console.warn(`Invalid config.json: ${configValidation.error}`)
      // We don't auto-repair config.json as it contains critical settings
    } else {
      console.log("config.json is valid")
    }
  }

  // Validate data directory
  const dataDir = path.join(__dirname, "data")
  if (fs.existsSync(dataDir)) {
    const dataValidation = jsonValidator.validateDirectory(dataDir, schemas)

    if (!dataValidation.valid) {
      console.warn("Some files in data directory are invalid")

      // Attempt to repair invalid files
      for (const [file, result] of Object.entries(dataValidation.results)) {
        if (!result.valid) {
          console.warn(`Invalid file ${file}: ${result.error}`)

          // Get default data based on file name
          let defaultData = {}
          if (file === "ticket-history.json") {
            defaultData = {
              tickets: [],
              users: {},
              servers: {},
              stats: {
                totalTickets: 0,
                closedTickets: 0,
                categoryCounts: {},
                tagCounts: {},
              },
            }
          } else if (file === "tags.json") {
            defaultData = {}
          } else if (file === "ticket-counters.json") {
            defaultData = {}
          } else if (file === "active-tickets.json") {
            defaultData = []
          }

          // Repair file
          const repairResult = jsonValidator.repairFile(path.join(dataDir, file), defaultData)
          if (repairResult.repaired) {
            console.log(`Repaired ${file}: ${repairResult.message}`)
          } else {
            console.error(`Failed to repair ${file}: ${repairResult.error || repairResult.message}`)
          }
        }
      }
    } else {
      console.log("All files in data directory are valid")
    }
  }

  // Check if transcripts directory exists and create it if not
  const transcriptsDir = path.join(__dirname, "transcripts")
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true })
    console.log("Created transcripts directory")
  }
}

// Save active tickets periodically
function setupTicketAutosave() {
  // Save tickets every 5 minutes
  const AUTOSAVE_INTERVAL = 5 * 60 * 1000 // 5 minutes in milliseconds

  setInterval(() => {
    if (client.tickets.size > 0) {
      client.ticketStorage.saveTickets(client.tickets)
    }
  }, AUTOSAVE_INTERVAL)

  // Also save tickets on process exit
  process.on("SIGINT", () => {
    console.log("Received SIGINT. Saving tickets before exit...")
    client.ticketStorage.saveTickets(client.tickets)
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    console.log("Received SIGTERM. Saving tickets before exit...")
    client.ticketStorage.saveTickets(client.tickets)
    process.exit(0)
  })
}

// Validate token before login
if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is not set in environment variables. Please check your .env file.")
  process.exit(1)
}

// Login to Discord with your client's token
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log("Bot successfully logged in")
    // Validate JSON files after successful login
    validateJsonFiles()
    // Setup ticket autosave
    setupTicketAutosave()
  })
  .catch((error) => {
    console.error("Failed to log in to Discord:", error)
    process.exit(1)
  })

// When the client is ready, load configurations from file
client.once(Events.ClientReady, () => {
  try {
    console.log(`Logged in as ${client.user.tag}`)

    // Load configurations from file
    if (fs.existsSync("./config.json")) {
      const configFile = fs.readFileSync("./config.json")
      const configs = JSON.parse(configFile)

      for (const [guildId, config] of Object.entries(configs)) {
        client.configs.set(guildId, config)
      }

      console.log(`Loaded configurations for ${Object.keys(configs).length} guilds.`)
    }

    // Log that client.tickets is initialized
    console.log("client.tickets collection initialized:", client.tickets instanceof Collection)
  } catch (error) {
    console.error("Error loading configurations:", error)
  }
})
