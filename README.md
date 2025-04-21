# Advanced Discord Modmail Bot

A comprehensive Discord modmail bot that allows users to contact server staff through DMs.

## Features

- **Initial Setup**: Easy configuration for modmail channels, staff roles, and logging
- **User Interaction**: Creates tickets when users DM the bot
- **Pending Status**: New tickets are marked as "Pending"
- **Reaction-Based Workflow**: Staff can claim tickets with reactions
- **Ticket Assignment**: Tickets are assigned to staff members who claim them
- **Staff-User Communication**: Two-way communication between staff and users
- **Ticket Closure**: Staff can close tickets with a command
- **Logging**: All modmail interactions are logged
- **Error Handling**: Robust error handling for potential issues

## Setup

1. Clone this repository
2. Install dependencies with `npm install`
3. Create a `.env` file with your Discord bot token and client ID
4. Deploy slash commands with `npm run deploy`
5. Start the bot with `npm start`

## Commands

- `/setup` - Set up the modmail system (Admin only)
- `/close [reason]` - Close a modmail ticket (Staff only)

## Usage

1. Users can DM the bot to create a ticket
2. Staff can claim tickets by reacting with ✅
3. Staff can reply to users by sending messages in the modmail channel
4. Staff can close tickets with the `/close` command

## Configuration

The bot stores configuration in a `config.json` file with the following structure:

\`\`\`json
{
  "guildId": {
    "modmailChannelId": "channel_id",
    "logChannelId": "channel_id",
    "staffRoleId": "role_id"
  }
}
