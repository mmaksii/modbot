const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');   

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
const badWords = ['badword1', 'badword2']; // ← edit these
const inviteRegex = /discord(?:\.gg|app\.com\/invite)\/\w+/i;

// ─── TRAP CHANNEL ───
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // Trap channel (auto-ban)
  if (message.channel.name === 'do-not-type-here') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.delete().catch(() => {});
      try {
        await message.member.ban({ reason: `Typed in trap channel. ID: ${message.author.id}` });
      } catch {}
      return;
    }
  }

  // Auto-mod
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
    message.reply(`⏰ ${member.user.tag} timed out for ${mins} min.`);
  }

  // ─── SOFTBAN ───
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

  // ─── SET PERM (all channels) ───
  if (cmd === 'setperm') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply('❌ You need Manage Channels permission.');
    const targetRole = message.mentions.roles.first() || (args[0] === '@everyone' ? message.guild.roles.everyone : null);      
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
    if (!permKey) return message.reply(`❌ Unknown. Options: ${Object.keys(permMap).join(', ')}`);

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
      .then(m => setTimeout(() => m.delete().catch(() => {}), 3000));
  }

  // ─── SET PERM (specific channel by ID) ───
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
  // ... rest stays the same   

    if (!targetRole || !channelId || !action || !perm)
      return message.reply('Usage: `,setpermch @role 123456789 deny sendmessages`');

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

    await channel.permissionOverwrites.edit(targetRole, {
      [permKey]: action === 'deny' ? false : true
    });
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

    await message.channel.send({ embeds: [welcomeEmbed] });
    const verifyButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
    .setCustomId('verify')
    .setLabel('Verify')
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success)
);

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
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify') {
    const verifiedRole = interaction.guild.roles.cache.find(r => r.name === 'verified');
    if (!verifiedRole) return interaction.reply({ content: '❌ No `verified` role found.', ephemeral: true });

    if (interaction.member.roles.cache.has(verifiedRole.id)) {
      return interaction.reply({ content: '✅ You are already verified.', ephemeral: true });
    }

    await interaction.member.roles.add(verifiedRole);
    await interaction.update({ content: '✅ You are verified. Enjoy!', components: [] });
  }
});   
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);   