const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { getData, saveData } = require("./database");
const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =========================
// أدوات
// =========================

function dbInit(db) {
  if (!db.users) db.users = {};
  if (!db.gangs) db.gangs = {};
  if (!db.jail) db.jail = {};
  if (!db.invites) db.invites = {};
  if (!db.reports) db.reports = {};
  if (!db.wars) db.wars = {};
  if (!db.missions) db.missions = {};
  if (!db.cooldowns) db.cooldowns = {};
  return db;
}

function user(db, id) {
  if (!db.users[id]) {
    db.users[id] = {
      balance: 0,
      wanted: false,
      wantedReason: null
    };
  }
  return db.users[id];
}

function role(member, id) {
  return member.roles.cache.has(id);
}

function owner(member) {
  return role(member, config.roles.owner);
}

function police(member) {
  return (
    role(member, config.roles.policeLeader) ||
    role(member, config.roles.policeDeputy) ||
    role(member, config.roles.policeOfficer)
  );
}

function policeLeader(member) {
  return owner(member) || role(member, config.roles.policeLeader);
}

function policeDeputy(member) {
  return policeLeader(member) || role(member, config.roles.policeDeputy);
}

function gangOf(db, id) {
  for (const [gid, gang] of Object.entries(db.gangs)) {
    if (gang.members && gang.members.includes(id)) {
      return { id: gid, gang };
    }
  }
  return null;
}

function gangLeader(db, id) {
  const g = gangOf(db, id);
  return g && g.gang.leader === id;
}

function gangManagement(db, id) {
  const g = gangOf(db, id);
  return g && (g.gang.leader === id || g.gang.deputy === id);
}

function money(n) {
  return Number(n || 0).toLocaleString();
}

async function giveRole(member, id) {
  if (!member.roles.cache.has(id)) {
    await member.roles.add(id);
  }
}

async function takeRole(member, id) {
  if (member.roles.cache.has(id)) {
    await member.roles.remove(id);
  }
}

const commandCooldowns = new Map();

// =========================
// الأوامر
// =========================

const commands = [
  new SlashCommandBuilder().setName("balance").setDescription("عرض رصيدك"),
  new SlashCommandBuilder()
    .setName("addmoney")
    .setDescription("إضافة أموال")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("المبلغ").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("سحب أموال")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("المبلغ").setRequired(true).setMinValue(1)),
  new SlashCommandBuilder()
    .setName("creategang")
    .setDescription("إنشاء عصابة")
    .addStringOption(o => o.setName("name").setDescription("اسم العصابة").setRequired(true)),
  new SlashCommandBuilder().setName("ganginfo").setDescription("معلومات العصابة"),
  new SlashCommandBuilder()
    .setName("ganginvite")
    .setDescription("دعوة عضو للعصابة")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder()
    .setName("gangkick")
    .setDescription("طرد عضو من العصابة")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("leavegang").setDescription("مغادرة العصابة"),
  new SlashCommandBuilder().setName("gangbank").setDescription("بنك العصابة"),
  new SlashCommandBuilder().setName("gangstorage").setDescription("مخزن العصابة"),
  new SlashCommandBuilder().setName("policeinfo").setDescription("معلومات الشرطة"),
  new SlashCommandBuilder()
    .setName("policeinvite")
    .setDescription("دعوة عضو للشرطة")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder()
    .setName("policekick")
    .setDescription("طرد عضو من الشرطة")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder().setName("policemissions").setDescription("مهام الشرطة"),
  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("سجن عضو")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("الدقائق").setRequired(true).setMinValue(1).setMaxValue(1440)),
  new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("فك السجن")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("جعل عضو مطلوب")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("السبب").setRequired(true)),
  new SlashCommandBuilder()
    .setName("unwanted")
    .setDescription("إزالة المطلوبية")
    .addUserOption(o => o.setName("user").setDescription("العضو").setRequired(true)),
  new SlashCommandBuilder()
    .setName("arrest")
    .setDescription("القبض على مطلوب")
    .addUserOption(o => o.setName("user").setDescription("المطلوب").setRequired(true)),
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("تقديم بلاغ")
    .addStringOption(o => o.setName("text").setDescription("البلاغ").setRequired(true)),
  new SlashCommandBuilder().setName("rob").setDescription("تنفيذ عملية سرقة"),
  new SlashCommandBuilder()
    .setName("war")
    .setDescription("إعلان حرب الشرطة ضد عصابة")
    .addStringOption(o => o.setName("gang").setDescription("اسم أو معرف العصابة المستهدفة").setRequired(true)),
  new SlashCommandBuilder().setName("mission").setDescription("عرض مهمتك")
].map(x => x.toJSON());

// =========================
// تشغيل
// =========================

