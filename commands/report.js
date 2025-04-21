const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require("discord.js")
const ticketAnalytics = require("../utils/ticket-analytics")
const tagManager = require("../utils/tag-manager")
const fs = require("fs")
const path = require("path")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("report")
    .setDescription("Generate ticket reports")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("summary")
        .setDescription("Generate a summary report")
        .addStringOption((option) =>
          option
            .setName("period")
            .setDescription("The time period to report on")
            .setRequired(true)
            .addChoices(
              { name: "Daily", value: "daily" },
              { name: "Weekly", value: "weekly" },
              { name: "Monthly", value: "monthly" },
              { name: "Custom", value: "custom" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to report on (for custom period)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("custom")
        .setDescription("Generate a custom report")
        .addStringOption((option) =>
          option
            .setName("metrics")
            .setDescription("Metrics to include (comma-separated)")
            .setRequired(true)
            .addChoices(
              { name: "All", value: "all" },
              { name: "Tickets", value: "tickets" },
              { name: "Response Times", value: "response" },
              { name: "Resolution Times", value: "resolution" },
              { name: "Satisfaction", value: "satisfaction" },
              { name: "Categories", value: "categories" },
              { name: "Tags", value: "tags" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("period")
            .setDescription("The time period to report on")
            .setRequired(true)
            .addChoices(
              { name: "Daily", value: "daily" },
              { name: "Weekly", value: "weekly" },
              { name: "Monthly", value: "monthly" },
              { name: "Custom", value: "custom" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to report on (for custom period)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365),
        )
        .addUserOption((option) => option.setName("staff").setDescription("Filter by staff member").setRequired(false))
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("Filter by category")
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
          option.setName("tag").setDescription("Filter by tag").setRequired(false).setAutocomplete(true),
        )
        .addBooleanOption((option) =>
          option.setName("export").setDescription("Export the report as a file").setRequired(false),
        ),
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
        content: "You do not have permission to generate reports.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      const subcommand = interaction.options.getSubcommand()

      if (subcommand === "summary") {
        await handleSummaryReport(interaction, client)
      } else if (subcommand === "custom") {
        await handleCustomReport(interaction, client)
      }
    } catch (error) {
      console.error("Error generating report:", error)
      await interaction.editReply({
        content: "An error occurred while generating the report.",
      })
    }
  },

  async autocomplete(interaction, client) {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === "tag") {
      try {
        // Get all tags for this guild
        const guildTags = tagManager.getGuildTags(interaction.guild.id)

        // Filter based on input
        const filtered = guildTags
          .filter((tag) => tag.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .map((tag) => ({ name: tag.name, value: tag.name }))
          .slice(0, 25)

        await interaction.respond(filtered)
      } catch (error) {
        console.error("Error in tag autocomplete:", error)
        await interaction.respond([])
      }
    }
  },
}

async function handleSummaryReport(interaction, client) {
  const period = interaction.options.getString("period")
  let days = interaction.options.getInteger("days") || 30

  // Determine time range based on period
  switch (period) {
    case "daily":
      days = 1
      break
    case "weekly":
      days = 7
      break
    case "monthly":
      days = 30
      break
    // For custom, use the provided days value
  }

  // Get stats
  const stats = ticketAnalytics.getBasicStats(interaction.guild.id, days)

  // Format category counts
  let categoryText = "None"
  if (Object.keys(stats.categoryCounts).length > 0) {
    categoryText = Object.entries(stats.categoryCounts)
      .map(([category, count]) => `${category}: ${count}`)
      .join("\n")
  }

  // Format tag counts
  let tagText = "None"
  if (Object.keys(stats.tagCounts).length > 0) {
    tagText = Object.entries(stats.tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `${tag}: ${count}`)
      .join("\n")
  }

  // Format top users
  let topUsersText = "None"
  if (stats.topUsers.length > 0) {
    topUsersText = stats.topUsers.map((user) => `${user.userTag}: ${user.count} tickets`).join("\n")
  }

  // Format top staff
  let topStaffText = "None"
  if (stats.topStaff.length > 0) {
    topStaffText = stats.topStaff
      .map((staff) => `${staff.staffTag}: ${staff.count} tickets (${staff.averageRating}/5)`)
      .join("\n")
  }

  // Create embed
  const reportEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Modmail Summary Report - ${getPeriodName(period, days)}`)
    .setDescription(`Summary of modmail activity for the ${getPeriodName(period, days).toLowerCase()}`)
    .addFields(
      {
        name: "Ticket Volume",
        value: `Total: ${stats.totalTickets}\nClosed: ${stats.closedTickets}\nClose Rate: ${stats.openRate}`,
        inline: false,
      },
      {
        name: "Response Times",
        value: `First Response: ${stats.avgResponseTime}\nResolution: ${stats.avgResolutionTime}`,
        inline: false,
      },
      {
        name: "User Satisfaction",
        value: `Average Rating: ${stats.satisfactionStats.averageRating}/5\nRated Tickets: ${stats.satisfactionStats.ratedTickets}/${stats.satisfactionStats.totalTickets} (${stats.satisfactionStats.ratingPercentage})`,
        inline: false,
      },
      { name: "Categories", value: categoryText, inline: true },
      { name: "Top Tags", value: tagText, inline: true },
      { name: "Top Users", value: topUsersText, inline: true },
      { name: "Top Staff", value: topStaffText, inline: true },
    )
    .setFooter({ text: `Generated at ${new Date().toLocaleString()}` })
    .setTimestamp()

  await interaction.editReply({
    embeds: [reportEmbed],
  })
}

async function handleCustomReport(interaction, client) {
  const metricsOption = interaction.options.getString("metrics")
  const period = interaction.options.getString("period")
  let days = interaction.options.getInteger("days") || 30
  const staffUser = interaction.options.getUser("staff")
  const category = interaction.options.getString("category")
  const tag = interaction.options.getString("tag")
  const exportReport = interaction.options.getBoolean("export") || false

  // Determine time range based on period
  switch (period) {
    case "daily":
      days = 1
      break
    case "weekly":
      days = 7
      break
    case "monthly":
      days = 30
      break
    // For custom, use the provided days value
  }

  // Parse metrics
  let metrics = []
  if (metricsOption === "all") {
    metrics = ["tickets", "response", "resolution", "satisfaction", "categories", "tags"]
  } else {
    metrics = [metricsOption]
  }

  // Generate custom report
  const report = ticketAnalytics.generateCustomReport(interaction.guild.id, {
    timeRange: days,
    staffId: staffUser ? staffUser.id : null,
    category: category,
    tags: tag ? [tag] : [],
    metrics: metrics,
  })

  // Create embed
  const reportEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Custom Modmail Report - ${getPeriodName(period, days)}`)
    .setDescription(`Custom report for the ${getPeriodName(period, days).toLowerCase()}`)

  // Add filters section
  let filtersText = ""
  if (staffUser) filtersText += `Staff: ${staffUser.tag}\n`
  if (category) filtersText += `Category: ${category}\n`
  if (tag) filtersText += `Tag: ${tag}\n`

  if (filtersText) {
    reportEmbed.addFields({ name: "Filters", value: filtersText, inline: false })
  }

  // Add metrics based on what was requested
  if (metrics.includes("tickets") && report.data.tickets) {
    reportEmbed.addFields({
      name: "Ticket Volume",
      value: `Total: ${report.data.tickets.total}\nClosed: ${report.data.tickets.closed}\nClose Rate: ${((report.data.tickets.closed / report.data.tickets.total) * 100).toFixed(2)}%`,
      inline: true,
    })
  }

  if (metrics.includes("response") && report.data.responseTimes) {
    reportEmbed.addFields({
      name: "Response Times",
      value: `Average: ${report.data.responseTimes.average}\nMin: ${report.data.responseTimes.min}\nMax: ${report.data.responseTimes.max}`,
      inline: true,
    })
  }

  if (metrics.includes("resolution") && report.data.resolutionTimes) {
    reportEmbed.addFields({
      name: "Resolution Times",
      value: `Average: ${report.data.resolutionTimes.average}\nMin: ${report.data.resolutionTimes.min}\nMax: ${report.data.resolutionTimes.max}`,
      inline: true,
    })
  }

  if (metrics.includes("satisfaction") && report.data.satisfaction) {
    const ratingCounts = report.data.satisfaction.counts
    const ratingsText = `5★: ${ratingCounts[5]}, 4★: ${ratingCounts[4]}, 3★: ${ratingCounts[3]}, 2★: ${ratingCounts[2]}, 1★: ${ratingCounts[1]}`

    reportEmbed.addFields({
      name: "User Satisfaction",
      value: `Average: ${report.data.satisfaction.average}/5\nRatings: ${ratingsText}\nRate: ${report.data.satisfaction.percentage}`,
      inline: false,
    })
  }

  if (metrics.includes("categories") && report.data.categories) {
    let categoryText = "None"
    if (Object.keys(report.data.categories).length > 0) {
      categoryText = Object.entries(report.data.categories)
        .map(([category, count]) => `${category}: ${count}`)
        .join("\n")
    }

    reportEmbed.addFields({
      name: "Categories",
      value: categoryText,
      inline: true,
    })
  }

  if (metrics.includes("tags") && report.data.tags) {
    let tagText = "None"
    if (Object.keys(report.data.tags).length > 0) {
      tagText = Object.entries(report.data.tags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => `${tag}: ${count}`)
        .join("\n")
    }

    reportEmbed.addFields({
      name: "Tags",
      value: tagText,
      inline: true,
    })
  }

  reportEmbed.setFooter({ text: `Generated at ${new Date().toLocaleString()}` })
  reportEmbed.setTimestamp()

  // Send the embed
  if (!exportReport) {
    await interaction.editReply({
      embeds: [reportEmbed],
    })
  } else {
    // Export as file
    const reportText = generateReportText(report, {
      period: getPeriodName(period, days),
      staffUser: staffUser ? staffUser.tag : null,
      category,
      tag,
    })

    // Create directory if it doesn't exist
    const reportsDir = path.join(__dirname, "../reports")
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir)
    }

    // Write to file
    const fileName = `modmail-report-${Date.now()}.txt`
    const filePath = path.join(reportsDir, fileName)
    fs.writeFileSync(filePath, reportText)

    // Send file
    const attachment = new AttachmentBuilder(filePath, { name: fileName })

    await interaction.editReply({
      content: "Here's your exported report:",
      files: [attachment],
    })
  }
}

