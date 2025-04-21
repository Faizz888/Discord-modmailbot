const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js")
const { setTimeout } = require("node:timers/promises")
const { getPriorityEmoji, getFormattedPriority } = require("../utils/priority-utils")

// Rate limiting for dashboard access
const cooldowns = new Map()
const COOLDOWN_DURATION = 30000 // 30 seconds cooldown for regular users

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dashboard")
    .setDescription("Access the admin dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction, client) {
    try {
      // Check if the user has the staff role
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

      const member = await interaction.guild.members.fetch(interaction.user.id)
      const hasStaffRole = member.roles.cache.has(config.staffRoleId)
      const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)

      // Access control - only staff or admins can use the dashboard
      if (!hasStaffRole && !isAdmin) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Permission Denied")
              .setDescription("You do not have permission to access the dashboard.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Staff channel restriction - check if command is used in an admin channel
      const isAdminChannel = isInAdminChannel(interaction.channel.id, config)

      if (!isAdminChannel) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Invalid Channel")
              .setDescription("The dashboard can only be accessed in the designated admin channels.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Rate limiting for non-admin users
      if (!isAdmin) {
        const now = Date.now()
        const userId = interaction.user.id

        if (cooldowns.has(userId)) {
          const expirationTime = cooldowns.get(userId) + COOLDOWN_DURATION

          if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("Rate Limited")
                  .setDescription(`Please wait ${timeLeft.toFixed(1)} more seconds before using the dashboard again.`)
                  .setTimestamp(),
              ],
              ephemeral: true,
            })
          }
        }

        cooldowns.set(userId, now)
        setTimeout(() => cooldowns.delete(userId), COOLDOWN_DURATION)
      }

      // Create the main dashboard embed
      const dashboardEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Modmail Admin Dashboard")
        .setDescription("Welcome to the Modmail Admin Dashboard. Use the reactions below to navigate.")
        .addFields([
          { name: "📊 Analytics", value: "View ticket analytics and statistics", inline: true },
          { name: "🔍 Search", value: "Search for tickets", inline: true },
          { name: "👥 Staff", value: "View staff performance", inline: true },
          { name: "⚙️ Settings", value: "Configure bot settings", inline: true },
          { name: "📝 Reports", value: "Generate reports", inline: true },
          { name: "🏷️ Tags", value: "Manage ticket tags", inline: true },
        ])
        .setFooter({ text: "React with an emoji to navigate • 🏠 Home • ❌ Close" })
        .setTimestamp()

      // Send the initial dashboard message
      const dashboardMessage = await interaction.reply({
        embeds: [dashboardEmbed],
        fetchReply: true,
      })

      // Add navigation reactions
      try {
        await dashboardMessage.react("📊") // Analytics
        await dashboardMessage.react("🔍") // Search
        await dashboardMessage.react("👥") // Staff
        await dashboardMessage.react("⚙️") // Settings
        await dashboardMessage.react("📝") // Reports
        await dashboardMessage.react("🏷️") // Tags
        await dashboardMessage.react("🏠") // Home
        await dashboardMessage.react("❌") // Close
      } catch (error) {
        client.errorLogger.logError("Dashboard Reactions", error, {
          user: interaction.user.tag,
          guild: interaction.guild.name,
        })
      }

      // Create a reaction collector
      const filter = (reaction, user) => {
        return user.id === interaction.user.id
      }

      const collector = dashboardMessage.createReactionCollector({ filter, time: 300000 }) // 5 minutes

      // Handle reaction collection
      collector.on("collect", async (reaction, user) => {
        // Remove user's reaction
        try {
          reaction.users.remove(user.id)
        } catch (error) {
          client.errorLogger.logWarning("Dashboard Reaction", "Failed to remove reaction", {
            user: user.tag,
            reaction: reaction.emoji.name,
          })
        }

        // Handle different reactions
        const mainMenuEmojis = ["📊", "🔍", "👥", "⚙️", "📝", "🏷️", "🏠", "❌"]
        const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]

        // Main menu navigation
        if (mainMenuEmojis.includes(reaction.emoji.name)) {
          switch (reaction.emoji.name) {
            case "📊": // Analytics
              await handleAnalyticsMenu(dashboardMessage, interaction, client)
              break
            case "🔍": // Search
              await handleSearchMenu(dashboardMessage, interaction, client)
              break
            case "👥": // Staff
              await handleStaffMenu(dashboardMessage, interaction, client)
              break
            case "⚙️": // Settings
              await handleSettingsMenu(dashboardMessage, interaction, client)
              break
            case "📝": // Reports
              await handleReportsMenu(dashboardMessage, interaction, client)
              break
            case "🏷️": // Tags
              await handleTagsMenu(dashboardMessage, interaction, client)
              break
            case "🏠": // Home
              await resetToMainMenu(dashboardMessage, dashboardEmbed)
              break
            case "❌": // Close
              collector.stop()
              break
          }
        }
        // Number menu navigation
        else if (numberEmojis.includes(reaction.emoji.name)) {
          const currentMenu = getCurrentMenu(dashboardMessage)
          const numberIndex = numberEmojis.indexOf(reaction.emoji.name)

          switch (currentMenu) {
            case "analytics":
              await handleAnalyticsSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
            case "search":
              await handleSearchSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
            case "staff":
              await handleStaffSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
            case "settings":
              await handleSettingsSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
            case "reports":
              await handleReportsSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
            case "tags":
              await handleTagsSubMenu(dashboardMessage, interaction, client, numberIndex)
              break
          }
        }
      })

      // Handle collector end
      collector.on("end", async () => {
        try {
          // Remove all reactions and update the embed
          await dashboardMessage.reactions.removeAll()

          const endedEmbed = EmbedBuilder.from(dashboardEmbed)
            .setDescription("Dashboard session has ended. Use `/dashboard` to start a new session.")
            .setFooter({ text: "Session ended" })

          await dashboardMessage.edit({ embeds: [endedEmbed] })
        } catch (error) {
          client.errorLogger.logError("Dashboard Session End", error, {
            user: interaction.user.tag,
            guild: interaction.guild.name,
          })
        }
      })
    } catch (error) {
      client.errorLogger.logError("Dashboard Command", error, {
        user: interaction.user.tag,
        guild: interaction.guild.name,
      })

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Error")
            .setDescription("An error occurred while opening the dashboard.")
            .setTimestamp(),
        ],
        ephemeral: true,
      })
    }
  },
}

