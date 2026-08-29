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

const POLICE_SHOP = [
  { id: 'taser', name: '⚡ صاعق كهربائي (تلايزر)', price: 10000, desc: 'أداة سريعة لشل حركة المشتبه بهم.' },
  { id: 'vest', name: '🛡️ درع تكتيكي ثقيل', price: 25000, desc: 'حماية إضافية أثناء الاشتباكات الأمنية.' },
  { id: 'glock', name: '🔫 مسدس بيرتا 9مم', price: 50000, desc: 'سلاح خدمة شخصي لعناصر الشرطة.' },
  { id: 'charger', name: '🚔 سيارة دورية شرطة', price: 350000, desc: 'سيارة مطاردات سريعة.' }
];

const GANG_SHOP = [
  { id: 'lockpick', name: '🔓 عدة خلع أقفال', price: 15000, desc: 'تستخدم لفك الأبواب وتنفيذ السرقات الميدانية.' },
  { id: 'mask', name: '🎭 قناع إخفاء الهوية', price: 20000, desc: 'لإخفاء الملامح أثناء الهجوم والسطو.' },
  { id: 'pistol_black', name: '🖤 مسدس غير مرخص', price: 60000, desc: 'سلاح شخصي للسوق السوداء.' },
  { id: 'ak47', name: '🔥 رشاش أوتوماتيكي AK-47', price: 200000, desc: 'قوة نارية مرعبة للاشتباكات وحروب العصابات.' },
  { id: 'armored_car', name: '🚐 فان تهريب مصفح', price: 500000, desc: 'لنقل الأموال المسروقة والمجرمين.' }
];

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
      bank: 0,
      inventory: [],
      wanted: false,
      wantedReason: null
    };
  }
  if (!db.users[id].inventory) db.users[id].inventory = [];
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

