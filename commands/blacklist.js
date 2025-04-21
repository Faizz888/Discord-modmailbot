const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const fs = require("fs")
const path = require("path")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Manage the modmail blacklist")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a user to the blacklist")
        .addUserOption((option) => option.setName("user").setDescription("The user to blacklist").setRequired(true))
        .addStringOption((option) =>
          option.setName("reason").setDescription("The reason for blacklisting").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a user from the blacklist")
        .addUserOption((option) => option.setName("user").setDescription("The user to remove").setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all blacklisted users"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

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
        content: "You do not have permission to manage the blacklist.",
        ephemeral: true,
      })
    }

    const subcommand = interaction.options.getSubcommand()

    try {
      // Load blacklist
      const blacklistPath = path.join(__dirname, "../blacklist.json")
      let blacklist = {}

      if (fs.existsSync(blacklistPath)) {
        const blacklistFile = fs.readFileSync(blacklistPath)
        blacklist = JSON.parse(blacklistFile)
      }

      // Initialize guild blacklist if it doesn't exist
      if (!blacklist[interaction.guild.id]) {
        blacklist[interaction.guild.id] = {}
      }

      const guildBlacklist = blacklist[interaction.guild.id]

      if (subcommand === "add") {
        const user = interaction.options.getUser("user")
        const reason = interaction.options.getString("reason")

        // Add user to blacklist
        guildBlacklist[user.id] = {
          username: user.tag,
          reason: reason,
          blacklistedBy: interaction.user.tag,
          blacklistedAt: new Date().toISOString(),
        }

        // Save blacklist
        fs.writeFileSync(blacklistPath, JSON.stringify(blacklist, null, 2))

        await interaction.reply({
          content: `User ${user.tag} has been added to the blacklist. Reason: ${reason}`,
        })

        // Log the blacklist addition
        const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
        const logEmbed = {
          color: 0xff0000,
          title: "User Blacklisted",
          description: `${user.tag} (${user.id}) has been blacklisted by ${member.displayName || interaction.user.username}`,
          fields: [{ name: "Reason", value: reason }],
          timestamp: new Date().toISOString(),
        }

        await logChannel.send({ embeds: [logEmbed] })
      } else if (subcommand === "remove") {
        const user = interaction.options.getUser("user")

        // Check if user is blacklisted
        if (!guildBlacklist[user.id]) {
          return interaction.reply({
            content: `User ${user.tag} is not blacklisted.`,
            ephemeral: true,
          })
        }

        // Remove user from blacklist
        delete guildBlacklist[user.id]

        // Save blacklist
        fs.writeFileSync(blacklistPath, JSON.stringify(blacklist, null, 2))

        await interaction.reply({
          content: `User ${user.tag} has been removed from the blacklist.`,
        })

        // Log the blacklist removal
        const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
        const logEmbed = {
          color: 0x00ff00,
          title: "User Removed from Blacklist",
          description: `${user.tag} (${user.id}) has been removed from the blacklist by ${member.displayName || interaction.user.username}`,
          timestamp: new Date().toISOString(),
        }

        await logChannel.send({ embeds: [logEmbed] })
      } else if (subcommand === "list") {
        // Get all blacklisted users
        const blacklistedUsers = Object.entries(guildBlacklist)

        if (blacklistedUsers.length === 0) {
          return interaction.reply({
            content: "There are no blacklisted users.",
            ephemeral: true,
          })
        }

        // Create embed with blacklisted users
        const blacklistEmbed = {
          color: 0xff0000,
          title: "Blacklisted Users",
          description: "Here are all the users who are blacklisted from using modmail:",
          fields: blacklistedUsers.map(([userId, data]) => ({
            name: data.username,
            value: `ID: ${userId}\nReason: ${data.reason}\nBlacklisted by: ${data.blacklistedBy}\nDate: ${new Date(
              data.blacklistedAt,
            ).toLocaleString()}`,
          })),
          timestamp: new Date().toISOString(),
        }

        await interaction.reply({ embeds: [blacklistEmbed] })
      }
    } catch (error) {
      console.error("Error managing blacklist:", error)
      await interaction.reply({
        content: "An error occurred while managing the blacklist.",
        ephemeral: true,
      })
    }
  },
}
