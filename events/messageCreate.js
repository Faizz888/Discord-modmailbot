const { EmbedBuilder, InteractionResponseFlags } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")
const security = require("../utils/security")
const fs = require("fs")
const path = require("path")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  name: "messageCreate",
  async execute(message) {
    // Get the client from the message's client property
    const client = message.client

    try {
      // Check if client.tickets exists
      if (!client || !client.tickets) {
        console.error("client.tickets is undefined in messageCreate")
        return
      }

      // Ignore bot messages
      if (message.author.bot) return

      // Handle DM messages (creating tickets)
      if (message.channel.type === 1) {
        // DM channel type is 1 in Discord.js v14
        try {
          // Check if user is blacklisted
          const blacklistPath = path.join(__dirname, "../blacklist.json")
          if (fs.existsSync(blacklistPath)) {
            try {
              const blacklistFile = fs.readFileSync(blacklistPath)
              const blacklist = JSON.parse(blacklistFile)

              // Check all guild blacklists
              for (const guildId in blacklist) {
                if (blacklist[guildId][message.author.id]) {
                  const blacklistData = blacklist[guildId][message.author.id]
                  return message.reply({
                    embeds: [
                      new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle("⛔ Access Denied")
                        .setDescription(`You have been blacklisted from using the modmail system.`)
                        .addFields([{ name: "📝 Reason", value: blacklistData.reason }])
                        .setTimestamp(),
                    ],
                  })
                }
              }
            } catch (error) {
              console.error("Error checking blacklist:", error)
              // Continue without blacklist check if there's an error
            }
          }

          // Check if user already has an active ticket
          const existingTicket = Array.from(client.tickets.values()).find(
            (ticket) => ticket.userId === message.author.id && ticket.status !== "closed",
          )

          if (existingTicket) {
            // Apply rate limiting for messages
            const rateLimit = security.checkRateLimit(message.author.id, "messages")
            if (rateLimit.limited) {
              console.log("Rate limit exceeded for user:", message.author.id)

              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle("⏱️ Rate Limit Exceeded")
                    .setDescription(
                      `You are sending messages too quickly. Please wait before sending more messages. (${rateLimit.count}/${rateLimit.limit} messages)`,
                    )
                    .setTimestamp(),
                ],
              })
            }

            // Forward message to the existing ticket thread
            const guild = client.guilds.cache.get(existingTicket.guildId)
            if (!guild) return

            // Get the config for this guild
            const config = client.configs.get(existingTicket.guildId)
            if (!config) return

            // Check if using threads
            if (config.useThreads && existingTicket.threadId) {
              const thread = await guild.channels.fetch(existingTicket.threadId)
              if (!thread) return

              // Sanitize user input
              const sanitizedContent = security.sanitizeInput(message.content)

              const userEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setAuthor({
                  name: `${message.author.tag} (${message.author.id})`,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setDescription(sanitizedContent || "*No message content*")
                .setTimestamp()

              // Handle attachments
              if (message.attachments.size > 0) {
                userEmbed.addFields([
                  {
                    name: "📎 Attachments",
                    value: message.attachments.map((a) => a.url).join("\n"),
                  },
                ])
              }

              await thread.send({ embeds: [userEmbed] })
            } else {
              // Legacy channel-based system
              const channel = guild.channels.cache.get(existingTicket.channelId)
              if (!channel) return

              // Sanitize user input
              const sanitizedContent = security.sanitizeInput(message.content)

              const userEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setAuthor({
                  name: `${message.author.tag} (${message.author.id})`,
                  iconURL: message.author.displayAvatarURL(),
                })
                .setDescription(sanitizedContent || "*No message content*")
                .setTimestamp()

              // Handle attachments
              if (message.attachments.size > 0) {
                userEmbed.addFields([
                  {
                    name: "📎 Attachments",
                    value: message.attachments.map((a) => a.url).join("\n"),
                  },
                ])
              }

              await channel.send({ embeds: [userEmbed] })
            }

            // Confirm receipt to user
            // No longer adding reaction to confirm receipt
          } else {
            // Apply rate limiting for new tickets
            const rateLimit = security.checkRateLimit(message.author.id, "tickets")
            if (rateLimit.limited) {
              console.log("Ticket rate limit exceeded for user:", message.author.id)

              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle("⏱️ Rate Limit Exceeded")
                    .setDescription(
                      `You have created too many tickets recently. Please wait before creating a new ticket. (${rateLimit.count}/${rateLimit.limit} tickets)`,
                    )
                    .setTimestamp(),
                ],
              })
            }

            // Create a new ticket
            // Find a guild where the bot is configured
            const guildId = Array.from(client.configs.keys())[0] // Just use the first configured guild
            if (!guildId) {
              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle("⚙️ Configuration Error")
                    .setDescription("I'm not configured in any server yet. Please ask an administrator to set me up.")
                    .setTimestamp(),
                ],
              })
            }

            const config = client.configs.get(guildId)
            const guild = client.guilds.cache.get(guildId)

            if (!guild) {
              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle("⚙️ Configuration Error")
                    .setDescription("I couldn't find the server. Please contact the server administrator.")
                    .setTimestamp(),
                ],
              })
            }

            const modmailChannel = guild.channels.cache.get(config.modmailChannelId)

            if (!modmailChannel) {
              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle("⚙️ Configuration Error")
                    .setDescription(
                      "The modmail channel is not properly configured. Please contact the server administrator.",
                    )
                    .setTimestamp(),
                ],
              })
            }

            // Create ticket ID (UUID for compatibility + numeric ID for display)
            const numericId = ticketHistory.getNextTicketId(guildId)
            const ticketId = `${guildId}-${numericId}`

            // Create user info embed
            const userInfoEmbed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle(`📩 New Modmail Ticket - #${numericId}`)
              .setAuthor({
                name: `${message.author.tag} (${message.author.id})`,
                iconURL: message.author.displayAvatarURL(),
              })
              .setDescription("A new modmail ticket has been created.")
              .addFields([
                { name: "👤 User", value: `<@${message.author.id}>`, inline: true },
                { name: "📝 Status", value: "🔶 Pending", inline: true },
                { name: "⏰ Created", value: new Date().toLocaleString(), inline: true },
                { name: "Priority", value: getFormattedPriority("medium"), inline: true },
              ])
              .setTimestamp()

            // Add user information
            try {
              const guildMember = await guild.members.fetch(message.author.id)
              if (guildMember) {
                // Add join date
                userInfoEmbed.addFields([
                  {
                    name: "📅 Joined Server",
                    value: guildMember.joinedAt.toLocaleString(),
                    inline: true,
                  },
                ])

                // Add account creation date
                userInfoEmbed.addFields([
                  {
                    name: "🔰 Account Created",
                    value: message.author.createdAt.toLocaleString(),
                    inline: true,
                  },
                ])

                // Add roles
                const roles = guildMember.roles.cache
                  .filter((r) => r.id !== guild.id) // Filter out @everyone role
                  .sort((a, b) => b.position - a.position) // Sort by position
                  .map((r) => r.toString())
                  .join(", ")

                if (roles) {
                  userInfoEmbed.addFields([
                    {
                      name: "🏷️ Roles",
                      value: roles.length > 1024 ? roles.substring(0, 1021) + "..." : roles,
                      inline: false,
                    },
                  ])
                }
              }
            } catch (error) {
              console.error("Could not fetch member information:", error)
              // Continue without member information
            }

            // Create a thread for this ticket if using thread-based tickets
            let thread = null
            let infoMessage = null
            let threadInfoMessage = null

            if (config.useThreads) {
              // Send user info to modmail channel first (without reaction)
              infoMessage = await modmailChannel.send({ embeds: [userInfoEmbed] })

              // Create a thread
              thread = await modmailChannel.threads.create({
                name: `Ticket-${numericId}-${message.author.username}`,
                autoArchiveDuration: 10080, // 7 days
                reason: `Modmail ticket ${numericId} for ${message.author.tag}`,
              })

              // Send the info message in the thread and add reaction ONLY to thread message
              threadInfoMessage = await thread.send({ embeds: [userInfoEmbed] })
              await threadInfoMessage.react("✅") // Only add reaction to thread message
            } else {
              // Legacy channel-based system
              infoMessage = await modmailChannel.send({ embeds: [userInfoEmbed] })
              await infoMessage.react("✅") // Add reaction to main message in legacy mode
            }

            // Sanitize user input
            const sanitizedContent = security.sanitizeInput(message.content)

            // Send the user's message
            const userMessageEmbed = new EmbedBuilder()
              .setColor(0x0099ff)
              .setAuthor({
                name: `${message.author.tag} (${message.author.id})`,
                iconURL: message.author.displayAvatarURL(),
              })
              .setDescription(sanitizedContent || "*No message content*")
              .setTimestamp()

            // Handle attachments
            if (message.attachments.size > 0) {
              userMessageEmbed.addFields([
                {
                  name: "📎 Attachments",
                  value: message.attachments.map((a) => a.url).join("\n"),
                },
              ])
            }

            // Send the message to the appropriate place
            if (thread) {
              await thread.send({ embeds: [userMessageEmbed] })
            } else {
              await modmailChannel.send({ embeds: [userMessageEmbed] })
            }

            // Store ticket information
            const ticket = {
              id: ticketId,
              numericId: numericId,
              userId: message.author.id,
              userTag: message.author.tag,
              guildId: guild.id,
              channelId: modmailChannel.id,
              threadId: thread ? thread.id : null,
              status: "pending",
              createdAt: new Date(),
              infoMessageId: infoMessage.id,
              threadInfoMessageId: threadInfoMessage ? threadInfoMessage.id : null,
              priority: "medium", // Default priority
            }

            client.tickets.set(ticketId, ticket)

            // Send confirmation to user
            const confirmEmbed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setTitle("✅ Modmail Ticket Created")
              .setDescription("Your message has been received. Please wait for a staff member to review your ticket.")
              .addFields([
                { name: "🎫 Ticket ID", value: numericId },
                {
                  name: "📝 Note",
                  value: "You can continue to send messages here to add more information to your ticket.",
                },
              ])
              .setTimestamp()

            await message.reply({ embeds: [confirmEmbed] })

            // Log ticket creation
            const logChannel = guild.channels.cache.get(config.logChannelId)
            if (logChannel) {
              const logEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("📩 New Modmail Ticket")
                .setDescription(`A new ticket has been created by ${message.author.tag} (${message.author.id})`)
                .addFields([
                  { name: "🎫 Ticket ID", value: numericId },
                  {
                    name: "📝 Content",
                    value: sanitizedContent ? sanitizedContent.substring(0, 1024) : "*No message content*",
                  },
                ])
                .setTimestamp()

              await logChannel.send({ embeds: [logEmbed] })
            }

            // Send webhook notification if configured
            if (config.webhookUrl) {
              try {
                const webhookData = {
                  embeds: [
                    {
                      title: "📩 New Modmail Ticket Created",
                      description: `A new ticket has been created by ${message.author.tag}`,
                      color: 0x00ff00,
                      fields: [
                        { name: "🎫 Ticket ID", value: numericId, inline: true },
                        { name: "👤 User", value: message.author.tag, inline: true },
                        {
                          name: "📝 Content",
                          value: sanitizedContent ? sanitizedContent.substring(0, 1024) : "*No message content*",
                        },
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
                }).catch((error) => {
                  console.error("Error sending webhook notification:", error)
                })
              } catch (error) {
                console.error("Error preparing webhook notification:", error)
              }
            }
          }
        } catch (error) {
          console.error("Error handling DM:", error)

          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("❌ Error")
                .setDescription("An error occurred while processing your message. Please try again later.")
                .setTimestamp(),
            ],
          })
        }
      }

      // Handle messages in modmail channels (staff replies)
      else if (message.guild) {
        const config = client.configs.get(message.guild.id)
        if (!config) return

        // Check if this is a thread-based ticket
        let ticket = null
        let isThread = false

        if (
          message.channel.isThread() &&
          message.channel.parent &&
          message.channel.parent.id === config.modmailChannelId
        ) {
          // This is a thread in the modmail channel
          ticket = Array.from(client.tickets.values()).find(
            (t) => t.guildId === message.guild.id && t.threadId === message.channel.id && t.status !== "closed",
          )
          isThread = true
        } else if (message.channel.id === config.modmailChannelId) {
          // This is the modmail channel itself
          ticket = Array.from(client.tickets.values()).find(
            (t) => t.guildId === message.guild.id && t.channelId === message.channel.id && t.status !== "closed",
          )
        }

        if (!ticket) return

        // Check if the author has the staff role
        const member = message.member
        if (!member || !member.roles.cache.has(config.staffRoleId)) return

        // Check if this is a staff-only message (starts with #)
        if (message.content.startsWith("#")) {
          // This is a staff-only message, don't forward to the user
          const staffNoteEmbed = new EmbedBuilder()
            .setColor(0xffa500) // Orange color for staff notes
            .setAuthor({
              name: `${member.displayName || message.author.username} (Staff Note)`,
              iconURL: message.author.displayAvatarURL(),
            })
            .setDescription(message.content.substring(1)) // Remove the # prefix
            .setTimestamp()

          // Send the staff note
          await message.channel.send({ embeds: [staffNoteEmbed] })

          // Delete the original message to keep the channel clean
          try {
            await message.delete()
          } catch (error) {
            console.error("Could not delete original message:", error)
          }

          return
        }

        // Check if this is a reply to a ticket
        // We'll assume any message from staff in the modmail channel that doesn't start with a prefix is a reply
        if (message.content.startsWith("!") || message.content.startsWith("/")) return

        // Check if the ticket is in "pending" status and the staff member hasn't claimed it yet
        if (ticket.status === "pending") {
          console.log(`Ticket ${ticket.id} status is still pending. Current status: ${ticket.status}`)

          // Attempt to fix the ticket status if it's still pending but has an assignedTo field
          if (ticket.assignedTo) {
            console.log(`Ticket ${ticket.id} has assignedTo but status is still pending. Fixing...`)
            ticket.status = "in_progress"
            client.tickets.set(ticket.id, ticket)
            console.log(`Fixed ticket ${ticket.id} status to: ${ticket.status}`)
          } else {
            // Auto-claim the ticket for the staff member who is replying
            console.log(`Auto-claiming ticket ${ticket.id} for ${message.author.tag}`)
            ticket.status = "in_progress"
            ticket.assignedTo = message.author.id
            ticket.assignedAt = new Date()
            ticket.firstResponseTime = new Date().toISOString()
            client.tickets.set(ticket.id, ticket)

            // Update the info message
            try {
              const channel = await message.guild.channels.fetch(ticket.channelId)
              const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

              const embed = EmbedBuilder.from(infoMessage.embeds[0])
              const fields = [...embed.data.fields]

              // Update the status field
              const statusFieldIndex = fields.findIndex(
                (field) => field.name === "Status" || field.name === "📝 Status",
              )
              if (statusFieldIndex !== -1) {
                fields[statusFieldIndex] = {
                  name: "📝 Status",
                  value: "🟢 In Progress",
                  inline: true,
                }
              }

              // Add assigned staff field
              const assignedFieldIndex = fields.findIndex(
                (field) => field.name === "👨‍💼 Assigned To" || field.name === "Assigned To",
              )

              if (assignedFieldIndex !== -1) {
                fields[assignedFieldIndex] = {
                  name: "👨‍💼 Assigned To",
                  value: `<@${message.author.id}>`,
                  inline: true,
                }
              } else {
                fields.push({
                  name: "👨‍💼 Assigned To",
                  value: `<@${message.author.id}>`,
                  inline: true,
                })
              }

              embed.setFields(fields)
              await infoMessage.edit({ embeds: [embed] })

              // Also update the thread info message if it exists
              if (config.useThreads && ticket.threadId && ticket.threadInfoMessageId) {
                try {
                  const thread = await message.guild.channels.fetch(ticket.threadId)
                  const threadInfoMessage = await thread.messages.fetch(ticket.threadInfoMessageId)
                  await threadInfoMessage.edit({ embeds: [embed] })
                } catch (error) {
                  console.error("Error updating thread info message:", error)
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
                  { name: "👨‍💼 Staff Member", value: member.displayName || message.author.username, inline: true },
                ])
                .setFooter({ text: "A staff member will assist you shortly" })
                .setTimestamp()

              // Only send DM if this is a thread-based ticket and we're in a thread
              if (config.useThreads && isThread) {
                await ticketUser.send({ embeds: [userEmbed] })
              } else if (!config.useThreads) {
                // Legacy mode - still allow DMs from main channel
                await ticketUser.send({ embeds: [userEmbed] })
              }
            } catch (error) {
              console.error("Error updating ticket status:", error)
            }

            // Send a notification in the channel
            await message.channel.send({
              content: `✅ <@${message.author.id}> has automatically claimed this ticket by replying.`,
            })
          }
        }

        // Check if the staff member is the assigned staff member
        if (ticket.assignedTo && ticket.assignedTo !== message.author.id) {
          // Allow the message but add a note that they're not the assigned staff
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff9900)
                .setTitle("⚠️ Note")
                .setDescription(`This ticket is assigned to <@${ticket.assignedTo}>, but you're responding instead.`)
                .setTimestamp(),
            ],
          })
        }

        try {
          // Forward the message to the user ONLY if this is a thread-based ticket and we're in a thread
          // Or if we're in legacy mode (not using threads)
          if ((config.useThreads && isThread) || (!config.useThreads && !isThread)) {
            const user = await client.users.fetch(ticket.userId)

            // Sanitize staff message
            const sanitizedContent = security.sanitizeInput(message.content)

            // Use server nickname instead of global username
            const staffEmbed = new EmbedBuilder()
              .setColor(0x00ff00)
              .setAuthor({
                name: `${member.displayName || message.author.username} (Staff)`,
                iconURL: message.author.displayAvatarURL(),
              })
              .setDescription(sanitizedContent || "*No message content*")
              .setFooter({
                text: `Ticket #${ticket.numericId}`,
              })
              .setTimestamp()

            // Handle attachments
            if (message.attachments.size > 0) {
              staffEmbed.addFields([
                {
                  name: "📎 Attachments",
                  value: message.attachments.map((a) => a.url).join("\n"),
                },
              ])
            }

            await user.send({ embeds: [staffEmbed] })

            // Log the staff reply if webhook is configured
            if (config.webhookUrl) {
              try {
                const webhookData = {
                  embeds: [
                    {
                      title: "💬 Staff Reply Sent",
                      description: `A staff member has replied to ticket #${ticket.numericId}`,
                      color: 0x00ff00,
                      fields: [
                        { name: "🎫 Ticket ID", value: ticket.numericId, inline: true },
                        { name: "👨‍💼 Staff", value: member.displayName || message.author.username, inline: true },
                        { name: "👤 User", value: user.tag, inline: true },
                        {
                          name: "📝 Content",
                          value: sanitizedContent ? sanitizedContent.substring(0, 1024) : "*No message content*",
                        },
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
                }).catch((error) => {
                  console.error("Error sending webhook notification:", error)
                })
              } catch (error) {
                console.error("Error preparing webhook notification:", error)
              }
            }
          } else if (config.useThreads && !isThread) {
            // We're in the main channel but using thread mode - inform staff to use the thread
            await message.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("❌ Thread Required")
                  .setDescription(
                    "This server is configured to use threads for modmail tickets. Please send your reply in the ticket's thread instead of the main channel.",
                  )
                  .addFields([
                    {
                      name: "Ticket Thread",
                      value: ticket.threadId ? `<#${ticket.threadId}>` : "Thread not found",
                    },
                  ])
                  .setTimestamp(),
              ],
              ephemeral: true,
            })

            // Delete the message to keep the channel clean
            try {
              await message.delete()
            } catch (error) {
              console.error("Could not delete message:", error)
            }
          }
        } catch (error) {
          console.error("Error sending staff reply:", error)

          await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("❌ Error")
                .setDescription("An error occurred while sending your reply to the user.")
                .setTimestamp(),
            ],
            ephemeral: true,
          })
        }
      }
    } catch (error) {
      console.error("Error in message handler:", error)
    }
  },
}
