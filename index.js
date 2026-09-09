const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
  ],
});

const prefix = ',';
const warns = new Map();
const inviteCache = new Map();

// ─── AUTO-MOD ───
const badWords = ['badword1', 'badword2'];
const inviteRegex = /discord(?:\.gg|app\.com\/invite)\/\w+/i;

// ─── LOG HELPER ───
async function logAction(guild, title, color, fields) {
  const logChannel = guild.channels.cache.find(c => c.name === 'staff-log');
  if (!logChannel) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .addFields(fields)
    .setTimestamp();
  logChannel.send({ embeds: [embed] });
}

// ─── INVITE TRACKER INIT ───
client.on('clientReady', async () => {
  const guild = client.guilds.cache.first();
  if (!guild) return;
  try {
    const invites = await guild.invites.fetch();
    invites.forEach(inv => inviteCache.set(inv.code, inv.uses));
  } catch {}
});

// ─── STAFF LOG: KICKS / BANS ───
client.on('guildMemberRemove', async (member) => {
  const guild = member.guild;
  const logChannel = guild.channels.cache.find(c => c.name === 'staff-log');
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setColor(0x991b1b)
    .setTitle('Member Removed')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });
});

// ─── STAFF LOG: JOINS + INVITE TRACKER ───
client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  const logChannel = guild.channels.cache.find(c => c.name === 'staff-log');
  if (!logChannel) return;

  let inviter = 'Unknown (no invite / direct link)';
  try {
    const invites = await guild.invites.fetch();
    for (const [code, invite] of invites) {
      const oldUses = inviteCache.get(code) || 0;
      if (invite.uses > oldUses) {
        const inviterUser = guild.members.cache.get(invite.inviter?.id);
        inviter = inviterUser ? `${inviterUser.user.tag} (\`${inviterUser.id}\`)` : `Unknown (\`${invite.inviter?.id}\`)`;
        inviteCache.set(code, invite.uses);
        break;
      }
    }
  } catch {}

  const ageMs = Date.now() - member.user.createdTimestamp;
  const ageDays = Math.floor(ageMs / 86400000);
  const ageStr = ageDays < 1 ? `${Math.floor(ageMs / 3600000)}h` : `${ageDays}d`;

  const embed = new EmbedBuilder()
    .setColor(0x1e1e2e)
    .setTitle('Member Joined')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'Account Age', value: ageStr, inline: true },
      { name: 'Invited By', value: inviter, inline: true }
    )
    .setTimestamp();

  logChannel.send({ embeds: [embed] });

  if (ageDays < 7) {
    const warnEmbed = new EmbedBuilder()
      .setColor(0x991b1b)
      .setDescription(`⚠️ **New account** — ${member.user.tag} is only **${ageStr}** old. Monitor.`);
    logChannel.send({ embeds: [warnEmbed] });
  }
});

// ─── VERIFY BUTTON ───
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify') {
    const verifiedRole = interaction.guild.roles.cache.find(r => r.name === 'verified');
    if (!verifiedRole) return interaction.reply({ content: '❌ No `verified` role found.', ephemeral: true });

    if (interaction.member.roles.cache.has(verifiedRole.id)) {
      return interaction.reply({ content: '✅ Already verified.', ephemeral: true });
    }

    await interaction.member.roles.add(verifiedRole);
    await interaction.update({ content: '✅ You are verified. Enjoy!', components: [] });
  }
});

