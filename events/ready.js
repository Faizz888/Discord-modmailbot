const fs = require("fs")

module.exports = {
  name: "ready",
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}!`)

    // Load configurations from file
    try {
      if (fs.existsSync("./config.json")) {
        const configFile = fs.readFileSync("./config.json")
        const configs = JSON.parse(configFile)

        for (const [guildId, config] of Object.entries(configs)) {
          client.configs.set(guildId, config)
        }

        console.log(`Loaded configurations for ${Object.keys(configs).length} guilds.`)
      }
    } catch (error) {
      console.error("Error loading configurations:", error)
    }

    // Load active tickets from persistent storage
    try {
      const activeTickets = client.ticketStorage.loadTickets()

      if (activeTickets.length > 0) {
        console.log(`Restoring ${activeTickets.length} active tickets from storage...`)

        // Add each ticket to the client.tickets collection
        for (const ticket of activeTickets) {
          // Verify ticket integrity
          const verifiedTicket = client.ticketStorage.verifyTicketIntegrity(ticket)
          if (verifiedTicket) {
            client.tickets.set(ticket.id, verifiedTicket)
          }
        }

        console.log(`Successfully restored ${client.tickets.size} active tickets.`)

        // Verify all tickets are accessible
        await verifyTicketChannels(client)
      } else {
        console.log("No active tickets to restore from storage.")
      }
    } catch (error) {
      console.error("Error restoring active tickets:", error)
    }

    // Register slash commands
    const { REST, Routes } = require("discord.js")
    const commands = []

    for (const command of client.commands.values()) {
      commands.push(command.data.toJSON())
    }

    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN)
    ;(async () => {
      try {
        console.log("Started refreshing application (/) commands.")

        await rest.put(Routes.applicationCommands(client.user.id), { body: commands })

        console.log("Successfully reloaded application (/) commands.")
      } catch (error) {
        console.error(error)
      }
    })()
  },
}

/**
 * Verify that all ticket channels/threads still exist and are accessible
 * @param {Object} client - Discord client
 */
async function verifyTicketChannels(client) {
  const ticketsToRemove = []

  for (const [ticketId, ticket] of client.tickets.entries()) {
    try {
      // Skip closed tickets
      if (ticket.status === "closed") {
        ticketsToRemove.push(ticketId)
        continue
      }

      // Get the guild
      const guild = client.guilds.cache.get(ticket.guildId)
      if (!guild) {
        console.warn(`Guild ${ticket.guildId} not found for ticket ${ticketId}`)
        continue
      }

      // Check if channel exists
      const channel = await guild.channels.fetch(ticket.channelId).catch(() => null)
      if (!channel) {
        console.warn(`Channel ${ticket.channelId} not found for ticket ${ticketId}`)
        ticketsToRemove.push(ticketId)
        continue
      }

      // If using threads, check if thread exists
      if (ticket.threadId) {
        const thread = await guild.channels.fetch(ticket.threadId).catch(() => null)
        if (!thread) {
          console.warn(`Thread ${ticket.threadId} not found for ticket ${ticketId}`)
          // Don't remove the ticket, just update it to not use threads
          ticket.threadId = null
          client.tickets.set(ticketId, ticket)
        }
      }

      console.log(`Verified ticket ${ticketId} (${ticket.numericId}) is accessible`)
    } catch (error) {
      console.error(`Error verifying ticket ${ticketId}:`, error)
    }
  }

  // Remove tickets that are no longer valid
  for (const ticketId of ticketsToRemove) {
    client.tickets.delete(ticketId)
  }

  if (ticketsToRemove.length > 0) {
    console.log(`Removed ${ticketsToRemove.length} invalid tickets`)
    // Save the updated tickets collection
    client.ticketStorage.saveTickets(client.tickets)
  }
}