client.once("ready", async () => {
  console.log(`✅ البوت اشتغل: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ تم تسجيل الأوامر");
  } catch (e) {
    console.error("❌ خطأ تسجيل الأوامر:", e);
  }
});

// =========================
// الأوامر
// =========================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const db = dbInit(getData());
    const id = interaction.user.id;
    const member = interaction.member;
    user(db, id);

    if (interaction.commandName === "balance") {
      return interaction.reply({
        content: `💰 رصيدك: **$${money(user(db, id).balance)}**`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "addmoney") {
      if (!owner(member)) return interaction.reply({ content: "❌ للمالك فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      user(db, target.id).balance += amount;
      saveData(db);
      return interaction.reply(`✅ تمت إضافة **$${money(amount)}** إلى ${target}.`);
    }

    if (interaction.commandName === "removemoney") {
      if (!owner(member)) return interaction.reply({ content: "❌ للمالك فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      user(db, target.id).balance = Math.max(0, user(db, target.id).balance - amount);
      saveData(db);
      return interaction.reply(`✅ تم سحب **$${money(amount)}** من ${target}.`);
    }

    if (interaction.commandName === "creategang") {
      if (!owner(member)) return interaction.reply({ content: "❌ الإدارة فقط.", ephemeral: true });
      if (gangOf(db, id)) return interaction.reply({ content: "❌ أنت داخل عصابة.", ephemeral: true });

      const name = interaction.options.getString("name");
      const gid = `gang_${Date.now()}`;

      db.gangs[gid] = {
        name,
        leader: id,
        deputy: null,
        members: [id],
        bank: 0,
        storage: { weed: 0, stolen: 0, weapons: 0 },
        wins: 0,
        losses: 0
      };

      await giveRole(member, config.roles.gangLeader);
      saveData(db);

      return interaction.reply(`🔫 تم إنشاء عصابة **${name}**.\n👑 الزعيم: ${interaction.user}`);
    }

    if (interaction.commandName === "ganginfo") {
      const result = gangOf(db, id);
      if (!result) return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      const g = result.gang;
      const embed = new EmbedBuilder()
        .setTitle(`🔫 معلومات عصابة ${g.name}`)
        .addFields(
          { name: "👑 الزعيم", value: `<@${g.leader}>`, inline: true },
          { name: "🥷 النائب", value: g.deputy ? `<@${g.deputy}>` : "لا يوجد", inline: true },
          { name: "👥 الأعضاء", value: `${g.members.length}`, inline: true },
          { name: "💰 البنك", value: `$${money(g.bank)}`, inline: true },
          { name: "🌿 الحشيش", value: `${g.storage.weed} كغ`, inline: true },
          { name: "📦 المسروقات", value: `${g.storage.stolen}`, inline: true },
          { name: "🔫 الأسلحة", value: `${g.storage.weapons}`, inline: true },
          { name: "🏆 الانتصارات", value: `${g.wins}`, inline: true },
          { name: "💀 الخسائر", value: `${g.losses}`, inline: true },
          { name: "👥 قائمة الأعضاء", value: g.members.map(x => `<@${x}>`).join("\n") || "لا يوجد" }
        )
        .setColor(0x8b0000);

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "ganginvite") {
      if (!gangManagement(db, id)) return interaction.reply({ content: "❌ الزعيم ونائبه فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");
      if (gangOf(db, target.id)) return interaction.reply({ content: "❌ العضو داخل عصابة.", ephemeral: true });

      const gid = gangOf(db, id).id;
      const invite = `gang_${Date.now()}`;
      db.invites[invite] = { type: "gang", gangId: gid, to: target.id };
      saveData(db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ga_${invite}`).setLabel("✅ قبول").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`gr_${invite}`).setLabel("❌ رفض").setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("📨 دعوة عصابة")
        .setDescription(`🔫 العصابة: **${db.gangs[gid].name}**\n👤 المدعو: ${target}\n👑 الداعي: ${interaction.user}\n\nاضغط قبول للانضمام.`);

      await target.send({ embeds: [embed], components: [row] }).catch(() => {});
      return interaction.reply({ content: `✅ تم إرسال الدعوة إلى ${target}.`, ephemeral: true });
    }

    if (interaction.commandName === "gangkick") {
      if (!gangManagement(db, id)) return interaction.reply({ content: "❌ الزعيم ونائبه فقط.", ephemeral: true });
      const result = gangOf(db, id);
      const target = interaction.options.getMember("user");

      if (!target || !result.gang.members.includes(target.id))
        return interaction.reply({ content: "❌ العضو ليس في عصابتك.", ephemeral: true });
      if (target.id === result.gang.leader)
        return interaction.reply({ content: "❌ لا يمكن طرد زعيم العصابة.", ephemeral: true });

      result.gang.members = result.gang.members.filter(x => x !== target.id);
      if (result.gang.deputy === target.id) result.gang.deputy = null;

      await takeRole(target, config.roles.gangMember);
      await takeRole(target, config.roles.gangDeputy);
      saveData(db);

      return interaction.reply(`✅ تم طرد ${target} من العصابة.`);
    }

    if (interaction.commandName === "leavegang") {
      const result = gangOf(db, id);
      if (!result) return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });
      if (result.gang.leader === id) return interaction.reply({ content: "❌ الزعيم لا يستطيع المغادرة.", ephemeral: true });

      result.gang.members = result.gang.members.filter(x => x !== id);
      if (result.gang.deputy === id) result.gang.deputy = null;

      await takeRole(member, config.roles.gangMember);
      await takeRole(member, config.roles.gangDeputy);
      saveData(db);

      return interaction.reply("✅ غادرت العصابة.");
    }

    if (interaction.commandName === "gangbank") {
      const result = gangOf(db, id);
      if (!result) return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });
      return interaction.reply({ content: `💰 بنك **${result.gang.name}**: **$${money(result.gang.bank)}**`, ephemeral: true });
    }

    if (interaction.commandName === "gangstorage") {
      const result = gangOf(db, id);
      if (!result) return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });
      const s = result.gang.storage;
      return interaction.reply({
        content: `📦 مخزن **${result.gang.name}**\n\n🌿 الحشيش: **${s.weed} كغ**\n📦 المسروقات: **${s.stolen}**\n🔫 الأسلحة: **${s.weapons}**`,
        ephemeral: true
      });
    }

    if (interaction.commandName === "policeinfo") {
      if (!police(member) && !owner(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const guildMembers = await interaction.guild.members.fetch();

      const leader = guildMembers.find(x => role(x, config.roles.policeLeader));
      const deputies = guildMembers.filter(x => role(x, config.roles.policeDeputy));
      const officers = guildMembers.filter(x => role(x, config.roles.policeOfficer));

      const embed = new EmbedBuilder()
        .setTitle("🚔 معلومات الشرطة")
        .addFields(
          { name: "👑 قائد الشرطة", value: leader ? `<@${leader.id}>` : "لا يوجد" },
          { name: "🥷 نواب الشرطة", value: deputies.map(x => `<@${x.id}>`).join("\n") || "لا يوجد" },
          { name: "👮 أعضاء الشرطة", value: officers.map(x => `<@${x.id}>`).join("\n") || "لا يوجد" }
        )
        .setColor(0x0066ff);

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "policeinvite") {
      if (!policeDeputy(member)) return interaction.reply({ content: "❌ قائد الشرطة ونائبه فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");
      const targetMember = await interaction.guild.members.fetch(target.id);

      if (police(targetMember)) return interaction.reply({ content: "❌ العضو موجود بالشرطة.", ephemeral: true });
      const invite = `police_${Date.now()}`;
      db.invites[invite] = { type: "police", to: target.id };
      saveData(db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pa_${invite}`).setLabel("✅ قبول").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pr_${invite}`).setLabel("❌ رفض").setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("📨 دعوة للشرطة")
        .setDescription(`🚔 الجهة: **الشرطة**\n👤 المدعو: ${target}\n👮 الداعي: ${interaction.user}\n\nهل تريد الانضمام؟`);

      await target.send({ embeds: [embed], components: [row] }).catch(() => {});
      return interaction.reply({ content: `✅ تم إرسال الدعوة إلى ${target}.`, ephemeral: true });
    }

    if (interaction.commandName === "policekick") {
      if (!policeLeader(member)) return interaction.reply({ content: "❌ قائد الشرطة فقط.", ephemeral: true });
      const target = interaction.options.getMember("user");

      if (!target || !role(target, config.roles.policeOfficer))
        return interaction.reply({ content: "❌ هذا العضو ليس شرطيًا.", ephemeral: true });

      await takeRole(target, config.roles.policeOfficer);
      saveData(db);
      return interaction.reply(`✅ تم طرد ${target} من الشرطة.`);
    }

    if (interaction.commandName === "policemissions") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      return interaction.reply({
        content: "🏆 **مهام الشرطة**\n\n🚔 القبض على 3 مطلوبين\n💰 المكافأة: **$5,000**\n\nاستخدم `/mission` لمتابعة تقدمك.",
        ephemeral: true
      });
    }

    if (interaction.commandName === "jail") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const target = interaction.options.getMember("user");
      const minutes = interaction.options.getInteger("minutes");

      if (!target) return interaction.reply({ content: "❌ العضو غير موجود.", ephemeral: true });
      const oldRoles = target.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.id);

      db.jail[target.id] = { ends: Date.now() + minutes * 60000, roles: oldRoles };
      await target.roles.set([config.roles.prisoner]);
      saveData(db);

      return interaction.reply(`⛓️ تم سجن ${target} لمدة **${minutes} دقيقة**.`);
    }

    if (interaction.commandName === "unjail") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const target = interaction.options.getMember("user");
      if (!target || !db.jail[target.id]) return interaction.reply({ content: "❌ العضو غير مسجون.", ephemeral: true });

      await target.roles.set(db.jail[target.id].roles);
      delete db.jail[target.id];
      saveData(db);

      return interaction.reply(`✅ تم فك سجن ${target}.`);
    }

    if (interaction.commandName === "wanted") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");

      user(db, target.id).wanted = true;
      user(db, target.id).wantedReason = reason;
      saveData(db);

      return interaction.reply(`🚨 ${target} أصبح مطلوبًا.\n📋 السبب: **${reason}**`);
    }

    if (interaction.commandName === "unwanted") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");

      user(db, target.id).wanted = false;
      user(db, target.id).wantedReason = null;
      saveData(db);

      return interaction.reply(`✅ تمت إزالة المطلوبية عن ${target}.`);
    }

    if (interaction.commandName === "arrest") {
      if (!police(member)) return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });
      const target = interaction.options.getUser("user");

      if (!user(db, target.id).wanted) return interaction.reply({ content: "❌ هذا اللاعب ليس مطلوبًا.", ephemeral: true });

      user(db, target.id).wanted = false;
      user(db, target.id).wantedReason = null;
      saveData(db);

      return interaction.reply(`🚔 تم القبض على ${target}.`);
    }

    if (interaction.commandName === "report") {
      const text = interaction.options.getString("text");
      const rid = `report_${Date.now()}`;
      db.reports[rid] = { user: id, text, created: Date.now() };
      saveData(db);

      return interaction.reply({ content: `🚨 تم إرسال البلاغ.\n🆔 رقم البلاغ: \`${rid}\``, ephemeral: true });
    }

    if (interaction.commandName === "rob") {
      if (!gangOf(db, id)) return interaction.reply({ content: "❌ العصابات فقط.", ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rob_store_${id}`).setLabel("🏪 سرقة متجر").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rob_bank_${id}`).setLabel("🏦 سرقة بنك").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rob_drugs_${id}`).setLabel("🌿 عملية حشيش").setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("🔫 عمليات العصابة").setDescription("اختر العملية:").setColor(0xff0000)],
        components: [row],
        ephemeral: true
      });
    }

    if (interaction.commandName === "war") {
      if (!policeLeader(member))
        return interaction.reply({ content: "❌ قائد الشرطة أو نائبه فقط يمكنهم إعلان الحرب على العصابات.", ephemeral: true });

      const gangInput = interaction.options.getString("gang");
      const foundGang = Object.entries(db.gangs).find(([gid, g]) => gid === gangInput || g.name.toLowerCase().includes(gangInput.toLowerCase()));

      if (!foundGang) return interaction.reply({ content: "❌ لم يتم العثور على العصابة المطلوبة.", ephemeral: true });

      const gangId = foundGang[0];
      const gangData = foundGang[1];
      const gangLeaderId = gangData.leader;

      const warId = `war_${Date.now()}`;
      db.wars[warId] = {
        gangId: gangId,
        gangLeaderId: gangLeaderId,
        policeScore: 0,
        gangScore: 0,
        policeTeam: [],
        gangTeam: [],
        participants: {},
        status: "recruiting",
        startedAt: Date.now()
      };

      saveData(db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`war_accept_${warId}`).setLabel("⚔️ قبول الحرب (قائد العصابة)").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`war_join_police_${warId}`).setLabel("🚔 الانضمام للشرطة (0/6)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`war_join_gang_${warId}`).setLabel("🔫 الانضمام للعصابة (0/6)").setStyle(ButtonStyle.Success)
      );

      let timeLeft = 120; // دقيقتين

      const embed = new EmbedBuilder()
        .setTitle("🚨 طلب إعلان حرب جديد!")
        .setDescription(
          `⚔️ أعلن قائد الشرطة ${interaction.user} الحرب ضد عصابة **${gangData.name}**!\n\n` +
          `⏳ **مرحلة التسجيل مفتوحة لمدة دقيقتين (ينتهي خلال ${timeLeft} ثانية):**\n` +
          `- الحد الأدنى للمشاركة: **4 أشخاص** لكل فريق.\n` +
          `- الحد الأقصى للمشاركة: **6 أشخاص** لكل فريق.\n` +
          `- يجب على قائد العصابة (<@${gangLeaderId}>) الضغط على زر قبول الحرب.\n\n` +
          `📋 **فريق الشرطة (0):** لا يوجد\n` +
          `📋 **فريق العصابة (0):** لا يوجد`
        )
        .setColor(0xffa500)
        .setTimestamp();

      const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      // مؤقت لتحديث العداد التنازلي كل 10 ثوانٍ
      const countdownInterval = setInterval(async () => {
        timeLeft -= 10;
        if (timeLeft <= 0) {
          clearInterval(countdownInterval);
          return;
        }
        try {
          const currentDb = dbInit(getData());
          const currentWar = currentDb.wars[warId];
          if (!currentWar || currentWar.status !== "recruiting") {
            clearInterval(countdownInterval);
            return;
          }

          const updatedEmbed = new EmbedBuilder()
            .setTitle("🚨 طلب إعلان حرب جديد!")
            .setDescription(
              `⚔️ أعلن قائد الشرطة ${interaction.user} الحرب ضد عصابة **${gangData.name}**!\n\n` +
              `⏳ **مرحلة التسجيل مفتوحة (ينتهي خلال ${timeLeft} ثانية):**\n` +
              `- الحد الأدنى للمشاركة: **4 أشخاص** لكل فريق.\n` +
              `- الحد الأقصى للمشاركة: **6 أشخاص** لكل فريق.\n` +
              `- يجب على قائد العصابة (<@${gangLeaderId}>) الضغط على زر قبول الحرب.\n\n` +
              `📋 **فريق الشرطة (${currentWar.policeTeam.length}):** ${currentWar.policeTeam.map(x => `<@${x}>`).join(", ") || "لا يوجد"}\n` +
              `📋 **فريق العصابة (${currentWar.gangTeam.length}):** ${currentWar.gangTeam.map(x => `<@${x}>`).join(", ") || "لا يوجد"}`
            )
            .setColor(0xffa500);

          await response.edit({ embeds: [updatedEmbed] }).catch(() => {});
        } catch (e) {
          clearInterval(countdownInterval);
        }
      }, 10000);

      // مؤقت انتهاء التسجيل بعد 120 ثانية (دقيقتين)
      setTimeout(async () => {
        clearInterval(countdownInterval);
        try {
          const currentDb = dbInit(getData());
          const currentWar = currentDb.wars[warId];
          if (!currentWar || currentWar.status !== "recruiting") return;

          if (currentWar.policeTeam.length < 4 || currentWar.gangTeam.length < 4) {
            currentWar.status = "cancelled";
            saveData(currentDb);

            const cancelEmbed = new EmbedBuilder()
              .setTitle("❌ إلغاء المعركة")
              .setDescription(`لم يتم إكمال الحد الأدنى للمشاركين (4 أشخاص لكل طرف). الشرطة: (${currentWar.policeTeam.length}), العصابة: (${currentWar.gangTeam.length}).`)
              .setColor(0x808080);

            return response.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
          }

          currentWar.status = "active";
          currentWar.warStartTime = Date.now();
          saveData(currentDb);

          updateActiveWarMessage(response, currentWar, gangData.name);

          setTimeout(async () => {
            endWarAutomatically(client, warId, gangData.name);
          }, 10 * 60 * 1000);

        } catch (e) {
          console.error("Timer Error:", e);
        }
      }, 120000);

      return;
    }

    if (interaction.commandName === "mission") {
      const p = police(member);
      return interaction.reply({
        content: p ? "🚔 مهمتك: القبض على 3 مطلوبين — 💰 المكافأة $5,000" : "🔫 مهمتك: تنفيذ 3 عمليات سرقة — 💰 المكافأة $5,000",
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ.", ephemeral: true }).catch(() => {});
    }
  }
});

function updateActiveWarMessage(message, warData, gangName) {
  const policeButtons = warData.policeTeam.slice(0, 5).map((id, index) =>
    new ButtonBuilder().setCustomId(`war_p_hit_${warData.gangId}_${id}`).setLabel(`شرطي ${index + 1}`).setStyle(ButtonStyle.Primary)
  );

  const gangButtons = warData.gangTeam.slice(0, 5).map((id, index) =>
    new ButtonBuilder().setCustomId(`war_g_hit_${warData.gangId}_${id}`).setLabel(`عصابة ${index + 1}`).setStyle(ButtonStyle.Danger)
  );

  const endBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`war_manual_end_${warData.gangId}`).setLabel("🏁 إنهاء الحرب يدويًا").setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  if (policeButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(policeButtons));
  if (gangButtons.length > 0) rows.push(new ActionRowBuilder().addComponents(gangButtons));
  rows.push(endBtn);

  const embed = new EmbedBuilder()
    .setTitle("⚔️ اشتعلت الحرب بين الشرطة والعصابة!")
    .setDescription(
      `🔥 المعركة قائمة الآن وستستمر لمدة **10 دقائق**!\n- يمكن لكل مشارك الهجوم على خصمه كل **5 ثوانٍ**.\n\n` +
      `📊 **النتيجة الحالية:**\n🚔 **الشرطة**: \`${warData.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warData.gangScore}\` نقطة`
    )
    .setColor(0xff0000);

  message.edit({ embeds: [embed], components: rows }).catch(() => {});
}