// Helper function to determine if a channel is an admin channel
function isInAdminChannel(channelId, config) {
  // Check if the channel is the modmail channel, log channel, or any additional admin channels
  if (channelId === config.modmailChannelId || channelId === config.logChannelId) {
    return true
  }

  // Check additional admin channels if configured
  if (config.adminChannels && Array.isArray(config.adminChannels)) {
    return config.adminChannels.includes(channelId)
  }

  return false
}

// Helper function to get the current menu from the embed title
function getCurrentMenu(message) {
  const embed = message.embeds[0]
  if (!embed || !embed.title) return null

  const title = embed.title.toLowerCase()

  if (title.includes("analytics")) return "analytics"
  if (title.includes("search")) return "search"
  if (title.includes("staff")) return "staff"
  if (title.includes("settings")) return "settings"
  if (title.includes("reports")) return "reports"
  if (title.includes("tag")) return "tags"

  return "main"
}

// Update the resetToMainMenu function
async function resetToMainMenu(message, mainMenuEmbed) {
  try {
    // First update the embed
    await message.edit({ embeds: [mainMenuEmbed] })

    // Then clear all reactions except home and close
    await clearSubmenuReactions(message)

    // Finally add main menu reactions
    await addMainMenuReactions(message)
  } catch (error) {
    console.error("Error resetting to main menu:", error)
  }
}

// Helper function to clear submenu reactions
async function clearSubmenuReactions(message) {
  try {
    const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]

    for (const emoji of numberEmojis) {
      const reaction = message.reactions.cache.get(emoji)
      if (reaction) {
        await reaction.remove()
      }
    }
  } catch (error) {
    console.error("Error clearing submenu reactions:", error)
  }
}

// Helper function to clear main menu reactions
async function clearMainMenuReactions(message) {
  try {
    const mainMenuEmojis = ["📊", "🔍", "👥", "⚙️", "📝", "🏷️"]

    for (const emoji of mainMenuEmojis) {
      const reaction = message.reactions.cache.get(emoji)
      if (reaction) {
        await reaction.remove()
      }
    }
  } catch (error) {
    console.error("Error clearing main menu reactions:", error)
  }
}

// Helper function to add main menu reactions
async function addMainMenuReactions(message) {
  try {
    const mainMenuEmojis = ["📊", "🔍", "👥", "⚙️", "📝", "🏷️"]

    for (const emoji of mainMenuEmojis) {
      if (!message.reactions.cache.has(emoji)) {
        await message.react(emoji)
      }
    }
  } catch (error) {
    console.error("Error adding main menu reactions:", error)
  }
}

