const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js")
const ticketAnalytics = require("../utils/ticket-analytics")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("performance")
    .setDescription("View staff performance metrics")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("overview")
        .setDescription("View performance overview for all staff members")
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze (default: 30)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("staff")
        .setDescription("View detailed performance for a specific staff member")
        .addUserOption((option) => option.setName("user").setDescription("The staff member to view").setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to analyze (default: 30)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

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
        content: "You do not have permission to view performance metrics.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      const subcommand = interaction.options.getSubcommand()
      const days = interaction.options.getInteger("days") || 30

      if (subcommand === "overview") {
        await handleOverview(interaction, client, days)
      } else if (subcommand === "staff") {
        const user = interaction.options.getUser("user")
        await handleStaffDetail(interaction, client, user, days)
      }
    } catch (error) {
      console.error("Error generating performance metrics:", error)
      await interaction.editReply({
        content: "An error occurred while generating performance metrics.",
      })
    }
  },
}

async function handleOverview(interaction, client, days) {
  // Get staff performance data
  const staffPerformance = ticketAnalytics.getStaffPerformance(interaction.guild.id, days)

  if (staffPerformance.length === 0) {
    return interaction.editReply({
      content: `No staff performance data available for the last ${days} days.`,
    })
  }

  // Create overview embed
  const overviewEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Staff Performance Overview")
    .setDescription(`Performance metrics for the last ${days} days`)
    .addFields(
      staffPerformance.map((staff) => ({
        name: staff.staffTag,
        value:
          `Tickets: ${staff.ticketsHandled} (${staff.closeRate} closed)\n` +
          `Avg. Response: ${staff.averageResponseTime}\n` +
          `Avg. Resolution: ${staff.averageResolutionTime}\n` +
          `Satisfaction: ${staff.averageRating}/5`,
        inline: true,
      })),
    )
    .setFooter({ text: `Generated at ${new Date().toLocaleString()}` })
    .setTimestamp()

  await interaction.editReply({
    embeds: [overviewEmbed],
  })
}

async function handleStaffDetail(interaction, client, user, days) {
  // Get staff performance data
  const staffPerformance = ticketAnalytics.getStaffPerformance(interaction.guild.id, days)

  // Find the specific staff member
  const staffMember = staffPerformance.find((s) => s.staffId === user.id)

  if (!staffMember) {
    return interaction.editReply({
      content: `No performance data available for ${user.tag} in the last ${days} days.`,
    })
  }

  // Format category distribution
  let categoryText = "None"
  if (Object.keys(staffMember.categories).length > 0) {
    categoryText = Object.entries(staffMember.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `${category}: ${count}`)
      .join("\n")
  }

  // Format tag distribution
  let tagText = "None"
  if (Object.keys(staffMember.tags).length > 0) {
    tagText = Object.entries(staffMember.tags)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => `${tag}: ${count}`)
      .join("\n")
  }

  // Format priority distribution
  let priorityText = "None"
  if (Object.keys(staffMember.priorities).length > 0) {
    priorityText = Object.entries(staffMember.priorities)
      .sort((a, b) => b[1] - a[1])
      .map(([priority, count]) => `${getFormattedPriority(priority)}: ${count}`)
      .join("\n")
  }

  // Create detailed embed
  const detailEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Performance Metrics: ${user.tag}`)
    .setDescription(`Detailed performance for the last ${days} days`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: "Tickets Handled", value: staffMember.ticketsHandled.toString(), inline: true },
      { name: "Tickets Closed", value: staffMember.ticketsClosed.toString(), inline: true },
      { name: "Close Rate", value: staffMember.closeRate, inline: true },
      { name: "Average Response Time", value: staffMember.averageResponseTime, inline: true },
      { name: "Average Resolution Time", value: staffMember.averageResolutionTime, inline: true },
      { name: "Satisfaction Rating", value: staffMember.averageRating, inline: true },
      { name: "Category Distribution", value: categoryText, inline: false },
      { name: "Tag Distribution", value: tagText, inline: false },
      { name: "Priority Distribution", value: priorityText, inline: false },
    )
    .setFooter({ text: `Generated at ${new Date().toLocaleString()}` })
    .setTimestamp()

  await interaction.editReply({
    embeds: [detailEmbed],
  })
}
