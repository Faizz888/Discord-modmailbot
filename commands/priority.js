const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")
const { getPriorityEmoji, getPriorityName, getPriorityColor, getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("priority")
    .setDescription("Set or update the priority of a ticket")
    .addStringOption((option) =>
      option
        .setName("level")
        .setDescription("The priority level to set")
        .setRequired(true)
        .addChoices(
          { name: "🟢 Low", value: "low" },
          { name: "🟡 Medium", value: "medium" },
          { name: "🟠 High", value: "high" },
          { name: "🔴 Urgent", value: "urgent" },
        ),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for setting this priority level").setRequired(false),
    ),

  async execute(interaction, client) {
    try {
      // Check if the command is used in a modmail channel
      const config = client.configs.get(interaction.guild.id)
      if (!config) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Setup Required")
              .setDescription("Modmail system is not set up in this server.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Check if the user has the staff role
      const member = await interaction.guild.members.fetch(interaction.user.id)
      if (!member.roles.cache.has(config.staffRoleId)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Permission Denied")
              .setDescription("You do not have permission to set ticket priorities.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Find the ticket associated with this channel
      let ticket = null
      let isThread = false

      if (
        interaction.channel.isThread() &&
        interaction.channel.parent &&
        interaction.channel.parent.id === config.modmailChannelId
      ) {
        // This is a thread in the modmail channel
        ticket = Array.from(client.tickets.values()).find(
          (t) => t.guildId === interaction.guild.id && t.threadId === interaction.channel.id && t.status !== "closed",
        )
        isThread = true
      } else if (interaction.channel.id === config.modmailChannelId) {
        // This is the modmail channel itself
        ticket = Array.from(client.tickets.values()).find(
          (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id && t.status !== "closed",
        )
      }

      if (!ticket) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Invalid Channel")
              .setDescription("This command can only be used in an active ticket channel or thread.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      const priority = interaction.options.getString("level")
      const reason = interaction.options.getString("reason") || "No reason provided"

      // Update the ticket
      const oldPriority = ticket.priority || "medium"
      ticket.priority = priority
      client.tickets.set(ticket.id, ticket)

      // Update the info message
      try {
        const channel = await interaction.guild.channels.fetch(ticket.channelId)
        const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

        const embed = EmbedBuilder.from(infoMessage.embeds[0])
        const fields = [...embed.data.fields]

        // Update or add priority field
        const priorityFieldIndex = fields.findIndex((field) => field.name === "Priority")
        if (priorityFieldIndex !== -1) {
          fields[priorityFieldIndex] = {
            name: "Priority",
            value: getFormattedPriority(priority),
            inline: true,
          }
        } else {
          fields.push({
            name: "Priority",
            value: getFormattedPriority(priority),
            inline: true,
          })
        }

        embed.setFields(fields)
        await infoMessage.edit({ embeds: [embed] })

        // If using threads, update the thread info message too
        if (isThread && ticket.threadInfoMessageId) {
          try {
            const thread = await interaction.guild.channels.fetch(ticket.threadId)
            if (thread) {
              // Get the thread info message
              const threadInfoMessage = await thread.messages.fetch(ticket.threadInfoMessageId)

              if (threadInfoMessage && threadInfoMessage.embeds.length > 0) {
                const threadEmbed = EmbedBuilder.from(threadInfoMessage.embeds[0])
                const threadFields = [...threadEmbed.data.fields]

                // Update or add priority field
                const threadPriorityFieldIndex = threadFields.findIndex((field) => field.name === "Priority")
                if (threadPriorityFieldIndex !== -1) {
                  threadFields[threadPriorityFieldIndex] = {
                    name: "Priority",
                    value: getFormattedPriority(priority),
                    inline: true,
                  }
                } else {
                  threadFields.push({
                    name: "Priority",
                    value: getFormattedPriority(priority),
                    inline: true,
                  })
                }

                threadEmbed.setFields(threadFields)
                await threadInfoMessage.edit({ embeds: [threadEmbed] })
              }
            }
          } catch (error) {
            client.errorLogger.logWarning("Priority Command", "Could not update thread info message", {
              ticketId: ticket.id,
              error: error.message,
            })
          }
        }
      } catch (error) {
        client.errorLogger.logError("Priority Command", error, { ticketId: ticket.id })
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Error")
              .setDescription("An error occurred while updating the ticket priority.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Log the priority change
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      const logEmbed = new EmbedBuilder()
        .setColor(getPriorityColor(priority))
        .setTitle(`${getPriorityEmoji(priority)} Ticket Priority Updated`)
        .setDescription(
          `Ticket #${ticket.numericId} priority has been updated by ${member.displayName || interaction.user.username}`,
        )
        .addFields([
          { name: "User", value: `<@${ticket.userId}>`, inline: true },
          { name: `Old Priority`, value: getFormattedPriority(oldPriority), inline: true },
          { name: `New Priority`, value: getFormattedPriority(priority), inline: true },
          { name: "Reason", value: reason },
        ])
        .setTimestamp()

      await logChannel.send({ embeds: [logEmbed] })

      // Send a notification in the ticket channel/thread
      const priorityChangeEmbed = new EmbedBuilder()
        .setColor(getPriorityColor(priority))
        .setTitle(`${getPriorityEmoji(priority)} Priority Updated`)
        .setDescription(`Ticket priority has been updated by ${member.displayName || interaction.user.username}`)
        .addFields([
          { name: `Old Priority`, value: getFormattedPriority(oldPriority), inline: true },
          { name: `New Priority`, value: getFormattedPriority(priority), inline: true },
          { name: "Reason", value: reason },
        ])
        .setTimestamp()

      await interaction.channel.send({ embeds: [priorityChangeEmbed] })

      // Reply to the interaction
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(getPriorityColor(priority))
            .setTitle(`${getPriorityEmoji(priority)} Priority Updated`)
            .setDescription(`Ticket priority has been updated to ${getFormattedPriority(priority)}.`)
            .setTimestamp(),
        ],
        ephemeral: true,
      })
    } catch (error) {
      client.errorLogger.logError("Priority Command", error, {
        command: "priority",
        user: interaction.user.tag,
        guild: interaction.guild.name,
      })

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Error")
            .setDescription("An error occurred while updating the ticket priority.")
            .setTimestamp(),
        ],
        ephemeral: true,
      })
    }
  },
}
