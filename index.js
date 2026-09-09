const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const prefix = ',';
const warns = new Map();

// ─── AUTO-MOD ───
const badWords = ['badword1', 'badword2']; // ← add your own here
const inviteRegex = /discord(?:\.gg|app\.com\/invite)\/\w+/i;

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Auto-mod (runs on ALL messages, not just prefix commands)
  if (badWords.some(w => message.content.toLowerCase().includes(w)) || inviteRegex.test(message.content)) {
    await message.delete().catch(() => {});
    message.channel.send(`⚠️ @${message.author.username} — your message was removed (banned word / invite link).`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    return;
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const member = message.mentions.members.first();

  if (!member && ['ban', 'kick', 'timeout', 'warn', 'unmute', 'mute', 'nick', 'resetwarns', 'softban', 'unsoftban'].includes(cmd)) {    
    return message.reply('Please mention a user.');
  }

  // ─── BAN ───
  if (cmd === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You need Ban Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.ban({ reason });
    message.reply(`🔨 ${member.user.tag} has been banned.`);
  }

  // ─── UNBAN ───
  if (cmd === 'unban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You need Ban Members permission.');
    const userId = args[0];
    if (!userId || isNaN(userId)) return message.reply('Usage: `,unban 123456789012345678`');
    await message.guild.members.unban(userId, args.slice(1).join(' ') || 'Unbanned')
      .then(() => message.reply(`✅ User \`${userId}\` has been unbanned.`))
      .catch(() => message.reply('❌ Could not unban. Invalid ID or already unbanned.'));
  }

  // ─── KICK ───
  if (cmd === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply('❌ You need Kick Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.kick(reason);
    message.reply(`👢 ${member.user.tag} has been kicked.`);
  }

  // ─── TIMEOUT ───
  if (cmd === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ You need Moderate Members permission.');
    const mins = parseInt(args[1]);
    if (isNaN(mins)) return message.reply('Usage: `,timeout @user 10`');
    await member.timeout(mins * 60000, args.slice(2).join(' ') || 'Timed out');
    message.reply(`⏰ ${member.user.tag} timed out for ${mins} min.`);
  }

  // ─── CLEAR (auto-deletes confirmation) ───
  if (cmd === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    const amount = Math.min(parseInt(args[0]) || 0, 100);
    if (amount <= 0) return message.reply('Usage: `,clear 50` (max 100)');
    const deleted = await message.channel.bulkDelete(amount, true);
    message.channel.send(`🗑️ Deleted ${deleted.size} messages.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));

      // ─── SOFTBAN (7-day timeout) ───
if (cmd === 'softban') {
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return message.reply('❌ You need Moderate Members permission.');
  await member.timeout(7 * 24 * 60 * 60 * 1000, 'Softbanned');
  message.reply(`🔒 ${member.user.tag} has been softbanned for 7 days.`);
}

// ─── UNSOFTBAN ───
if (cmd === 'unsoftban') {
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return message.reply('❌ You need Moderate Members permission.');
  await member.timeout(null);
  message.reply(`✅ ${member.user.tag} has been unsoftbanned.`);
}   
  }

  // ─── WARN ───
  if (cmd === 'warn') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    const count = (warns.get(member.id) || 0) + 1;
    warns.set(member.id, count);
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
    if (!mutedRole) return message.reply('❌ No "muted" role found. Create one first.');
    await member.roles.add(mutedRole);
    message.reply(`🔇 ${member.user.tag} has been muted.`);
  }

  // ─── UNMUTE ───
  if (cmd === 'unmute') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply('❌ You need Manage Roles permission.');
    let mutedRole = message.guild.roles.cache.find(r => r.name === 'muted');
    if (!mutedRole) return message.reply('❌ No "muted" role found.');
    await member.roles.remove(mutedRole);
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
    if (isNaN(secs) || secs < 0) return message.reply('Usage: `,slowmode 5` (seconds, 0 to disable)');
    await message.channel.setRateLimitPerUser(secs);
    message.reply(`⏱️ Slowmode set to ${secs}s in this channel.`);
  }

  // ─── LOCK ───
  if (cmd === 'lock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false
    });
    message.reply(`🔒 \`${message.channel.name}\` is locked.`);
  }

  // ─── UNLOCK ───
  if (cmd === 'unlock') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: null
    });
    message.reply(`🔓 \`${message.channel.name}\` is unlocked.`);
  }

  // ─── SET PERMISSION ON ALL CHANNELS ───
  if (cmd === 'setperm') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    const targetRole = message.mentions.roles.first();
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
      sendmessagesinthreads: 'SendMessagesInThreads',
    };

    const permKey = permMap[perm];
    if (!permKey) return message.reply(`❌ Unknown permission. Options: ${Object.keys(permMap).join(', ')}`);

    const channels = message.guild.channels.cache.filter(c => c.type === 0);
    let count = 0;

    for (const channel of channels.values()) {
      try {
        await channel.permissionOverwrites.edit(targetRole, {
          [permKey]: action === 'deny' ? false : true
        });
        count++;
      } catch {}
    }

    message.channel.send(`✅ Set \`${perm}\` to **${action}** for @${targetRole.name} on **${count}** channels.`)
      .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
  }

  // ─── USER INFO ───
  if (cmd === 'userinfo') {
    const target = member || message.member;
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
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
      .setColor(0x5865f2)
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

  // ─── HELP ───
  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Mod Bot Commands')
      .addFields(
        { name: `,ban @user reason`, value: 'Ban a member', inline: true },
        { name: `,unban userID`, value: 'Unban a member', inline: true },
        { name: `,kick @user reason`, value: 'Kick a member', inline: true },
        { name: `,timeout @user mins`, value: 'Timeout a member', inline: true },
        { name: `,clear amount`, value: 'Delete messages (max 100)', inline: true },
        { name: `,warn @user reason`, value: 'Warn a member', inline: true },
        { name: `,resetwarns @user`, value: 'Reset warnings', inline: true },
        { name: `,mute @user`, value: 'Mute (muted role)', inline: true },
        { name: `,unmute @user`, value: 'Unmute', inline: true },
        { name: `,nick @user name`, value: 'Change nickname', inline: true },
        { name: `,slowmode secs`, value: 'Set slowmode', inline: true },
        { name: `,lock / ,unlock`, value: 'Lock/unlock channel', inline: true },   
        { name: `,setperm @role deny/allow perm`, value: 'Bulk set permissions', inline: true },
        { name: `,userinfo [@user]`, value: 'Show user info', inline: true },
        { name: `,serverinfo`, value: 'Show server stats', inline: true },
        { name: `,softban @user`, value: '7-day timeout', inline: true },
        { name: `,unsoftban @user`, value: 'Remove timeout', inline: true },   
      );
    message.channel.send({ embeds: [embed] });
  }
});

client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);   