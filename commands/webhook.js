const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const fs = require("fs")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("webhook")
    .setDescription("Manage webhook notifications for modmail")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("set")
        .setDescription("Set a webhook URL for notifications")
        .addStringOption((option) =>
          option.setName("url").setDescription("The webhook URL to send notifications to").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("remove").setDescription("Remove the webhook URL"))
    .addSubcommand((subcommand) => subcommand.setName("test").setDescription("Send a test notification to the webhook"))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    const subcommand = interaction.options.getSubcommand()

    try {
      if (subcommand === "set") {
        const webhookUrl = interaction.options.getString("url")

        // Validate webhook URL format
        if (
          !webhookUrl.startsWith("https://discord.com/api/webhooks/") &&
          !webhookUrl.startsWith("https://discordapp.com/api/webhooks/")
        ) {
          return interaction.reply({
            content: "Invalid webhook URL. Please provide a valid Discord webhook URL.",
            ephemeral: true,
          })
        }

        // Update config
        config.webhookUrl = webhookUrl
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

        await interaction.reply({
          content: "Webhook URL has been set for modmail notifications.",
          ephemeral: true,
        })

        // Log the webhook setup
        const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
        const member = await interaction.guild.members.fetch(interaction.user.id)
        const logEmbed = {
          color: 0x00ff00,
          title: "Webhook Notifications Set Up",
          description: `Webhook notifications have been set up by ${member.displayName || interaction.user.username}`,
          timestamp: new Date().toISOString(),
        }

        await logChannel.send({ embeds: [logEmbed] })
      } else if (subcommand === "remove") {
        // Remove webhook URL
        config.webhookUrl = null
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

        await interaction.reply({
          content: "Webhook URL has been removed. Notifications are now disabled.",
          ephemeral: true,
        })

        // Log the webhook removal
        const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
        const member = await interaction.guild.members.fetch(interaction.user.id)
        const logEmbed = {
          color: 0xff0000,
          title: "Webhook Notifications Disabled",
          description: `Webhook notifications have been disabled by ${member.displayName || interaction.user.username}`,
          timestamp: new Date().toISOString(),
        }

        await logChannel.send({ embeds: [logEmbed] })
      } else if (subcommand === "test") {
        // Check if webhook URL is set
        if (!config.webhookUrl) {
          return interaction.reply({
            content: "No webhook URL is set. Please set a webhook URL first.",
            ephemeral: true,
          })
        }

        // Send test notification
        const webhookData = {
          embeds: [
            {
              title: "Test Notification",
              description: "This is a test notification from the modmail bot.",
              color: 0x00ff00,
              fields: [
                { name: "Server", value: interaction.guild.name, inline: true },
                { name: "Sent By", value: interaction.user.tag, inline: true },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }

        try {
          const response = await fetch(config.webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(webhookData),
          })

          if (response.ok) {
            await interaction.reply({
              content: "Test notification sent successfully!",
              ephemeral: true,
            })
          } else {
            await interaction.reply({
              content: `Failed to send test notification. Status: ${response.status}`,
              ephemeral: true,
            })
          }
        } catch (error) {
          console.error("Error sending test webhook notification:", error)
          await interaction.reply({
            content: "An error occurred while sending the test notification.",
            ephemeral: true,
          })
        }
      }
    } catch (error) {
      console.error("Error managing webhook:", error)
      await interaction.reply({
        content: "An error occurred while managing the webhook.",
        ephemeral: true,
      })
    }
  },
}