const commands = [
  new SlashCommandBuilder().setName("balance").setDescription("عرض رصيدك ومعدات حقيبتك"),
  new SlashCommandBuilder().setName("toprich").setDescription("عرض قائمة أغنى اللاعبين في السيرفر حسب المحفظة والبنك"),
  new SlashCommandBuilder().setName("shop").setDescription("عرض متجر الشرطة الرسمي للمعدات والأسلحة"),
  new SlashCommandBuilder().setName("gangshop").setDescription("عرض سوق العصابات والسوق السوداء للأسلحة"),
  
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("شراء معدات من متجر الشرطة")
    .addStringOption(o => 
      o.setName("item").setDescription("اختر الغرض").setRequired(true)
        .addChoices(...POLICE_SHOP.map(i => ({ name: `${i.name} ($${money(i.price)})`, value: i.id })))
    ),

  new SlashCommandBuilder()
    .setName("gangbuy")
    .setDescription("شراء أسلحة وأدوات من السوق السوداء")
    .addStringOption(o => 
      o.setName("item").setDescription("اختر الغرض غير القانوني").setRequired(true)
        .addChoices(...GANG_SHOP.map(i => ({ name: `${i.name} ($${money(i.price)})`, value: i.id })))
    ),

  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("إيداع أموال في البنك")
    .addIntegerOption(o => o.setName("amount").setDescription("المبلغ المراد إيداعه").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("سحب أموال من البنك إلى المحفظة")
    .addIntegerOption(o => o.setName("amount").setDescription("المبلغ المراد سحبه").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("تحويل أموال إلى لاعب آخر")
    .addUserOption(o => o.setName("user").setDescription("الشخص المراد التحويل له").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("المبلغ المراد تحويله").setRequired(true).setMinValue(1)),

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
  new SlashCommandBuilder().setName("mission").setDescription("عرض مهمتك اليومية وإنجازها")
].map(x => x.toJSON());

const WAR_ZONES = [
  { id: "zone_1", name: "منطقة وسط المدينة", channelId: config.channels?.zone1 || "YOUR_CHANNEL_ID_1" },
  { id: "zone_2", name: "منطقة الميناء", channelId: config.channels?.zone2 || "YOUR_CHANNEL_ID_2" },
  { id: "zone_3", name: "منطقة الصناعية", channelId: config.channels?.zone3 || "YOUR_CHANNEL_ID_3" },
  { id: "zone_4", name: "منطقة الهضبة", channelId: config.channels?.zone4 || "YOUR_CHANNEL_ID_4" },
  { id: "zone_5", name: "منطقة السوق التجاري", channelId: config.channels?.zone5 || "YOUR_CHANNEL_ID_5" }
];

function setupAutoWars(clientInstance) {
  setInterval(async () => {
    const now = new Date();
    const day = now.getDay(); 
    const hours = now.getHours();
    const minutes = now.getMinutes();

    if (day >= 0 && day <= 4 && hours === 20 && minutes === 0) {
      const db = dbInit(getData());
      const gangsList = Object.entries(db.gangs);
      if (gangsList.length === 0) return;

      const randomGangEntry = gangsList[Math.floor(Math.random() * gangsList.length)];
      const gangId = randomGangEntry[0];
      const gangData = randomGangEntry[1];

      const zone = WAR_ZONES[day] || WAR_ZONES[0];
      const channel = await clientInstance.channels.fetch(zone.channelId).catch(() => null);
      if (!channel) return;

      const warId = `war_${Date.now()}`;
      db.wars[warId] = {
        gangId: gangId,
        gangLeaderId: gangData.leader,
        policeScore: 0,
        gangScore: 0,
        policeTeam: [],
        gangTeam: [],
        participants: {},
        status: "recruiting",
        startedAt: Date.now()
      };
      saveData(db);

      let timeLeft = 180;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`war_join_police_${warId}`).setLabel("🚔 قبول / انضمام (الشرطة) (0/6)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`war_join_gang_${warId}`).setLabel(`⚔️ قبول / انضمام (${gangData.name}) (0/6)`).setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle(`🚨 اندلاع معركة تلقائية في: ${zone.name}!`)
        .setDescription(
          `🔥 بدأت فترة التسجيل للحرب بين **الشرطة** وعصابة **${gangData.name}**!\n\n` +
          `⏳ **مرحلة التسجيل (3 دقائق):**\n` +
          `- الحد الأدنى للمشاركة: **4 أشخاص** لكل فريق.\n` +
          `- الحد الأقصى للمشاركة: **6 أشخاص** لكل فريق.\n\n` +
          `📋 **فريق الشرطة (0/6):** لا يوجد\n` +
          `📋 **فريق العصابة (${gangData.name}) (0/6):** لا يوجد`
        )
        .setColor(0xffa500)
        .setTimestamp();

      const response = await channel.send({ embeds: [embed], components: [row] }).catch(() => {});
      if (!response) return;

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

          const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`war_join_police_${warId}`).setLabel(`🚔 قبول / انضمام (الشرطة) (${currentWar.policeTeam.length}/6)`).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`war_join_gang_${warId}`).setLabel(`⚔️ قبول / انضمام (${gangData.name}) (${currentWar.gangTeam.length}/6)`).setStyle(ButtonStyle.Danger)
          );

          const updatedEmbed = new EmbedBuilder()
            .setTitle(`🚨 اندلاع معركة تلقائية في: ${zone.name}!`)
            .setDescription(
              `🔥 فترة التسجيل جارية (ينتهي خلال ${timeLeft} ثانية):\n\n` +
              `📋 **فريق الشرطة (${currentWar.policeTeam.length}/6):** ${currentWar.policeTeam.map(x => `<@${x}>`).join(", ") || "لا يوجد"}\n` +
              `📋 **فريق العصابة (${gangData.name}) (${currentWar.gangTeam.length}/6):** ${currentWar.gangTeam.map(x => `<@${x}>`).join(", ") || "لا يوجد"}`
            )
            .setColor(0xffa500);

          await response.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});
        } catch (e) {
          clearInterval(countdownInterval);
        }
      }, 10000);

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
              .setTitle("❌ إلغاء المعركة التلقائية")
              .setDescription(`لم يتم استيفاء الحد الأدنى للمشاركين (4 أشخاص لكل طرف).`)
              .setColor(0x808080);

            return response.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
          }

          currentWar.status = "active";
          currentWar.warStartTime = Date.now();
          saveData(currentDb);

          updateActiveWarMessage(response, currentWar, gangData.name, clientInstance);

          setTimeout(async () => {
            endWarAutomatically(clientInstance, warId, gangData.name);
          }, 10 * 60 * 1000);

        } catch (e) {
          console.error("Auto War Timer Error:", e);
        }
      }, 180000);
    }
  }, 60000);
}

