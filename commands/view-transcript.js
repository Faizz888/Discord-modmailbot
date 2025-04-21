const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js")
const fs = require("fs")
const path = require("path")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("view-transcript")
    .setDescription("View the transcript of a ticket")
    .addStringOption((option) =>
      option.setName("ticket_id").setDescription("The ID of the ticket to view").setRequired(true),
    ),

  async execute(interaction, client) {
    // Check if the user has the staff role
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (!member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({
        content: "You do not have permission to view transcripts.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      const ticketId = interaction.options.getString("ticket_id")

      // Find the ticket in history
      const ticket =
        client.ticketHistory.getTicket(ticketId) ||
        client.ticketHistory.getTicketByNumericId(interaction.guild.id, ticketId)

      if (!ticket) {
        return interaction.editReply({
          content: `Ticket with ID ${ticketId} not found.`,
        })
      }

      // Check if the ticket has messages
      if (!ticket.messages || ticket.messages.length === 0) {
        return interaction.editReply({
          content: `No messages found for ticket #${ticket.numericId || ticketId}.`,
        })
      }

      // Generate transcript
      const transcript = await generateTranscript(ticket, client)

      // Create transcript file
      const transcriptsDir = path.join(__dirname, "../transcripts")
      if (!fs.existsSync(transcriptsDir)) {
        fs.mkdirSync(transcriptsDir, { recursive: true })
      }

      const fileName = `ticket-${ticket.numericId || ticketId}-${Date.now()}.md`
      const filePath = path.join(transcriptsDir, fileName)
      fs.writeFileSync(filePath, transcript)

      // Create a summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Transcript for Ticket #${ticket.numericId || ticketId}`)
        .setDescription("Here is the transcript for this ticket.")
        .addFields([
          { name: "User", value: ticket.userTag || `<@${ticket.userId}>`, inline: true },
          { name: "Created", value: new Date(ticket.createdAt).toLocaleString(), inline: true },
          { name: "Status", value: ticket.status, inline: true },
          { name: "Messages", value: `${ticket.messages.length}`, inline: true },
          { name: "Category", value: ticket.category || "None", inline: true },
          { name: "Priority", value: ticket.priority ? getFormattedPriority(ticket.priority) : "None", inline: true },
        ])
        .setFooter({ text: "Use the download button to save the transcript" })
        .setTimestamp()

      // Create a preview of the transcript (first few messages)
      const previewMessages = ticket.messages.slice(0, 5)
      let previewText = "**Transcript Preview:**\n\n"

      for (const msg of previewMessages) {
        const timestamp = new Date(msg.timestamp).toLocaleString()
        const author = msg.isStaff ? `${msg.author} (Staff)` : msg.author
        previewText += `**${author}** - ${timestamp}\n${msg.content.substring(0, 100)}${msg.content.length > 100 ? "..." : ""}\n\n`
      }

      if (ticket.messages.length > 5) {
        previewText += `*... and ${ticket.messages.length - 5} more messages*`
      }

      const previewEmbed = new EmbedBuilder().setColor(0x0099ff).setDescription(previewText)

      // Send the embeds and file
      const attachment = new AttachmentBuilder(filePath, { name: fileName })

      await interaction.editReply({
        embeds: [summaryEmbed, previewEmbed],
        files: [attachment],
      })
    } catch (error) {
      console.error("Error viewing transcript:", error)
      await interaction.editReply({
        content: "An error occurred while generating the transcript.",
      })
    }
  },
}

async function generateTranscript(ticket, client) {
  // Generate a markdown transcript
  let transcript = `# Ticket Transcript: #${ticket.numericId || ticket.id}\n\n`

  transcript += `**User:** ${ticket.userTag || ticket.userId} (${ticket.userId})\n`
  transcript += `**Created:** ${new Date(ticket.createdAt).toLocaleString()}\n`

  if (ticket.closedAt) {
    transcript += `**Closed:** ${new Date(ticket.closedAt).toLocaleString()}\n`
  }

  if (ticket.category) {
    transcript += `**Category:** ${ticket.category}\n`
  }

  if (ticket.priority) {
    transcript += `**Priority:** ${ticket.priority ? getFormattedPriority(ticket.priority) : "None"}\n`
  }

  if (ticket.assignedTo) {
    const staffTag =
      ticket.assignedToTag || (await client.users.fetch(ticket.assignedTo).catch(() => null))?.tag || ticket.assignedTo
    transcript += `**Assigned To:** ${staffTag}\n`
  }

  transcript += `**Status:** ${ticket.status}\n\n`
  transcript += `## Messages\n\n`

  // Sort messages by timestamp
  const sortedMessages = [...ticket.messages].sort((a, b) => a.timestamp - b.timestamp)

  for (const message of sortedMessages) {
    const timestamp = new Date(message.timestamp).toLocaleString()
    const author = message.isStaff ? `${message.author} (Staff)` : message.author

    transcript += `### ${author} - ${timestamp}\n\n`
    transcript += `${message.content || "*No content*"}\n\n`

    // Include attachments if any
    if (message.attachments) {
      transcript += `**Attachments:**\n`
      transcript += `${message.attachments}\n\n`
    }
  }

  transcript += `## End of Transcript\n`
  transcript += `Generated: ${new Date().toLocaleString()}\n`

  return transcript
}