// ─── MESSAGE HANDLER ───
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Trap channel
  if (message.channel.name === 'do-not-type-here') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.delete().catch(() => {});
      try {
        await message.member.ban({ reason: `Trap channel. ID: ${message.author.id}` });
      } catch {}
      await logAction(message.guild, 'Trap Channel Ban', 0x991b1b, [
        { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)` },
        { name: 'Reason', value: 'Typed in trap channel' }
      ]);
      return;
    }
  }

  // Auto-mod
  if (badWords.some(w => message.content.toLowerCase().includes(w)) || inviteRegex.test(message.content)) {
    await message.delete().catch(() => {});
    message.channel.send(`⚠️ @${message.author.username} — message removed (banned word / invite link).`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    await logAction(message.guild, 'Auto-Mod Triggered', 0x991b1b, [
      { name: 'User', value: `${message.author.tag} (\`${message.author.id}\`)` },
      { name: 'Channel', value: `#${message.channel.name}` },
      { name: 'Content', value: message.content.slice(0, 200) || '(empty)' }
    ]);
    return;
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const member = message.mentions.members.first();

  if (!member && ['ban', 'kick', 'timeout', 'warn', 'unmute', 'mute', 'nick', 'resetwarns', 'softban', 'unsoftban', 'kickreq'].includes(cmd)) {
    return message.reply('Please mention a user.');
  }

  // ─── BAN ───
  if (cmd === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You need Ban Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.ban({ reason });
    await logAction(message.guild, 'Ban', 0x991b1b, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` },
      { name: 'Reason', value: reason }
    ]);
    message.reply(`🔨 ${member.user.tag} has been banned.`);
  }

  // ─── UNBAN ───
  if (cmd === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You need Ban Members permission.');
    const userId = args[0];
    if (!userId || isNaN(userId)) return message.reply('Usage: `,unban 123456789012345678`');
    await message.guild.members.unban(userId, args.slice(1).join(' ') || 'Unbanned')
      .then(() => {
        logAction(message.guild, 'Unban', 0x1e1e2e, [
          { name: 'User', value: `\`${userId}\`` },
          { name: 'By', value: `${message.author.tag}` }
        ]);
        message.reply(`✅ User \`${userId}\` has been unbanned.`);
      })
      .catch(() => message.reply('❌ Could not unban.'));
  }

  // ─── KICK ───
  if (cmd === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply('❌ You need Kick Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.kick(reason);
    await logAction(message.guild, 'Kick', 0x991b1b, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` },
      { name: 'Reason', value: reason }
    ]);
    message.reply(`👢 ${member.user.tag} has been kicked.`);
  }

  // ─── KICK REQUEST ───
  if (cmd === 'kickreq') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply('❌ You need Kick Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    const kickChannel = message.guild.channels.cache.find(c => c.name === 'kick-requests');
    if (!kickChannel) return message.reply('❌ No `kick-requests` channel found.');
    const embed = new EmbedBuilder()
      .setColor(0x991b1b)
      .setTitle('👢 Kick Request')
      .addFields(
        { name: 'Target', value: `${member.user.tag} (\`${member.id}\`)` },
        { name: 'Requested by', value: `${message.author.tag}` },
        { name: 'Reason', value: reason }
      )
      .setTimestamp();
    kickChannel.send({ embeds: [embed] });
    message.reply(`✅ Kick request sent to #kick-requests.`);
  }

  // ─── TIMEOUT ───
  if (cmd === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ You need Moderate Members permission.');
    const mins = parseInt(args[1]);
    if (isNaN(mins)) return message.reply('Usage: `,timeout @user 10`');
    await member.timeout(mins * 60000, args.slice(2).join(' ') || 'Timed out');
    await logAction(message.guild, 'Timeout', 0xffa500, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` },
      { name: 'Duration', value: `${mins} min` },
      { name: 'Reason', value: args.slice(2).join(' ') || 'No reason' }
    ]);
    message.reply(`⏰ ${member.user.tag} timed out for ${mins} min.`);
  }

  // ─── SOFTBAN ───
  if (cmd === 'softban') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ You need Moderate Members permission.');
    await member.timeout(7 * 24 * 60 * 60 * 1000, 'Softbanned');
    await logAction(message.guild, 'Softban (7d)', 0x991b1b, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` }
    ]);
    message.reply(`🔒 ${member.user.tag} has been softbanned for 7 days.`);
  }

  // ─── UNSOFTBAN ───
  if (cmd === 'unsoftban') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ You need Moderate Members permission.');
    await member.timeout(null);
    await logAction(message.guild, 'Unsoftban', 0x1e1e2e, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` }
    ]);
    message.reply(`✅ ${member.user.tag} has been unsoftbanned.`);
  }

  // ─── CLEAR ───
  if (cmd === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    const amount = Math.min(parseInt(args[0]) || 0, 100);
    if (amount <= 0) return message.reply('Usage: `,clear 50` (max 100)');
    const deleted = await message.channel.bulkDelete(amount, true);
    message.channel.send(`🗑️ ${deleted.size}`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 1000));
  }

  // ─── WARN ───
  if (cmd === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    const count = (warns.get(member.id) || 0) + 1;
    warns.set(member.id, count);
    await logAction(message.guild, 'Warn', 0xffa500, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` },
      { name: 'Warning #', value: `${count}` },
      { name: 'Reason', value: reason }
    ]);
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle(`⚠️ Warning #${count}`)
      .addFields(
        { name: 'Member', value: member.user.tag, inline: true },
        { name: 'Reason', value: reason, inline: true }
      )
      .setTimestamp();
    message.channel.send({ embeds: [embed] });
  }

  // ─── RESET WARNS ───
  if (cmd === 'resetwarns') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    warns.delete(member.id);
    message.reply(`✅ Warnings reset for ${member.user.tag}.`);
  }

  // ─── MUTE ───
  if (cmd === 'mute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply('❌ You need Manage Roles permission.');
    let mutedRole = message.guild.roles.cache.find(r => r.name === 'muted');
    if (!mutedRole) return message.reply('❌ No "muted" role found.');
    await member.roles.add(mutedRole);
    await logAction(message.guild, 'Mute', 0xffa500, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` }
    ]);
    message.reply(`🔇 ${member.user.tag} has been muted.`);
  }

  // ─── UNMUTE ───
  if (cmd === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply('❌ You need Manage Roles permission.');
    let mutedRole = message.guild.roles.cache.find(r => r.name === 'muted');
    if (!mutedRole) return message.reply('❌ No "muted" role found.');
    await member.roles.remove(mutedRole);
    await logAction(message.guild, 'Unmute', 0x1e1e2e, [
      { name: 'User', value: `${member.user.tag} (\`${member.id}\`)` },
      { name: 'By', value: `${message.author.tag}` }
    ]);
    message.reply(`🔊 ${member.user.tag} has been unmuted.`);
  }

  // ─── NICKNAME ───
  if (cmd === 'nick') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames))
      return message.reply('❌ You need Manage Nicknames permission.');
    const newNick = args.slice(1).join(' ');
    if (!newNick) return message.reply('Usage: `,nick @user NewName`');
    await member.setNickname(newNick);
    message.reply(`✅ Nickname changed to \`${newNick}\`.`);
  }

  // ─── SLOWMODE ───
  if (cmd === 'slowmode') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    const secs = parseInt(args[0]);
    if (isNaN(secs) || secs < 0) return message.reply('Usage: `,slowmode 5` (0 to disable)');
    await message.channel.setRateLimitPerUser(secs);
    message.reply(`⏱️ Slowmode set to ${secs}s.`);
  }

  // ─── LOCK ───
  if (cmd === 'lock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
    message.reply(`🔒 \`${message.channel.name}\` locked.`);
  }

  // ─── UNLOCK ───
  if (cmd === 'unlock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
    message.reply(`🔓 \`${message.channel.name}\` unlocked.`);
  }

  // ─── SET PERM (all channels) ───
  if (cmd === 'setperm') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    let targetRole = message.mentions.roles.first();
    if (!targetRole && args[0] === '@everyone') targetRole = message.guild.roles.everyone;
    if (!targetRole) return message.reply('Usage: `,setperm @role deny sendmessages`');
    const action = args[1];
    const perm = args.slice(2).join(' ').toLowerCase().replace(/\s+/g, '');
    if (!action || !perm) return message.reply('Usage: `,setperm @role deny sendmessages`');

    const permMap = {
      sendmessages: 'SendMessages',
      speak: 'Speak',
      addreactions: 'AddReactions',
      attachfiles: 'AttachFiles',
      embedlinks: 'EmbedLinks',
      readmessages: 'ViewChannel',
      viewchannels: 'ViewChannel',
      sendmessagesinthreads: 'SendMessagesInThreads',
    };

    const permKey = permMap[perm];
    if (!permKey) return message.reply(`❌ Unknown. Options: ${Object.keys(permMap).join(', ')}`);

    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    let count = 0;
    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(targetRole, { [permKey]: action === 'deny' ? false : true });
        count++;
      } catch {}
    }
    message.channel.send(`✅ Set \`${perm}\` to **${action}** for @${targetRole.name} on **${count}** channels.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
  }

  // ─── SET PERM (specific channel) ───
  if (cmd === 'setpermch') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');

    let targetRole = message.mentions.roles.first();
    let offset = 0;
    if (!targetRole && args[0] === '@everyone') {
      targetRole = message.guild.roles.everyone;
      offset = 1;
    }
    if (!targetRole) return message.reply('Usage: `,setpermch @role 123456789 deny sendmessages`');

    const channelId = args[offset];
    const action = args[offset + 1];
    const perm = args.slice(offset + 2).join(' ').toLowerCase().replace(/\s+/g, '');
    if (!channelId || !action || !perm) return message.reply('Usage: `,setpermch @role 123456789 deny sendmessages`');

    const permMap = {
      sendmessages: 'SendMessages',
      speak: 'Speak',
      addreactions: 'AddReactions',
      attachfiles: 'AttachFiles',
      embedlinks: 'EmbedLinks',
      readmessages: 'ViewChannel',
      viewchannels: 'ViewChannel',
      sendmessagesinthreads: 'SendMessagesInThreads',
    };

    const permKey = permMap[perm];
    if (!permKey) return message.reply(`❌ Unknown. Options: ${Object.keys(permMap).join(', ')}`);

    const channel = message.guild.channels.cache.get(channelId);
    if (!channel) return message.reply('❌ Channel not found.');

    await channel.permissionOverwrites.edit(targetRole, { [permKey]: action === 'deny' ? false : true });
    message.reply(`✅ \`${channel.name}\` → @${targetRole.name} → ${action} ${perm}`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
  }

  // ─── RENAME CHANNEL ───
  if (cmd === 'renamech') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    const channelId = args[0];
    const newName = args.slice(1).join(' ');
    if (!channelId || !newName) return message.reply('Usage: `,renamech 123456789 new-name`');
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel) return message.reply('❌ Channel not found.');
    await channel.setName(newName);
    message.reply(`✅ Renamed to \`${newName}\``)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
  }

  // ─── USER INFO ───
  if (cmd === 'userinfo') {
    const target = member || message.member;
    const embed = new EmbedBuilder()
      .setColor(0x1e1e2e)
      .setAuthor({ name: target.user.username, iconURL: target.user.displayAvatarURL() })
      .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'ID', value: target.id, inline: true },
        { name: 'Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Roles', value: `${target.roles.cache.size - 1}`, inline: true }
      );
    message.channel.send({ embeds: [embed] });
  }

  // ─── SERVER INFO ───
  if (cmd === 'serverinfo') {
    const embed = new EmbedBuilder()
      .setColor(0x1e1e2e)
      .setTitle(message.guild.name)
      .setThumbnail(message.guild.iconURL())
      .addFields(
        { name: 'Owner', value: message.guild.ownerId, inline: true },
        { name: 'Members', value: `${message.guild.memberCount}`, inline: true },
        { name: 'Channels', value: `${message.guild.channels.cache.size}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(message.guild.createdTimestamp / 1000)}:R>`, inline: true }
      );
    message.channel.send({ embeds: [embed] });
  }

  // ─── SEND WELCOME ───
  if (cmd === 'sendwelcome') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x1e1e2e)
      .setTitle('Welcome to the server!')
      .setDescription(
        `We're glad you're here. Before you start, take a moment to read the rules below.\n` +
        `By staying in this server, you agree to follow them.\n\n` +
        `Enjoy your stay.`
      );

    const rulesEmbed = new EmbedBuilder()
      .setColor(0x27272a)
      .setTitle('Rules')
      .setDescription(
        `**1.** Be respectful — treat others the way you want to be treated.\n` +
        `**2.** No inappropriate language — profanity kept to a minimum, no slurs or targeted harassment.\n` +
        `**3.** No spamming — don't flood channels with repeated messages.\n` +
        `**4.** No NSFW content — this is not the place for it.\n` +
        `**5.** No advertising or self-promo — post your content in the designated channel only if it adds value.\n` +
        `**6.** No offensive names or avatars — staff will ask you to change them if needed.\n` +
        `**7.** No raiding or mentioning raiding.\n` +
        `**8.** No threats — DDoS, doxxing, death threats, or any form of intimidation is a permanent ban.\n` +
        `**9.** Follow Discord's [Community Guidelines](https://discord.com/guidelines) and [Terms of Service](https://discord.com/terms).`
      )
      .setFooter({ text: 'Mute → Warn → Kick → Ban. Pushing boundaries = same punishment as breaking the rule.' });

    const verifyButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify')
        .setLabel('Verify')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [welcomeEmbed] });
    const rulesMsg = await message.channel.send({ embeds: [rulesEmbed], components: [verifyButton] });
    await rulesMsg.pin().catch(() => {});
    message.reply('✅ Sent and pinned.')
      .then(m => setTimeout(() => m.delete().catch(() => {}), 1000));
  }

  // ─── SEND TRAP ───
  if (cmd === 'sendtrap') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');

    const trapChannel = message.guild.channels.cache.find(c => c.name === 'do-not-type-here');
    if (!trapChannel) return message.reply('❌ No `do-not-type-here` channel found.');

    const embed = new EmbedBuilder()
      .setColor(0x1e1e2e)
      .setDescription(
        `⚠️ **DO NOT SEND ANY MESSAGES HERE. YOU WILL BE IRREVERSIBLY BANNED.** 🔨\n` +
        `\n` +
        `🚫 **THIS IS A TRAP FOR COMPROMISED ACCOUNTS.**\n` +
        `\n` +
        `ℹ️ Messages posted here will be **automatically deleted**, and the sender will be **automatically banned**.\n` +
        `\n` +
        `YOU HAVE BEEN WARNED. INTENTIONALLY SENDING MESSAGES WILL GET YOU BANNED WITH NO APPEALS.`
      );

    const msg = await trapChannel.send({ embeds: [embed] });
    await msg.pin().catch(() => {});
    message.reply(`✅ Trap message posted in #do-not-type-here.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 1000));
  }

  // ─── HELP ───
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x1e1e2e)
      .setTitle('  MODERATION')
      .setDescription('```diff\n+ ban @user reason\n+ unban id\n+ kick @user reason\n+ kickreq @user reason\n+ timeout @user mins\n+ softban @user\n+ unsoftban @user\n+ clear amount\n+ warn @user reason\n+ resetwarns @user\n+ mute @user\n+ unmute @user\n```')
      .addFields(
        { name: '  CHANNELS', value: '```diff\n+ lock\n+ unlock\n+ slowmode secs\n+ renamech id name\n+ setperm @role deny/allow perm\n+ setpermch @role id deny/allow perm\n```' },
        { name: '  INFO', value: '```diff\n+ userinfo [@user]\n+ serverinfo\n+ sendwelcome\n+ sendtrap\n```' }
      )
      .setFooter({ text: 'prefix: ,  •  $ = owner  •  mod = limited' });
    message.channel.send({ embeds: [embed] });
  }
});

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);   