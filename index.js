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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();
  const member = message.mentions.members.first();

  if (!member && (cmd === 'ban' || cmd === 'kick' || cmd === 'timeout' || cmd === 'warn')) {
    return message.reply('Please mention a user.');
  }

  if (cmd === 'ban') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You need Ban Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.ban({ reason });
    message.reply(`🔨 ${member.user.tag} has been banned.`);
  }

  if (cmd === 'kick') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
      return message.reply('❌ You need Kick Members permission.');
    const reason = args.slice(1).join(' ') || 'No reason';
    await member.kick(reason);
    message.reply(`👢 ${member.user.tag} has been kicked.`);
  }

  if (cmd === 'timeout') {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply('❌ You need Moderate Members permission.');
    const mins = parseInt(args[1]);
    if (isNaN(mins)) return message.reply('Usage: `,timeout @user 10`');
    await member.timeout(mins * 60000, args.slice(2).join(' ') || 'Timed out');
    message.reply(`⏰ ${member.user.tag} timed out for ${mins} min.`);
  }

  if (cmd === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    const amount = Math.min(parseInt(args[0]) || 0, 100);
    if (amount <= 0) return message.reply('Usage: `,clear 50` (max 100)');
    const deleted = await message.channel.bulkDelete(amount, true);
    message.channel.send(`🗑️ Deleted ${deleted.size} messages.`);
  }

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

  if (cmd === 'resetwarns') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply('❌ You need Manage Messages permission.');
    warns.delete(member.id);
    message.reply(`✅ Warnings reset for ${member.user.tag}.`);
  }

  if (cmd === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📋 Mod Bot Commands')
      .addFields(
        { name: `,ban @user reason`, value: 'Ban a member', inline: true },
        { name: `,kick @user reason`, value: 'Kick a member', inline: true },
        { name: `,timeout @user mins`, value: 'Timeout a member', inline: true },
        { name: `,clear amount`, value: 'Delete messages (max 100)', inline: true },
        { name: `,warn @user reason`, value: 'Warn a member', inline: true },
        { name: `,resetwarns @user`, value: 'Reset warnings', inline: true }
      );
    message.channel.send({ embeds: [embed] });
  }
});

client.once('clientReady', () => {   
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);   