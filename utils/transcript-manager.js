const fs = require("fs")
const path = require("path")
const { EmbedBuilder, AttachmentBuilder } = require("discord.js")
const { getPriorityEmoji, getFormattedPriority } = require("./priority-utils")

class TranscriptManager {
  constructor() {
    this.transcriptsDir = path.join(__dirname, "../transcripts")
    this.ensureDirectoryExists()
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.transcriptsDir)) {
      fs.mkdirSync(this.transcriptsDir, { recursive: true })
    }
  }

  /**
   * Generate a transcript for a ticket
   * @param {Object} ticket - The ticket object
   * @param {Array} messages - Array of messages in the ticket
   * @param {Object} client - Discord client
   * @returns {Promise<Object>} - Transcript file information
   */
  async generateTranscript(ticket, messages, client) {
    try {
      // Sort messages by timestamp (oldest first)
      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

      // Generate transcript in markdown format
      let transcript = `# Modmail Ticket Transcript

`
      transcript += `## Ticket Information

`
      transcript += `- **Ticket ID:** ${ticket.numericId}
`
      transcript += `- **User:** ${ticket.userTag} (${ticket.userId})
`
      transcript += `- **Created:** ${new Date(ticket.createdAt).toLocaleString()}
`

      if (ticket.closedAt) {
        transcript += `- **Closed:** ${new Date(ticket.closedAt).toLocaleString()}
`
      }

      if (ticket.closedBy) {
        try {
          const closedByUser = await client.users.fetch(ticket.closedBy)
          transcript += `- **Closed By:** ${closedByUser.tag} (${ticket.closedBy})
`
        } catch (error) {
          transcript += `- **Closed By:** Unknown (${ticket.closedBy})
`
        }
      }

      if (ticket.closeReason) {
        transcript += `- **Close Reason:** ${ticket.closeReason}
`
      }

      if (ticket.category) {
        transcript += `- **Category:** ${ticket.category}
`
      }

      if (ticket.priority) {
        transcript += `- **Priority:** ${getFormattedPriority(ticket.priority)}
`
      }

      if (ticket.assignedTo) {
        try {
          const assignedToUser = await client.users.fetch(ticket.assignedTo)
          transcript += `- **Assigned To:** ${assignedToUser.tag} (${ticket.assignedTo})
`
        } catch (error) {
          transcript += `- **Assigned To:** Unknown (${ticket.assignedTo})
`
        }
      }

      if (ticket.tags && ticket.tags.length > 0) {
        transcript += `- **Tags:** ${ticket.tags.join(", ")}
`
      }

      transcript += `
## Messages

`

      // Process each message
      for (const message of messages) {
        const timestamp = new Date(message.createdTimestamp).toLocaleString()

        // Handle embeds (most user/staff messages are in embeds)
        if (message.embeds && message.embeds.length > 0) {
          for (const embed of message.embeds) {
            if (embed.author) {
              const authorName = embed.author.name
              const isStaff = authorName.includes("Staff") || authorName.includes("Staff Note")
              const content = embed.description || "*No content*"

              transcript += `### ${authorName} - ${timestamp}

`
              transcript += `${content}

`

              // Include attachments if any
              if (embed.fields && embed.fields.some((f) => f.name === "📎 Attachments" || f.name === "Attachments")) {
                const attachmentField = embed.fields.find(
                  (f) => f.name === "📎 Attachments" || f.name === "Attachments",
                )
                transcript += `**Attachments:**
${attachmentField.value}

`
              }
            }
          }
        } else if (!message.author.bot) {
          // Handle regular messages from users (not bot)
          transcript += `### ${message.author.tag} - ${timestamp}

`
          transcript += `${message.content || "*No content*"}

`

          // Include attachments if any
          if (message.attachments.size > 0) {
            transcript += `**Attachments:**
`
            message.attachments.forEach((attachment) => {
              transcript += `- ${attachment.url}
`
            })
            transcript += `
`
          }
        } else if (message.author.bot && message.content && message.content.includes("Ticket closed")) {
          // Capture ticket closure message from bot
          transcript += `### System Message - ${timestamp}

`
          transcript += `${message.content}

`
        }
      }

      transcript += `
## End of Transcript
`
      transcript += `Generated: ${new Date().toLocaleString()}
`

      // Save transcript to file
      const fileName = `ticket-${ticket.numericId}-${Date.now()}.md`
      const filePath = path.join(this.transcriptsDir, fileName)
      fs.writeFileSync(filePath, transcript)

      return {
        fileName,
        filePath,
        content: transcript,
      }
    } catch (error) {
      console.error("Error generating transcript:", error)
      throw error
    }
  }

  /**
   * Send a transcript to the logs channel
   * @param {Object} transcript - Transcript information
   * @param {Object} ticket - The ticket object
   * @param {Object} guild - The Discord guild
   * @param {string} logChannelId - ID of the logs channel
   * @returns {Promise<Object>} - The sent message
   */
  async sendTranscript(transcript, ticket, guild, logChannelId) {
    try {
      const logChannel = await guild.channels.fetch(logChannelId)
      if (!logChannel) {
        throw new Error(`Log channel ${logChannelId} not found`)
      }

      // Create a summary embed
      const summaryEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📝 Ticket Transcript - #${ticket.numericId}`)
        .setDescription(`A ticket has been closed and a transcript has been generated.`)
        .addFields([
          { name: "👤 User", value: ticket.userTag || `<@${ticket.userId}>`, inline: true },
          { name: "🎫 Ticket ID", value: ticket.numericId, inline: true },
          { name: "⏰ Created", value: new Date(ticket.createdAt).toLocaleString(), inline: true },
          { name: "🔒 Closed", value: new Date(ticket.closedAt || Date.now()).toLocaleString(), inline: true },
          {
            name: "🔒 Closed By",
            value: ticket.closedBy ? `<@${ticket.closedBy}>` : "Unknown",
            inline: true,
          },
        ])
        .setTimestamp()

      // Add priority if available
      if (ticket.priority) {
        summaryEmbed.addFields([{ name: "🚨 Priority", value: getFormattedPriority(ticket.priority), inline: true }])
      }

      // Add category if available
      if (ticket.category) {
        summaryEmbed.addFields([{ name: "📂 Category", value: ticket.category, inline: true }])
      }

      // Add close reason if available
      if (ticket.closeReason) {
        summaryEmbed.addFields([{ name: "📝 Close Reason", value: ticket.closeReason }])
      }

      // Add message count statistics
      if (ticket.messageCount) {
        summaryEmbed.addFields([
          {
            name: "📊 Message Statistics",
            value: `Total: ${ticket.messageCount}\nUser: ${ticket.userMessageCount || 0}\nStaff: ${ticket.staffMessageCount || 0}`,
            inline: true,
          },
        ])
      }

      // Create attachment
      const attachment = new AttachmentBuilder(transcript.filePath, { name: transcript.fileName })

      // Send to log channel
      return await logChannel.send({
        content: `🔒 Ticket #${ticket.numericId} has been closed. Transcript is attached.`,
        embeds: [summaryEmbed],
        files: [attachment],
      })
    } catch (error) {
      console.error("Error sending transcript:", error)
      throw error
    }
  }

  /**
   * Generate HTML transcript (more visually appealing)
   * @param {Object} ticket - The ticket object
   * @param {Array} messages - Array of messages in the ticket
   * @param {Object} client - Discord client
   * @returns {Promise<Object>} - Transcript file information
   */
  async generateHtmlTranscript(ticket, messages, client) {
    try {
      // Sort messages by timestamp (oldest first)
      messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp)

      // Generate HTML header
      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticket.numericId} Transcript</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    .ticket-info {
      background-color: #f5f5f5;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .message {
      margin-bottom: 15px;
      padding: 10px;
      border-radius: 5px;
    }
    .user-message {
      background-color: #e3f2fd;
      border-left: 4px solid #2196F3;
    }
    .staff-message {
      background-color: #e8f5e9;
      border-left: 4px solid #4CAF50;
    }
    .staff-note {
      background-color: #fff3e0;
      border-left: 4px solid #FF9800;
    }
    .system-message {
      background-color: #f3e5f5;
      border-left: 4px solid #9c27b0;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
      font-weight: bold;
    }
    .message-content {
      white-space: pre-wrap;
    }
    .attachments {
      margin-top: 10px;
      font-style: italic;
    }
    .attachments a {
      display: block;
      color: #2196F3;
    }
    .timestamp {
      color: #757575;
      font-size: 0.9em;
    }
    h1, h2 {
      color: #444;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 0.9em;
      color: #757575;
    }
  </style>
