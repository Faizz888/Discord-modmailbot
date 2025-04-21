const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")
const tagManager = require("../utils/tag-manager")
const { getFormattedPriority } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search for tickets based on various criteria")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("user")
        .setDescription("Search tickets by user")
        .addUserOption((option) => option.setName("user").setDescription("The user to search for").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ticket")
        .setDescription("Search for a specific ticket by ID")
        .addStringOption((option) =>
          option.setName("id").setDescription("The ticket ID to search for").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("content")
        .setDescription("Search tickets by content")
        .addStringOption((option) =>
          option.setName("query").setDescription("The text to search for in ticket messages").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("tag")
        .setDescription("Search tickets by tag")
        .addStringOption((option) =>
          option.setName("tag").setDescription("The tag to search for").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("category")
        .setDescription("Search tickets by category")
        .addStringOption((option) =>
          option
            .setName("category")
            .setDescription("The category to search for")
            .setRequired(true)
            .addChoices(
              { name: "General Help", value: "general" },
              { name: "Technical Support", value: "tech" },
              { name: "Report User", value: "report" },
              { name: "Appeal", value: "appeal" },
              { name: "Feedback", value: "feedback" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("advanced")
        .setDescription("Advanced ticket search with multiple criteria")
        .addUserOption((option) => option.setName("user").setDescription("Filter by user").setRequired(false))
        .addStringOption((option) =>
          option.setName("content").setDescription("Filter by message content").setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("tag").setDescription("Filter by tag").setRequired(false).setAutocomplete(true),
        )
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
        .addIntegerOption((option) =>
          option
            .setName("days")
            .setDescription("Number of days to look back")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(365),
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
        content: "You do not have permission to search tickets.",
        ephemeral: true,
      })
    }

    await interaction.deferReply()

    try {
      const subcommand = interaction.options.getSubcommand()
      const searchCriteria = { guildId: interaction.guild.id }
      let searchDescription = ""

      // Build search criteria based on subcommand
      switch (subcommand) {
        case "user":
          const user = interaction.options.getUser("user")
          searchCriteria.userId = user.id
          searchDescription = `User: ${user.tag}`
          break

        case "ticket":
          const ticketId = interaction.options.getString("id")
          searchCriteria.ticketId = ticketId
          searchDescription = `Ticket ID: ${ticketId}`
          break

        case "content":
          const query = interaction.options.getString("query")
          searchCriteria.content = query
          searchDescription = `Content: "${query}"`
          break

        case "tag":
          const tag = interaction.options.getString("tag")
          searchCriteria.tags = [tag]
          searchDescription = `Tag: ${tag}`
          break

        case "category":
          const category = interaction.options.getString("category")
          searchCriteria.category = category
          searchDescription = `Category: ${category}`
          break

        case "advanced":
          // Build advanced search criteria
          const advUser = interaction.options.getUser("user")
          const advContent = interaction.options.getString("content")
          const advTag = interaction.options.getString("tag")
          const advCategory = interaction.options.getString("category")
          const days = interaction.options.getInteger("days")

          if (advUser) {
            searchCriteria.userId = advUser.id
            searchDescription += `User: ${advUser.tag}\n`
          }

          if (advContent) {
            searchCriteria.content = advContent
            searchDescription += `Content: "${advContent}"\n`
          }

          if (advTag) {
            searchCriteria.tags = [advTag]
            searchDescription += `Tag: ${advTag}\n`
          }

          if (advCategory) {
            searchCriteria.category = advCategory
            searchDescription += `Category: ${advCategory}\n`
          }

          if (days) {
            const startDate = new Date()
            startDate.setDate(startDate.getDate() - days)
            searchCriteria.startDate = startDate.toISOString()
            searchDescription += `Time period: Last ${days} days\n`
          }

          if (!searchDescription) {
            searchDescription = "No filters applied"
          }
          break
      }

      // Perform the search
      const results = ticketHistory.searchTickets(searchCriteria)

      if (results.length === 0) {
        return interaction.editReply({
          content: `No tickets found matching the criteria: ${searchDescription}`,
        })
      }

      // Sort results by date (newest first)
      results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      // Limit to 10 results for display
      const displayResults = results.slice(0, 10)

      // Create embed for results
      const resultsEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Ticket Search Results")
        .setDescription(`Found ${results.length} tickets matching:\n${searchDescription}`)
        .addFields(
          displayResults.map((ticket) => ({
            name: `Ticket #${ticket.id}`,
            value:
              `**User:** ${ticket.userTag || "Unknown"}\n` +
              `**Created:** ${new Date(ticket.createdAt).toLocaleString()}\n` +
              `**Status:** ${ticket.status}\n` +
              `**Category:** ${ticket.category || "None"}\n` +
              `**Tags:** ${ticket.tags && ticket.tags.length > 0 ? ticket.tags.join(", ") : "None"}\n` +
              `**Messages:** ${ticket.messageCount || 0}`,
          })),
        )
        .setFooter({
          text:
            results.length > 10
              ? `Showing 10 of ${results.length} results. Use more specific search criteria to narrow down results.`
              : `Showing all ${results.length} results.`,
        })
        .setTimestamp()

      await interaction.editReply({
        embeds: [resultsEmbed],
      })
    } catch (error) {
      console.error("Error searching tickets:", error)
      await interaction.editReply({
        content: "An error occurred while searching tickets.",
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
