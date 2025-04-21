const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const ticketAnalytics = require("../utils/ticket-analytics")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analytics")
    .setDescription("View ticket analytics")
    .addIntegerOption((option) =>
      option
        .setName("days")
        .setDescription("Number of days to analyze (default: 30)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365),
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
        content: "You do not have permission to view analytics.",
        ephemeral: true,
      })
    }

    const days = interaction.options.getInteger("days") || 30

    try {
      // Get analytics data
      const stats = ticketAnalytics.getBasicStats(interaction.guild.id, days)

      // Format category counts
      let categoryText = "None"
      if (Object.keys(stats.categoryCounts).length > 0) {
        categoryText = Object.entries(stats.categoryCounts)
          .map(([category, count]) => `${category}: ${count}`)
          .join("\n")
      }

      // Format priority counts
      let priorityText = "None"
      if (Object.keys(stats.priorityCounts).length > 0) {
        priorityText = Object.entries(stats.priorityCounts)
          .map(([priority, count]) => `${priority}: ${count}`)
          .join("\n")
      }

      // Format top users
      let topUsersText = "None"
      if (stats.topUsers.length > 0) {
        topUsersText = await Promise.all(
          stats.topUsers.map(async ({ userId, count }) => {
            try {
              const user = await client.users.fetch(userId)
              return `${user.tag}: ${count} tickets`
            } catch (error) {
              return `Unknown User (${userId}): ${count} tickets`
            }
          }),
        ).then((lines) => lines.join("\n"))
      }

      // Format top staff
      let topStaffText = "None"
      if (stats.topStaff.length > 0) {
        topStaffText = await Promise.all(
          stats.topStaff.map(async ({ staffId, count }) => {
            try {
              const user = await client.users.fetch(staffId)
              return `${user.tag}: ${count} tickets`
            } catch (error) {
              return `Unknown Staff (${staffId}): ${count} tickets`
            }
          }),
        ).then((lines) => lines.join("\n"))
      }

      // Create embed with analytics
      const analyticsEmbed = {
        color: 0x0099ff,
        title: `Ticket Analytics (Last ${days} Days)`,
        fields: [
          {
            name: "Ticket Volume",
            value: `Total: ${stats.totalTickets}\nClosed: ${stats.closedTickets}\nClose Rate: ${stats.openRate}`,
            inline: true,
          },
          {
            name: "Response Times",
            value: `First Response: ${stats.avgResponseTime}\nResolution: ${stats.avgResolutionTime}`,
            inline: true,
          },
          {
            name: "Categories",
            value: categoryText,
            inline: true,
          },
          {
            name: "Priorities",
            value: priorityText,
            inline: true,
          },
          {
            name: "Top Users",
            value: topUsersText,
            inline: true,
          },
          {
            name: "Top Staff",
            value: topStaffText,
            inline: true,
          },
        ],
        timestamp: new Date().toISOString(),
      }

      await interaction.reply({ embeds: [analyticsEmbed] })
    } catch (error) {
      console.error("Error generating analytics:", error)
      await interaction.reply({
        content: "An error occurred while generating analytics.",
        ephemeral: true,
      })
    }
  },
}
