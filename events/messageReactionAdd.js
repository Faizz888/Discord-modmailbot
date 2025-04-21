const { EmbedBuilder } = require("discord.js")

module.exports = {
  name: "messageReactionAdd",
  async execute(reaction, user) {
    // Get the client from the reaction's client property
    const client = reaction.client

    try {
      // Ignore bot reactions
      if (user.bot) return

      // Make sure the reaction is fully fetched
      if (reaction.partial) {
        try {
          await reaction.fetch()
        } catch (error) {
          console.error("Error fetching reaction:", error)
          return
        }
      }

      // Check if this is a ✅ reaction on a ticket info message
      if (reaction.emoji.name === "✅") {
        const message = reaction.message

        // Make sure the message is in a guild
        if (!message.guild) return

        // Check if client.tickets exists
        if (!client || !client.tickets) {
          console.error("client.tickets is undefined in messageReactionAdd")
          return
        }

        // Find the ticket associated with this message
        let ticket = null
        try {
          // First try to find by threadInfoMessageId (for thread messages)
          ticket = Array.from(client.tickets.values()).find(
            (t) => t.guildId === message.guild.id && t.threadInfoMessageId === message.id && t.status === "pending",
          )

          // If not found, try to find by infoMessageId (for main channel messages)
          if (!ticket) {
            ticket = Array.from(client.tickets.values()).find(
              (t) => t.guildId === message.guild.id && t.infoMessageId === message.id && t.status === "pending",
            )
          }

          // If still not found, try to find by threadId
          if (!ticket && message.channel.isThread()) {
            ticket = Array.from(client.tickets.values()).find(
              (t) => t.guildId === message.guild.id && t.threadId === message.channel.id && t.status === "pending",
            )
          }
        } catch (error) {
          console.error("Error finding ticket:", error)
          return
        }

        if (!ticket) {
          console.log("No pending ticket found for this message")
          return
        }

        // Get the guild configuration
        const config = client.configs.get(message.guild.id)
        if (!config) return

        // Check if the user has the staff role
        const member = await message.guild.members.fetch(user.id)
        if (!member.roles.cache.has(config.staffRoleId)) {
          // Remove the reaction if the user doesn't have the staff role
          await reaction.users.remove(user.id)
          return
        }

        try {
          console.log(`Claiming ticket ${ticket.id}. Current status: ${ticket.status}`)

          // Update the ticket status
          ticket.status = "in_progress"
          ticket.assignedTo = user.id
          ticket.assignedAt = new Date()

          // Record first response time for analytics
          ticket.firstResponseTime = new Date().toISOString()

          // Save the updated ticket
          client.tickets.set(ticket.id, ticket)

          console.log(`Ticket ${ticket.id} updated. New status: ${ticket.status}`)

          // Remove all reactions from the message
          await message.reactions.removeAll()

          // Update the info message in the main channel
          const mainChannel = await message.guild.channels.fetch(ticket.channelId)
          const infoMessage = await mainChannel.messages.fetch(ticket.infoMessageId)
          const embed = EmbedBuilder.from(infoMessage.embeds[0])

          // Find and update the status field
          const statusFieldIndex = embed.data.fields.findIndex(
            (field) => field.name === "Status" || field.name === "📝 Status",
          )
          if (statusFieldIndex !== -1) {
            embed.data.fields[statusFieldIndex] = {
              name: "📝 Status",
              value: "🟢 In Progress",
              inline: true,
            }
          }

          // Check if there's already an assigned staff field
          const assignedFieldIndex = embed.data.fields.findIndex(
            (field) => field.name === "👨‍💼 Assigned To" || field.name === "Assigned To",
          )

          if (assignedFieldIndex !== -1) {
            // Update existing field
            embed.data.fields[assignedFieldIndex] = {
              name: "👨‍💼 Assigned To",
              value: `<@${user.id}>`,
              inline: true,
            }
          } else {
            // Add new field
            embed.addFields([
              {
                name: "👨‍💼 Assigned To",
                value: `<@${user.id}>`,
                inline: true,
              },
            ])
          }

          await infoMessage.edit({ embeds: [embed] })

          // If using threads, update the thread info message too
          if (config.useThreads && ticket.threadId && ticket.threadInfoMessageId) {
            try {
              const thread = await message.guild.channels.fetch(ticket.threadId)
              if (thread) {
                // Get the thread info message
                const threadInfoMessage = await thread.messages.fetch(ticket.threadInfoMessageId)

                if (threadInfoMessage) {
                  // Update the thread info message with the same embed
                  await threadInfoMessage.edit({ embeds: [embed] })
                  console.log("Updated thread info message")
                } else {
                  console.log("Could not find thread info message")
                  // If we can't find the info message, send a new status update
                  await thread.send({
                    embeds: [
                      new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle("🎫 Ticket Status Update")
                        .setDescription(`This ticket has been claimed by <@${user.id}> and is now in progress.`)
                        .setTimestamp(),
                    ],
                  })
                }

                // Add the staff member to the thread
                await thread.members.add(user.id)
              }
            } catch (error) {
              console.error("Error updating thread:", error)
            }
          }

          // Notify the user that their ticket has been claimed
          const ticketUser = await client.users.fetch(ticket.userId)
          const userEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("🎫 Ticket Update")
            .setDescription(`Your ticket (ID: ${ticket.numericId}) has been assigned to a staff member.`)
            .addFields([
              { name: "📝 Status", value: "🟢 In Progress", inline: true },
              { name: "👨‍💼 Staff Member", value: member.displayName || user.username, inline: true },
            ])
            .setFooter({ text: "A staff member will assist you shortly" })
            .setTimestamp()

          await ticketUser.send({ embeds: [userEmbed] })

          // Log the assignment
          const logChannel = message.guild.channels.cache.get(config.logChannelId)
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("✅ Ticket Assigned")
              .setDescription(
                `Ticket #${ticket.numericId} has been assigned to ${member.displayName || user.username} (${user.id})`,
              )
              .addFields([
                { name: "👤 User", value: `<@${ticket.userId}>`, inline: true },
                { name: "⏰ Assigned At", value: new Date().toLocaleString(), inline: true },
              ])
              .setTimestamp()

            await logChannel.send({ embeds: [logEmbed] })
          }

          // Send a notification in the appropriate channel
          if (config.useThreads && ticket.threadId) {
            const thread = await message.guild.channels.fetch(ticket.threadId)
            await thread.send({
              content: `✅ <@${user.id}> has claimed ticket #${ticket.numericId} from <@${ticket.userId}>.`,
            })
          } else {
            const modmailChannel = message.guild.channels.cache.get(config.modmailChannelId)
            await modmailChannel.send({
              content: `✅ <@${user.id}> has claimed ticket #${ticket.numericId} from <@${ticket.userId}>.`,
            })
          }

          // Send webhook notification if configured
          if (config.webhookUrl) {
            try {
              const webhookData = {
                embeds: [
                  {
                    title: "✅ Ticket Assigned",
                    description: `Ticket #${ticket.numericId} has been assigned to ${member.displayName || user.username}`,
                    color: 0x00ff00,
                    fields: [
                      { name: "🎫 Ticket ID", value: ticket.numericId, inline: true },
                      { name: "👤 User", value: ticketUser.tag, inline: true },
                      { name: "👨‍💼 Staff", value: member.displayName || user.username, inline: true },
                      { name: "⏰ Assigned At", value: new Date().toLocaleString(), inline: true },
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
              }).catch((error) => console.error("Error sending webhook:", error))
            } catch (error) {
              console.error("Error preparing webhook:", error)
            }
          }
        } catch (error) {
          console.error("Error assigning ticket:", error)
        }
      }
    } catch (error) {
      console.error("Error in messageReactionAdd event:", error)
    }
  },
}