async function endWarAutomatically(clientInstance, warId, gangName) {
  try {
    const db = dbInit(getData());
    const war = db.wars[warId];
    if (!war || war.status !== "active") return;
    war.status = "ended";
    saveData(db);
  } catch (e) {
    console.error("Auto End Error:", e);
  }
}

// =========================
// الأزرار
// =========================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  try {
    const db = dbInit(getData());

    if (interaction.customId.startsWith("ga_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];

      if (!inv || inv.to !== interaction.user.id) return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });
      const gang = db.gangs[inv.gangId];
      if (!gang) return interaction.reply({ content: "❌ العصابة غير موجودة.", ephemeral: true });
      if (gangOf(db, interaction.user.id)) return interaction.reply({ content: "❌ أنت داخل عصابة.", ephemeral: true });

      gang.members.push(interaction.user.id);
      delete db.invites[key];

      const member = await interaction.guild.members.fetch(interaction.user.id);
      await giveRole(member, config.roles.gangMember);
      saveData(db);

      return interaction.update({ content: `✅ انضممت إلى عصابة **${gang.name}**.\n🔫 تم إعطاؤك رتبة عضو العصابة.`, embeds: [], components: [] });
    }

    if (interaction.customId.startsWith("gr_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];
      if (!inv || inv.to !== interaction.user.id) return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      delete db.invites[key];
      saveData(db);
      return interaction.update({ content: "❌ تم رفض دعوة العصابة.", embeds: [], components: [] });
    }

    if (interaction.customId.startsWith("pa_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];
      if (!inv || inv.to !== interaction.user.id) return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.user.id);
      await giveRole(member, config.roles.policeOfficer);

      delete db.invites[key];
      saveData(db);
      return interaction.update({ content: "✅ تم قبول الدعوة.\n🚔 تم إعطاؤك رتبة الشرطة.", embeds: [], components: [] });
    }

    if (interaction.customId.startsWith("pr_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];
      if (!inv || inv.to !== interaction.user.id) return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      delete db.invites[key];
      saveData(db);
      return interaction.update({ content: "❌ تم رفض دعوة الشرطة.", embeds: [], components: [] });
    }

    if (interaction.customId.startsWith("rob_")) {
      const parts = interaction.customId.split("_");
      const type = parts[1];
      const ownerId = parts[2];
      const userId = interaction.user.id;

      if (userId !== ownerId) return interaction.reply({ content: "❌ هذا الزر ليس لك.", ephemeral: true });
      const result = gangOf(db, userId);
      if (!result) return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      if (!db.cooldowns) db.cooldowns = {};
      const now = Date.now();

      // تحديد وقت الانتظار حسب نوع السرقة (ساعتين للمتجر والبنك، نصف ساعة للحشيش)
      let cdTime = 2 * 60 * 60 * 1000; // ساعتان افتراضياً (للبنك والمتجر)
      if (type === "drugs") {
        cdTime = 30 * 60 * 1000; // نصف ساعة (30 دقيقة) لصناعة الحشيش
      }

      const userCdKey = `rob_${type}_${userId}`;
      const lastRob = db.cooldowns[userCdKey] || 0;

      if (now - lastRob < cdTime) {
        const remainingMs = cdTime - (now - lastRob);
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        const hours = Math.floor(remainingMinutes / 60);
        const mins = remainingMinutes % 60;
        const timeStr = hours > 0 ? `${hours} ساعة و ${mins} دقيقة` : `${mins} دقيقة`;
        return interaction.reply({ content: `⏳ يجب عليك الانتظار **${timeStr}** قبل إمكانية تنفيذ هذه العملية مرة أخرى.`, ephemeral: true });
      }

      const chance = Math.random();
      if (chance < 0.35) {
        db.cooldowns[userCdKey] = now;
        saveData(db);
        return interaction.update({ content: "❌ فشلت عملية السرقة! حاول مرة أخرى لاحقًا.", embeds: [], components: [] });
      }

      let reward = 0;
      if (type === "store") {
        reward = Math.floor(Math.random() * 5000) + 2000;
        result.gang.bank += reward;
        result.gang.storage.stolen++;
      }
      if (type === "bank") {
        reward = Math.floor(Math.random() * 20000) + 10000;
        result.gang.bank += reward;
        result.gang.storage.stolen += 5;
      }
      if (type === "drugs") {
        const weed = Math.floor(Math.random() * 10) + 5;
        result.gang.storage.weed += weed;
        db.cooldowns[userCdKey] = now;
        saveData(db);
        return interaction.update({ content: `✅ نجحت العملية!\n🌿 تمت إضافة **${weed} كغ** إلى مخزن العصابة.`, embeds: [], components: [] });
      }

      db.cooldowns[userCdKey] = now;
      saveData(db);
      return interaction.update({
        content: `✅ نجحت العملية!\n💰 ربح العصابة: **$${money(reward)}**\n📦 تمت إضافة المسروقات للمخزن.`,
        embeds: [],
        components: []
      });
    }

    if (interaction.customId.startsWith("war_")) {
      const parts = interaction.customId.split("_");
      const action = parts[1];

      if (action === "accept") {
        const warId = `war_${parts[2]}`;
        const war = db.wars[warId];
        if (!war || war.status !== "recruiting") return interaction.reply({ content: "❌ الحرب منتهية أو غير موجودة.", ephemeral: true });

        if (interaction.user.id !== war.gangLeaderId && !owner(interaction.member))
          return interaction.reply({ content: "❌ هذا الزر مخصص لقائد العصابة المستهدفة فقط.", ephemeral: true });

        war.gangAccepted = true;
        saveData(db);
        return interaction.reply({ content: "✅ قام قائد العصابة بقبول المعركة! بانتظار اكتمال الأعضاء.", ephemeral: true });
      }

      if (action === "join" && parts[2] === "police") {
        const warId = `war_${parts[3]}`;
        const war = db.wars[warId];
        if (!war || war.status !== "recruiting") return interaction.reply({ content: "❌ انتهى وقت التسجيل.", ephemeral: true });

        if (!police(interaction.member)) return interaction.reply({ content: "❌ هذا الفريق مخصص للشرطة فقط.", ephemeral: true });
        if (war.policeTeam.includes(interaction.user.id)) return interaction.reply({ content: "❌ أنت مسجل مسبقاً في فريق الشرطة.", ephemeral: true });
        if (war.policeTeam.length >= 6) return interaction.reply({ content: "❌ اكتمل العدد الأقصى لفريق الشرطة (6 أشخاص).", ephemeral: true });

        war.policeTeam.push(interaction.user.id);
        saveData(db);
        return interaction.reply({ content: `✅ تم تسجيلك ضمن فريق الشرطة (${war.policeTeam.length}/6).`, ephemeral: true });
      }

      if (action === "join" && parts[2] === "gang") {
        const warId = `war_${parts[3]}`;
        const war = db.wars[warId];
        if (!war || war.status !== "recruiting") return interaction.reply({ content: "❌ انتهى وقت التسجيل.", ephemeral: true });

        const userGang = gangOf(db, interaction.user.id);
        if (!userGang || userGang.id !== war.gangId)
          return interaction.reply({ content: "❌ يجب أن تكون عضواً في هذه العصابة المحددة للانضمام.", ephemeral: true });
        if (war.gangTeam.includes(interaction.user.id)) return interaction.reply({ content: "❌ أنت مسجل مسبقاً في فريق العصابة.", ephemeral: true });
        if (war.gangTeam.length >= 6) return interaction.reply({ content: "❌ اكتمل العدد الأقصى لفريق العصابة (6 أشخاص).", ephemeral: true });

        war.gangTeam.push(interaction.user.id);
        saveData(db);
        return interaction.reply({ content: `✅ تم تسجيلك ضمن فريق العصابة (${war.gangTeam.length}/6).`, ephemeral: true });
      }

      if (action === "p" || action === "g") {
        const gangId = parts[3];
        const targetId = parts[4];
        const userId = interaction.user.id;
        const userName = interaction.user.username;

        const lastHit = commandCooldowns.get(userId) || 0;
        if (Date.now() - lastHit < 5000) {
          const remaining = Math.ceil((5000 - (Date.now() - lastHit)) / 1000);
          return interaction.reply({ content: `⏳ يجب عليك الانتظار **${remaining} ثوانٍ** قبل تنفيذ الهجوم التالي.`, ephemeral: true });
        }

        const warEntry = Object.values(db.wars).find(w => w.gangId === gangId && w.status === "active");
        if (!warEntry) return interaction.reply({ content: "❌ لا توجد حرب نشطة حالياً.", ephemeral: true });

        const gangData = db.gangs[gangId];
        const gangName = gangData ? gangData.name : "العصابة";

        if (!warEntry.participants) warEntry.participants = {};

        if (action === "p") {
          if (!police(interaction.member) || !warEntry.policeTeam.includes(userId))
            return interaction.reply({ content: "❌ لست مشاركاً ضمن فريق الشرطة في هذه الحرب.", ephemeral: true });

          const pts = Math.floor(Math.random() * 15) + 5;
          warEntry.policeScore += pts;

          if (!warEntry.participants[userId]) warEntry.participants[userId] = { name: userName, team: "الشرطة", points: 0 };
          warEntry.participants[userId].points += pts;

          commandCooldowns.set(userId, Date.now());
          saveData(db);

          const embed = new EmbedBuilder()
            .setTitle("🚔 هجوم أمني ناجح!")
            .setDescription(`💥 قام الشرطي ${interaction.user} بضربة ناجحة ضد <@${targetId}> (+${pts} نقطة)!\n\n📊 **النتيجة الحالية:**\n🚔 **الشرطة**: \`${warEntry.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warEntry.gangScore}\` نقطة`)
            .setColor(0x0000ff);

          return interaction.update({ embeds: [embed] });
        }

        if (action === "g") {
          const userGang = gangOf(db, userId);
          if (!userGang || userGang.id !== gangId || !warEntry.gangTeam.includes(userId))
            return interaction.reply({ content: "❌ لست مشاركاً ضمن فريق هذه العصابة في الحرب.", ephemeral: true });

          const pts = Math.floor(Math.random() * 15) + 5;
          warEntry.gangScore += pts;

          if (!warEntry.participants[userId]) warEntry.participants[userId] = { name: userName, team: gangName, points: 0 };
          warEntry.participants[userId].points += pts;

          commandCooldowns.set(userId, Date.now());
          saveData(db);

          const embed = new EmbedBuilder()
            .setTitle("🔫 هجوم مضاد للعصابة!")
            .setDescription(`💥 قام ${interaction.user} بضربة مضادة ضد <@${targetId}> (+${pts} نقطة)!\n\n📊 **النتيجة الحالية:**\n🚔 **الشرطة**: \`${warEntry.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warEntry.gangScore}\` نقطة`)
            .setColor(0xff0000);

          return interaction.update({ embeds: [embed] });
        }
      }

      if (action === "manual" && parts[2] === "end") {
        const gangId = parts[3];
        const userId = interaction.user.id;

        const warEntry = Object.values(db.wars).find(w => w.gangId === gangId && w.status === "active");
        if (!warEntry) return interaction.reply({ content: "❌ لا توجد حرب نشطة.", ephemeral: true });

        if (!policeLeader(interaction.member) && !gangManagement(db, userId))
          return interaction.reply({ content: "❌ قادة الشرطة أو العصابة فقط يمكنهم إنهاء الحرب.", ephemeral: true });

        warEntry.status = "ended";
        saveData(db);

        const gangData = db.gangs[gangId];
        const gangName = gangData ? gangData.name : "العصابة";

        let winner = "تعادل";
        if (warEntry.policeScore > warEntry.gangScore) winner = "🚔 الشرطة";
        else if (warEntry.gangScore > warEntry.policeScore) winner = `🔫 عصابة ${gangName}`;

        const participantsList = Object.values(warEntry.participants || {});
        const topPolice = participantsList.filter(p => p.team === "الشرطة").sort((a, b) => b.points - a.points).slice(0, 3);
        const topGang = participantsList.filter(p => p.team === gangName).sort((a, b) => b.points - a.points).slice(0, 3);

        const policeTopText = topPolice.length > 0 ? topPolice.map((p, index) => `${index + 1}. **${p.name}**: \`${p.points}\` نقطة`).join("\n") : "لا يوجد مشاركون";
        const gangTopText = topGang.length > 0 ? topGang.map((p, index) => `${index + 1}. **${p.name}**: \`${p.points}\` نقطة`).join("\n") : "لا يوجد مشاركون";

        const endEmbed = new EmbedBuilder()
          .setTitle("🏁 انتهت المعركة بين الشرطة والعصابة!")
          .setDescription(
            `🏆 **المنتصر:** ${winner}\n\n📊 **النتيجة النهائية:**\n🚔 **الشرطة**: \`${warEntry.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warEntry.gangScore}\` نقطة\n\n` +
            `🎖️ **أكثر أعضاء الشرطة تسجيلاً للنقاط:**\n${policeTopText}\n\n🎖️ **أكثر أعضاء العصابة (${gangName}) تسجيلاً للنقاط:**\n${gangTopText}`
          )
          .setColor(0x808080);

        return interaction.update({ embeds: [endEmbed], components: [] });
      }
    }

  } catch (error) {
    console.error("Button Error:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ.", ephemeral: true }).catch(() => {});
    }
  }
});

setInterval(async () => {
  try {
    const db = dbInit(getData());
    let changed = false;

    for (const [id, jail] of Object.entries(db.jail)) {
      if (Date.now() >= jail.ends) {
        try {
          const guild = client.guilds.cache.first();
          if (guild) {
            const member = await guild.members.fetch(id).catch(() => null);
            if (member) {
              await member.roles.set(jail.roles);
            }
          }
          delete db.jail[id];
          changed = true;
        } catch (e) {
          console.error("Jail Error:", e);
        }
      }
    }

    if (changed) saveData(db);
  } catch (e) {
    console.error("Auto Jail Error:", e);
  }
}, 30000);

if (!process.env.TOKEN) {
  console.error("❌ TOKEN غير موجود في Environment Variables.");
  process.exit(1);
}

client.login(process.env.TOKEN);
