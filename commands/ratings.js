const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ratings")
    .setDescription("View staff ratings")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("overview")
        .setDescription("View ratings overview for all staff members")
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
        .setDescription("View detailed ratings for a specific staff member")
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
    .addSubcommand((subcommand) =>
      subcommand
        .setName("recent")
        .setDescription("View most recent ratings")
        .addIntegerOption((option) =>
          option
            .setName("count")
            .setDescription("Number of ratings to show (default: 10)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50),
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
    if (!member.roles.cache.has(config.staffRoleId) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "You do not have permission to view ratings.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      const subcommand = interaction.options.getSubcommand()

      if (subcommand === "overview") {
        await handleOverview(interaction, client)
      } else if (subcommand === "staff") {
        const user = interaction.options.getUser("user")
        await handleStaffDetail(interaction, client, user)
      } else if (subcommand === "recent") {
        await handleRecentRatings(interaction, client)
      }
    } catch (error) {
      console.error("Error generating ratings:", error)
      await interaction.editReply({
        content: "An error occurred while generating ratings data.",
      })
    }
  },
}

async function handleOverview(interaction, client) {
  const days = interaction.options.getInteger("days") || 30
  const guildId = interaction.guild.id

  // Get all tickets for this guild
  const allTickets = client.ticketHistory.getTicketsByGuild(guildId)

  // Filter by time range (days)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const tickets = allTickets.filter((ticket) => {
    const closedAt = ticket.closedAt ? new Date(ticket.closedAt) : null
    return closedAt && closedAt >= cutoffDate && ticket.satisfactionRating
  })

  if (tickets.length === 0) {
    return interaction.editReply({
      content: `No ratings data available for the last ${days} days.`,
    })
  }

  // Group tickets by staff member
  const staffRatings = {}

  tickets.forEach((ticket) => {
    if (ticket.assignedTo) {
      if (!staffRatings[ticket.assignedTo]) {
        staffRatings[ticket.assignedTo] = {
          staffId: ticket.assignedTo,
          staffTag: ticket.assignedToTag || "Unknown",
          ratings: [],
          averageRating: 0,
          totalTickets: 0,
        }
      }

      staffRatings[ticket.assignedTo].ratings.push(ticket.satisfactionRating)
      staffRatings[ticket.assignedTo].totalTickets++
    }
  })

  // Calculate average ratings
  Object.values(staffRatings).forEach((staff) => {
    if (staff.ratings.length > 0) {
      staff.averageRating = (staff.ratings.reduce((sum, rating) => sum + rating, 0) / staff.ratings.length).toFixed(2)
    }
  })

  // Sort by average rating (highest first)
  const sortedStaff = Object.values(staffRatings).sort((a, b) => b.averageRating - a.averageRating)

  // Create overview embed
  const overviewEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Staff Ratings Overview")
    .setDescription(`Ratings for the last ${days} days`)
    .setFooter({ text: `Total rated tickets: ${tickets.length}` })
    .setTimestamp()

  // Add fields for each staff member
  for (const staff of sortedStaff) {
    // Get rating distribution
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    staff.ratings.forEach((rating) => distribution[rating]++)

    const distributionText = Object.entries(distribution)
      .filter(([_, count]) => count > 0)
      .map(([rating, count]) => `${rating}★: ${count}`)
      .join(", ")

    overviewEmbed.addFields({
      name: staff.staffTag,
      value: `Average: ${staff.averageRating}/5 (${staff.ratings.length} ratings)\nDistribution: ${distributionText}`,
      inline: false,
    })
  }

  await interaction.editReply({ embeds: [overviewEmbed] })
}

