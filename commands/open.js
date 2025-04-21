const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")
const security = require("../utils/security")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("open")
    .setDescription("Open a new modmail conversation with a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to start a conversation with").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("message").setDescription("Initial message to send to the user").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("The category for this ticket")
        .setRequired(false)
        .addChoices(
          { name: "General Help", value: "general" },
          { name: "Technical Support", value: "tech" },
          { name: "Report User", value: "report" },
          { name: "Appeal", value: "appeal" },
          { name: "Feedback", value: "feedback" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("priority")
        .setDescription("The priority level of this ticket")
        .setRequired(false)
        .addChoices(
          { name: "Low", value: "low" },
          { name: "Medium", value: "medium" },
          { name: "High", value: "high" },
          { name: "Urgent", value: "urgent" },
        ),
    ),

  async execute(interaction, client) {
    try {
      // Check if the modmail system is set up
      const config = client.configs.get(interaction.guild.id)
      if (!config) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Setup Required")
              .setDescription("Modmail system is not set up in this server. Please use `/setup` first.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Check if the user has the staff role
      const member = await interaction.guild.members.fetch(interaction.user.id)
      if (!member.roles.cache.has(config.staffRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Permission Denied")
              .setDescription("You do not have permission to use this command.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Get command options
      const targetUser = interaction.options.getUser("user")
      const initialMessage = interaction.options.getString("message")
      const category = interaction.options.getString("category")
      const priority = interaction.options.getString("priority") || "medium"

      // Check if user is a bot
      if (targetUser.bot) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Invalid User")
              .setDescription("You cannot start a conversation with a bot.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Check if there's already an active ticket for this user
      const existingTicket = Array.from(client.tickets.values()).find(
        (ticket) => ticket.userId === targetUser.id && ticket.status !== "closed",
      )

      if (existingTicket) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Ticket Already Exists")
              .setDescription(`There is already an active ticket for ${targetUser.tag}.`)
              .addFields([
                { name: "Ticket ID", value: existingTicket.numericId, inline: true },
                { name: "Status", value: existingTicket.status, inline: true },
                {
                  name: "Location",
                  value: existingTicket.threadId ? `<#${existingTicket.threadId}>` : `<#${existingTicket.channelId}>`,
                  inline: true,
                },
              ])
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Defer the reply as this might take some time
      await interaction.deferReply({ ephemeral: true })

      // Get the modmail channel
      const modmailChannel = await interaction.guild.channels.fetch(config.modmailChannelId)
      if (!modmailChannel) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Channel Not Found")
              .setDescription("The configured modmail channel could not be found.")
              .setTimestamp(),
          ],
        })
      }

      // Create ticket ID
      const numericId = ticketHistory.getNextTicketId(interaction.guild.id)
      const ticketId = `${interaction.guild.id}-${numericId}`

      // Create user info embed
      const userInfoEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`Staff-Initiated Ticket - #${numericId}`)
        .setAuthor({
          name: `${targetUser.tag} (${targetUser.id})`,
          iconURL: targetUser.displayAvatarURL(),
        })
        .setDescription("A staff member has initiated a conversation with this user.")
        .addFields([
          { name: "User", value: `<@${targetUser.id}>`, inline: true },
          { name: "Status", value: "🟢 In Progress", inline: true },
          { name: "Created", value: new Date().toLocaleString(), inline: true },
          { name: "Initiated By", value: `<@${interaction.user.id}>`, inline: true },
        ])
        .setTimestamp()

      // Add category and priority if provided
      if (category) {
        userInfoEmbed.addFields([
          {
            name: "Category",
            value: getCategoryEmoji(category) + " " + getCategoryName(category),
            inline: true,
          },
        ])
      }

      userInfoEmbed.addFields([
        {
          name: "Priority",
          value: getPriorityEmoji(priority) + " " + getPriorityName(priority),
          inline: true,
        },
      ])

      // Add user information
      try {
        const guildMember = await interaction.guild.members.fetch(targetUser.id)
        if (guildMember) {
          // Add join date
          userInfoEmbed.addFields([
            {
              name: "Joined Server",
              value: guildMember.joinedAt.toLocaleString(),
              inline: true,
            },
          ])

          // Add account creation date
          userInfoEmbed.addFields([
            {
              name: "Account Created",
              value: targetUser.createdAt.toLocaleString(),
              inline: true,
            },
          ])

          // Add roles
          const roles = guildMember.roles.cache
            .filter((r) => r.id !== interaction.guild.id) // Filter out @everyone role
            .sort((a, b) => b.position - a.position) // Sort by position
            .map((r) => r.toString())
            .join(", ")

          if (roles) {
            userInfoEmbed.addFields([
              {
                name: "Roles",
                value: roles.length > 1024 ? roles.substring(0, 1021) + "..." : roles,
                inline: false,
              },
            ])
          }
        }
      } catch (error) {
        client.errorLogger.logWarning("Open Command", "Could not fetch member information", {
          userId: targetUser.id,
          error: error.message,
        })
        // Continue without member information
      }

      // Create a thread for this ticket if using thread-based tickets
      let thread = null
      let infoMessage = null

      if (config.useThreads) {
        // Send user info to modmail channel first
        infoMessage = await modmailChannel.send({ embeds: [userInfoEmbed] })

        // Create a thread
        thread = await modmailChannel.threads.create({
          name: `Ticket-${numericId}-${targetUser.username}`,
          autoArchiveDuration: 10080, // 7 days
          reason: `Modmail ticket ${numericId} for ${targetUser.tag}`,
        })

        // Send the info message in the thread too
        await thread.send({ embeds: [userInfoEmbed] })
      } else {
        // Legacy channel-based system
        infoMessage = await modmailChannel.send({ embeds: [userInfoEmbed] })
      }

      // Sanitize staff message
      const sanitizedContent = security.sanitizeInput(initialMessage)

      // Create the initial message embed
      const staffMessageEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setAuthor({
          name: `${interaction.user.tag} (Staff)`,
          iconURL: interaction.user.displayAvatarURL(),
        })
        .setDescription(sanitizedContent)
        .setFooter({
          text: `Ticket #${numericId}`,
        })
        .setTimestamp()

      // Send the message to the appropriate place
      if (thread) {
        await thread.send({ embeds: [staffMessageEmbed] })
      } else {
        await modmailChannel.send({ embeds: [staffMessageEmbed] })
      }

      // Send the message to the user
      try {
        await targetUser.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x0099ff)
              .setTitle(`New Message from ${interaction.guild.name} Staff`)
              .setDescription(sanitizedContent)
              .setFooter({
                text: `Reply to this message to respond to the staff team.`,
              })
              .setTimestamp(),
          ],
        })
      } catch (error) {
        // Handle the case where the user has DMs closed
        client.errorLogger.logWarning("Open Command", "Could not send DM to user", {
          userId: targetUser.id,
          error: error.message,
        })

        if (thread) {
          await thread.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Message Not Delivered")
                .setDescription(`Could not send message to ${targetUser.tag}. They may have DMs disabled.`)
                .setTimestamp(),
            ],
          })
        } else {
          await modmailChannel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Message Not Delivered")
                .setDescription(`Could not send message to ${targetUser.tag}. They may have DMs disabled.`)
                .setTimestamp(),
            ],
          })
        }

        // Still create the ticket, but mark it as having delivery issues
        await infoMessage.edit({
          embeds: [
            userInfoEmbed.addFields([
              {
                name: "⚠️ Warning",
                value: "Initial message could not be delivered. User may have DMs disabled.",
                inline: false,
              },
            ]),
          ],
        })
      }

      // Store ticket information
      const ticket = {
        id: ticketId,
        numericId: numericId,
        userId: targetUser.id,
        userTag: targetUser.tag,
        guildId: interaction.guild.id,
        channelId: modmailChannel.id,
        threadId: thread ? thread.id : null,
        status: "in_progress",
        createdAt: new Date(),
        infoMessageId: infoMessage.id,
        category: category || null,
        priority: priority,
        assignedTo: interaction.user.id,
        assignedAt: new Date(),
        firstResponseTime: new Date().toISOString(),
        initiatedBy: interaction.user.id,
      }

      client.tickets.set(ticketId, ticket)

      // Log ticket creation
      const logChannel = interaction.guild.channels.cache.get(config.logChannelId)
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Staff-Initiated Ticket Created")
          .setDescription(
            `A new ticket has been created for ${targetUser.tag} (${targetUser.id}) by ${member.displayName || interaction.user.username}`,
          )
          .addFields([
            { name: "Ticket ID", value: numericId },
            { name: "Initial Message", value: sanitizedContent.substring(0, 1024) },
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
                title: "Staff-Initiated Ticket Created",
                description: `A new ticket has been created for ${targetUser.tag} by ${member.displayName || interaction.user.username}`,
                color: 0x00ff00,
                fields: [
                  { name: "Ticket ID", value: numericId, inline: true },
                  { name: "User", value: targetUser.tag, inline: true },
                  { name: "👨‍💼 Staff", value: member.displayName || interaction.user.username, inline: true },
                  { name: "Initial Message", value: sanitizedContent.substring(0, 1024) },
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
          client.errorLogger.logError("Webhook Notification", error, { ticketId })
        }
      }

      // Reply to the interaction
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("Ticket Created")
            .setDescription(`Successfully created a new ticket for ${targetUser.tag}.`)
            .addFields([
              { name: "Ticket ID", value: numericId, inline: true },
              {
                name: "Location",
                value: thread ? `<#${thread.id}>` : `<#${modmailChannel.id}>`,
                inline: true,
              },
            ])
            .setTimestamp(),
        ],
      })
    } catch (error) {
      // Log the error without sensitive information
      client.errorLogger.logError("Open Command", error, {
        command: "open",
        user: interaction.user.tag,
        guild: interaction.guild.name,
      })

      // Send a sanitized error message
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Error")
            .setDescription("An error occurred while creating the ticket. Please try again later.")
            .setTimestamp(),
        ],
      })
    }
  },
}

// Helper functions
function getCategoryEmoji(category) {
  const emojis = {
    general: "❓",
    tech: "🔧",
    report: "🚨",
    appeal: "⚖️",
    feedback: "💬",
  }
  return emojis[category] || "📝"
}

function getCategoryName(category) {
  const names = {
    general: "General Help",
    tech: "Technical Support",
    report: "Report User",
    appeal: "Appeal",
    feedback: "Feedback",
  }
  return names[category] || "Unknown"
}

function getPriorityEmoji(priority) {
  const emojis = {
    low: "🟢",
    medium: "🟡",
    high: "🟠",
    urgent: "🔴",
  }
  return emojis[priority] || "⚪"
}

function getPriorityName(priority) {
  const names = {
    low: "Low",
    medium: "Medium",
    high: "High",
    urgent: "Urgent",
  }
  return names[priority] || "Unknown"
}
