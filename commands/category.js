const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const { getPriorityEmoji, getPriorityName, getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("category")
    .setDescription("Set the category for a ticket")
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("The category for this ticket")
        .setRequired(true)
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
          { name: "🟢 Low", value: "low" },
          { name: "🟡 Medium", value: "medium" },
          { name: "🟠 High", value: "high" },
          { name: "🔴 Urgent", value: "urgent" },
        ),
    ),

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
        content: "You do not have permission to set ticket categories.",
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

    const category = interaction.options.getString("category")
    const priority = interaction.options.getString("priority") || "medium"

    try {
      // Update the ticket
      ticket.category = category
      ticket.priority = priority
      client.tickets.set(ticket.id, ticket)

      // Update the info message
      const channel = await interaction.guild.channels.fetch(ticket.channelId)
      const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

      const embed = infoMessage.embeds[0]
      const fields = [...embed.fields]

      // Update or add category field
      const categoryFieldIndex = fields.findIndex((field) => field.name === "Category")
      if (categoryFieldIndex !== -1) {
        fields[categoryFieldIndex] = {
          name: "Category",
          value: getCategoryEmoji(category) + " " + getCategoryName(category),
          inline: true,
        }
      } else {
        fields.push({
          name: "Category",
          value: getCategoryEmoji(category) + " " + getCategoryName(category),
          inline: true,
        })
      }

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

      const updatedEmbed = {
        ...embed,
        fields: fields,
      }

      await infoMessage.edit({ embeds: [updatedEmbed] })

      // Log the category change
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      const logEmbed = {
        color: 0x00ff00,
        title: "Ticket Category Updated",
        description: `Ticket #${ticket.id} category has been updated by ${member.displayName || interaction.user.username}`,
        fields: [
          { name: "User", value: `<@${ticket.userId}>`, inline: true },
          { name: "Category", value: getCategoryName(category), inline: true },
          { name: "Priority", value: getFormattedPriority(priority), inline: true },
        ],
        timestamp: new Date().toISOString(),
      }

      await logChannel.send({ embeds: [logEmbed] })

      // Notify the user
      const user = await client.users.fetch(ticket.userId)
      const userEmbed = {
        color: 0x00ff00,
        title: "Ticket Update",
        description: `Your ticket (ID: ${ticket.id}) has been categorized as "${getCategoryName(category)}" with "${getFormattedPriority(priority)}" priority.`,
        timestamp: new Date().toISOString(),
      }

      await user.send({ embeds: [userEmbed] })

      // Reply to the interaction
      await interaction.reply({
        content: `Ticket categorized as "${getCategoryName(category)}" with "${getFormattedPriority(priority)}" priority.`,
      })
    } catch (error) {
      console.error("Error setting ticket category:", error)
      await interaction.reply({
        content: "An error occurred while setting the ticket category.",
        ephemeral: true,
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