</head>
<body>
  <h1>Modmail Ticket Transcript</h1>
  
  <div class="ticket-info">
    <h2>Ticket Information</h2>
    <p><strong>Ticket ID:</strong> ${ticket.numericId}</p>
    <p><strong>User:</strong> ${ticket.userTag} (${ticket.userId})</p>
    <p><strong>Created:</strong> ${new Date(ticket.createdAt).toLocaleString()}</p>`

      if (ticket.closedAt) {
        html += `    <p><strong>Closed:</strong> ${new Date(ticket.closedAt).toLocaleString()}</p>`
      }

      if (ticket.closedBy) {
        try {
          const closedByUser = await client.users.fetch(ticket.closedBy)
          html += `    <p><strong>Closed By:</strong> ${closedByUser.tag} (${ticket.closedBy})</p>`
        } catch (error) {
          html += `    <p><strong>Closed By:</strong> Unknown (${ticket.closedBy})</p>`
        }
      }

      if (ticket.closeReason) {
        html += `    <p><strong>Close Reason:</strong> ${ticket.closeReason}</p>`
      }

      if (ticket.category) {
        html += `    <p><strong>Category:</strong> ${ticket.category}</p>`
      }

      if (ticket.priority) {
        html += `    <p><strong>Priority:</strong> ${getFormattedPriority(ticket.priority)}</p>`
      }

      if (ticket.assignedTo) {
        try {
          const assignedToUser = await client.users.fetch(ticket.assignedTo)
          html += `    <p><strong>Assigned To:</strong> ${assignedToUser.tag} (${ticket.assignedTo})</p>`
        } catch (error) {
          html += `    <p><strong>Assigned To:</strong> Unknown (${ticket.assignedTo})</p>`
        }
      }

      if (ticket.tags && ticket.tags.length > 0) {
        html += `    <p><strong>Tags:</strong> ${ticket.tags.join(", ")}</p>`
      }

      html += `  </div>
  
  <h2>Messages</h2>`

      // Process each message
      for (const message of messages) {
        const timestamp = new Date(message.createdTimestamp).toLocaleString()

        // Handle embeds (most user/staff messages are in embeds)
        if (message.embeds && message.embeds.length > 0) {
          for (const embed of message.embeds) {
            if (embed.author) {
              const authorName = embed.author.name
              const isStaff = authorName.includes("Staff")
              const isStaffNote = authorName.includes("Staff Note")
              const content = embed.description || "<em>No content</em>"

              const messageClass = isStaffNote ? "staff-note" : isStaff ? "staff-message" : "user-message"

              html += `
  <div class="message ${messageClass}">
    <div class="message-header">
      <span>${this.escapeHtml(authorName)}</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="message-content">${this.escapeHtml(content)}</div>`

              // Include attachments if any
              if (embed.fields && embed.fields.some((f) => f.name === "📎 Attachments" || f.name === "Attachments")) {
                const attachmentField = embed.fields.find(
                  (f) => f.name === "📎 Attachments" || f.name === "Attachments",
                )
                html += `
    <div class="attachments">
      <strong>Attachments:</strong>`

                const attachmentUrls = attachmentField.value.split("\n")
                for (const url of attachmentUrls) {
                  html += `
      <a href="${url}" target="_blank">${url}</a>`
                }

                html += `
    </div>`
              }

              html += `
  </div>`
            }
          }
        } else if (!message.author.bot) {
          // Handle regular messages from users (not bot)
          html += `
  <div class="message user-message">
    <div class="message-header">
      <span>${this.escapeHtml(message.author.tag)}</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="message-content">${this.escapeHtml(message.content || "<em>No content</em>")}</div>`

          // Include attachments if any
          if (message.attachments.size > 0) {
            html += `
    <div class="attachments">
      <strong>Attachments:</strong>`

            message.attachments.forEach((attachment) => {
              html += `
      <a href="${attachment.url}" target="_blank">${attachment.url}</a>`
            })

            html += `
    </div>`
          }

          html += `
  </div>`
        } else if (message.author.bot && message.content && message.content.includes("Ticket closed")) {
          // Capture ticket closure message from bot
          html += `
  <div class="message system-message">
    <div class="message-header">
      <span>System Message</span>
      <span class="timestamp">${timestamp}</span>
    </div>
    <div class="message-content">${this.escapeHtml(message.content)}</div>
  </div>`
        }
      }

      // Add footer
      html += `
  <div class="footer">
    <p>End of Transcript</p>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>`

      // Save transcript to file
      const fileName = `ticket-${ticket.numericId}-${Date.now()}.html`
      const filePath = path.join(this.transcriptsDir, fileName)
      fs.writeFileSync(filePath, html)

      return {
        fileName,
        filePath,
        content: html,
      }
    } catch (error) {
      console.error("Error generating HTML transcript:", error)
      throw error
    }
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    if (!text) return ""
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br>")
  }
}

module.exports = new TranscriptManager()
