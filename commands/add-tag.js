const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js")
const tagManager = require("../utils/tag-manager")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-tag")
    .setDescription("Add a new tag for ticket categorization")
    .addStringOption((option) => option.setName("name").setDescription("The name of the tag").setRequired(true))
    .addStringOption((option) =>
      option.setName("description").setDescription("A description of what this tag is used for").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("color").setDescription("The color for this tag (hex code)").setRequired(false),
    )
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
        content: "You do not have permission to add tags.",
        ephemeral: true,
      })
    }

    const name = interaction.options.getString("name")
    const description = interaction.options.getString("description")
    const color = interaction.options.getString("color") || "#cccccc"

    // Validate color format
    if (color && !color.match(/^#[0-9A-Fa-f]{6}$/)) {
      return interaction.reply({
        content: "Invalid color format. Please use a hex color code (e.g., #ff0000).",
        ephemeral: true,
      })
    }

    // Create the tag
    const tag = {
      name,
      description,
      color,
      createdBy: interaction.user.id,
      createdAt: new Date().toISOString(),
    }

    const result = tagManager.addTag(interaction.guild.id, tag)

    if (!result.success) {
      return interaction.reply({
        content: `Failed to add tag: ${result.message}`,
        ephemeral: true,
      })
    }

    const tagEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle("Tag Added")
      .setDescription(`The tag "${name}" has been added successfully.`)
      .addFields(
        { name: "Name", value: name, inline: true },
        { name: "Description", value: description, inline: true },
        { name: "Color", value: color, inline: true },
      )
      .setFooter({ text: `Created by ${member.displayName || interaction.user.username}` })
      .setTimestamp()

    await interaction.reply({
      embeds: [tagEmbed],
    })

    // Log the tag addition
    const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
    const logEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Tag Added")
      .setDescription(`A new tag has been added by ${member.displayName || interaction.user.username}`)
      .addFields(
        { name: "Name", value: name, inline: true },
        { name: "Description", value: description.substring(0, 1024), inline: false },
      )
      .setTimestamp()

    await logChannel.send({ embeds: [logEmbed] })
  },
}