async function handleStaffDetail(interaction, client, user) {
  const days = interaction.options.getInteger("days") || 30
  const guildId = interaction.guild.id

  // Get all tickets for this guild
  const allTickets = client.ticketHistory.getTicketsByGuild(guildId)

  // Filter by time range and staff member
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const tickets = allTickets.filter((ticket) => {
    const closedAt = ticket.closedAt ? new Date(ticket.closedAt) : null
    return closedAt && closedAt >= cutoffDate && ticket.satisfactionRating && ticket.assignedTo === user.id
  })

  if (tickets.length === 0) {
    return interaction.editReply({
      content: `No ratings data available for ${user.tag} in the last ${days} days.`,
    })
  }

  // Calculate ratings data
  const ratings = tickets.map((t) => t.satisfactionRating)
  const averageRating = (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2)

  // Get rating distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  ratings.forEach((rating) => distribution[rating]++)

  // Create staff detail embed
  const detailEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Ratings for ${user.tag}`)
    .setDescription(`Ratings for the last ${days} days`)
    .setThumbnail(user.displayAvatarURL())
    .addFields([
      { name: "Average Rating", value: `${averageRating}/5`, inline: true },
      { name: "Total Ratings", value: `${ratings.length}`, inline: true },
      {
        name: "Rating Distribution",
        value:
          `5★: ${distribution[5]} (${((distribution[5] / ratings.length) * 100).toFixed(1)}%)\n` +
          `4★: ${distribution[4]} (${((distribution[4] / ratings.length) * 100).toFixed(1)}%)\n` +
          `3★: ${distribution[3]} (${((distribution[3] / ratings.length) * 100).toFixed(1)}%)\n` +
          `2★: ${distribution[2]} (${((distribution[2] / ratings.length) * 100).toFixed(1)}%)\n` +
          `1★: ${distribution[1]} (${((distribution[1] / ratings.length) * 100).toFixed(1)}%)`,
        inline: false,
      },
    ])
    .setFooter({ text: `Data from ${tickets.length} rated tickets` })
    .setTimestamp()

  // Add recent ratings
  const recentRatings = tickets.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)).slice(0, 5)

  if (recentRatings.length > 0) {
    const recentText = recentRatings
      .map(
        (ticket) =>
          `Ticket #${ticket.numericId}: ${ticket.satisfactionRating}★ (${new Date(ticket.closedAt).toLocaleDateString()})`,
      )
      .join("\n")

    detailEmbed.addFields({ name: "Recent Ratings", value: recentText, inline: false })
  }

  await interaction.editReply({ embeds: [detailEmbed] })
}

async function handleRecentRatings(interaction, client) {
  const count = interaction.options.getInteger("count") || 10
  const guildId = interaction.guild.id

  // Get all tickets for this guild
  const allTickets = client.ticketHistory.getTicketsByGuild(guildId)

  // Filter to only include tickets with ratings
  const ratedTickets = allTickets.filter((ticket) => ticket.satisfactionRating)

  if (ratedTickets.length === 0) {
    return interaction.editReply({
      content: "No ratings data available.",
    })
  }

  // Sort by closed date (newest first)
  ratedTickets.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))

  // Take the requested number of tickets
  const recentRatings = ratedTickets.slice(0, count)

  // Create recent ratings embed
  const recentEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Recent Ticket Ratings")
    .setDescription(`Showing the ${recentRatings.length} most recent ratings`)
    .setFooter({ text: `Total rated tickets: ${ratedTickets.length}` })
    .setTimestamp()

  // Add each rating as a field
  for (const ticket of recentRatings) {
    let userTag = ticket.userTag || "Unknown User"
    let staffTag = ticket.assignedToTag || "Unassigned"

    try {
      if (!ticket.userTag && ticket.userId) {
        const user = await client.users.fetch(ticket.userId)
        userTag = user.tag
      }

      if (!ticket.assignedToTag && ticket.assignedTo) {
        const staff = await client.users.fetch(ticket.assignedTo)
        staffTag = staff.tag
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
    }

    recentEmbed.addFields({
      name: `Ticket #${ticket.numericId} - ${ticket.satisfactionRating}★`,
      value: `**User:** ${userTag}\n**Staff:** ${staffTag}\n**Date:** ${new Date(ticket.closedAt).toLocaleString()}`,
      inline: true,
    })
  }

  await interaction.editReply({ embeds: [recentEmbed] })
}