async function handleAnalyticsMenu(message, interaction, client) {
  try {
    // Create analytics embed first
    // Get analytics data
    const guildId = interaction.guild.id
    const stats = client.ticketAnalytics.getBasicStats(guildId, 30) // Last 30 days

    // Format category counts
    let categoryText = "None"
    if (Object.keys(stats.categoryCounts).length > 0) {
      categoryText = Object.entries(stats.categoryCounts)
        .map(([category, count]) => `${category}: ${count}`)
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

    // Create analytics embed
    const analyticsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📊 Ticket Analytics")
      .setDescription("Overview of ticket activity for the last 30 days")
      .addFields([
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
          inline: false,
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
      ])
      .setFooter({ text: "React with 🏠 to return to the main menu • 1️⃣ Daily • 2️⃣ Weekly • 3️⃣ Monthly" })
      .setTimestamp()

    // First update the message with the new embed
    await message.edit({ embeds: [analyticsEmbed] })

    // Then clear main menu reactions
    await clearMainMenuReactions(message)

    // Finally add number reactions for time period selection
    await message.react("1️⃣") // Daily
    await message.react("2️⃣") // Weekly
    await message.react("3️⃣") // Monthly
  } catch (error) {
    client.errorLogger.logError("Analytics Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading analytics data. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Analytics submenu handler
async function handleAnalyticsSubMenu(message, interaction, client, numberIndex) {
  try {
    let days = 30
    let periodName = "Monthly"

    // Determine time period based on number index
    switch (numberIndex) {
      case 0: // 1️⃣
        days = 1
        periodName = "Daily"
        break
      case 1: // 2️⃣
        days = 7
        periodName = "Weekly"
        break
      case 2: // 3️⃣
        days = 30
        periodName = "Monthly"
        break
      default:
        return // Invalid option
    }

    // Get analytics data for the selected period
    const guildId = interaction.guild.id
    const stats = client.ticketAnalytics.getBasicStats(guildId, days)

    // Format data (similar to handleAnalyticsMenu but with the selected time period)
    let categoryText = "None"
    if (Object.keys(stats.categoryCounts).length > 0) {
      categoryText = Object.entries(stats.categoryCounts)
        .map(([category, count]) => `${category}: ${count}`)
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

    // Create analytics embed for the selected period
    const analyticsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`📊 ${periodName} Ticket Analytics`)
      .setDescription(`Overview of ticket activity for the last ${days} day${days === 1 ? "" : "s"}`)
      .addFields([
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
          inline: false,
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
      ])
      .setFooter({ text: "React with 🏠 to return to the main menu • 1️⃣ Daily • 2️⃣ Weekly • 3️⃣ Monthly" })
      .setTimestamp()

    // Update the message
    await message.edit({ embeds: [analyticsEmbed] })
  } catch (error) {
    client.errorLogger.logError("Analytics Submenu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
      option: numberIndex,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading analytics data. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Search menu handler
async function handleSearchMenu(message, interaction, client) {
  try {
    // Clear main menu reactions
    await clearMainMenuReactions(message)

    const searchEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🔍 Ticket Search")
      .setDescription("Select a search option:")
      .addFields([
        { name: "1️⃣ Search by User", value: "Find tickets by user" },
        { name: "2️⃣ Search by Ticket ID", value: "Find a specific ticket" },
        { name: "3️⃣ Search by Content", value: "Find tickets containing specific text" },
        { name: "4️⃣ Search by Category", value: "Find tickets in a specific category" },
        { name: "5️⃣ Search by Tag", value: "Find tickets with a specific tag" },
        { name: "6️⃣ Advanced Search", value: "Search with multiple criteria" },
      ])
      .setFooter({ text: "React with a number to select an option • 🏠 Home" })
      .setTimestamp()

    await message.edit({ embeds: [searchEmbed] })

    // Add number reactions
    await message.react("1️⃣")
    await message.react("2️⃣")
    await message.react("3️⃣")
    await message.react("4️⃣")
    await message.react("5️⃣")
    await message.react("6️⃣")
  } catch (error) {
    client.errorLogger.logError("Search Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading the search menu. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Search submenu handler
async function handleSearchSubMenu(message, interaction, client, numberIndex) {
  try {
    const searchOptions = ["User", "Ticket ID", "Content", "Category", "Tag", "Advanced"]

    if (numberIndex >= 0 && numberIndex < searchOptions.length) {
      const option = searchOptions[numberIndex]

      // Create a prompt for the user to enter search criteria
      const promptEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`🔍 Search by ${option}`)
        .setDescription(`Please enter your search criteria in the chat. Type "cancel" to cancel the search.`)
        .setFooter({ text: "This prompt will expire in 2 minutes" })
        .setTimestamp()

      await message.edit({ embeds: [promptEmbed] })

      // Create a message collector to get the user's input
      const filter = (m) => m.author.id === interaction.user.id
      const collector = message.channel.createMessageCollector({
        filter,
        time: 120000, // 2 minutes
        max: 1,
      })

      collector.on("collect", async (msg) => {
        // Try to delete the user's message to keep the channel clean
        try {
          await msg.delete()
        } catch (error) {
          client.errorLogger.logWarning("Dashboard Search", "Could not delete user message", {
            error: error.message,
          })
        }

        const searchInput = msg.content

        // Check if the user wants to cancel
        if (searchInput.toLowerCase() === "cancel") {
          const cancelEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle("Search Cancelled")
            .setDescription("The search operation has been cancelled.")
            .setFooter({ text: "React with 🏠 to return to the main menu" })
            .setTimestamp()

          await message.edit({ embeds: [cancelEmbed] })
          return
        }

        // Prepare search criteria based on the selected option
        const searchCriteria = { guildId: interaction.guild.id }
        let searchDescription = ""

        switch (numberIndex) {
          case 0: // User
            // Try to find the user by mention, ID, or username
            let userId = searchInput

            // Check if it's a mention
            const mentionMatch = searchInput.match(/<@!?(\d+)>/)
            if (mentionMatch) {
              userId = mentionMatch[1]
            }

            // Try to find the user
            try {
              const user = await client.users.fetch(userId).catch(async () => {
                // If not a valid ID, try to find by username
                const members = await interaction.guild.members.fetch()
                return members.find(
                  (m) =>
                    m.user.username.toLowerCase().includes(searchInput.toLowerCase()) ||
                    m.displayName.toLowerCase().includes(searchInput.toLowerCase()),
                )?.user
              })

              if (user) {
                searchCriteria.userId = user.id
                searchDescription = `User: ${user.tag}`
              } else {
                const notFoundEmbed = new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("User Not Found")
                  .setDescription(`Could not find a user matching "${searchInput}".`)
                  .setFooter({ text: "React with 🏠 to return to the main menu" })
                  .setTimestamp()

                await message.edit({ embeds: [notFoundEmbed] })
                return
              }
            } catch (error) {
              client.errorLogger.logError("Dashboard Search User", error, {
                input: searchInput,
              })

              const errorEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Search Error")
                .setDescription("An error occurred while searching for the user.")
                .setFooter({ text: "React with 🏠 to return to the main menu" })
                .setTimestamp()

              await message.edit({ embeds: [errorEmbed] })
              return
            }
            break

          case 1: // Ticket ID
            searchCriteria.ticketId = searchInput
            searchDescription = `Ticket ID: ${searchInput}`
            break

          case 2: // Content
            searchCriteria.content = searchInput
            searchDescription = `Content: "${searchInput}"`
            break

          case 3: // Category
            // Normalize category input
            const categories = {
              general: "general",
              "general help": "general",
              tech: "tech",
              technical: "tech",
              "technical support": "tech",
              report: "report",
              "report user": "report",
              appeal: "appeal",
              feedback: "feedback",
            }

            const normalizedCategory = categories[searchInput.toLowerCase()]

            if (normalizedCategory) {
              searchCriteria.category = normalizedCategory
              searchDescription = `Category: ${getCategoryName(normalizedCategory)}`
            } else {
              const invalidCategoryEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Invalid Category")
                .setDescription(
                  `"${searchInput}" is not a valid category. Valid categories are: General Help, Technical Support, Report User, Appeal, Feedback.`,
                )
                .setFooter({ text: "React with 🏠 to return to the main menu" })
                .setTimestamp()

              await message.edit({ embeds: [invalidCategoryEmbed] })
              return
            }
            break

          case 4: // Tag
            // Get all tags for this guild
            const guildTags = client.tagManager.getGuildTags(interaction.guild.id)
            const tagNames = guildTags.map((tag) => tag.name.toLowerCase())

            if (tagNames.includes(searchInput.toLowerCase())) {
              searchCriteria.tags = [searchInput]
              searchDescription = `Tag: ${searchInput}`
            } else {
              const invalidTagEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Invalid Tag")
                .setDescription(`"${searchInput}" is not a valid tag.`)
                .setFooter({ text: "React with 🏠 to return to the main menu" })
                .setTimestamp()

              await message.edit({ embeds: [invalidTagEmbed] })
              return
            }
            break

          case 5: // Advanced
            // For advanced search, we'll parse the input as key:value pairs
            // Format: user:username content:"search text" category:general tag:important days:7
            const advancedCriteria = parseAdvancedSearch(searchInput)

            if (Object.keys(advancedCriteria).length === 0) {
              const invalidFormatEmbed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("Invalid Format")
                .setDescription(
                  `Please use the format: key:value (e.g., user:username content:"search text" category:general tag:important days:7)`,
                )
                .setFooter({ text: "React with 🏠 to return to the main menu" })
                .setTimestamp()

              await message.edit({ embeds: [invalidFormatEmbed] })
              return
            }

            // Process advanced criteria
            if (advancedCriteria.user) {
              try {
                const user = await client.users.fetch(advancedCriteria.user).catch(async () => {
                  // If not a valid ID, try to find by username
                  const members = await interaction.guild.members.fetch()
                  return members.find(
                    (m) =>
                      m.user.username.toLowerCase().includes(advancedCriteria.user.toLowerCase()) ||
                      m.displayName.toLowerCase().includes(advancedCriteria.user.toLowerCase()),
                  )?.user
                })

                if (user) {
                  searchCriteria.userId = user.id
                  searchDescription += `User: ${user.tag}\n`
                }
              } catch (error) {
                // Just skip the user filter if not found
                client.errorLogger.logWarning("Dashboard Advanced Search", "User not found", {
                  input: advancedCriteria.user,
                })
              }
            }

            if (advancedCriteria.content) {
              searchCriteria.content = advancedCriteria.content
              searchDescription += `Content: "${advancedCriteria.content}"\n`
            }

            if (advancedCriteria.category) {
              const categories = {
                general: "general",
                "general help": "general",
                tech: "tech",
                technical: "tech",
                "technical support": "tech",
                report: "report",
                "report user": "report",
                appeal: "appeal",
                feedback: "feedback",
              }

              const normalizedCategory = categories[advancedCriteria.category.toLowerCase()]

              if (normalizedCategory) {
                searchCriteria.category = normalizedCategory
                searchDescription += `Category: ${getCategoryName(normalizedCategory)}\n`
              }
            }

            if (advancedCriteria.tag) {
              searchCriteria.tags = [advancedCriteria.tag]
              searchDescription += `Tag: ${advancedCriteria.tag}\n`
            }

            if (advancedCriteria.days) {
              const days = Number.parseInt(advancedCriteria.days)
              if (!isNaN(days) && days > 0) {
                const startDate = new Date()
                startDate.setDate(startDate.getDate() - days)
                searchCriteria.startDate = startDate.toISOString()
                searchDescription += `Time period: Last ${days} days\n`
              }
            }

            if (searchDescription === "") {
              searchDescription = "No filters applied"
            }
            break
        }

        // Perform the search
        const results = client.ticketHistory.searchTickets(searchCriteria)

        if (results.length === 0) {
          const noResultsEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle("No Results Found")
            .setDescription(`No tickets found matching the criteria: ${searchDescription}`)
            .setFooter({ text: "React with 🏠 to return to the main menu" })
            .setTimestamp()

          await message.edit({ embeds: [noResultsEmbed] })
          return
        }

        // Sort results by date (newest first)
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        // Limit to 10 results for display
        const displayResults = results.slice(0, 10)

        // Create embed for results
        const resultsEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("Search Results")
          .setDescription(`Found ${results.length} tickets matching:\n${searchDescription}`)
          .setFooter({
            text:
              results.length > 10
                ? `Showing 10 of ${results.length} results. React with 🏠 to return to the main menu.`
                : `Showing all ${results.length} results. React with 🏠 to return to the main menu.`,
          })
          .setTimestamp()

        // Add fields for each result
        for (const ticket of displayResults) {
          resultsEmbed.addFields([
            {
              name: `Ticket #${ticket.id}`,
              value:
                `**User:** ${ticket.userTag || "Unknown"}\n` +
                `**Created:** ${new Date(ticket.createdAt).toLocaleString()}\n` +
                `**Status:** ${ticket.status}\n` +
                `**Category:** ${ticket.category || "None"}\n` +
                `**Tags:** ${ticket.tags && ticket.tags.length > 0 ? ticket.tags.join(", ") : "None"}\n` +
                `**Messages:** ${ticket.messageCount || 0}`,
            },
          ])
        }

        await message.edit({ embeds: [resultsEmbed] })
      })

      collector.on("end", async (collected) => {
        if (collected.size === 0) {
          // Timed out
          const timeoutEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Search Timed Out")
            .setDescription("You did not provide any search criteria within the time limit.")
            .setFooter({ text: "React with 🏠 to return to the main menu" })
            .setTimestamp()

          await message.edit({ embeds: [timeoutEmbed] })
        }
      })
    }
  } catch (error) {
    client.errorLogger.logError("Search Submenu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
      option: numberIndex,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while processing your search. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Helper function to parse advanced search input
function parseAdvancedSearch(input) {
  const result = {}
  const currentKey = null
  const currentValue = ""
  let inQuotes = false

  // Split by space, but respect quoted strings
  const tokens = []
  let currentToken = ""

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (char === '"') {
      inQuotes = !inQuotes
      currentToken += char
    } else if (char === " " && !inQuotes) {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ""
      }
    } else {
      currentToken += char
    }
  }

  if (currentToken) {
    tokens.push(currentToken)
  }

  // Process each token
  for (const token of tokens) {
    const match = token.match(/^([^:]+):(.+)$/)
    if (match) {
      const key = match[1].toLowerCase()
      let value = match[2]

      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1)
      }

      result[key] = value
    }
  }

  return result
}

// Helper function to get category name
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

// Staff menu handler
async function handleStaffMenu(message, interaction, client) {
  try {
    // Create staff performance embed first
    // Get staff performance data
    const guildId = interaction.guild.id
    const staffPerformance = client.ticketAnalytics.getStaffPerformance(guildId, 30) // Last 30 days

    if (staffPerformance.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("👥 Staff Performance")
        .setDescription("No staff performance data available for the last 30 days.")
        .setFooter({ text: "React with 🏠 to return to the main menu" })
        .setTimestamp()

      await message.edit({ embeds: [noDataEmbed] })
      return
    }

    // Create staff performance embed
    const staffEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("👥 Staff Performance")
      .setDescription("Staff performance metrics for the last 30 days")

    // Add fields for each staff member (limit to top 10)
    for (const staff of staffPerformance.slice(0, 10)) {
      staffEmbed.addFields([
        {
          name: staff.staffTag,
          value:
            `Tickets: ${staff.ticketsHandled} (${staff.closeRate} closed)\n` +
            `Avg. Response: ${staff.averageResponseTime}\n` +
            `Avg. Resolution: ${staff.averageResolutionTime}\n` +
            `Satisfaction: ${staff.averageRating}/5`,
          inline: true,
        },
      ])
    }

    // First update the message with the new embed
    await message.edit({ embeds: [staffEmbed] })

    // Then clear main menu reactions
    await clearMainMenuReactions(message)

    // Finally add number reactions for time period selection
    await message.react("1️⃣") // Daily
    await message.react("2️⃣") // Weekly
    await message.react("3️⃣") // Monthly
  } catch (error) {
    client.errorLogger.logError("Staff Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading staff performance data. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Staff submenu handler
async function handleStaffSubMenu(message, interaction, client, numberIndex) {
  try {
    let days = 30
    let periodName = "Monthly"

    // Determine time period based on number index
    switch (numberIndex) {
      case 0: // 1️⃣
        days = 1
        periodName = "Daily"
        break
      case 1: // 2️⃣
        days = 7
        periodName = "Weekly"
        break
      case 2: // 3️⃣
        days = 30
        periodName = "Monthly"
        break
      default:
        return // Invalid option
    }

    // Get staff performance data for the selected period
    const guildId = interaction.guild.id
    const staffPerformance = client.ticketAnalytics.getStaffPerformance(guildId, days)

    if (staffPerformance.length === 0) {
      const noDataEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`👥 ${periodName} Staff Performance`)
        .setDescription(`No staff performance data available for the last ${days} day${days === 1 ? "" : "s"}.`)
        .setFooter({ text: "React with 🏠 to return to the main menu • 1️⃣ Daily • 2️⃣ Weekly • 3️⃣ Monthly" })
        .setTimestamp()

      await message.edit({ embeds: [noDataEmbed] })
      return
    }

    // Create staff performance embed for the selected period
    const staffEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`👥 ${periodName} Staff Performance`)
      .setDescription(`Staff performance metrics for the last ${days} day${days === 1 ? "" : "s"}`)

    // Add fields for each staff member (limit to top 10)
    for (const staff of staffPerformance.slice(0, 10)) {
      staffEmbed.addFields([
        {
          name: staff.staffTag,
          value:
            `Tickets: ${staff.ticketsHandled} (${staff.closeRate} closed)\n` +
            `Avg. Response: ${staff.averageResponseTime}\n` +
            `Avg. Resolution: ${staff.averageResolutionTime}\n` +
            `Satisfaction: ${staff.averageRating}/5`,
          inline: true,
        },
      ])
    }

    staffEmbed
      .setFooter({ text: "React with 🏠 to return to the main menu • 1️⃣ Daily • 2️⃣ Weekly • 3️⃣ Monthly" })
      .setTimestamp()

    // Update the message
    await message.edit({ embeds: [staffEmbed] })
  } catch (error) {
    client.errorLogger.logError("Staff Submenu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
      option: numberIndex,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading staff performance data. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Settings menu handler
async function handleSettingsMenu(message, interaction, client) {
  try {
    // Clear main menu reactions
    await clearMainMenuReactions(message)

    // Get current configuration
    const config = client.configs.get(interaction.guild.id)

    // Create settings embed
    const settingsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("⚙️ Bot Settings")
      .setDescription("Current configuration:")
      .addFields([
        {
          name: "Channels",
          value: `Modmail: <#${config.modmailChannelId}>\nLogs: <#${config.logChannelId}>`,
          inline: true,
        },
        {
          name: "Staff Role",
          value: `<@&${config.staffRoleId}>`,
          inline: true,
        },
        {
          name: "Thread Mode",
          value: config.useThreads ? "Enabled" : "Disabled",
          inline: true,
        },
        {
          name: "Webhook Notifications",
          value: config.webhookUrl ? "Enabled" : "Disabled",
          inline: true,
        },
        {
          name: "Admin Channels",
          value:
            config.adminChannels && config.adminChannels.length > 0
              ? config.adminChannels.map((id) => `<#${id}>`).join(", ")
              : "None configured",
          inline: true,
        },
      ])
      .addFields([
        { name: "1️⃣ Update Channels", value: "Change modmail and log channels" },
        { name: "2️⃣ Update Staff Role", value: "Change the staff role" },
        { name: "3️⃣ Toggle Thread Mode", value: `Currently: ${config.useThreads ? "Enabled" : "Disabled"}` },
        { name: "4️⃣ Webhook Settings", value: "Configure webhook notifications" },
        { name: "5️⃣ Admin Channels", value: "Configure additional admin channels" },
      ])
      .setFooter({ text: "React with a number to select an option • 🏠 Home" })
      .setTimestamp()

    await message.edit({ embeds: [settingsEmbed] })

    // Add number reactions
    await message.react("1️⃣")
    await message.react("2️⃣")
    await message.react("3️⃣")
    await message.react("4️⃣")
    await message.react("5️⃣")
  } catch (error) {
    client.errorLogger.logError("Settings Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading settings. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Settings submenu handler
async function handleSettingsSubMenu(message, interaction, client, numberIndex) {
  // This would be implemented to handle the specific settings option selected
  // For brevity, I'm not implementing the full functionality here
  const settingsOptions = [
    "Update Channels",
    "Update Staff Role",
    "Toggle Thread Mode",
    "Webhook Settings",
    "Admin Channels",
  ]

  if (numberIndex >= 0 && numberIndex < settingsOptions.length) {
    const option = settingsOptions[numberIndex]

    const settingsPromptEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`⚙️ ${option}`)
      .setDescription(`To ${option.toLowerCase()}, please use the /setup command with the appropriate options.`)
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [settingsPromptEmbed] })
  }
}

// Reports menu handler
async function handleReportsMenu(message, interaction, client) {
  try {
    // Clear main menu reactions
    await clearMainMenuReactions(message)

    const reportsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📝 Reports")
      .setDescription("Select a report to generate:")
      .addFields([
        { name: "1️⃣ Daily Summary", value: "Generate a summary report for the last 24 hours" },
        { name: "2️⃣ Weekly Summary", value: "Generate a summary report for the last 7 days" },
        { name: "3️⃣ Monthly Summary", value: "Generate a summary report for the last 30 days" },
        { name: "4️⃣ Staff Performance", value: "Generate a staff performance report" },
        { name: "5️⃣ Category Analysis", value: "Generate a report on ticket categories" },
        { name: "6️⃣ Custom Report", value: "Generate a custom report" },
      ])
      .setFooter({ text: "React with a number to select an option • 🏠 Home" })
      .setTimestamp()

    await message.edit({ embeds: [reportsEmbed] })

    // Add number reactions
    await message.react("1️⃣")
    await message.react("2️⃣")
    await message.react("3️⃣")
    await message.react("4️⃣")
    await message.react("5️⃣")
    await message.react("6️⃣")
  } catch (error) {
    client.errorLogger.logError("Reports Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading the reports menu. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Reports submenu handler
async function handleReportsSubMenu(message, interaction, client, numberIndex) {
  try {
    let days = 30
    let reportType = "Summary"

    // Determine report type based on number index
    switch (numberIndex) {
      case 0: // 1️⃣
        days = 1
        reportType = "Daily Summary"
        break
      case 1: // 2️⃣
        days = 7
        reportType = "Weekly Summary"
        break
      case 2: // 3️⃣
        days = 30
        reportType = "Monthly Summary"
        break
      case 3: // 4️⃣
        reportType = "Staff Performance"
        break
      case 4: // 5️⃣
        reportType = "Category Analysis"
        break
      case 5: // 6️⃣
        reportType = "Custom Report"
        break
      default:
        return // Invalid option
    }

    // Create report prompt embed
    const reportPromptEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`📝 ${reportType} Report`)
      .setDescription(
        `To generate a ${reportType.toLowerCase()} report, please use the /report command with the appropriate options.`,
      )
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [reportPromptEmbed] })
  } catch (error) {
    client.errorLogger.logError("Reports Submenu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
      option: numberIndex,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while processing your report selection. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Tags menu handler
async function handleTagsMenu(message, interaction, client) {
  try {
    // Clear main menu reactions
    await clearMainMenuReactions(message)

    // Get all tags for this guild
    const guildTags = client.tagManager.getGuildTags(interaction.guild.id)

    let tagsDescription = "Manage ticket tags:"

    if (guildTags.length === 0) {
      tagsDescription += "\n\nNo tags have been created yet."
    } else {
      tagsDescription += "\n\nExisting tags:"

      // Add up to 10 tags to the description
      for (let i = 0; i < Math.min(guildTags.length, 10); i++) {
        const tag = guildTags[i]
        tagsDescription += `\n• **${tag.name}**: ${tag.description}`
      }

      if (guildTags.length > 10) {
        tagsDescription += `\n... and ${guildTags.length - 10} more.`
      }
    }

    const tagsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🏷️ Tag Management")
      .setDescription(tagsDescription)
      .addFields([
        { name: "1️⃣ View All Tags", value: "See a complete list of all tags" },
        { name: "2️⃣ Add Tag", value: "Use /tag add <tag> in a ticket" },
        { name: "3️⃣ Remove Tag", value: "Use /tag remove <tag> in a ticket" },
        { name: "4️⃣ List Ticket Tags", value: "Use /tag list in a ticket" },
      ])
      .setFooter({ text: "React with a number to select an option • 🏠 Home" })
      .setTimestamp()

    await message.edit({ embeds: [tagsEmbed] })

    // Add number reactions
    await message.react("1️⃣")
    await message.react("2️⃣")
    await message.react("3️⃣")
    await message.react("4️⃣")
  } catch (error) {
    client.errorLogger.logError("Tags Menu", error, {
      user: interaction.user.tag,
      guild: interaction.guild.name,
    })

    // Show error message
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("An error occurred while loading tags. Please try again later.")
      .setFooter({ text: "React with 🏠 to return to the main menu" })
      .setTimestamp()

    await message.edit({ embeds: [errorEmbed] })
  }
}

// Tags submenu handler
async function handleTagsSubMenu(message, interaction, client, numberIndex) {
  // This would be implemented to handle the specific tags option selected
  // For brevity, I'm not implementing the full functionality here
  const tagsOptions = ["View All Tags", "Add Tag", "Remove Tag", "List Ticket Tags"]

  if (numberIndex >= 0 && numberIndex < tagsOptions.length) {
    const option = tagsOptions[numberIndex]

    if (numberIndex === 0) {
      // View All Tags
      try {
        // Get all tags for this guild
        const guildTags = client.tagManager.getGuildTags(interaction.guild.id)

        if (guildTags.length === 0) {
          const noTagsEmbed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle("🏷️ All Tags")
            .setDescription("No tags have been created yet.")
            .setFooter({ text: "React with 🏠 to return to the main menu" })
            .setTimestamp()

          await message.edit({ embeds: [noTagsEmbed] })
          return
        }

        // Create embed with all tags
        const allTagsEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("🏷️ All Tags")
          .setDescription(`Total tags: ${guildTags.length}`)
          .setFooter({ text: "React with 🏠 to return to the main menu" })
          .setTimestamp()

        // Add fields for each tag
        guildTags.forEach((tag) => {
          allTagsEmbed.addFields([
            {
              name: tag.name,
              value: tag.description || "No description",
              inline: true,
            },
          ])
        })

        await message.edit({ embeds: [allTagsEmbed] })
      } catch (error) {
        client.errorLogger.logError("Tags View All", error, {
          user: interaction.user.tag,
          guild: interaction.guild.name,
        })

        // Show error message
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Error")
          .setDescription("An error occurred while loading tags. Please try again later.")
          .setFooter({ text: "React with 🏠 to return to the main menu" })
          .setTimestamp()

        await message.edit({ embeds: [errorEmbed] })
      }
    } else {
      // For other options, show a prompt to use the appropriate command
      const tagsPromptEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`🏷️ ${option}`)
        .setDescription(`To ${option.toLowerCase()}, please use the /tag command in a ticket.`)
        .setFooter({ text: "React with 🏠 to return to the main menu" })
        .setTimestamp()

      await message.edit({ embeds: [tagsPromptEmbed] })
    }
  }
}
