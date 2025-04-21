const { SlashCommandBuilder } = require("discord.js")
const fs = require("fs")
const path = require("path")

module.exports = {
  data: new SlashCommandBuilder().setName("transcript").setDescription("Generate a transcript of the current ticket"),

  async execute(interaction, client) {
    // Check if the command is used in a modmail channel
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    // Check if the user has the staff role
    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (!member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({
        content: "You do not have permission to generate transcripts.",
        ephemeral: true,
      })
    }

    // Find the ticket associated with this channel
    const ticket = Array.from(client.tickets.values()).find(
      (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id,
    )

    if (!ticket) {
      return interaction.reply({
        content: "This is not a modmail ticket channel.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      // Fetch all messages in the channel
      const channel = await interaction.guild.channels.fetch(ticket.channelId)
      let allMessages = []
      let lastId = null

      while (true) {
        const options = { limit: 100 }
        if (lastId) {
          options.before = lastId
        }

        const messages = await channel.messages.fetch(options)
        if (messages.size === 0) break

        allMessages = [...allMessages, ...messages.values()]
        lastId = messages.last().id

        if (messages.size < 100) break
      }

      // Sort messages by timestamp (oldest first)
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

      // Generate transcript
      let transcript = `# Ticket Transcript: #${ticket.id}\n\n`
      transcript += `**User:** ${(await client.users.fetch(ticket.userId)).tag} (${ticket.userId})\n`
      transcript += `**Created:** ${new Date(ticket.createdAt).toLocaleString()}\n`
      if (ticket.category) {
        transcript += `**Category:** ${ticket.category}\n`
      }
      if (ticket.priority) {
        transcript += `**Priority:** ${ticket.priority}\n`
      }
      transcript += `**Status:** ${ticket.status}\n\n`
      transcript += `## Messages\n\n`

      for (const message of allMessages) {
        // Skip bot messages that aren't embeds (like system messages)
        if (message.author.bot && message.embeds.length === 0) continue

        const timestamp = new Date(message.createdTimestamp).toLocaleString()

        if (message.embeds.length > 0) {
          // Handle embed messages (user messages and staff replies)
          const embed = message.embeds[0]
          if (!embed.author) continue

          const authorName = embed.author.name
          const isStaff = authorName.includes("Staff")
          const content = embed.description || "*No content*"

          transcript += `### ${authorName} - ${timestamp}\n\n`
          transcript += `${content}\n\n`

          // Include attachments if any
          if (embed.fields && embed.fields.some((f) => f.name === "Attachments")) {
            const attachmentField = embed.fields.find((f) => f.name === "Attachments")
            transcript += `**Attachments:**\n${attachmentField.value}\n\n`
          }
        } else {
          // Handle regular messages
          transcript += `### ${message.author.tag} - ${timestamp}\n\n`
          transcript += `${message.content || "*No content*"}\n\n`

          // Include attachments if any
          if (message.attachments.size > 0) {
            transcript += `**Attachments:**\n`
            message.attachments.forEach((attachment) => {
              transcript += `- ${attachment.url}\n`
            })
            transcript += `\n`
          }
        }
      }

      // Create transcripts directory if it doesn't exist
      const transcriptsDir = path.join(__dirname, "../transcripts")
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir)
      }

      // Save transcript to file
      const fileName = `ticket-${ticket.id}-${Date.now()}.md`
      const filePath = path.join(transcriptsDir, fileName)
      fs.writeFileSync(filePath, transcript)

      // Send transcript file
      await interaction.editReply({
        content: `Transcript generated for ticket #${ticket.id}.`,
        files: [
          {
            attachment: filePath,
            name: fileName,
          },
        ],
      })

      // Log transcript generation
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      const logEmbed = {
        color: 0x00ff00,
        title: "Transcript Generated",
        description: `A transcript has been generated for ticket #${ticket.id} by ${member.displayName || interaction.user.username}`,
        fields: [
          { name: "User", value: `<@${ticket.userId}>`, inline: true },
          { name: "Status", value: ticket.status, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }

      await logChannel.send({
        embeds: [logEmbed],
        files: [
          {
            attachment: filePath,
            name: fileName,
          },
        ],
      })
    } catch (error) {
      console.error("Error generating transcript:", error)
      await interaction.editReply({
        content: "An error occurred while generating the transcript.",
      })
    }
  },
}
