const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")
const satisfactionSurvey = require("../utils/satisfaction-survey")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close a modmail ticket")
    .addStringOption((option) =>
      option.setName("reason").setDescription("The reason for closing the ticket").setRequired(false),
    ),

  async execute(interaction, client) {
    // Check if we're in a guild
    if (!interaction.guild) {
      return interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      })
    }

    // Check if the command is used in a modmail channel or thread
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    // Check if the user has the staff role or is an administrator
    const member = await interaction.guild.members.fetch(interaction.user.id)
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
    const hasStaffRole = member.roles.cache.has(config.staffRoleId)

    if (!hasStaffRole && !isAdmin) {
      return interaction.reply({
        content: "You do not have permission to close tickets.",
        ephemeral: true,
      })
    }

    // Find the ticket associated with this channel or thread
    let ticket = null
    let isThread = false

    if (
      config.useThreads &&
      interaction.channel.isThread() &&
      interaction.channel.parent?.id === config.modmailChannelId
    ) {
      // This is a thread in the modmail channel
      ticket = Array.from(client.tickets.values()).find(
        (t) => t.guildId === interaction.guild.id && t.threadId === interaction.channel.id,
      )
      isThread = true
    } else {
      // Check if this is the modmail channel
      ticket = Array.from(client.tickets.values()).find(
        (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id,
      )
    }

    if (!ticket) {
      return interaction.reply({
        content: "This is not a modmail ticket channel or thread.",
        ephemeral: true,
      })
    }

    const reason = interaction.options.getString("reason") || "No reason provided"

    try {
      await interaction.deferReply()

      // Update ticket status to closed
      ticket.status = "closed"
      ticket.closedBy = interaction.user.id
      ticket.closedAt = new Date().toISOString()
      ticket.closeReason = reason

      // Update the info message to show closed status
      try {
        const channel = await interaction.guild.channels.fetch(ticket.channelId)
        const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

        const embed = EmbedBuilder.from(infoMessage.embeds[0])
        const fields = [...embed.data.fields]

        // Update the status field
        const statusFieldIndex = fields.findIndex((field) => field.name === "Status" || field.name === "📝 Status")
        if (statusFieldIndex !== -1) {
          fields[statusFieldIndex] = {
            name: "📝 Status",
            value: "🔴 Closed",
            inline: true,
          }
        }

        embed.setFields(fields)
        await infoMessage.edit({ embeds: [embed] })

        // If using threads, update the thread info message too
        if (config.useThreads && ticket.threadId && ticket.threadInfoMessageId) {
          try {
            const thread = await interaction.guild.channels.fetch(ticket.threadId)
            if (thread) {
              const threadInfoMessage = await thread.messages.fetch(ticket.threadInfoMessageId)
              if (threadInfoMessage) {
                await threadInfoMessage.edit({ embeds: [embed] })
              }
            }
          } catch (error) {
            console.error("Error updating thread info message:", error)
          }
        }
      } catch (error) {
        console.error("Error updating info message:", error)
      }

      // Send a closure message in the channel/thread
      let closureMessage

      // Notify the user that the ticket is closed
      const user = await client.users.fetch(ticket.userId)
      const userEmbed = {
        color: 0xff0000,
        title: "🔒 Ticket Closed",
        description: `Your modmail ticket has been closed by ${member.displayName || interaction.user.username}.`,
        fields: [{ name: "📝 Reason", value: reason }],
        timestamp: new Date().toISOString(),
      }

      await user.send({ embeds: [userEmbed] }).catch((error) => {
        console.error(`Could not send DM to ${user.tag}.`, error)
      })

      // Send satisfaction survey
      await satisfactionSurvey.sendSurvey(client, ticket, user).catch((error) => {
        console.error("Error sending satisfaction survey:", error)
      })

      // Send a closure message in the channel/thread - move this up before transcript generation
      closureMessage = await interaction.channel.send({
        content: `🔒 Ticket closed by ${member.displayName || interaction.user.username}. Reason: ${reason}${
          config.useThreads && ticket.threadId ? "\nThis thread will now be archived." : ""
        }`,
      })

      // Fetch all messages in the channel or thread for history and transcript
      let allMessages = []
      let lastId = null

      while (true) {
        const options = { limit: 100 }
        if (lastId) {
          options.before = lastId
        }

        const messages = await interaction.channel.messages.fetch(options)
        if (messages.size === 0) break

        allMessages = [...allMessages, ...messages.values()]
        lastId = messages.last().id

        if (messages.size < 100) break
      }

      // Make sure to include the closure message in the transcript
      if (!allMessages.some((m) => m.id === closureMessage.id)) {
        allMessages.push(closureMessage)
      }

      // Update ticket with closing information
      ticket.userTag = user.tag
      ticket.assignedToTag = ticket.assignedTo
        ? (await client.users.fetch(ticket.assignedTo).catch(() => null))?.tag || "Unknown"
        : null
      ticket.staffRoleId = config.staffRoleId

      // Calculate resolution time
      ticket.resolutionTime = new Date().toISOString()

      // Add message counts
      ticket.messageCount = allMessages.length
      ticket.staffMessageCount = allMessages.filter(
        (m) =>
          (m.embeds?.length > 0 && m.embeds[0].author?.name?.includes("Staff")) ||
          (m.member && m.member.roles.cache.has(config.staffRoleId)),
      ).length
      ticket.userMessageCount = allMessages.filter(
        (m) =>
          (m.embeds?.length > 0 && !m.embeds[0].author?.name?.includes("Staff")) ||
          (m.author.id === ticket.userId && !m.author.bot),
      ).length

      // Generate transcript
      const transcript = await client.transcriptManager.generateTranscript(ticket, allMessages, client)

      // Send transcript to log channel
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      await client.transcriptManager.sendTranscript(transcript, ticket, interaction.guild, config.logChannelId)

      // Store ticket in history
      ticketHistory.addTicket(ticket, allMessages)

      // Reply to the interaction
      await interaction.editReply({
        content: `✅ Ticket closed. Reason: ${reason}. Transcript has been generated and sent to the logs channel.`,
      })

      // Log the ticket closure
      const logEmbed = {
        color: 0xff0000,
        title: "🔒 Ticket Closed",
        description: `Ticket from ${user.tag} (${user.id}) has been closed by ${member.displayName || interaction.user.username}.`,
        fields: [
          { name: "📝 Reason", value: reason },
          { name: "🎫 Ticket ID", value: ticket.numericId },
          { name: "Priority", value: getFormattedPriority(ticket.priority), inline: true },
          { name: "Category", value: ticket.category || "None", inline: true },
          { name: "Duration", value: calculateDuration(ticket.createdAt, ticket.closedAt), inline: true },
        ],
        timestamp: new Date().toISOString(),
      }

      await logChannel.send({ embeds: [logEmbed] })

      // Send webhook notification if configured
      if (config.webhookUrl) {
        try {
          const webhookData = {
            embeds: [
              {
                title: "🔒 Ticket Closed",
                description: `Ticket #${ticket.numericId} has been closed by ${member.displayName || interaction.user.username}`,
                color: 0xff0000,
                fields: [
                  { name: "🎫 Ticket ID", value: ticket.numericId, inline: true },
                  { name: "👤 User", value: user.tag, inline: true },
                  { name: "👨‍💼 Staff", value: member.displayName || interaction.user.username, inline: true },
                  { name: "📝 Reason", value: reason, inline: false },
                  { name: "⏰ Closed At", value: new Date().toLocaleString(), inline: true },
                ],
                timestamp: new Date().toISOString(),
              },
            ],
          }

          fetch(config.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(webhookData),
          })
        } catch (error) {
          console.error("Error sending webhook notification:", error)
        }
      }

      // Remove the ticket from the collection
      client.tickets.delete(ticket.id)

      // Save the updated tickets collection to persistent storage
      client.ticketStorage.saveTickets(client.tickets)

      // Archive the thread if applicable
      if (config.useThreads && ticket.threadId) {
        await interaction.channel.setArchived(true, `Ticket #${ticket.numericId} closed: ${reason}`)
      }
    } catch (error) {
      console.error("Error closing ticket:", error)
      await interaction.editReply({
        content: "An error occurred while closing the ticket.",
      })
    }
  },
}

// Helper function to calculate duration between two dates
function calculateDuration(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate || Date.now())

  const durationMs = end - start
  const seconds = Math.floor(durationMs / 1000)

  if (seconds < 60) {
    return `${seconds} seconds`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} minutes`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} hours`
  }

  const days = Math.floor(hours / 24)
  return `${days} days`
}
