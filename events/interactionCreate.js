const satisfactionSurvey = require("../utils/satisfaction-survey")
const { EmbedBuilder } = require("discord.js")
const security = require("../utils/security")

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    // Get the client from the interaction's client property
    const client = interaction.client

    try {
      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName)

        if (!command) return

        try {
          // Check if this is an admin command used outside of admin channels
          const isAdminCommand = ["dashboard", "analytics", "report", "search", "blacklist", "performance"].includes(
            interaction.commandName,
          )

          if (isAdminCommand) {
            const config = client.configs.get(interaction.guild?.id)

            if (config) {
              const isInAdminChannel = isAdminCommandInAdminChannel(interaction.channel.id, config)

              // If admin command is used outside admin channels, make it ephemeral
              if (!isInAdminChannel) {
                // Force ephemeral response for admin commands outside admin channels
                const originalReply = interaction.reply.bind(interaction)
                interaction.reply = async (options) => {
                  if (typeof options === "object") {
                    // Use ephemeral instead of flags
                    options.ephemeral = true
                  } else {
                    options = {
                      content: options,
                      ephemeral: true,
                    }
                  }
                  return await originalReply(options)
                }
              }
            }
          }

          await command.execute(interaction, client)
        } catch (error) {
          console.error(`Command Execution: ${interaction.commandName}`, error)

          // Check if the reply has already been sent
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("Command Error")
                  .setDescription("There was an error executing this command. The error has been logged.")
                  .setTimestamp(),
              ],
              ephemeral: true,
            })
          } else {
            await interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("Command Error")
                  .setDescription("There was an error executing this command. The error has been logged.")
                  .setTimestamp(),
              ],
              ephemeral: true,
            })
          }
        }
      }

      // Handle button interactions
      if (interaction.isButton()) {
        // Check if this is a satisfaction survey rating
        if (interaction.customId.startsWith("rating_")) {
          await satisfactionSurvey.handleRating(interaction, client)
        }
      }

      // Handle autocomplete interactions
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName)

        if (!command || !command.autocomplete) return

        try {
          await command.autocomplete(interaction, client)
        } catch (error) {
          console.error(`Autocomplete: ${interaction.commandName}`, error)
        }
      }
    } catch (error) {
      console.error("Interaction Handler", error)
    }
  },
}

// Helper function to determine if an admin command is used in an admin channel
function isAdminCommandInAdminChannel(channelId, config) {
  // Check if the channel is the modmail channel, log channel, or any additional admin channels
  if (channelId === config.modmailChannelId || channelId === config.logChannelId) {
    return true
  }

  // Check additional admin channels if configured
  if (config.adminChannels && Array.isArray(config.adminChannels)) {
    return config.adminChannels.includes(channelId)
  }

  return false
}