function setupAutoSalaries(clientInstance) {
  setInterval(async () => {
    try {
      const guild = clientInstance.guilds.cache.first();
      if (!guild) return;

      const members = await guild.members.fetch();
      const db = dbInit(getData());
      let saved = false;

      members.forEach(member => {
        if (member.user.bot) return;

        let salaryAmount = 0;

        if (member.roles.cache.has(config.roles.policeOfficer) || member.roles.cache.has(config.roles.policeDeputy) || member.roles.cache.has(config.roles.policeLeader)) {
          salaryAmount = 40000;
        } else if (member.roles.cache.has(config.roles.gangMember)) {
          salaryAmount = 25000;
        }

        if (salaryAmount > 0) {
          const uData = user(db, member.id);
          uData.bank = (uData.bank || 0) + salaryAmount;
          saved = true;

          member.send(`💰 تم إيداع راتبك بقيمة **$${money(salaryAmount)}** في حسابك البنكي تلقائياً!`).catch(() => {});
        }
      });

      if (saved) {
        saveData(db);
      }
    } catch (error) {
      console.error("خطأ في نظام الرواتب التلقائية:", error);
    }
  }, 60 * 60 * 1000);
}

client.once("ready", async () => {
  console.log(`✅ البوت اشتغل: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ تم تسجيل الأوامر بنجاح");
  } catch (e) {
    console.error("❌ خطأ تسجيل الأوامر:", e);
  }

  setupAutoWars(client);
  setupAutoSalaries(client);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const db = dbInit(getData());
    const id = interaction.user.id;
    const member = interaction.member;
    const uData = user(db, id);

    if (interaction.commandName === "balance") {
      const embed = new EmbedBuilder()
        .setTitle(`💳 الملف الشخصي لـ ${interaction.user.username}`)
        .addFields(
          { name: '💵 الكاش (المحفظة)', value: `**$${money(uData.balance)}**`, inline: true },
          { name: '🏦 البنك', value: `**$${money(uData.bank || 0)}**`, inline: true },
          { name: '🎒 الأغراض والمعدات في الحقيبة', value: uData.inventory.length > 0 ? uData.inventory.join(', ') : 'الحقيبة فارغة تماماً', inline: false }
        )
        .setColor(0xffd700);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "toprich") {
      const usersData = db.users || {};
      
      const sortedUsers = Object.entries(usersData)
        .map(([userId, data]) => {
          const totalMoney = (data.balance || 0) + (data.bank || 0);
          return { userId, totalMoney, balance: data.balance || 0, bank: data.bank || 0 };
        })
        .sort((a, b) => b.totalMoney - a.totalMoney)
        .slice(0, 10);

      if (sortedUsers.length === 0) {
        return interaction.reply({ content: "❌ لا توجد بيانات مسجلة للأموال حتى الآن.", ephemeral: true });
      }

      let description = "";
      sortedUsers.forEach((userObj, index) => {
        let medal = "🏅";
        if (index === 0) medal = "👑";
        else if (index === 1) medal = "🥈";
        else if (index === 2) medal = "🥉";

        description += `${medal} **${index + 1}-** <@${userObj.userId}>\n   💰 المجموع: **$${money(userObj.totalMoney)}** (كاش: $${money(userObj.balance)} | بنك: $${money(userObj.bank)})\n\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🏆 لوحة الشرف - أغنى أثرياء المدينة")
        .setDescription(description)
        .setColor(0xffd700)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === "deposit") {
      const amount = interaction.options.getInteger("amount");
      if (uData.balance < amount) {
        return interaction.reply({ content: `❌ لا توجد لديك أموال كافية في المحفظة! رصيدك: **$${money(uData.balance)}**`, ephemeral: true });
      }
      uData.balance -= amount;
      uData.bank = (uData.bank || 0) + amount;
      saveData(db);
      return interaction.reply({ content: `✅ تم إيداع **$${money(amount)}** في البنك بنجاح. رصيدك البنكي الحالي: **$${money(uData.bank)}**`, ephemeral: true });
    }

    if (interaction.commandName === "withdraw") {
      const amount = interaction.options.getInteger("amount");
      if ((uData.bank || 0) < amount) {
        return interaction.reply({ content: `❌ لا توجد لديك أموال كافية في البنك! رصيدك البنكي: **$${money(uData.bank || 0)}**`, ephemeral: true });
      }
      uData.bank -= amount;
      uData.balance += amount;
      saveData(db);
      return interaction.reply({ content: `✅ تم سحب **$${money(amount)}** من البنك إلى محفظتك بنجاح.`, ephemeral: true });
    }

    if (interaction.commandName === "transfer") {
      const targetUser = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      if (targetUser.id === id) {
        return interaction.reply({ content: "❌ لا يمكنك تحويل الأموال لنفسك!", ephemeral: true });
      }

      if (uData.balance < amount) {
        return interaction.reply({ content: `❌ لا تمتلك المبلغ المطلوب في محفظتك لتحويله! رصيدك: **$${money(uData.balance)}**`, ephemeral: true });
      }

      const targetData = user(db, targetUser.id);
      uData.balance -= amount;
      targetData.balance += amount;
      saveData(db);

      return interaction.reply({ content: `✅ تم تحويل **$${money(amount)}** بنجاح إلى ${targetUser}.` });
    }

    if (interaction.commandName === "shop") {
      const embed = new EmbedBuilder()
        .setTitle("🛒 متجر المعدات العسكرية والشرطة")
        .setDescription("المعدات القانونية الرسمية لرجال الأمن (استخدم `/buy` للشراء):")
        .setColor(0x0099ff);

      POLICE_SHOP.forEach(item => {
        embed.addFields({ name: `${item.name}`, value: `السعر: **$${money(item.price)}**\nالوصف: ${item.desc}`, inline: false });
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "buy") {
      if (!police(member) && !owner(member)) {
        return interaction.reply({ content: "❌ عذراً، هذا المتجر مخصص لرجال الشرطة فقط!", ephemeral: true });
      }

      const itemId = interaction.options.getString("item");
      const item = POLICE_SHOP.find(i => i.id === itemId);
      if (!item) return interaction.reply({ content: "❌ الغرض غير موجود.", ephemeral: true });

      if (uData.balance < item.price) {
        return interaction.reply({ content: `❌ لا تمتلك مالاً كافياً! رصيدك: **$${money(uData.balance)}**`, ephemeral: true });
      }

      uData.balance -= item.price;
      uData.inventory.push(item.name);
      saveData(db);

      return interaction.reply({ content: `✅ تم شراء **${item.name}** بنجاح مقابل **$${money(item.price)}**.`, ephemeral: true });
    }

    if (interaction.commandName === "gangshop") {
      const embed = new EmbedBuilder()
        .setTitle("🏴‍☠️ سوق العصابات والسوق السوداء")
        .setDescription("الأسلحة والمعدات السرية غير القانونية (استخدم `/gangbuy` للشراء):")
        .setColor(0xff0000);

      GANG_SHOP.forEach(item => {
        embed.addFields({ name: `${item.name}`, value: `السعر: **$${money(item.price)}**\nالوصف: ${item.desc}`, inline: false });
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (interaction.commandName === "gangbuy") {
      const itemId = interaction.options.getString("item");
      const item = GANG_SHOP.find(i => i.id === itemId);
      if (!item) return interaction.reply({ content: "❌ السلعة غير موجودة بالسوق السوداء.", ephemeral: true });

      if (uData.balance < item.price) {
        return interaction.reply({ content: `❌ فلوسك ما تكفي! رصيدك الحالي: **$${money(uData.balance)}**`, ephemeral: true });
      }

      uData.balance -= item.price;
      uData.inventory.push(item.name);
      saveData(db);

      return interaction.reply({ content: `🔥 تمت الصفقة في السوق السوداء بنجاح! اشتريت **${item.name}** مقابل **$${money(item.price)}**.`, ephemeral: true });
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
        .setDescription(`🔫 العصابة: **${db.gangs[gid].name}**\n👤 المدعو: ${target}\n👑 الداعي: ${interaction.user}`);

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
        .setDescription(`🚔 الجهة: **الشرطة**\n👤 المدعو: ${target}\n👮 الداعي: ${interaction.user}`);

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
        content: "🏆 **مهام الشرطة**\n\n🚔 القبض على 3 مطلوبين\n💰 المكافأة: **$5,000**",
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
        new ButtonBuilder().setCustomId(`rob_drugs_${id}`).setLabel("🌿 صناعة الحشيش").setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        embeds: [new EmbedBuilder().setTitle("🔫 عمليات العصابة").setDescription("اختر العملية:").setColor(0xff0000)],
        components: [row],
        ephemeral: true
      });
    }

    if (interaction.commandName === "mission") {
      if (!db.missions) db.missions = {};
      const today = new Date().toISOString().slice(0, 10);
      
      if (!db.missions[id] || db.missions[id].date !== today) {
        const isCop = police(member);
        db.missions[id] = {
          date: today,
          type: isCop ? "police" : "gang",
          target: 3,
          progress: 0,
          completed: false
        };
        saveData(db);
      }

      const m = db.missions[id];
      const missionTitle = m.type === "police" ? "🚔 مهمة الشرطة اليومية: القبض على 3 مطلوبين" : "🔫 مهمة العصابة اليومية: تنفيذ 3 عمليات سرقة ناجحة";

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_mission_${id}`)
          .setLabel(m.completed ? "✅ تم استلام المكافأة" : `🎁 استلام المكافأة (${m.progress}/${m.target})`)
          .setStyle(m.completed ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setDisabled(m.completed || m.progress < m.target)
      );

      const embed = new EmbedBuilder()
        .setTitle("📋 نظام المهام اليومية")
        .setDescription(`**${missionTitle}**\n\n📊 **التقدم الحالي:** \`${m.progress}/${m.target}\`\n💰 **مكافأة الإنجاز:** \`$5,000\``)
        .setColor(0x00ff00);

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ حدث خطأ.", ephemeral: true }).catch(() => {});
    }
  }
});

function updateActiveWarMessage(message, warData, gangName, clientInstance) {
  const policeButtons = warData.policeTeam.map((id, index) =>
    new ButtonBuilder().setCustomId(`war_p_${warData.gangId}_${id}`).setLabel(`شرطي ${index + 1}`).setStyle(ButtonStyle.Primary)
  );

  const gangButtons = warData.gangTeam.map((id, index) =>
    new ButtonBuilder().setCustomId(`war_g_${warData.gangId}_${id}`).setLabel(`عصابة ${index + 1}`).setStyle(ButtonStyle.Danger)
  );

  const endBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`war_manual_end_${warData.gangId}`).setLabel("🏁 إنهاء الحرب يدويًا").setStyle(ButtonStyle.Secondary)
  );

  const rows = [];
  if (policeButtons.length > 0) {
    for (let i = 0; i < policeButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(policeButtons.slice(i, i + 5)));
    }
  }
  if (gangButtons.length > 0) {
    for (let i = 0; i < gangButtons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(gangButtons.slice(i, i + 5)));
    }
  }
  rows.push(endBtn);

  const embed = new EmbedBuilder()
    .setTitle("⚔️ اشتعلت الحرب بين الشرطة والعصابة التلقائية!")
    .setDescription(
      `🔥 المعركة قائمة الآن وستستمر لمدة **10 دقائق**!\n- يمكن لأي عضو من الأطراف الضغط على زر خصمه لكسب نقاط عشوائية.\n\n` +
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

    if (interaction.customId.startsWith("claim_mission_")) {
      const userId = interaction.user.id;
      if (!db.missions || !db.missions[userId]) return interaction.reply({ content: "❌ لا توجد مهمة نشطة.", ephemeral: true });
      const m = db.missions[userId];

      if (m.completed) return interaction.reply({ content: "❌ لقد استلمت مكافأة هذه المهمة مسبقاً.", ephemeral: true });
      if (m.progress < m.target) return interaction.reply({ content: "❌ لم تنهِ متطلبات المهمة بعد!", ephemeral: true });

      m.completed = true;
      const uData = user(db, userId);
      uData.balance += 5000;
      saveData(db);

      return interaction.update({ content: "🎉 مبروك! تم استلام مكافأة المهمة بنجاح بقيمة **$5,000**.", embeds: [], components: [] });
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

      let cdTime = 2 * 60 * 60 * 1000;
      if (type === "drugs") {
        cdTime = 30 * 60 * 1000;
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
        
        if (db.missions && db.missions[userId] && db.missions[userId].type === "gang" && !db.missions[userId].completed) {
          db.missions[userId].progress = Math.min(db.missions[userId].target, db.missions[userId].progress + 1);
        }

        saveData(db);
        return interaction.update({ content: `✅ نجحت العملية!\n🌿 تمت إضافة **${weed} كغ** إلى مخزن العصابة.`, embeds: [], components: [] });
      }

      db.cooldowns[userCdKey] = now;
      if (db.missions && db.missions[userId] && db.missions[userId].type === "gang" && !db.missions[userId].completed) {
        db.missions[userId].progress = Math.min(db.missions[userId].target, db.missions[userId].progress + 1);
      }

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

      if (action === "join") {
        const teamType = parts[2];
        const warId = parts.slice(3).join("_");
        const war = db.wars[warId];
        
        if (!war || war.status !== "recruiting") return interaction.reply({ content: "❌ انتهى وقت التسجيل أو الحرب غير موجودة.", ephemeral: true });

        if (teamType === "police") {
          if (!police(interaction.member)) return interaction.reply({ content: "❌ هذا الفريق مخصص للشرطة فقط.", ephemeral: true });
          if (war.policeTeam.includes(interaction.user.id)) return interaction.reply({ content: "❌ أنت مسجل مسبقاً في فريق الشرطة.", ephemeral: true });
          if (war.policeTeam.length >= 6) return interaction.reply({ content: "❌ اكتمل العدد الأقصى لفريق الشرطة (6 أشخاص).", ephemeral: true });

          war.policeTeam.push(interaction.user.id);
          saveData(db);
          return interaction.reply({ content: `✅ تم تسجيلك ضمن فريق الشرطة (${war.policeTeam.length}/6).`, ephemeral: true });
        }

        if (teamType === "gang") {
          const userGang = gangOf(db, interaction.user.id);
          if (!userGang || userGang.id !== war.gangId)
            return interaction.reply({ content: "❌ هذا الزر مخصص فقط لأعضاء العصابة المستهدفة!", ephemeral: true });
          if (war.gangTeam.includes(interaction.user.id)) return interaction.reply({ content: "❌ أنت مسجل مسبقاً في فريق العصابة.", ephemeral: true });
          if (war.gangTeam.length >= 6) return interaction.reply({ content: "❌ اكتمل العدد الأقصى لفريق العصابة (6 أشخاص).", ephemeral: true });

          war.gangTeam.push(interaction.user.id);
          saveData(db);
          return interaction.reply({ content: `✅ تم تسجيلك ضمن فريق العصابة (${war.gangTeam.length}/6).`, ephemeral: true });
        }
      }

      if (action === "p" || action === "g") {
        const gangId = parts[2];
        const targetId = parts[3];
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

          const pts = Math.floor(Math.random() * 20) + 1;
          warEntry.policeScore += pts;

          if (!warEntry.participants[userId]) warEntry.participants[userId] = { name: userName, team: "الشرطة", points: 0 };
          warEntry.participants[userId].points += pts;

          commandCooldowns.set(userId, Date.now());
          saveData(db);

          const embed = new EmbedBuilder()
            .setTitle("🚔 هجوم أمني ناجح!")
            .setDescription(`💥 قام ${interaction.user} بضربة ناجحة ضد <@${targetId}> كسب منها (+${pts} نقطة)!\n\n📊 **النتيجة الحالية:**\n🚔 **الشرطة**: \`${warEntry.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warEntry.gangScore}\` نقطة`)
            .setColor(0x0000ff);

          return interaction.update({ embeds: [embed] });
        }

        if (action === "g") {
          const userGang = gangOf(db, userId);
          if (!userGang || userGang.id !== gangId || !warEntry.gangTeam.includes(userId))
            return interaction.reply({ content: "❌ لست مشاركاً ضمن فريق هذه العصابة في الحرب.", ephemeral: true });

          const pts = Math.floor(Math.random() * 20) + 1;
          warEntry.gangScore += pts;

          if (!warEntry.participants[userId]) warEntry.participants[userId] = { name: userName, team: gangName, points: 0 };
          warEntry.participants[userId].points += pts;

          commandCooldowns.set(userId, Date.now());
          saveData(db);

          const embed = new EmbedBuilder()
            .setTitle("🔫 هجوم مضاد للعصابة!")
            .setDescription(`💥 قام ${interaction.user} بضربة مضادة ضد <@${targetId}> كسب منها (+${pts} نقطة)!\n\n📊 **النتيجة الحالية:**\n🚔 **الشرطة**: \`${warEntry.policeScore}\` نقطة\n🔫 **${gangName}**: \`${warEntry.gangScore}\` نقطة`)
            .setColor(0xff0000);

          return interaction.update({ embeds: [embed] });
        }
      }

      if (action === "manual" && parts[2] === "end") {
        const gangId = parts[3];
        const userId = interaction.user.id;

        const warEntry = Object.values(db.wars).find(w => w.gangId === gangId && w.status === "active");
        if (!warEntry) return interaction.reply({ content