function getPeriodName(period, days) {
  switch (period) {
    case "daily":
      return "Daily Report"
    case "weekly":
      return "Weekly Report"
    case "monthly":
      return "Monthly Report"
    case "custom":
      return `Last ${days} Days`
    default:
      return `Last ${days} Days`
  }
}

function generateReportText(report, options) {
  const { period, staffUser, category, tag } = options

  let text = `=== MODMAIL REPORT: ${period.toUpperCase()} ===\n\n`
  text += `Generated: ${new Date().toLocaleString()}\n\n`

  // Add filters
  text += "FILTERS:\n"
  text += `Time Period: ${period}\n`
  if (staffUser) text += `Staff: ${staffUser}\n`
  if (category) text += `Category: ${category}\n`
  if (tag) text += `Tag: ${tag}\n`
  text += "\n"

  // Add ticket volume
  if (report.data.tickets) {
    text += "TICKET VOLUME:\n"
    text += `Total Tickets: ${report.data.tickets.total}\n`
    text += `Closed Tickets: ${report.data.tickets.closed}\n`
    text += `Close Rate: ${((report.data.tickets.closed / report.data.tickets.total) * 100).toFixed(2)}%\n\n`
  }

  // Add response times
  if (report.data.responseTimes) {
    text += "RESPONSE TIMES:\n"
    text += `Average: ${report.data.responseTimes.average}\n`
    text += `Minimum: ${report.data.responseTimes.min}\n`
    text += `Maximum: ${report.data.responseTimes.max}\n\n`
  }

  // Add resolution times
  if (report.data.resolutionTimes) {
    text += "RESOLUTION TIMES:\n"
    text += `Average: ${report.data.resolutionTimes.average}\n`
    text += `Minimum: ${report.data.resolutionTimes.min}\n`
    text += `Maximum: ${report.data.resolutionTimes.max}\n\n`
  }

  // Add satisfaction
  if (report.data.satisfaction) {
    text += "USER SATISFACTION:\n"
    text += `Average Rating: ${report.data.satisfaction.average}/5\n`
    text += `Rating Distribution:\n`
    text += `  5 stars: ${report.data.satisfaction.counts[5]}\n`
    text += `  4 stars: ${report.data.satisfaction.counts[4]}\n`
    text += `  3 stars: ${report.data.satisfaction.counts[3]}\n`
    text += `  2 stars: ${report.data.satisfaction.counts[2]}\n`
    text += `  1 star: ${report.data.satisfaction.counts[1]}\n`
    text += `Response Rate: ${report.data.satisfaction.percentage}\n\n`
  }

  // Add categories
  if (report.data.categories) {
    text += "CATEGORIES:\n"
    if (Object.keys(report.data.categories).length > 0) {
      Object.entries(report.data.categories).forEach(([category, count]) => {
        text += `${category}: ${count}\n`
      })
    } else {
      text += "None\n"
    }
    text += "\n"
  }

  // Add tags
  if (report.data.tags) {
    text += "TAGS:\n"
    if (Object.keys(report.data.tags).length > 0) {
      Object.entries(report.data.tags)
        .sort((a, b) => b[1] - a[1])
        .forEach(([tag, count]) => {
          text += `${tag}: ${count}\n`
        })
    } else {
      text += "None\n"
    }
    text += "\n"
  }

  text += "=== END OF REPORT ===\n"

  return text
}
