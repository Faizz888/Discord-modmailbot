const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require("discord.js")
const fs = require("fs")
const security = require("../utils/security")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Set up the modmail system")
    .addChannelOption((option) =>
      option
        .setName("modmail_channel")
        .setDescription("The channel where modmail tickets will be posted")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    )
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("The channel where modmail logs will be posted")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText),
    )
    .addRoleOption((option) =>
      option.setName("staff_role").setDescription("The role that can handle modmail tickets").setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("use_threads")
        .setDescription("Whether to use threads for tickets instead of the main channel (recommended)")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("webhook_url")
        .setDescription("Webhook URL for external notifications (optional)")
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("admin_channel1")
        .setDescription("Additional admin channel (optional)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText),
    )
    .addChannelOption((option) =>
      option
        .setName("admin_channel2")
        .setDescription("Additional admin channel (optional)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText),
    )
    .addChannelOption((option) =>
      option
        .setName("admin_channel3")
        .setDescription("Additional admin channel (optional)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    try {
      const modmailChannel = interaction.options.getChannel("modmail_channel")
      const logChannel = interaction.options.getChannel("log_channel")
      const staffRole = interaction.options.getRole("staff_role")
      const useThreads = interaction.options.getBoolean("use_threads") ?? true // Default to true
      const webhookUrl = interaction.options.getString("webhook_url") || null

      // Get additional admin channels
      const adminChannel1 = interaction.options.getChannel("admin_channel1")
      const adminChannel2 = interaction.options.getChannel("admin_channel2")
      const adminChannel3 = interaction.options.getChannel("admin_channel3")

      // Create array of admin channel IDs (excluding null values)
      const adminChannels = [adminChannel1?.id, adminChannel2?.id, adminChannel3?.id].filter(Boolean) // Remove null/undefined values

      // Validate webhook URL if provided
      if (webhookUrl && !security.isValidWebhookUrl(webhookUrl)) {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("❌ Invalid Webhook URL")
              .setDescription("The webhook URL provided is not valid. Please provide a valid Discord webhook URL.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Validate permissions
      try {
        // Check if bot has permissions in modmail channel
        const botMember = await interaction.guild.members.fetchMe()
        const modmailPerms = modmailChannel.permissionsFor(botMember)

        if (
          !modmailPerms.has("ViewChannel") ||
          !modmailPerms.has("SendMessages") ||
          !modmailPerms.has("EmbedLinks") ||
          !modmailPerms.has("AddReactions")
        ) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("❌ Permission Error")
                .setDescription(
                  "I don't have the required permissions in the modmail channel. I need: View Channel, Send Messages, Embed Links, and Add Reactions.",
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          })
        }

        // Check if bot has permissions in log channel
        const logPerms = logChannel.permissionsFor(botMember)
        if (!logPerms.has("ViewChannel") || !logPerms.has("SendMessages") || !logPerms.has("EmbedLinks")) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("❌ Permission Error")
                .setDescription(
                  "I don't have the required permissions in the log channel. I need: View Channel, Send Messages, and Embed Links.",
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          })
        }

        // Check thread permissions if using threads
        if (useThreads && (!modmailPerms.has("CreatePublicThreads") || !modmailPerms.has("ManageThreads"))) {
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle("❌ Permission Error")
                .setDescription(
                  "I don't have the required permissions to use threads. I need: Create Public Threads and Manage Threads.",
                )
                .setTimestamp(),
            ],
            ephemeral: true,
          })
        }

        // Check permissions in admin channels if provided
        for (const channelId of adminChannels) {
          const channel = await interaction.guild.channels.fetch(channelId)
          const adminPerms = channel.permissionsFor(botMember)

          if (!adminPerms.has("ViewChannel") || !adminPerms.has("SendMessages") || !adminPerms.has("EmbedLinks")) {
            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xff0000)
                  .setTitle("❌ Permission Error")
                  .setDescription(
                    `I don't have the required permissions in the admin channel <#${channelId}>. I need: View Channel, Send Messages, and Embed Links.`,
                  )
                  .setTimestamp(),
              ],
              ephemeral: true,
            })
          }
        }
      } catch (error) {
        client.errorLogger.logError("Setup Command", error, {
          guild: interaction.guild.name,
          user: interaction.user.tag,
        })

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("❌ Error")
              .setDescription("An error occurred while checking permissions. Please try again later.")
              .setTimestamp(),
          ],
          ephemeral: true,
        })
      }

      // Save configuration to a file
      const config = {
        guildId: interaction.guild.id,
        modmailChannelId: modmailChannel.id,
        logChannelId: logChannel.id,
        staffRoleId: staffRole.id,
        useThreads: useThreads,
        webhookUrl: webhookUrl,
        adminChannels: adminChannels.length > 0 ? adminChannels : [],
        setupBy: interaction.user.id,
        setupAt: new Date().toISOString(),
      }

      // Store in memory
      client.configs.set(interaction.guild.id, config)

      // Save to file
      const configPath = "./config.json"
      let configs = {}

      if (fs.existsSync(configPath)) {
        const configFile = fs.readFileSync(configPath)
        configs = JSON.parse(configFile)
      }

      configs[interaction.guild.id] = config
      fs.writeFileSync(configPath, JSON.stringify(configs, null, 2))

      // Create data directories if they don't exist
      const dirs = ["./data", "./reports", "./transcripts", "./logs"]
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
      }

      // Send success message
      const setupEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ Modmail System Setup")
        .setDescription("The modmail system has been successfully configured!")
        .addFields([
          { name: "📩 Modmail Channel", value: `${modmailChannel}`, inline: true },
          { name: "📝 Log Channel", value: `${logChannel}`, inline: true },
          { name: "👨‍💼 Staff Role", value: `${staffRole}`, inline: true },
          { name: "🧵 Using Threads", value: useThreads ? "Yes ✅" : "No ❌", inline: true },
          { name: "🔔 Webhook Notifications", value: webhookUrl ? "Enabled ✅" : "Disabled ❌", inline: true },
        ])
        .setFooter({ text: "Users can now DM me to create tickets" })
        .setTimestamp()

      // Add admin channels field if any were configured
      if (adminChannels.length > 0) {
        setupEmbed.addFields([
          {
            name: "🛠️ Admin Channels",
            value: adminChannels.map((id) => `<#${id}>`).join(", "),
            inline: false,
          },
        ])
      }

      await interaction.reply({
        embeds: [setupEmbed],
        ephemeral: true,
      })

      // Log setup in the log channel
      const member = await interaction.guild.members.fetch(interaction.user.id)
      const logEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("⚙️ Modmail System Setup")
        .setDescription(`The modmail system has been set up by ${member.displayName || interaction.user.username}`)
        .addFields([
          { name: "📩 Modmail Channel", value: `${modmailChannel}`, inline: true },
          { name: "📝 Log Channel", value: `${logChannel}`, inline: true },
          { name: "👨‍💼 Staff Role", value: `${staffRole}`, inline: true },
          { name: "🧵 Using Threads", value: useThreads ? "Yes ✅" : "No ❌", inline: true },
          { name: "🔔 Webhook Notifications", value: webhookUrl ? "Enabled ✅" : "Disabled ❌", inline: true },
        ])
        .setTimestamp()

      // Add admin channels field if any were configured
      if (adminChannels.length > 0) {
        logEmbed.addFields([
          {
            name: "🛠️ Admin Channels",
            value: adminChannels.map((id) => `<#${id}>`).join(", "),
            inline: false,
          },
        ])
      }

      await logChannel.send({ embeds: [logEmbed] })

      // Send welcome message to modmail channel
      const welcomeEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎉 Modmail System Active")
        .setDescription("This channel is now set up to receive modmail tickets.")
        .addFields([
          {
            name: "ℹ️ How it works",
            value:
              "When users DM the bot, their messages will appear here. " +
              (useThreads ? "Each ticket will create a new thread." : "Staff can reply directly in this channel."),
          },
          {
            name: "🛠️ Staff Commands",
            value:
              "• `/close [reason]` - Close a ticket\n" +
              "• `/category <category>` - Set ticket category\n" +
              "• `/priority <level>` - Set ticket priority\n" +
              "• `/tag add <tag>` - Add a tag to a ticket\n" +
              "• `/open <user>` - Start a conversation with a user\n" +
              "• Start a message with `#` for staff-only notes",
          },
        ])
        .setFooter({ text: "Type /help for more commands" })
        .setTimestamp()

      await modmailChannel.send({ embeds: [welcomeEmbed] })

      // Send welcome message to each admin channel
      if (adminChannels.length > 0) {
        const adminWelcomeEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🛠️ Modmail Admin Channel Active")
          .setDescription("This channel has been set up as an admin channel for the modmail system.")
          .addFields([
            {
              name: "⚙️ Admin Commands",
              value:
                "• `/dashboard` - Access the admin dashboard\n" +
                "• `/analytics` - View ticket analytics\n" +
                "• `/report` - Generate reports\n" +
                "• `/search` - Search for tickets\n" +
                "• `/blacklist` - Manage the user blacklist",
            },
          ])
          .setFooter({ text: "Type /help for more commands" })
          .setTimestamp()

        for (const channelId of adminChannels) {
          try {
            const adminChannel = await interaction.guild.channels.fetch(channelId)
            await adminChannel.send({ embeds: [adminWelcomeEmbed] })
          } catch (error) {
            client.errorLogger.logWarning(
              "Setup Command",
              `Failed to send welcome message to admin channel ${channelId}`,
              {
                error: error.message,
              },
            )
          }
        }
      }

      // Log successful setup
      client.errorLogger.logInfo("Setup Command", "Modmail system successfully set up", {
        guild: interaction.guild.name,
        user: interaction.user.tag,
        channels: {
          modmail: modmailChannel.name,
          log: logChannel.name,
          adminChannels: adminChannels.length > 0 ? adminChannels : "None",
        },
        staffRole: staffRole.name,
        useThreads: useThreads,
      })
    } catch (error) {
      client.errorLogger.logError("Setup Command", error, {
        guild: interaction.guild.name,
        user: interaction.user.tag,
      })

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("❌ Error")
            .setDescription("An error occurred while setting up the modmail system. Please try again later.")
            .setTimestamp(),
        ],
        ephemeral: true,
      })
    }
  },
}
