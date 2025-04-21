const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")
const tagManager = require("../utils/tag-manager")
const ticketHistory = require("../utils/ticket-history")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Add or remove tags from the current ticket")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a tag to the current ticket")
        .addStringOption((option) =>
          option.setName("tag").setDescription("The tag to add").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a tag from the current ticket")
        .addStringOption((option) =>
          option.setName("tag").setDescription("The tag to remove").setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all tags on the current ticket")),

  async execute(interaction, client) {
    // Check if the command is used in a modmail channel
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    // Check if the user has the staff role
    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (!member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({
        content: "You do not have permission to manage ticket tags.",
        ephemeral: true,
      })
    }

    // Find the ticket associated with this channel
    const ticket = Array.from(client.tickets.values()).find(
      (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id,
    )

    if (!ticket) {
      return interaction.reply({
        content: "This is not a modmail ticket channel.",
        ephemeral: true,
      })
    }

    const subcommand = interaction.options.getSubcommand()

    try {
      switch (subcommand) {
        case "add":
          await handleAddTag(interaction, client, ticket)
          break
        case "remove":
          await handleRemoveTag(interaction, client, ticket)
          break
        case "list":
          await handleListTags(interaction, client, ticket)
          break
      }
    } catch (error) {
      console.error(`Error handling ticket tag ${subcommand}:`, error)
      await interaction.reply({
        content: "An error occurred while managing ticket tags.",
        ephemeral: true,
      })
    }
  },

  async autocomplete(interaction, client) {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === "tag") {
      try {
        // Get all tags for this guild
        const guildTags = tagManager.getGuildTags(interaction.guild.id)

        // For remove subcommand, only show tags that are on the ticket
        if (interaction.options.getSubcommand() === "remove") {
          // Find the ticket
          const ticket = Array.from(client.tickets.values()).find(
            (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id,
          )

          if (ticket && ticket.tags && ticket.tags.length > 0) {
            // Filter to only show tags that are on the ticket
            const filtered = guildTags
              .filter(
                (tag) =>
                  ticket.tags.includes(tag.name) && tag.name.toLowerCase().includes(focusedOption.value.toLowerCase()),
              )
              .map((tag) => ({ name: tag.name, value: tag.name }))
              .slice(0, 25)

            return await interaction.respond(filtered)
          }
        }

        // For add subcommand, filter based on input
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

async function handleAddTag(interaction, client, ticket) {
  const tagName = interaction.options.getString("tag")
  const member = await interaction.guild.members.fetch(interaction.user.id)

  // Check if the tag exists
  const tag = tagManager.getTag(interaction.guild.id, tagName)

  if (!tag) {
    return interaction.reply({
      content: `The tag "${tagName}" does not exist.`,
      ephemeral: true,
    })
  }

  // Check if the ticket already has this tag
  if (ticket.tags && ticket.tags.includes(tagName)) {
    return interaction.reply({
      content: `This ticket already has the tag "${tagName}".`,
      ephemeral: true,
    })
  }

  // Add the tag to the ticket
  if (!ticket.tags) {
    ticket.tags = []
  }

  ticket.tags.push(tagName)

  // Add an event to the ticket
  if (!ticket.events) {
    ticket.events = []
  }

  ticket.events.push({
    type: "tag_added",
    tag: tagName,
    by: interaction.user.id,
    byTag: interaction.user.tag,
    timestamp: new Date().toISOString(),
  })

  // Update the ticket in the collection
  client.tickets.set(ticket.id, ticket)

  // Update the info message
  try {
    const channel = await interaction.guild.channels.fetch(ticket.channelId)
    const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

    const embed = infoMessage.embeds[0]
    const fields = [...embed.fields]

    // Update or add tags field
    const tagsFieldIndex = fields.findIndex((field) => field.name === "Tags")

    if (tagsFieldIndex !== -1) {
      fields[tagsFieldIndex] = {
        name: "Tags",
        value: ticket.tags.join(", "),
        inline: true,
      }
    } else {
      fields.push({
        name: "Tags",
        value: ticket.tags.join(", "),
        inline: true,
      })
    }

    const updatedEmbed = {
      ...embed,
      fields: fields,
    }

    await infoMessage.edit({ embeds: [updatedEmbed] })
  } catch (error) {
    console.error("Error updating info message with tag:", error)
  }

  // Reply to the interaction
  const tagEmbed = new EmbedBuilder()
    .setColor(tag.color || "#cccccc")
    .setTitle("Tag Added")
    .setDescription(`The tag "${tagName}" has been added to this ticket.`)
    .addFields(
      { name: "Tag", value: tagName, inline: true },
      { name: "Description", value: tag.description || "No description", inline: true },
    )
    .setFooter({ text: `Added by ${member.displayName || interaction.user.username}` })
    .setTimestamp()

  await interaction.reply({
    embeds: [tagEmbed],
  })
}

async function handleRemoveTag(interaction, client, ticket) {
  const tagName = interaction.options.getString("tag")

  // Check if the ticket has this tag
  if (!ticket.tags || !ticket.tags.includes(tagName)) {
    return interaction.reply({
      content: `This ticket does not have the tag "${tagName}".`,
      ephemeral: true,
    })
  }

  // Remove the tag from the ticket
  ticket.tags = ticket.tags.filter((t) => t !== tagName)

  // Add an event to the ticket
  if (!ticket.events) {
    ticket.events = []
  }

  ticket.events.push({
    type: "tag_removed",
    tag: tagName,
    by: interaction.user.id,
    byTag: interaction.user.tag,
    timestamp: new Date().toISOString(),
  })

  // Update the ticket in the collection
  client.tickets.set(ticket.id, ticket)

  // Update the info message
  try {
    const channel = await interaction.guild.channels.fetch(ticket.channelId)
    const infoMessage = await channel.messages.fetch(ticket.infoMessageId)

    const embed = infoMessage.embeds[0]
    const fields = [...embed.fields]

    // Update tags field
    const tagsFieldIndex = fields.findIndex((field) => field.name === "Tags")

    if (tagsFieldIndex !== -1) {
      if (ticket.tags.length > 0) {
        fields[tagsFieldIndex] = {
          name: "Tags",
          value: ticket.tags.join(", "),
          inline: true,
        }
      } else {
        // Remove the field if there are no tags
        fields.splice(tagsFieldIndex, 1)
      }
    }

    const updatedEmbed = {
      ...embed,
      fields: fields,
    }

    await infoMessage.edit({ embeds: [updatedEmbed] })
  } catch (error) {
    console.error("Error updating info message after removing tag:", error)
  }

  // Reply to the interaction
  await interaction.reply({
    content: `The tag "${tagName}" has been removed from this ticket.`,
    ephemeral: true,
  })
}

async function handleListTags(interaction, client, ticket) {
  if (!ticket.tags || ticket.tags.length === 0) {
    return interaction.reply({
      content: "This ticket has no tags.",
      ephemeral: true,
    })
  }

  // Get tag details
  const guildTags = tagManager.getGuildTags(interaction.guild.id)
  const ticketTags = ticket.tags.map((tagName) => {
    const tagDetails = guildTags.find((t) => t.name === tagName) || {
      name: tagName,
      description: "Unknown tag",
      color: "#cccccc",
    }
    return tagDetails
  })

  // Create embed
  const tagsEmbed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("Ticket Tags")
    .setDescription(`This ticket has the following tags:`)
    .addFields(
      ticketTags.map((tag) => ({
        name: tag.name,
        value: tag.description || "No description",
        inline: true,
      })),
    )
    .setFooter({ text: `Ticket #${ticket.id}` })
    .setTimestamp()

  await interaction.reply({
    embeds: [tagsEmbed],
  })
}
